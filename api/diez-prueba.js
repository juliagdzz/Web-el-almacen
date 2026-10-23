// TEMPORAL: busca dónde guarda Díez Ceramic el código DPC de cada color. Se borra después.
const CAB = { "User-Agent": "Mozilla/5.0 (El Almacén; catálogo de esmaltes)", "Accept-Language": "es-ES" };
module.exports = async (req, res) => {
  const url = req.query.url || "https://diezceramic.com/tienda/esmaltes/50-1760-esmaltes-reactivos-ceramica.html";
  const html = await (await fetch(url, { headers: CAB })).text();
  const producto = html.match(/name="id_product" value="(\d+)"/)?.[1];
  const grupos = [...html.matchAll(/name="group\[(\d+)\]"[^>]*value="(\d+)"[^>]*(checked|selected)?/g)].map((m) => ({ g: m[1], v: m[2], marcado: Boolean(m[3]) }));
  const tamano = grupos.find((x) => x.g !== "2" && x.marcado) ?? grupos.find((x) => x.g !== "2");
  const colores = grupos.filter((x) => x.g === "2").slice(0, Number(req.query.n || 4));
  const salida = [];
  for (const c of colores) {
    const cuerpo = new URLSearchParams({ ajax: "1", action: "refresh", quantity_wanted: "1", id_product: producto, [`group[${tamano?.g ?? 1}]`]: tamano?.v ?? "195", "group[2]": c.v });
    const r = await fetch(url, { method: "POST", headers: { ...CAB, "Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest", Accept: "application/json" }, body: cuerpo });
    const t = await r.text();
    let j = null; try { j = JSON.parse(t); } catch {}
    salida.push({ valor: c.v, status: r.status, combinacion: j?.id_product_attribute, sku: (j?.product_details ?? "").match(/[A-Z0-9 -]*DPC[A-Z0-9 -]*/)?.[0] ?? null, trozo: (j?.product_details ?? "").replace(/\s+/g, " ").slice(0, 400), otra: j ? null : t.slice(0, 200) });
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ producto, tamano, ncolores: grupos.filter((x) => x.g === "2").length, salida });
};
