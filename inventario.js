// Panel del taller: inventario de esmaltes. Lo que se marca aquí lo ven los
// alumnos en sus tableros y en sus piezas (inventario-esmaltes.js).

const $ = (sel) => document.querySelector(sel);
const nube = window.nube;
const MAXIMO = 100; // filas a la vez en el catálogo; para más, buscar

let catalogo = [];
let inventario = new Map(); // clave → fila de inventario_esmaltes
let filtro = "todos";
let cargandoCatalogo = true;
let faltaTabla = false; // Supabase sin la tabla inventario_esmaltes (falta ejecutar esquema.sql) // se empieza por el catálogo, para ir tickando
let temporizadorCopia;

let temporizadorAviso;
function avisar(texto) {
  const el = $("#aviso");
  el.textContent = texto;
  el.classList.add("visible");
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => el.classList.remove("visible"), 2500);
}

// Crea un elemento: h("button", { class: "x", onclick }, "texto", hijo…)
function h(etiqueta, props = {}, ...hijos) {
  const el = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(props)) {
    if (valor == null || valor === false) continue;
    if (clave.startsWith("on")) el.addEventListener(clave.slice(2), valor);
    else if (clave === "class") el.className = valor;
    else if (clave in el) el[clave] = valor;
    else el.setAttribute(clave, valor === true ? "" : valor);
  }
  el.append(...hijos.flat().filter((x) => x != null && x !== false && x !== ""));
  return el;
}

const sinAcentos = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const nombreDe = (e) => [e.codigo, e.nombre].filter(Boolean).join(" · ") || e.serie || "Esmalte";
const claveDe = (e) => window.inventarioTaller.clave(e);

// El catálogo de Prodesco, el mismo que en los tableros (con copia en el móvil)
async function cargarCatalogo() {
  try { catalogo = JSON.parse(localStorage.getItem("catalogoEsmaltes")) ?? []; } catch {}
  if (catalogo.length) pintar(); // la copia del móvil, mientras llega la nueva
  try {
    const r = await fetch("/api/esmaltes");
    if (!r.ok) throw new Error();
    catalogo = await r.json();
    try { localStorage.setItem("catalogoEsmaltes", JSON.stringify(catalogo)); } catch {}
  } catch {
    if (!catalogo.length) throw new Error("sin catálogo");
  }
}

async function cargarInventario() {
  const { data, error } = await nube.cliente.from("inventario_esmaltes").select("*").order("codigo").order("nombre");
  if (error) throw error;
  inventario = new Map(data.map((x) => [x.clave, x]));
}

// ---------- Pintar ----------

function pintarResumen() {
  if (faltaTabla) {
    $("#resumen-inventario").textContent = "Para que se guarde lo que marques, falta un paso en Supabase: vuelve a ejecutar supabase/esquema.sql (SQL Editor → pegar entero → Run) y recarga esta página.";
    $("#resumen-inventario").classList.add("aviso-falta");
    return;
  }
  const filas = [...inventario.values()];
  const poco = filas.filter((x) => x.estado === "poco").length;
  $("#resumen-inventario").textContent = filas.length
    ? `${filas.length === 1 ? "1 esmalte" : `${filas.length} esmaltes`} en el taller${poco ? ` · ${poco === 1 ? "queda poco de 1" : `quedan pocos de ${poco}`}` : ""}`
    : "Aún no has marcado ningún esmalte. Empieza por el catálogo de Prodesco.";
}

