// Función de Vercel: recibe un enlace de Pinterest y devuelve la foto del pin.
// Solo acepta Pinterest para que nadie la use como proxy de cualquier web.

const PAGINAS = /(^|\.)pinterest\.[a-z.]+$|^pin\.it$/;
const IMAGENES = /^i\.pinimg\.com$/;
const MAXIMO_BYTES = 15 * 1024 * 1024;
const NAVEGADOR = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";

function fallo(res, estado, error) {
  res.status(estado).json({ error });
}

// Busca la foto en las etiquetas que Pinterest pone para compartir en redes
function buscarImagen(html) {
  const meta =
    html.match(/<meta[^>]+(?:property|name)=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']og:image["']/i);
  if (meta) return meta[1].replace(/&amp;/g, "&");
  const suelta = html.match(/https:\/\/i\.pinimg\.com\/(?:originals|736x)\/[^"'\s\\]+/);
  return suelta?.[0] ?? null;
}

module.exports = async (req, res) => {
  let enlace;
  try {
    enlace = new URL(req.query.url);
  } catch {
    return fallo(res, 400, "Eso no parece un enlace");
  }
  if (enlace.protocol !== "https:" && enlace.protocol !== "http:") {
    return fallo(res, 400, "Eso no parece un enlace");
  }

  try {
    let imagen = IMAGENES.test(enlace.hostname) ? enlace : null;

    if (!imagen) {
      if (!PAGINAS.test(enlace.hostname)) {
        return fallo(res, 400, "Solo funciona con enlaces de Pinterest");
      }
      const pagina = await fetch(enlace, { headers: { "User-Agent": NAVEGADOR }, redirect: "follow" });
      if (!PAGINAS.test(new URL(pagina.url).hostname)) {
        return fallo(res, 400, "Ese enlace no lleva a Pinterest");
      }
      if (!pagina.ok) return fallo(res, 404, "No encuentro ese pin");
      const encontrada = buscarImagen(await pagina.text());
      if (!encontrada) return fallo(res, 404, "Ese pin no tiene foto");
      imagen = new URL(encontrada);
      if (!IMAGENES.test(imagen.hostname)) return fallo(res, 404, "Ese pin no tiene foto");
    }

    const foto = await fetch(imagen, { headers: { "User-Agent": NAVEGADOR } });
    const tipo = foto.headers.get("content-type") || "";
    if (!foto.ok || !tipo.startsWith("image/")) return fallo(res, 502, "No he podido descargar la foto");
    const datos = Buffer.from(await foto.arrayBuffer());
    if (datos.length > MAXIMO_BYTES) return fallo(res, 413, "La foto es demasiado grande");

    res.setHeader("Content-Type", tipo);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.status(200).send(datos);
  } catch (e) {
    console.error(e);
    fallo(res, 502, "Pinterest no responde, prueba otra vez");
  }
};

module.exports.buscarImagen = buscarImagen;
