// TEMPORAL: busca dónde guarda Díez Ceramic el código DPC de los Reactivos. Se borra después.
const CAB = { "User-Agent": "Mozilla/5.0 (El Almacén; catálogo de esmaltes)", "Accept-Language": "es-ES" };
module.exports = async (req, res) => {
  const url = "https://diezceramic.com/tienda/esmaltes/50-1760-esmaltes-reactivos-ceramica.html";
  const html = await (await fetch(url, { headers: CAB })).text();
  const alrededor = (re) => [...html.matchAll(re)].slice(0, 40).map((m) => html.slice(Math.max(0, m.index - 160), m.index + 160).replace(/\s+/g, " "));
  const grupo = html.match(/<ul id="group_(\d+)">/)?.[1];
  const valores = [...html.matchAll(/value="(\d+)"[^>]*>\s*<span\s+class="color/g)].map((m) => m[1]).slice(0, 4);
  const refresco = [];
  for (const v of valores) {
    const r = await fetch(`https://diezceramic.com/tienda/index.php?controller=product&id_product=50&ajax=1&action=refresh&quantity_wanted=1&group%5B${grupo}%5D=${v}`, { headers: { ...CAB, "X-Requested-With": "XMLHttpRequest", Accept: "application/json" } });
    const t = await r.text();
    let j = null; try { j = JSON.parse(t); } catch {}
    refresco.push({ v, status: r.status, claves: j ? Object.keys(j) : null, referencia: (t.match(/[Rr]eferencia[^<]{0,80}|"reference":"[^"]*"|DPC[\s-]?\d+/g) ?? []).slice(0, 6), trozo: j ? null : t.slice(0, 300) });
  }
  res.setHeader("Cache-Control", "no-store");
  res.json({ grupo, valores, dpc: alrededor(/DPC/g), referencia: alrededor(/reference|Referencia/g).slice(0, 8), dataProduct: (html.match(/data-product="([^"]{0,600})/)?.[1] ?? ""), refresco });
};
