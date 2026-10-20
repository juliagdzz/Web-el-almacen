// Calcula el color de cada esmalte de Prodesco a partir de la foto de su azulejo de muestra
// y lo guarda en colores-esmaltes.json (lo usa la «Paleta desde una foto» de los tableros).
// Uso (desde la carpeta del proyecto):  node scripts/actualizar-colores.mjs

import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";

const require = createRequire(import.meta.url);
const catalogo = require("../api/esmaltes.js");

// El catálogo, usando la misma función que la web
function leerCatalogo() {
  return new Promise((resolve, reject) => {
    const res = {
      setHeader() {},
      status() { return res; },
      json: (datos) => (Array.isArray(datos) ? resolve(datos) : reject(new Error(datos.error))),
    };
    catalogo({ query: {} }, res);
  });
}

// Lector mínimo de PNG (8 bits, RGB o RGBA, sin entrelazar), que es como vienen las muestras
function leerPNG(datos) {
  const ancho = datos.readUInt32BE(16);
  const alto = datos.readUInt32BE(20);
  const [bits, tipo, , , entrelazado] = datos.subarray(24, 29);
  if (bits !== 8 || entrelazado || (tipo !== 2 && tipo !== 6)) throw new Error("PNG no admitido");
  const canales = tipo === 6 ? 4 : 3;
  const trozos = [];
  for (let i = 8; i < datos.length;) {
    const largo = datos.readUInt32BE(i);
    if (datos.toString("ascii", i + 4, i + 8) === "IDAT") trozos.push(datos.subarray(i + 8, i + 8 + largo));
    i += 12 + largo;
  }
  const crudo = inflateSync(Buffer.concat(trozos));
  const fila = ancho * canales;
  const px = Buffer.alloc(alto * fila);
  for (let y = 0; y < alto; y++) {
    const filtro = crudo[y * (fila + 1)];
    for (let x = 0; x < fila; x++) {
      const v = crudo[y * (fila + 1) + 1 + x];
      const a = x >= canales ? px[y * fila + x - canales] : 0;
      const b = y > 0 ? px[(y - 1) * fila + x] : 0;
      const c = x >= canales && y > 0 ? px[(y - 1) * fila + x - canales] : 0;
      const p = a + b - c;
      const paeth = Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c;
      px[y * fila + x] = (v + [0, a, b, (a + b) >> 1, paeth][filtro]) & 255;
    }
  }
  return { ancho, alto, canales, px };
}

// Color del azulejo: la mediana de la parte central, sin brillos ni transparencias
function colorDeMuestra({ ancho, alto, canales, px }) {
  const r = [], g = [], b = [];
  for (let y = Math.floor(alto * 0.18); y < alto * 0.82; y++) {
    for (let x = Math.floor(ancho * 0.18); x < ancho * 0.82; x++) {
      const i = (y * ancho + x) * canales;
      if (canales === 4 && px[i + 3] < 200) continue;
      if (px[i] > 238 && px[i + 1] > 238 && px[i + 2] > 238) continue; // reflejos
      r.push(px[i]); g.push(px[i + 1]); b.push(px[i + 2]);
    }
  }
  if (!r.length) return null;
  const mediana = (v) => v.sort((m, n) => m - n)[v.length >> 1];
  return "#" + [mediana(r), mediana(g), mediana(b)].map((n) => n.toString(16).padStart(2, "0")).join("");
}

const esmaltes = await leerCatalogo();
const colores = {};
let hechos = 0;
for (const e of esmaltes) {
  try {
    const foto = Buffer.from(await (await fetch(e.miniatura)).arrayBuffer());
    const color = colorDeMuestra(leerPNG(foto));
    if (color) colores[e.id] = color;
  } catch (error) {
    console.log(`Sin color: ${e.codigo || e.nombre} (${error.message})`);
  }
  if (++hechos % 50 === 0) console.log(`${hechos} de ${esmaltes.length}…`);
}
await writeFile(new URL("../colores-esmaltes.json", import.meta.url), JSON.stringify(colores) + "\n");
console.log(`\n${Object.keys(colores).length} colores guardados en colores-esmaltes.json`);
