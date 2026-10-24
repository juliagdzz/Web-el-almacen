// Junta en pastas.json las pastas de varias marcas que se venden en España:
// SIO-2 (las que ya trae pastas.json, de actualizar-pastas.mjs), y las de las
// tiendas ANPER (Vicar, Sibelco, Vicente Díez, La Bisbal, Limoges…), Prodesco
// y Díez Ceramic (porcelanas Tecniclay). Cada pasta lleva su «marca» (quien la
// fabrica) y su «tienda». Las que repiten una de SIO-2 no se añaden otra vez.
// Uso (desde la carpeta del proyecto):  node scripts/catalogo-pastas.mjs

import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { coloresDelProducto } = require("../api/_tecniglaze.js");
const ARCHIVO = new URL("../pastas.json", import.meta.url);
const CABECERAS = { "User-Agent": "Mozilla/5.0 (El Almacén; catálogo de pastas)", "Accept-Language": "es-ES" };

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function texto(url, intentos = 8) {
  try {
    const r = await fetch(url, { headers: CABECERAS });
    if (!r.ok) throw new Error(`${url} → ${r.status}`);
    return await r.text();
  } catch (e) {
    if (intentos <= 1) throw e;
    await esperar(3000);
    return texto(url, intentos - 1);
  }
}

const entidades = (t) => t
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
  .replace(/&([aeiouAEIOU])acute;/g, (_, l) => ({ a: "á", e: "é", i: "í", o: "ó", u: "ú", A: "Á", E: "É", I: "Í", O: "Ó", U: "Ú" })[l])
  .replace(/&ntilde;/g, "ñ").replace(/&Ntilde;/g, "Ñ").replace(/&ndash;/g, "–").replace(/&ordm;/g, "º").replace(/&deg;/g, "º")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
const plano = (html) => entidades(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, "\n"))
  .replace(/[ \t ]+/g, " ").replace(/\n\s*\n+/g, "\n");
const numero = (t) => parseFloat(String(t).replace(",", "."));
const media = (a, b) => Math.round(((numero(a) + numero(b ?? a)) / 2) * 10) / 10;

// Datos técnicos de la ficha: rango de cocción, contracciones y si es para colar
function datosTecnicos(t) {
  const rango = t.match(/(?:Temperatura (?:de )?cocci[oó]n|Rango cocci[oó]n|TEMPERATURA COCCI[OÓ]N)[^0-9]{0,40}(\d{3,4})\s*º?\s*C?\s*[-–]\s*(\d{3,4})/i)
    ?? t.match(/(?:Temperatura (?:de )?cocci[oó]n|Rango cocci[oó]n|TEMPERATURA (?:DE )?COCCI[OÓ]N)[^0-9]{0,40}(\d{3,4})/i);
  const desde = rango ? Number(rango[1]) : null;
  const hasta = rango ? Number(rango[2] ?? rango[1]) : null;
  const secado = t.match(/Contracci[oó]n (?:de )?secado[^0-9]{0,20}([\d,.]+)\s*(?:[-–]\s*([\d,.]+))?\s*%/i);
  const coccion = t.match(/Contracci[oó]n (?:de )?cocci[oó]n\s*(?:\((\d{3,4})\s*º?C?\))?[^0-9]{0,20}([\d,.]+)\s*(?:[-–]\s*([\d,.]+))?\s*%/i);
  const porosidad = t.match(/(?:Porosidad|Absorci[oó]n (?:de )?agua)[^0-9]{0,40}([\d,.]+)\s*(?:[-–]\s*([\d,.]+))?\s*%/i);
  return {
    coccion: desde ? (hasta && hasta !== desde ? `${desde}-${hasta} ºC` : `${desde} ºC`) : null,
    secado: secado ? media(secado[1], secado[2]) : null,
    cocciones: coccion && (coccion[1] || hasta) ? [{ temperatura: Number(coccion[1] ?? hasta), contraccion: media(coccion[2], coccion[3]) }] : [],
    porosidad: porosidad ? media(porosidad[1], porosidad[2]) : null,
    colada: /colaje|colada|para colar|barbotina|slip/i.test(t),
  };
}