function pintar() {
  pintarResumen();
  const palabras = sinAcentos($("#buscar-inventario").value).split(/\s+/).filter(Boolean);
  const coincide = (e) => palabras.every((p) => sinAcentos(`${e.codigo} ${e.nombre} ${e.serie} ${e.nota ?? ""}`).includes(p));
  let lista;
  if (filtro === "todos") return pintarCatalogo(catalogo.filter(coincide), palabras.length > 0);
  $("#series-inventario").hidden = true;
  {
    $("#catalogo-inventario").replaceChildren();
    lista = [...inventario.values()].filter((x) => (filtro === "taller" || x.estado === "poco") && coincide(x));
  }
  const total = lista.length;
  lista = lista.slice(0, MAXIMO);
  $("#cuenta-inventario").textContent = filtro === "todos"
    ? total > MAXIMO ? `${total} esmaltes; salen los ${MAXIMO} primeros. Busca para afinar.` : `${total === 1 ? "1 esmalte" : `${total} esmaltes`}`
    : total ? "" : filtro === "poco" ? "No queda poco de ninguno." : palabras.length ? "Ninguno con esa búsqueda." : "";
  $("#lista-inventario").replaceChildren(...lista.map(fila));
}

function fila(e) {
  const clave = "url" in e ? claveDe(e) : e.clave; // del catálogo, por su enlace; del inventario, la suya
  const enInventario = inventario.get(clave);
  const estado = enInventario?.estado ?? "no";
  const propio = clave.startsWith("propio:");
  const muestra = e.miniatura
    ? h("img", { src: e.miniatura, alt: "", loading: "lazy" })
    : h("span", { class: "color-propio", style: `background:${e.color || "#c49a64"}` });
  const boton = (valor, texto) => h("button", { type: "button", class: `estado-${valor}`, "aria-pressed": String(estado === valor),
    onclick: () => cambiar(e, clave, valor) }, texto);
  return h("li", { class: `fila-inv estado-${estado}` },
    h("span", { class: "muestra-inv" }, muestra),
    h("span", { class: "datos-inv" },
      h("strong", {}, nombreDe(e)),
      h("small", {}, [propio ? "No es de Prodesco" : e.serie, e.nota].filter(Boolean).join(" · "))),
    h("span", { class: "estados-inv", role: "group", "aria-label": `${nombreDe(e)}: ¿hay en el taller?` },
      boton("no", "No hay"), boton("hay", "Hay"), boton("poco", "Poco")));
}

// ---------- Catálogo para ir marcando ----------
// Todas las muestras de Prodesco por series; al tocar una se marca (hay) o se
// desmarca. «Queda poco» se pone en la pestaña «En el taller».

// ---------- Series: «mis series» (las mismas que en los tableros) y filtro ----------

const SERIES_POR_DEFECTO = ["Especiales EESP", "Transparentes ETSP", "Opacos EOSP", "PSE con Plomo", "ENSP"];
let serieElegida = "mias"; // "mias", "todas" o el nombre de una serie
function leerSeries() {
  try {
    const guardadas = JSON.parse(localStorage.getItem("seriesFavoritas"));
    if (Array.isArray(guardadas)) return new Set(guardadas);
  } catch {}
  return new Set(SERIES_POR_DEFECTO);
}
function cambiarFavorita(serie) {
  const series = leerSeries();
  series.has(serie) ? series.delete(serie) : series.add(serie);
  try { localStorage.setItem("seriesFavoritas", JSON.stringify([...series])); } catch {}
  if (serieElegida === "mias" && !series.size) serieElegida = "todas";
  pintar();
}
// Primero tus series y luego las demás, por orden alfabético
function ordenSeries(nombres) {
  const favoritas = leerSeries();
  return [...nombres].sort((a, b) => favoritas.has(b) - favoritas.has(a) || a.localeCompare(b, "es"));
}

function pintarSeries() {
  const caja = $("#series-inventario");
  caja.hidden = filtro !== "todos" || !catalogo.length;
  if (caja.hidden) return;
  const favoritas = leerSeries();
  const cuantos = new Map();
  for (const e of catalogo) cuantos.set(e.serie, (cuantos.get(e.serie) ?? 0) + 1);
  const chip = (valor, texto, extra) => h("button", { type: "button", class: `chip-serie${favoritas.has(valor) ? " favorita" : ""}`,
    "aria-pressed": String(serieElegida === valor), onclick: () => { serieElegida = valor; pintar(); } }, texto, extra && h("small", {}, extra));
  caja.replaceChildren(
    favoritas.size > 0 && chip("mias", "★ Mis series"),
    chip("todas", "Todas", String(catalogo.length)),
    ...ordenSeries(cuantos.keys()).map((s) => chip(s, s, String(cuantos.get(s)))));
}

