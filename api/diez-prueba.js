// TEMPORAL: busca dónde guarda Díez Ceramic el código DPC de los Reactivos. Se borra después.
const CAB = { "User-Agent": "Mozilla/5.0 (El Almacén; catálogo de esmaltes)", "Accept-Language": "es-ES" };
const leer = async (u) => (await fetch(u, { headers: CAB })).text();
module.exports = async (req, res) => {
  const categoria = await leer("https://diezceramic.com/tienda/15-esmaltes");
  // enlaces de variante: /50-1765-esmaltes-reactivos-ceramica.html#/195-tamano-200_ml/381-color-moss_green...
  const variantes = new Map();
  for (const m of categoria.matchAll(/https:\/\/diezceramic\.com\/tienda\/esmaltes\/(\d+)-(\d+)-[a-z0-9-]+\.html#\/(\d+)-tamano-[a-z0-9_]+\/(\d+)-color-([a-z0-9_]+)/g)) {
    const [url, prod, combinacion, , valor, slug] = m;
    if (!variantes.has(valor)) variantes.set(valor, { prod, combinacion, valor, slug, url: url.split("#")[0] });
  }
  const quiero = [...variantes.values()].filter((v) => v.prod === (req.query.prod || "50"));
  const salida = await Promise.all(quiero.map(async (v) => {
    const html = await leer(v.url).catch(() => "");
    return { ...v, sku: html.match(/itemprop="sku">([^<]+)/)?.[1] ?? null };
  }));
  res.setHeader("Cache-Control", "no-store");
  res.json({ totalVariantes: variantes.size, productos: [...new Set([...variantes.values()].map((v) => v.prod))], salida });
};
