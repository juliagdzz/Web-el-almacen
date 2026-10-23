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
    const tamano = grupos.find((x) => x.g !== "2" && x.marcado) ?? grupos.find((x) => x.g !== "2");
    for (const c of grupos.filter((x) => x.g === "2")) tareas.push({ id, url, tamano, valor: c.v });
  }
  const salida = await enTandas(tareas, 10, async (t) => {
    const cuerpo = new URLSearchParams({ ajax: "1", action: "refresh", quantity_wanted: "1", id_product: t.id, "group[2]": t.valor });
    if (t.tamano) cuerpo.set(`group[${t.tamano.g}]`, t.tamano.v);
    const r = await fetch(t.url, { method: "POST", headers: { ...CAB, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest", Accept: "application/json" }, body: cuerpo });
    const j = await r.json();
    return { id: t.id, valor: t.valor, sku: (j.product_details ?? "").match(/itemprop="sku">([^<]+)/)?.[1]?.trim() ?? (j.product_details ?? "").match(/[A-Z0-9 -]*DPC[A-Z0-9 -]*/)?.[0] ?? null };
  });
  res.setHeader("Cache-Control", "no-store");
  res.json({ productos: [...productos.keys()], total: tareas.length, salida });
};
