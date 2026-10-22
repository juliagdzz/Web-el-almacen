// Catálogo de esmaltes Tecniglaze (la marca de Díez Ceramic), leído de su tienda.
// No es una función de Vercel (empieza por _): lo usa api/esmaltes.js para dar
// Prodesco y Tecniglaze en una sola lista.
//
// En la tienda cada línea (Opaco brillo, Mate, Speckglaze Picas…) es un producto
// y sus colores son variantes: cada color trae su nombre y, o un color exacto
// (background-color), o una foto de la textura (Speckglaze).

const TIENDA = "https://diezceramic.com/tienda";
const CATEGORIA = `${TIENDA}/15-esmaltes`;
const CABECERAS = { "User-Agent": "Mozilla/5.0 (El Almacén; catálogo de esmaltes)", "Accept-Language": "es-ES" };

const decodificar = (t) => t
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
  .replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

async function leer(url) {
  const r = await fetch(url, { headers: CABECERAS });
  if (!r.ok) throw new Error(`Díez Ceramic respondió ${r.status} en ${url}`);
  return r.text();
}

// "Verde Turquesa Esmaltes TecniGlaze" → "Verde turquesa"; "DPC800-BS - Esmaltes Picas" → código DPC800-BS
function limpiarNombre(titulo) {
  const codigo = titulo.match(/^([A-Z]{2,4}\d{2,4}(?:-[A-Z0-9]{1,4})?)\b/)?.[1] ?? "";
  let nombre = titulo
    .replace(/^([A-Z]{2,4}\d{2,4}(?:-[A-Z0-9]{1,4})?)\b/, "")
    .replace(/\s*-?\s*Esmaltes?\b.*$/i, "")
    .replace(/^\s*-\s*/, "")
    .trim();
  if (nombre) nombre = nombre[0].toUpperCase() + nombre.slice(1).toLowerCase();
  return { codigo, nombre };
}

function coloresDelProducto(html) {
  const datos = html.match(/data-product="([^"]+)"/);
  if (!datos) return [];
  const producto = JSON.parse(decodificar(datos[1]));
  const serie = decodificar(producto.name || "Tecniglaze").trim();
  const enlace = producto.link || `${TIENDA}/esmaltes/${producto.id_product}.html`;
  // El grupo de colores es el <ul id="group_N"> con muestras (input-color)
  const grupos = [...html.matchAll(/<ul id="group_(\d+)">([\s\S]*?)<\/ul>/g)].filter(([, , cuerpo]) => /input-color/.test(cuerpo));
  const lista = [];
  for (const [, , cuerpo] of grupos) {
    for (const [, titulo, valor, estilo] of cuerpo.matchAll(/title="([^"]+)"[\s\S]*?value="(\d+)"[\s\S]*?<span\s+class="color[^"]*"\s*(?:style="([^"]*)")?/g)) {
      const { codigo, nombre } = limpiarNombre(decodificar(titulo));
      const hex = estilo?.match(/background-color:\s*(#[0-9a-f]{6})/i)?.[1]?.toLowerCase() ?? null;
      const textura = estilo?.match(/background-image:\s*url\(([^)]+)\)/)?.[1] ?? null;
      const foto = textura ? new URL(textura, TIENDA).href : null;
      const swatch = hex ? `/api/esmaltes?color=${hex.slice(1)}` : foto;
      if (!swatch) continue;
      lista.push({
        id: `tg-${producto.id_product}-${valor}`,
        marca: "Tecniglaze",
        codigo,
        nombre: nombre || (codigo ? "" : serie),
        serie,
        plomo: false, // la gama Tecniglaze es sin plomo
        color: hex,
        miniatura: swatch,
        muestra: swatch,
        url: `${enlace}#color-${valor}`,
      });
    }
  }
  return lista;
}

async function catalogoTecniglaze() {
  const categoria = await leer(CATEGORIA);
  // Un enlace por producto (línea de esmaltes): /tienda/esmaltes/51-1771-esmaltes-picas-ceramica.html
  const productos = new Map();
  for (const [url, id] of categoria.matchAll(/https:\/\/diezceramic\.com\/tienda\/esmaltes\/(\d+)-\d+-[a-z0-9-]+\.html/g)) {
    if (!productos.has(id)) productos.set(id, url);
  }
  const paginas = await Promise.all([...productos.values()].map((u) => leer(u).catch(() => "")));
  const vistos = new Set();
  return paginas.flatMap(coloresDelProducto).filter((e) => !vistos.has(e.id) && vistos.add(e.id));
}

module.exports = { catalogoTecniglaze, limpiarNombre, coloresDelProducto };