// "PA000804 Pasta Europa para Colaje" → código PA000804, nombre "Pasta Europa para colaje"
const CODIGOS = [/\bPA0\d{5}\b/, /\bPAVD[A-Z0-9]+\b/, /\bW[MBS][SZ]?\s?\d{4,5}[A-Z]{0,2}\b/, /\bBG\d{2}\b/, /\bPA-[A-Z0-9]+\b/, /\bPA84[A-Z0-9/-]+/, /\bPA\d{6}\b/];
function limpiar(titulo) {
  let t = titulo.replace(/\s+/g, " ").replace(/PA84(?=W)/g, "").trim(); // ANPER antepone PA84 a los de Sibelco
  const codigo = CODIGOS.map((re) => t.match(re)?.[0]).find(Boolean)?.replace(/\s/g, "") ?? null;
  for (const re of CODIGOS) t = t.replace(new RegExp(re.source, "g"), " ");
  t = t.replace(/\b\d+([.,]\d+)?\s*(kg|lt|l|g)\b\.?/gi, " ")
    .replace(/\b\d{3,4}\s*[-–]\s*\d{3,4}\s*º?C\b/gi, " ")
    .replace(/\b(Sibelco|Vicar|KPCL)\b/gi, " ")
    .replace(/^\s*Pasta\s+/i, "")
    .replace(/[\s.-]+$/, "")
    .replace(/\s+/g, " ").trim();
  // LO QUE VIENE EN MAYÚSCULAS, en minúsculas con la primera en mayúscula
  if (t === t.toUpperCase()) t = t.toLowerCase();
  t = t[0].toUpperCase() + t.slice(1);
  return { codigo, nombre: t };
}

// Lo de la categoría de baja temperatura se queda ahí aunque lleve chamota
const tipoDe = (texto, porDefecto) =>
  /porcelana|limoge/i.test(texto) ? "Porcelana"
    : porDefecto === "Baja temperatura" ? porDefecto
    : /refractari|gres|vitrogres|chamota/i.test(texto) ? "Gres y refractarias"
    : porDefecto;

// Quién la fabrica, en las fichas de ANPER (lo dicen el código, la foto o el texto)
function marcaAnper(titulo, imagen, t) {
  const todo = `${titulo} ${imagen} ${t.slice(0, 800)}`;
  if (/BIS15|bisbal/i.test(todo)) return "La Bisbal";
  if (/VICAR/i.test(todo) || /\bPA0\d{5}\b|PA847030/.test(titulo)) return "Vicar";
  if (/sibelco/i.test(todo) || /\bW[MBS]/.test(titulo)) return "Sibelco";
  if (/limoge/i.test(todo)) return "Limoges";
  if (/\bPAVD|\bBG\d|\bPA-(NT|CH|CT)/.test(titulo) || /Vicent/i.test(imagen)) return "Vicente Díez";
  if (/saint-amand/i.test(todo)) return "Saint-Amand";
  if (/SIO-?2/i.test(todo)) return "SIO-2";
  return "ANPER";
}

const actual = JSON.parse(await readFile(ARCHIVO, "utf8"));
const sio2 = actual.filter((p) => !p.marca || p.marca === "SIO-2").map((p) => ({ ...p, marca: "SIO-2", tienda: "SIO-2" }));
const normal = (t) => t.toUpperCase().replace(/[-_]/g, " ").replace(/\s+/g, " ").trim();
const nombresSio2 = new Set(sio2.map((p) => normal(p.nombre)));
// ¿Es una pasta de SIO-2 que ya está? («BLACK-ICE Porcelana negra» → BLACK ICE)
const repiteSio2 = (nombre) => {
  const n = normal(nombre);
  return [...nombresSio2].some((s) => n === s || n.startsWith(`${s} `));
};

const nuevas = [];
const codigosVistos = new Set();
function anadir(p) {
  const clave = p.codigo ?? `${p.marca}:${normal(p.nombre)}`;
  if (codigosVistos.has(clave)) return;
  codigosVistos.add(clave);
  nuevas.push(p);
  console.log(`${p.tienda} · ${p.marca} · ${p.nombre}${p.coccion ? ` · ${p.coccion}` : ""}${p.cocciones.length ? ` · contracción ${p.secado} + ${p.cocciones[0].contraccion} %` : ""}${p.colada ? " · colada" : ""}`);
}

