// TEMPORAL: saca la referencia (código DPC) de cada color de Tecniglaze. Se borra después.
const CAB = { "User-Agent": "Mozilla/5.0 (El Almacén; catálogo de esmaltes)", "Accept-Language": "es-ES" };
const leer = async (u) => (await fetch(u, { headers: CAB })).text();
async function enTandas(lista, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < lista.length) { const k = i++; out[k] = await fn(lista[k]).catch((e) => ({ error: String(e) })); } }));
  return out;
}
module.exports = async (req, res) => {
  const categoria = await leer("https://diezceramic.com/tienda/15-esmaltes");
  const productos = new Map();
  for (const [url, id] of categoria.matchAll(/https:\/\/diezceramic\.com\/tienda\/esmaltes\/(\d+)-\d+-[a-z0-9-]+\.html/g)) if (!productos.has(id)) productos.set(id, url);
  const tareas = [];
  for (const [id, url] of productos) {
    if (req.query.prod && req.query.prod !== id) continue;
    const html = await leer(url);
    const grupos = [...html.matchAll(/name="group\[(\d+)\]"[^>]*value="(\d+)"[^>]*(checked|selected)?/g)].map((m) => ({ g: m[1], v: m[2], marcado: Boolean(m[3]) }));
    // el grupo de colores es el <ul id="group_N"> con muestras; el otro, el tamaño
    const gColor = [...html.matchAll(/<ul id="group_(\d+)">([\s\S]*?)<\/ul>/g)].find(([, , cuerpo]) => /input-color/.test(cuerpo))?.[1] ?? "2";
    const tamano = grupos.find((x) => x.g !== gColor && x.marcado) ?? grupos.find((x) => x.g !== gColor);
    for (const c of grupos.filter((x) => x.g === gColor)) tareas.push({ id, url, tamano, gColor, valor: c.v });
    if (req.query.ver) return res.json({ gColor, grupos: grupos.slice(0, 6), trozos: [...html.matchAll(/group\[\d+\]/g)].slice(0, 4).map((m) => html.slice(m.index - 300, m.index + 200).replace(/\s+/g, " ")), dpc: [...html.matchAll(/DPC/g)].slice(0, 5).map((m) => html.slice(m.index - 150, m.index + 60).replace(/\s+/g, " ")) });
  }
  const salida = await enTandas(tareas, 10, async (t) => {
    const cuerpo = new URLSearchParams({ ajax: "1", action: "refresh", quantity_wanted: "1", id_product: t.id, [`group[${t.gColor}]`]: t.valor });
    if (t.tamano) cuerpo.set(`group[${t.tamano.g}]`, t.tamano.v);
    const r = await fetch(t.url, { method: "POST", headers: { ...CAB, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest", Accept: "application/json" }, body: cuerpo });
    const j = await r.json();
    const det = j.product_details ?? "";
    const i = det.indexOf("sku");
    const k = det.indexOf("DPC");
    return { id: t.id, valor: t.valor, dpc: k >= 0 ? det.slice(Math.max(0, k - 200), k + 60).replace(/\s+/g, " ") : null, cerca: i >= 0 ? det.slice(i - 40, i + 120).replace(/\s+/g, " ") : null, sku: (j.product_details ?? "").match(/itemprop="sku">([^<]+)/)?.[1]?.trim() ?? (j.product_details ?? "").match(/[A-Z0-9 -]*DPC[A-Z0-9 -]*/)?.[0] ?? null };
  });
  res.setHeader("Cache-Control", "no-store");
  res.json({ productos: [...productos.keys()], total: tareas.length, salida });
};
