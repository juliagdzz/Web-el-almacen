// Descarga las pastas cerámicas de SIO-2 con sus contracciones y las guarda en pastas.json.
// Uso (desde la carpeta del proyecto):  node scripts/actualizar-pastas.mjs
// Después, node scripts/catalogo-pastas.mjs para añadir las otras marcas.

import { writeFile } from "node:fs/promises";

const WEB = "https://www.sio-2.com/es/";
const CATEGORIAS = {
  "66-pastas-ceramicas-baja-temperatura": "Baja temperatura",
  "74-pastas-refractarias-y-gres": "Gres y refractarias",
  "86-pastas-porcelana": "Porcelana",
  "82-pastas-ceramicas-especiales": "Especiales",
  "90-pastas-ceramicas-impresion-3d": "Impresión 3D",
  "94-pasta-para-modelar": "Hobby cerámico",
};

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// Con hasta tres intentos: a veces la conexión se corta
async function texto(url, intentos = 3) {
  try {
    const respuesta = await fetch(url);
    if (!respuesta.ok) throw new Error(`${url} → ${respuesta.status}`);
    return await respuesta.text();
  } catch (e) {
    if (intentos <= 1) throw e;
    await esperar(2000);
    return texto(url, intentos - 1);
  }
}

// El HTML de la ficha pasado a líneas de texto
function lineas(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

const numero = (t) => parseFloat(t.replace(",", ".").replace(/\s+/g, ""));

// "PRAI Arcilla blanca alta temperatura" → PRAI / Arcilla blanca alta temperatura
function separarNombre(titulo) {
  const palabras = titulo.replace(/\s+\d+([.,]\d+)?\s*(kg|lt)\b.*$/i, "").trim().split(/\s+/);
  let corte = 0;
  while (corte < palabras.length && /^[A-ZÁÉÍÓÚÑ0-9/.-]+$/.test(palabras[corte])) corte++;
  const nombre = palabras.slice(0, corte).join(" ") || palabras[0];
  const descripcion = palabras.slice(corte).join(" ");
  return { nombre, descripcion: descripcion && descripcion[0].toUpperCase() + descripcion.slice(1) };
}

function leerFicha(html, url, tipo) {
  const l = lineas(html);
  const titulo = l[0].split(" - SIO-2")[0].trim();
  const secado = l.find((x) => /^Contracci[oó]n (de )?secado/i.test(x));
  const cocciones = l
    .filter((x) => /^Contracci[oó]n cocci[oó]n/i.test(x))
    .map((x) => {
      const m = x.match(/(\d{3,4})\s*º?\s*C\)?:\s*(-?[\d.,\s]+)%/i);
      return m && { temperatura: Number(m[1]), contraccion: numero(m[2]) };
    })
    .filter(Boolean);
  if (!secado || !cocciones.length) return null;

  const i = l.findIndex((x) => /^Temperatura de cocci[oó]n\*/i.test(x));
  const rango = i >= 0 ? l[i + 1].replace(/\s*º\s*C/, " ºC") : `${cocciones.map((c) => c.temperatura).join(" / ")} ºC`;
  const porosidad = l.find((x) => /^Porosidad/i.test(x))?.match(/:\s*([\d.,]+)\s*%/)?.[1];
  // El tamaño de la chamota solo viene en la dirección: "…-0-02mm-…" es 0-0,2 mm
  const chamota = url.match(/-(\d)-(\d+)-?mm/);
  const { nombre, descripcion } = separarNombre(titulo);
  return {
    id: Number(url.match(/\/(\d+)-[^/]+$/)[1]),
    nombre,
    descripcion: descripcion.replace(/\s*\d-[\d.]+\s*mm/, ""),
    chamota: chamota && `${chamota[1]}-${chamota[2].length > 1 ? chamota[2][0] + "," + chamota[2].slice(1) : chamota[2]} mm`,
    tipo,
    coccion: rango,
    secado: numero(secado.split(":")[1]),
    cocciones,
    porosidad: porosidad ? numero(porosidad) : null,
    url,
  };
}

const pastas = [];
const vistas = new Set();
for (const [categoria, tipo] of Object.entries(CATEGORIAS)) {
  const html = await texto(`${WEB}${categoria}?resultsPerPage=100`);
  const enlaces = [...new Set(html.match(/https:\/\/www\.sio-2\.com\/es\/[^"]+\.html/g) ?? [])]
    .filter((u) => u.includes(categoria.replace(/^\d+-/, "")));
  for (const url of enlaces) {
    await esperar(300); // sin prisas, para no cargar su web
    const ficha = leerFicha(await texto(url), url, tipo);
    // Las mismas pastas en otro formato (5 kg, 12,5 kg…) solo una vez
    if (!ficha || vistas.has(ficha.nombre)) continue;
    vistas.add(ficha.nombre);
    pastas.push(ficha);
    console.log(`${tipo} · ${ficha.nombre}: secado ${ficha.secado} %, cocción ${ficha.cocciones.map((c) => `${c.contraccion} % a ${c.temperatura} ºC`).join(", ")}`);
  }
}

await writeFile(new URL("../pastas.json", import.meta.url), JSON.stringify(pastas, null, 2) + "\n");
console.log(`\n${pastas.length} pastas guardadas en pastas.json`);
