// Panel del taller: inventario de esmaltes. Lo que se marca aquí lo ven los
// alumnos en sus tableros y en sus piezas (inventario-esmaltes.js).

const $ = (sel) => document.querySelector(sel);
const nube = window.nube;
const MAXIMO = 100; // filas a la vez en el catálogo; para más, buscar

let catalogo = [];
let inventario = new Map(); // clave → fila de inventario_esmaltes
let filtro = "taller";

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
  if (filtro === "todos") {
    lista = catalogo.filter(coincide);
  } else {
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

// ---------- Cambiar ----------

async function cambiar(e, clave, estado) {
  const actual = inventario.get(clave);
  if ((actual?.estado ?? "no") === estado) return;
  const cliente = nube.cliente.from("inventario_esmaltes");
  let error;
  if (estado === "no") {
    if (clave.startsWith("propio:") && !confirm(`¿Quitar «${nombreDe(e)}» del inventario? Como no es de Prodesco, se borra del todo.`)) return;
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
  if (error) return avisar("No se ha podido guardar");
  avisar(estado === "no" ? `${nombreDe(e)}: no hay` : estado === "poco" ? `${nombreDe(e)}: queda poco` : `${nombreDe(e)}: en el taller ✓`);
  pintar();
  window.inventarioTaller.cargar(true); // la copia de este móvil, al día
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
  filtro = "taller";
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
  try {
    await cargarInventario();
  } catch {
    $("#cuenta-inventario").textContent = "No se ha podido cargar el inventario. Comprueba la conexión y recarga.";
    return;
  }
  // Sin nada apuntado se empieza por el catálogo
  if (!inventario.size) { filtro = "todos"; marcarFiltro(); }
  pintar();
  try {
    await cargarCatalogo();
  } catch {
    if (filtro === "todos") $("#cuenta-inventario").textContent = "No he podido cargar el catálogo de Prodesco. Prueba en un rato.";
    return;
  }
  pintar();
})();