function pintarCatalogo(lista, buscando) {
  $("#lista-inventario").replaceChildren();
  pintarSeries();
  const favoritas = leerSeries();
  if (serieElegida === "mias" && !favoritas.size) serieElegida = "todas";
  // Buscando se mira en todo el catálogo; si no, en la serie o las series elegidas
  if (!buscando) lista = lista.filter((e) => serieElegida === "todas" || (serieElegida === "mias" ? favoritas.has(e.serie) : e.serie === serieElegida));
  const marcados = lista.filter((e) => inventario.has(claveDe(e))).length;
  $("#cuenta-inventario").textContent = lista.length
    ? `Toca una muestra para marcarla. ${marcados} de ${lista.length} marcadas${buscando ? " (la búsqueda mira en todo el catálogo)" : ""}.`
    : cargandoCatalogo ? "Cargando el catálogo de Prodesco… (la primera vez tarda unos segundos)"
    : buscando ? "Ninguno con esa búsqueda." : "No he podido cargar el catálogo de Prodesco. Prueba en un rato.";
  const series = new Map();
  for (const e of lista) series.set(e.serie, [...(series.get(e.serie) ?? []), e]);
  $("#catalogo-inventario").replaceChildren(...ordenSeries(series.keys()).map((serie) => {
    const esmaltes = series.get(serie);
    const cuenta = h("small", {});
    const contar = () => (cuenta.textContent = `${esmaltes.filter((e) => inventario.has(claveDe(e))).length} de ${esmaltes.length}`);
    contar();
    const favorita = favoritas.has(serie);
    return h("section", { class: "serie-cat" },
      h("h3", {}, h("button", { type: "button", class: `estrella${favorita ? " puesta" : ""}`, "aria-pressed": String(favorita),
        "aria-label": favorita ? `Quitar ${serie} de mis series` : `Poner ${serie} en mis series`, title: favorita ? "Quitar de mis series" : "Poner en mis series",
        onclick: () => cambiarFavorita(serie) }, favorita ? "★" : "☆"), serie, " ", cuenta),
      h("div", { class: "rejilla-cat" }, esmaltes.map((e) => ficha(e, contar))));
  }));
}

function ficha(e, alCambiar) {
  const clave = claveDe(e);
  const boton = h("button", { type: "button", class: "ficha-cat" },
    h("span", { class: "img-cat" }, h("img", { src: e.miniatura, alt: "", loading: "lazy" }), h("span", { class: "tick", "aria-hidden": "true" }, "✓")),
    h("strong", {}, e.codigo || e.nombre),
    h("small", {}, e.codigo ? e.nombre || "" : ""));
  const pintarFicha = () => {
    const estado = inventario.get(clave)?.estado ?? "no";
    boton.setAttribute("aria-pressed", String(estado !== "no"));
    boton.classList.toggle("poco", estado === "poco");
    boton.setAttribute("aria-label", `${nombreDe(e)}: ${estado === "no" ? "no hay" : estado === "poco" ? "queda poco" : "en el taller"}`);
  };
  pintarFicha();
  boton.addEventListener("click", async () => {
    const marcado = inventario.has(clave);
    boton.disabled = true;
    const ok = await cambiar(e, clave, marcado ? "no" : "hay", { repintar: false, preguntar: false });
    boton.disabled = false;
    if (!ok) return;
    pintarFicha();
    alCambiar();
    pintarResumen();
    const total = $("#catalogo-inventario").querySelectorAll(".ficha-cat").length;
    const marcados = $("#catalogo-inventario").querySelectorAll('.ficha-cat[aria-pressed="true"]').length;
    $("#cuenta-inventario").textContent = `Toca una muestra para marcarla. ${marcados} de ${total} marcadas.`;
  });
  return boton;
}

