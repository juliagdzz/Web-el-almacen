// Función de Vercel: catálogo de esmaltes y engobes de Prodesco.
// Sin parámetros devuelve la lista; con ?imagen= devuelve la foto de una muestra,
// porque Prodesco no deja descargarlas directamente desde el navegador.

const API = "https://prodesco.es/wp-json/wc/store/v1/products";
const CATEGORIA = 84; // Esmaltes y Engobes
const POR_PAGINA = 100;
const PAGINAS_A_LA_VEZ = 7; // hoy son 6; si sobra alguna vuelve vacía
const CAMPOS = "id,name,permalink,images,categories";
// Categorías que no dicen la serie: Esmaltes y Engobes, Esmaltes, Engobes, Reservado uso Industrial…
const GENERICAS = new Set([84, 85, 89, 105, 106, 109]);
const INFORMACION = 2755; // fichas de información, no son esmaltes
const IMAGENES = /^https:\/\/prodesco\.es\/wp-content\/uploads\/[\w\/.-]+\.(png|jpe?g|webp)$/i;
const MAXIMO_BYTES = 5 * 1024 * 1024;

function fallo(res, estado, error) {
  res.status(estado).json({ error });
}

function decodificar(texto) {
  return texto
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'");
}

// La foto de un tamaño concreto (150, 300…) a partir del srcset de WordPress
function tamano(imagen, ancho) {
  const coincide = imagen.srcset?.match(new RegExp(`(\\S+) ${ancho}w`));
  return coincide ? coincide[1] : imagen.thumbnail || imagen.src;
}

// "5546 VERDE MARINO" → código 5546, nombre "Verde marino"
function aEsmalte(p) {
  const titulo = decodificar(p.name).replace(/\*/g, "").replace(/^O-\s+/, "O-").trim();
  const [primera, ...resto] = titulo.split(/\s+/);
  const conCodigo = /\d/.test(primera);
  const nombre = conCodigo ? resto.join(" ") : titulo;
  const imagen = p.images[0];
  return {
    id: p.id,
    codigo: conCodigo ? primera : "",
    nombre: nombre && nombre[0] + nombre.slice(1).toLowerCase(),
    serie: p.categories.find((c) => !GENERICAS.has(c.id))?.name ?? "Esmaltes",
    plomo: p.categories.some((c) => /plomo/i.test(c.name)),
    miniatura: tamano(imagen, 150),
    muestra: tamano(imagen, 300),
    url: p.permalink,
  };
}

async function pagina(numero) {
  const respuesta = await fetch(`${API}?category=${CATEGORIA}&per_page=${POR_PAGINA}&page=${numero}&_fields=${CAMPOS}`);
  if (!respuesta.ok) throw new Error(`Prodesco respondió ${respuesta.status}`);
  return respuesta;
}

async function enviarImagen(url, res) {
  if (!IMAGENES.test(url)) return fallo(res, 400, "Esa imagen no es de Prodesco");
  const foto = await fetch(url);
  const tipo = foto.headers.get("content-type") || "";
  if (!foto.ok || !tipo.startsWith("image/")) return fallo(res, 502, "No he podido descargar la muestra");
  const datos = Buffer.from(await foto.arrayBuffer());
  if (datos.length > MAXIMO_BYTES) return fallo(res, 413, "La muestra es demasiado grande");
  res.setHeader("Content-Type", tipo);
  res.setHeader("Cache-Control", "public, max-age=604800");
  res.status(200).send(datos);
}

module.exports = async (req, res) => {
  try {
    if (req.query.imagen) return await enviarImagen(req.query.imagen, res);

    // Prodesco tarda unos 9 s en dar el catálogo entero, por eso Vercel lo guarda (abajo)
    const numeros = (desde, hasta) => Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);
    const respuestas = await Promise.all(numeros(1, PAGINAS_A_LA_VEZ).map(pagina));
    const total = Number(respuestas[0].headers.get("x-wp-totalpages")) || 1;
    if (total > PAGINAS_A_LA_VEZ) respuestas.push(...(await Promise.all(numeros(PAGINAS_A_LA_VEZ + 1, total).map(pagina))));
    const productos = (await Promise.all(respuestas.map((r) => r.json()))).flat();

    const esmaltes = productos
      .filter((p) => p.images.length && !p.categories.some((c) => c.id === INFORMACION))
      .map(aEsmalte)
      // Primero los que tienen número, ordenados; los que no (bases, materias primas) al final
      .sort((a, b) => !a.codigo - !b.codigo || (a.codigo || a.nombre).localeCompare(b.codigo || b.nombre, "es", { numeric: true }));

    // Vercel guarda la lista un día y la renueva por detrás: solo espera la primera visita
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    res.status(200).json(esmaltes);
  } catch (e) {
    console.error(e);
    fallo(res, 502, "No he podido cargar el catálogo de Prodesco");
  }
};

module.exports.aEsmalte = aEsmalte;
