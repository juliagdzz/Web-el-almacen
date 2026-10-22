// Función de Vercel: catálogo de esmaltes Tecniglaze (Díez Ceramic).
// Primer paso: devuelve el HTML de una página de la tienda de Díez Ceramic para
// ver cómo vienen los colores. Solo deja leer páginas de diezceramic.com/tienda.

const PERMITIDA = /^https:\/\/diezceramic\.com\/tienda\/[\w\/.-]+$/;

module.exports = async (req, res) => {
  const pagina = String(req.query.pagina || "");
  if (!PERMITIDA.test(pagina)) return res.status(400).json({ error: "Solo páginas de diezceramic.com/tienda" });
  try {
    const r = await fetch(pagina, { headers: { "User-Agent": "Mozilla/5.0 (El Almacén; catálogo de esmaltes)", "Accept-Language": "es-ES" } });
    const html = await r.text();
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.status(r.status).send(html);
  } catch (e) {
    res.status(502).json({ error: String(e?.message || e) });
  }
};