// ---------- Cambiar ----------

async function cambiar(e, clave, estado, { repintar = true, preguntar = true } = {}) {
  const actual = inventario.get(clave);
  if ((actual?.estado ?? "no") === estado) return true;
  const cliente = nube.cliente.from("inventario_esmaltes");
  let error;
  if (estado === "no") {
    if (preguntar && clave.startsWith("propio:") && !confirm(`¿Quitar «${nombreDe(e)}» del inventario? Como no es de Prodesco, se borra del todo.`)) return false;
    ({ error } = await cliente.delete().eq("clave", clave));
    if (!error) inventario.delete(clave);
  } else if (actual) {
    ({ error } = await cliente.update({ estado }).eq("clave", clave));
    if (!error) actual.estado = estado;
  } else {
    const nueva = { clave, codigo: e.codigo || null, nombre: e.nombre || e.codigo || "Esmalte", serie: e.serie || null, miniatura: e.miniatura || null, estado };
    ({ error } = await cliente.insert(nueva));
    if (!error) inventario.set(clave, nueva);
  }
  if (error) {
    avisar(faltaTabla ? "Antes hay que ejecutar esquema.sql en Supabase" : "No se ha podido guardar");
    return false;
  }
  avisar(estado === "no" ? `${nombreDe(e)}: no hay` : estado === "poco" ? `${nombreDe(e)}: queda poco` : `${nombreDe(e)}: en el taller ✓`);
  if (repintar) pintar();
  clearTimeout(temporizadorCopia);
  temporizadorCopia = setTimeout(() => window.inventarioTaller.cargar(true), 1500); // la copia de este móvil, al día
  return true;
}

$("#form-propio").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const nombre = $("#propio-nombre").value.trim();
  if (!nombre) return;
  const nueva = { clave: `propio:${crypto.randomUUID()}`, nombre, color: $("#propio-color").value, nota: $("#propio-nota").value.trim() || null, estado: "hay" };
  const { error } = await nube.cliente.from("inventario_esmaltes").insert(nueva);
  if (error) return avisar("No se ha podido añadir");
  inventario.set(nueva.clave, nueva);
  ev.target.reset();
  avisar(`${nombre} añadido`);
  filtro = "taller"; // el nuevo sale en «En el taller»
  marcarFiltro();
  pintar();
  window.inventarioTaller.cargar(true);
});

function marcarFiltro() {
  document.querySelectorAll("[data-filtro]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.filtro === filtro)));
}
document.querySelectorAll("[data-filtro]").forEach((b) => b.addEventListener("click", () => {
  filtro = b.dataset.filtro;
  marcarFiltro();
  pintar();
}));
let temporizadorBuscar;
$("#buscar-inventario").addEventListener("input", () => {
  clearTimeout(temporizadorBuscar);
  temporizadorBuscar = setTimeout(pintar, 200);
});

// ---------- Arranque ----------

(async () => {
  await window.accesoTaller;
  // El inventario y el catálogo se cargan a la vez; si falla uno, el otro se ve igual
  const inventarioListo = cargarInventario().catch((e) => {
    faltaTabla = /inventario_esmaltes|PGRST205|does not exist|schema cache/i.test(`${e?.code} ${e?.message}`);
    if (!faltaTabla) $("#resumen-inventario").textContent = "No se ha podido cargar lo que ya tenías marcado. Comprueba la conexión y recarga.";
  });
  pintar();
  await inventarioListo;
  pintar();
  try {
    await cargarCatalogo();
  } catch {}
  cargandoCatalogo = false;
  pintar();
})();
