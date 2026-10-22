// Función de Vercel: catálogo de esmaltes de Prodesco y de Tecniglaze (Díez Ceramic).
// Sin parámetros devuelve la lista; con ?imagen= devuelve la foto de una muestra,
// porque las tiendas no dejan descargarlas directamente desde el navegador; con
// ?color=91b8ae, una muestra lisa de ese color (los Tecniglaze que no traen foto).

const zlib = require("zlib");
const { catalogoTecniglaze } = require("./_tecniglaze.js");

const API = "https://prodesco.es/wp-json/wc/store/v1/products";
const CATEGORIA = 84; // Esmaltes y Engobes
const POR_PAGINA = 100;
const PAGINAS_A_LA_VEZ = 7; // hoy son 6; si sobra alguna vuelve vacía
const CAMPOS = "id,name,permalink,images,categories";
// Categorías que no dicen la serie: Esmaltes y Engobes, Esmaltes, Engobes, Reservado uso Industrial…
const GENERICAS = new Set([84, 85, 89, 105, 106, 109]);
const INFORMACION = 2755; // fichas de información, no son esmaltes
const IMAGENES = /^https:\/\/(prodesco\.es\/wp-content\/uploads|diezceramic\.com\/tienda\/img)\/[\w\/.-]+\.(png|jpe?g|webp|gif)$/i;
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
    marca: "Prodesco",
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

// Una muestra lisa en PNG (sin librerías: cabecera, datos comprimidos y fin)
function pngLiso(hex, lado = 120) {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const crc = (buf) => {
    let c = ~0;
    for (const byte of buf) { c ^= byte; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
    return ~c >>> 0;
  };
  const trozo = (tipo, datos) => {
    const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length);
    const cuerpo = Buffer.concat([Buffer.from(tipo), datos]);
    const suma = Buffer.alloc(4); suma.writeUInt32BE(crc(cuerpo));
    return Buffer.concat([largo, cuerpo, suma]);
  };
  const cabecera = Buffer.alloc(13);
  cabecera.writeUInt32BE(lado, 0); cabecera.writeUInt32BE(lado, 4);
  cabecera.set([8, 2, 0, 0, 0], 8); // 8 bits, RGB
  const fila = Buffer.alloc(1 + lado * 3);
  for (let x = 0; x < lado; x++) fila.set([r, g, b], 1 + x * 3);
  const pixeles = zlib.deflateSync(Buffer.concat(Array.from({ length: lado }, () => fila)));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), trozo("IHDR", cabecera), trozo("IDAT", pixeles), trozo("IEND", Buffer.alloc(0))]);
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
    if (req.query.color) {
      const hex = String(req.query.color).toLowerCase();
      if (!/^[0-9a-f]{6}$/.test(hex)) return fallo(res, 400, "Color no válido");
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      return res.status(200).send(pngLiso(hex));
    }

    // Prodesco tarda unos 9 s en dar el catálogo entero, por eso Vercel lo guarda (abajo)
    const [prodesco, tecniglaze] = await Promise.allSettled([catalogoProdesco(), catalogoTecniglaze()]);
    if (prodesco.status === "rejected") console.error("Prodesco:", prodesco.reason);
    if (tecniglaze.status === "rejected") console.error("Tecniglaze:", tecniglaze.reason);
    if (prodesco.status === "rejected" && tecniglaze.status === "rejected") throw prodesco.reason;
    const esmaltes = [...(prodesco.value ?? []), ...(tecniglaze.value ?? [])];

    // Vercel guarda la lista un día y la renueva por detrás: solo espera la primera visita
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    res.status(200).json(esmaltes);
  } catch (e) {
    console.error(e);
    fallo(res, 502, "No he podido cargar el catálogo de esmaltes");
  }
};

async function catalogoProdesco() {
  const numeros = (desde, hasta) => Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);
  const respuestas = await Promise.all(numeros(1, PAGINAS_A_LA_VEZ).map(pagina));
  const total = Number(respuestas[0].headers.get("x-wp-totalpages")) || 1;
  if (total > PAGINAS_A_LA_VEZ) respuestas.push(...(await Promise.all(numeros(PAGINAS_A_LA_VEZ + 1, total).map(pagina))));
  const productos = (await Promise.all(respuestas.map((r) => r.json()))).flat();
  return productos
    .filter((p) => p.images.length && !p.categories.some((c) => c.id === INFORMACION))
    .map(aEsmalte)
    // Primero los que tienen número, ordenados; los que no (bases, materias primas) al final
    .sort((a, b) => !a.codigo - !b.codigo || (a.codigo || a.nombre).localeCompare(b.codigo || b.nombre, "es", { numeric: true }));
}

module.exports.aEsmalte = aEsmalte;