// ---------- ANPER ----------
const CATEGORIAS_ANPER = {
  "arcilla-baja-temperatura": "Baja temperatura",
  "arcilla-alta-temperatura/gres/59": "Gres y refractarias",
  "arcilla-alta-temperatura/porcelana/58": "Porcelana",
  "arcilla-alta-temperatura/refractaria/60": "Gres y refractarias",
  "arcilla-alta-temperatura/vitrogres-1050-1100-c/61": "Gres y refractarias",
};
const fichasAnper = new Map();
for (const [categoria, tipo] of Object.entries(CATEGORIAS_ANPER)) {
  const html = await texto(`https://anper.net/categoria/${categoria}`);
  for (const [url, id] of html.matchAll(/https:\/\/anper\.net\/productos\/(\d+)\/arcilla[^"'\s]*/g)) if (!fichasAnper.has(id)) fichasAnper.set(id, { url, tipo });
}
for (const [id, { url, tipo }] of fichasAnper) {
  await esperar(300);
  const html = await texto(url);
  const titulo = entidades(html.match(/<title>([\s\S]*?) - ANPER/)?.[1] ?? "").trim();
  const imagen = decodeURIComponent(html.match(/og:image" content="([^"]*)"/)?.[1] ?? "");
  const t = plano(html);
  const ficha = t.slice(t.indexOf("Categoría:"), t.indexOf("Añadir a la cesta") > 0 ? t.indexOf("Añadir a la cesta") : undefined);
  const { codigo, nombre } = limpiar(titulo);
  if (!nombre || /pincel/i.test(nombre)) continue;
  const marca = marcaAnper(titulo, imagen, ficha);
  if ((marca === "SIO-2" || marca === "ANPER") && repiteSio2(nombre)) continue;
  anadir({ id: `anper-${id}`, marca, tienda: "ANPER", codigo, nombre, descripcion: "", tipo: tipoDe(nombre, tipo), chamota: null, ...datosTecnicos(ficha), url });
}

// ---------- Prodesco (su tienda tiene API) ----------
const CATEGORIAS_PRODESCO = { 77: "Baja temperatura", 78: "Gres y refractarias", 79: "Porcelana", 261: "Sin cocción", 80: "Impresión 3D", 76: "Baja temperatura" };
const vistosProdesco = new Set();
for (const [categoria, tipo] of Object.entries(CATEGORIAS_PRODESCO)) {
  const lista = JSON.parse(await texto(`https://prodesco.es/wp-json/wc/store/v1/products?category=${categoria}&per_page=100`));
  for (const p of lista) {
    if (vistosProdesco.has(p.id)) continue;
    vistosProdesco.add(p.id);
    const titulo = entidades(p.name);
    const { codigo, nombre } = limpiar(titulo.replace(/^CORTE DE\s+/i, ""));
    if (repiteSio2(nombre) || /^SIO-2/i.test(nombre)) continue;
    // Plus y Colorplus: el mismo producto en varios tamaños y colores, una vez
    const desc = plano(`${p.short_description} ${p.description}`);
    const marca = /limoge/i.test(nombre) ? "Limoges" : /^W[MBS]/.test(codigo ?? "") ? "Sibelco" : "Prodesco";
    const sinCoccion = /endurece al aire|sin (necesidad de )?cocci[oó]n/i.test(desc);
    anadir({
      id: `prodesco-${p.id}`, marca, tienda: "Prodesco",
      codigo,
      nombre: nombre.replace(/^(Plus|Colorplus) .*$/i, (m) => m), descripcion: "",
      tipo: sinCoccion ? "Sin cocción" : tipoDe(nombre, tipo), chamota: null, ...datosTecnicos(desc), url: p.permalink,
    });
  }
}

// ---------- Díez Ceramic: porcelanas Tecniclay (cada color, con su muestra) ----------
try {
  const html = await texto("https://diezceramic.com/tienda/porcelanas/34-1422-porcelanas-masa-plastica-profesional.html");
  const t = plano(html);
  const datos = datosTecnicos(t.slice(t.indexOf("Descripción"), t.indexOf("Descripción") + 3000));
  for (const c of coloresDelProducto(html)) {
    const color = c.nombre || c.serie;
    anadir({
      id: `diez-${c.id.replace(/^tg-/, "")}`, marca: "Vicente Díez", tienda: "Díez Ceramic", codigo: c.codigo || null,
      nombre: `Tecniclay ${color.replace(/\s*Tecniclay$/i, "")}`, descripcion: "Porcelana de color", tipo: "Porcelana", chamota: null,
      ...datos, color: c.color, muestra: c.color ? null : c.muestra, url: c.url,
    });
  }
} catch (e) {
  console.warn("Díez Ceramic no ha contestado: las Tecniclay se quedan como estaban.", e.message);
  for (const p of actual.filter((x) => x.tienda === "Díez Ceramic")) anadir(p);
}

const todas = [...sio2, ...nuevas];
await writeFile(ARCHIVO, JSON.stringify(todas, null, 2) + "\n");
const porMarca = todas.reduce((m, p) => ((m[p.marca] = (m[p.marca] ?? 0) + 1), m), {});
console.log(`\n${todas.length} pastas en pastas.json:`, porMarca);
