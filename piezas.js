// Piezas terminadas y recetas de esmalte propias. Todo se guarda en el navegador (IndexedDB).

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const app = $("#app");
const LADO_MAXIMO = 1600;

// ---------- Listas típicas ----------

// [nombre, grupo, hay que tener cuidado al manipularlo]
const MATERIALES = [
  ["Feldespato potásico", "Fundentes"],
  ["Feldespato sódico", "Fundentes"],
  ["Nefelina sienita", "Fundentes"],
  ["Carbonato cálcico (blanco de España)", "Fundentes"],
  ["Wollastonita", "Fundentes"],
  ["Dolomita", "Fundentes"],
  ["Talco", "Fundentes"],
  ["Carbonato de magnesio", "Fundentes"],
  ["Óxido de zinc", "Fundentes"],
  ["Carbonato de estroncio", "Fundentes"],
  ["Carbonato de bario", "Fundentes", true],
  ["Carbonato de litio", "Fundentes", true],
  ["Espodumena", "Fundentes"],
  ["Petalita", "Fundentes"],
  ["Colemanita", "Fundentes"],
  ["Gerstley borate", "Fundentes"],
  ["Bórax", "Fundentes"],
  ["Ceniza de madera", "Fundentes", true],
  ["Frita alcalina", "Fritas"],
  ["Frita borácica (borosilicato cálcico)", "Fritas"],
  ["Frita transparente", "Fritas"],
  ["Cuarzo (sílice)", "Sílice y alúmina"],
  ["Caolín", "Sílice y alúmina"],
  ["Arcilla de bola (ball clay)", "Sílice y alúmina"],
  ["Óxido de hierro rojo", "Colorantes"],
  ["Óxido de cobre negro", "Colorantes"],
  ["Carbonato de cobre", "Colorantes"],
  ["Óxido de cobalto", "Colorantes", true],
  ["Carbonato de cobalto", "Colorantes", true],
  ["Dióxido de manganeso", "Colorantes", true],
  ["Óxido de cromo", "Colorantes", true],
  ["Óxido de níquel", "Colorantes", true],
  ["Rutilo", "Colorantes"],
  ["Pigmento cerámico", "Colorantes"],
  ["Dióxido de titanio", "Opacificantes"],
  ["Óxido de estaño", "Opacificantes"],
  ["Silicato de circonio", "Opacificantes"],
  ["Bentonita", "Aditivos"],
  ["CMC (goma)", "Aditivos"],
];
const SE_AÑADEN = new Set(["Colorantes", "Opacificantes", "Aditivos"]); // van «fuera del 100 %»
const material = (nombre) => MATERIALES.find(([n]) => n.toLowerCase() === nombre.trim().toLowerCase());

const UNIDADES = { g: "gramos", "%": "%", cucharadas: "cucharadas", partes: "partes" };
const TECNICAS = ["Torno", "Pellizco", "Churros", "Planchas", "Molde o colada", "Modelado", "Asas", "Esgrafiado", "Engobe",
  "Bajo cubierta", "Cera de reserva", "Mishima", "Nerikomi", "Bruñido", "Sigillata", "Estampado", "Esponjado",
  "Salpicado", "Calcomanía", "Lustre u oro", "Raku", "Craquelado"];
const APLICACIONES = ["Pincel", "Inmersión", "Vertido", "Pulverizado", "Esponja", "Pera o jeringa", "Salpicado"];
const PINCELES = ["Pincel plano", "Pincel redondo", "Paletina", "Pincel abanico", "Pincel hake", "Pincel de cerdas", "Perfilador (liner)", "Pincel lengua de gato"];
const ZONAS = ["Toda la pieza", "Exterior", "Interior", "Borde", "Pie", "Detalles"];
const ATMOSFERAS = ["Oxidación", "Reducción", "Raku", "Leña"];

// ---------- Base de datos ----------

let dbPromesa;
function abrirDB() {
  dbPromesa ??= new Promise((resolve, reject) => {
    const peticion = indexedDB.open("elalmacen-piezas", 1);
    peticion.onupgradeneeded = () => {
      peticion.result.createObjectStore("piezas", { keyPath: "id" });
      peticion.result.createObjectStore("recetas", { keyPath: "id" });
    };
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error);
  });
  return dbPromesa;
}

async function operacion(almacen, modo, fn) {
  const db = await abrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(almacen, modo);
    const resultado = fn(tx.objectStore(almacen));
    tx.oncomplete = () => resolve(resultado?.result);
    tx.onerror = () => reject(tx.error);
  });
}

const datos = {
  todos: (almacen) => operacion(almacen, "readonly", (s) => s.getAll()),
  uno: (almacen, id) => operacion(almacen, "readonly", (s) => s.get(id)),
  // Cada cambio se avisa a nube.js, que lo sube a la cuenta si hay sesión
  async guardar(almacen, obj) {
    await operacion(almacen, "readwrite", (s) => s.put(obj));
    window.nube?.guardado(almacen, obj);
  },
  async borrar(almacen, id) {
    await operacion(almacen, "readwrite", (s) => s.delete(id));
    window.nube?.borrado(almacen, id);
  },
};

const nuevoId = () => crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);
const hoy = () => new Date().toISOString().slice(0, 10);
const fecha = (iso) => iso ? new Date(iso + "T12:00").toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) : "";
const numero = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });

// ---------- Utilidades ----------

// Crea un elemento: h("button", { class: "x", onclick }, "texto", hijo…)
function h(etiqueta, props = {}, ...hijos) {
  const el = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(props)) {
    if (valor == null || valor === false) continue;
    if (clave.startsWith("on")) el.addEventListener(clave.slice(2), valor);
    else if (clave === "class") el.className = valor;
    else if (clave in el && !["list", "form"].includes(clave)) el[clave] = valor;
    else el.setAttribute(clave, valor === true ? "" : valor);
  }
  el.append(...hijos.flat().filter((x) => x != null && x !== false));
  return el;
}

// Pinta la pantalla; los apartados que no tocan (false/null) se saltan
function pintar(...hijos) {
  app.replaceChildren(...hijos.flat().filter((x) => x != null && x !== false));
}

let urlsActivas = [];
function urlDe(blob) {
  const url = URL.createObjectURL(blob);
  urlsActivas.push(url);
  return url;
}

async function prepararImagen(blob) {
  const bitmap = await createImageBitmap(blob);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
}

let temporizadorAviso;
function avisar(texto) {
  const el = $("#aviso");
  el.textContent = texto;
  el.classList.add("visible");
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => el.classList.remove("visible"), 2500);
}

// ---------- Guardado automático ----------

let pendiente = null; // { almacen, obj, temporizador }

function cambiado(almacen, obj) {
  obj.modificado = Date.now();
  // Una ficha nueva pasa a tener su propia dirección, para que al recargar se abra ella y no otra vacía
  if (/^#\/(pieza\/nueva|esmalte\/nuevo)$/.test(location.hash)) {
    history.replaceState(null, "", `#/${almacen === "piezas" ? "pieza" : "esmalte"}/${obj.id}`);
  }
  clearTimeout(pendiente?.temporizador);
  pendiente = { almacen, obj, temporizador: setTimeout(guardarYa, 400) };
  $(".estado-guardado")?.replaceChildren("Guardando…");
}

async function guardarYa() {
  if (!pendiente) return;
  const { almacen, obj, temporizador } = pendiente;
  clearTimeout(temporizador);
  pendiente = null;
  await datos.guardar(almacen, obj);
  $(".estado-guardado")?.replaceChildren("Guardado ✓");
}

// ---------- Campos reutilizables ----------

function campo(etiqueta, control, ayuda) {
  return h("label", { class: "campo" }, h("span", { class: "etiqueta" }, etiqueta), control, ayuda && h("small", {}, ayuda));
}

// Lo que registras tú (pastas, pinceles, técnicas…) para que salga en las listas la próxima vez
function leerPropias() {
  try { return JSON.parse(localStorage.getItem("listasPropias")) ?? {}; } catch { return {}; }
}
const propias = (tipo) => leerPropias()[tipo] ?? [];
function registrar(tipo, valor) {
  const listas = leerPropias();
  listas[tipo] = [...new Set([...(listas[tipo] ?? []), valor])];
  try { localStorage.setItem("listasPropias", JSON.stringify(listas)); } catch {}
}

// Campo con desplegable: al tocarlo enseña la lista, al escribir la filtra y, si lo
// escrito no está, ofrece registrarlo. alCambiar(valor, final): final al elegir o salir.
function selector({ valor = "", opciones, tipo, etiqueta, placeholder, registrarComo, alCambiar }) {
  const input = h("input", { type: "text", value: valor, placeholder, autocomplete: "off", role: "combobox", "aria-expanded": "false", "aria-label": etiqueta });
  const lista = h("ul", { class: "desplegable", role: "listbox", hidden: true });
  const sinPerderFoco = (e) => e.preventDefault(); // tocar la lista no cierra el teclado ni el desplegable

  function todas() {
    const vistas = new Set();
    return [...(typeof opciones === "function" ? opciones() : opciones), ...propias(tipo).map((v) => ({ valor: v, detalle: "Registrado por ti" }))]
      .filter((o) => o.valor && !vistas.has(sinAcentos(o.valor)) && vistas.add(sinAcentos(o.valor)));
  }
  function pintarLista(todo) {
    const texto = input.value.trim();
    const palabras = sinAcentos(texto).split(/\s+/).filter(Boolean);
    const candidatas = todas().filter((o) => todo || palabras.every((pal) => sinAcentos(`${o.valor} ${o.detalle ?? ""}`).includes(pal)));
    const yaEsta = todas().some((o) => sinAcentos(o.valor) === sinAcentos(texto));
    lista.replaceChildren(...[
      ...candidatas.slice(0, 80).map((o) => h("li", { role: "option", "aria-selected": sinAcentos(o.valor) === sinAcentos(texto) },
        h("button", { type: "button", onpointerdown: sinPerderFoco, onclick: () => elegir(o.valor) },
          h("span", {}, o.valor), o.detalle && h("small", {}, o.detalle)))),
      texto && !yaEsta && h("li", { class: "registrar" },
        h("button", { type: "button", onpointerdown: sinPerderFoco, onclick: () => {
          registrar(tipo, texto);
          elegir(texto);
          avisar(`«${texto}» registrado: saldrá en la lista`);
        } }, `＋ ${registrarComo} «${texto}»`)),
      !candidatas.length && !texto && h("li", { class: "vacio-lista" }, "Escribe para registrar uno"),
    ].filter(Boolean));
  }
  function abrir(todo) {
    pintarLista(todo);
    lista.hidden = false;
    input.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => lista.scrollIntoView({ block: "nearest" }));
  }
  function cerrar() {
    lista.hidden = true;
    input.setAttribute("aria-expanded", "false");
  }
  function elegir(v) {
    input.value = v;
    cerrar();
    alCambiar(v, true);
  }

  input.addEventListener("focus", () => abrir(true));
  input.addEventListener("input", () => { alCambiar(input.value, false); abrir(false); });
  input.addEventListener("blur", () => { cerrar(); alCambiar(input.value, true); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") cerrar();
    if (e.key !== "Enter") return;
    e.preventDefault();
    lista.querySelector("button")?.click();
  });
  return h("div", { class: "selector" }, input,
    h("button", { type: "button", class: "abrir", tabIndex: -1, "aria-label": `Ver la lista de ${etiqueta.toLowerCase()}`, onpointerdown: sinPerderFoco,
      onclick: () => (lista.hidden ? (input.focus(), abrir(true)) : cerrar()) }, "▾"),
    lista);
}

// Fotos: miniaturas con botón de quitar, y botones de cámara y galería
function editorFotos(obj, alCambiar) {
  const caja = h("div", { class: "fotos" });
  function pintar() {
    caja.replaceChildren(
      ...obj.fotos.map((foto, i) =>
        h("figure", { class: "foto" },
          h("img", { src: urlDe(foto), alt: "" }),
          h("button", { type: "button", class: "editar-foto", "aria-label": "Editar foto", onclick: () => editar(i) }, "✎"),
          h("button", { type: "button", class: "quitar", "aria-label": "Quitar foto", onclick: () => {
            if (!confirm("¿Quitar esta foto?")) return;
            obj.fotos.splice(i, 1);
            alCambiar();
            pintar();
          } }, "✕"))),
      botonFoto("📷", "Hacer foto", { capture: "environment" }),
      botonFoto("🖼️", "Galería", { multiple: true }),
    );
  }
  // Recortar, girar o cambiar el fondo (editor-fotos.js)
  async function editar(i) {
    const nueva = await editarFoto(obj.fotos[i]);
    if (!nueva) return;
    obj.fotos[i] = nueva;
    alCambiar();
    pintar();
  }
  function botonFoto(icono, texto, extra) {
    const input = h("input", { type: "file", accept: "image/*", hidden: true, ...extra, onchange: async (e) => {
      const archivos = [...e.target.files];
      e.target.value = "";
      for (const archivo of archivos) {
        try { obj.fotos.push(await prepararImagen(archivo)); } catch { avisar("No he podido leer esa imagen"); }
      }
      alCambiar();
      pintar();
      // Con una sola foto se abre el editor directamente
      if (archivos.length === 1 && obj.fotos.length) await editar(obj.fotos.length - 1);
    } });
    return h("label", { class: "anadir-foto" }, h("span", { "aria-hidden": "true" }, icono), texto, input);
  }
  pintar();
  return caja;
}

function estrellas(obj, alCambiar) {
  const caja = h("div", { class: "estrellas", role: "radiogroup", "aria-label": "Valoración" });
  function pintar() {
    caja.replaceChildren(...[1, 2, 3, 4, 5].map((n) =>
      h("button", { type: "button", class: n <= (obj.valoracion ?? 0) ? "llena" : "", "aria-label": `${n} de 5`,
        onclick: () => { obj.valoracion = obj.valoracion === n ? 0 : n; alCambiar(); pintar(); } }, "★")));
  }
  pintar();
  return caja;
}

// «Salió mal»: apuntar los fallos también cuenta (y da la insignia Aprender del error)
function salioMal(p, alCambiar) {
  const nota = h("textarea", { rows: 3, value: p.que_paso, placeholder: "Se escurrió el esmalte y se pegó a la placa; la próxima, 1 cm sin esmaltar en el pie",
    oninput: (e) => { p.que_paso = e.target.value; alCambiar(); } });
  const campoNota = campo("¿Qué pasó?", nota, "Así la próxima vez sabes qué cambiar.");
  campoNota.hidden = !p.fallo;
  return h("div", { class: "salio-mal" },
    h("label", { class: "marcar-fallo" },
      h("input", { type: "checkbox", checked: p.fallo, onchange: (e) => {
        p.fallo = e.target.checked;
        campoNota.hidden = !p.fallo;
        alCambiar();
        if (p.fallo) nota.focus();
      } }),
      h("span", {}, "Esta pieza salió mal")),
    campoNota);
}

// ---------- Catálogo de Prodesco (el mismo que en los tableros) ----------

const SERIES_POR_DEFECTO = ["Especiales EESP", "Transparentes ETSP", "Opacos EOSP", "PSE con Plomo", "ENSP"];
let catalogo = null;

function cargarCatalogo() {
  catalogo ??= (async () => {
    let lista = null;
    try { lista = JSON.parse(localStorage.getItem("catalogoEsmaltes")); } catch {}
    const nueva = fetch("/api/esmaltes").then((r) => {
      if (!r.ok) throw new Error();
      return r.json();
    }).then((l) => {
      try { localStorage.setItem("catalogoEsmaltes", JSON.stringify(l)); } catch {}
      return l;
    });
    if (lista) nueva.catch(() => {});
    else lista = await nueva;
    return lista;
  })().catch((e) => { catalogo = null; throw e; });
  return catalogo;
}

const sinAcentos = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const compacto = (t) => sinAcentos(t).replace(/[^a-z0-9]/g, "");

function seriesFavoritas() {
  try {
    const guardadas = JSON.parse(localStorage.getItem("seriesFavoritas"));
    if (Array.isArray(guardadas)) return new Set(guardadas);
  } catch {}
  return new Set(SERIES_POR_DEFECTO);
}

let alElegirProdesco = null;

async function pintarProdesco() {
  let lista;
  try {
    lista = await cargarCatalogo();
  } catch {
    $("#cuenta-prodesco").textContent = "No he podido cargar el catálogo de Prodesco.";
    return;
  }
  const favoritas = seriesFavoritas();
  const palabras = sinAcentos($("#buscar-prodesco").value).split(/\s+/).filter(Boolean);
  const encontrados = lista
    .filter((e) => palabras.every((p) => sinAcentos(`${e.codigo} ${e.nombre} ${e.serie}`).includes(p) ||
      (compacto(p) && compacto(e.codigo).includes(compacto(p)))))
    .sort((a, b) => favoritas.has(b.serie) - favoritas.has(a.serie));
  const MAXIMO = 120;
  $("#cuenta-prodesco").textContent = encontrados.length > MAXIMO
    ? `${encontrados.length} esmaltes; salen los ${MAXIMO} primeros (tus series antes). Busca para afinar.`
    : `${encontrados.length} esmaltes`;
  $("#lista-prodesco").replaceChildren(...encontrados.slice(0, MAXIMO).map((e) =>
    h("button", { type: "button", class: "opcion-prodesco", onclick: () => {
      $("#hoja-prodesco").close();
      alElegirProdesco?.(e);
    } },
      h("img", { src: e.miniatura, alt: "", loading: "lazy" }),
      h("strong", {}, e.codigo || e.nombre),
      h("span", {}, e.codigo ? e.nombre || e.serie : e.serie),
      inventarioTaller.marca(e))));
}

function elegirProdesco(callback) {
  alElegirProdesco = callback;
  $("#buscar-prodesco").value = "";
  $("#hoja-prodesco").showModal();
  pintarProdesco();
}
$("#buscar-prodesco").addEventListener("input", pintarProdesco);

async function elegirReceta(callback) {
  const recetas = (await datos.todos("recetas")).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  $("#lista-recetas-elegir").replaceChildren(
    ...(recetas.length
      ? recetas.map((r) => h("button", { type: "button", class: "opcion", onclick: () => { $("#hoja-recetas").close(); callback(r); } },
          r.fotos[0] ? h("img", { src: urlDe(r.fotos[0]), alt: "" }) : h("span", { class: "sin-foto" }, "🧪"),
          h("span", {}, h("strong", {}, r.nombre || "Sin nombre"), r.temperatura && h("small", {}, ` · ${r.temperatura} ºC`))))
      : [h("p", {}, "Todavía no tienes recetas.")]),
    h("form", { class: "registrar-receta", onsubmit: async (e) => {
      e.preventDefault();
      const nombre = e.target.elements.nombre.value.trim();
      if (!nombre) return e.target.elements.nombre.focus();
      const r = { id: nuevoId(), nombre, tipo: "Esmalte", temperatura: "", atmosfera: "", unidad: "g", lote: 500,
        ingredientes: [], fotos: [], notas: "", creado: Date.now(), modificado: Date.now() };
      await datos.guardar("recetas", r);
      $("#hoja-recetas").close();
      callback(r);
      avisar(`«${nombre}» registrado en Mis esmaltes`);
    } },
      h("label", { for: "nombre-receta-nueva" }, "¿No está? Regístralo y completa la receta cuando quieras:"),
      h("div", { class: "fila" },
        h("input", { id: "nombre-receta-nueva", name: "nombre", type: "text", placeholder: "Nombre del esmalte", autocomplete: "off" }),
        h("button", { type: "submit" }, "＋ Registrar"))));
  $("#hoja-recetas").showModal();
}

document.querySelectorAll("dialog").forEach((d) => d.addEventListener("click", (e) => e.target === d && d.close()));

// ---------- Listas: piezas y recetas ----------

function pestanas(activa) {
  return h("nav", { class: "pestanas" },
    h("a", { href: "#/", class: activa === "piezas" ? "activa" : "" }, "Piezas"),
    h("a", { href: "#/esmaltes", class: activa === "esmaltes" ? "activa" : "" }, "Mis esmaltes"));
}

function nombreCapa(c) {
  return [c.codigo, c.nombre].filter(Boolean).join(" · ") || "Esmalte";
}

function muestraCapa(c) {
  return c.origen === "prodesco" && c.miniatura
    ? h("img", { class: "muestra", src: c.miniatura, alt: "" })
    : h("span", { class: "muestra sin-foto" }, c.origen === "propio" ? "🧪" : "🎨");
}

// "2 capas · pincel · Paletina 20 mm · exterior"
function detalleCapa(c) {
  return [`${c.capas} ${c.capas === 1 ? "capa" : "capas"}`, c.aplicacion?.toLowerCase(), c.pincel, c.zona?.toLowerCase()]
    .filter(Boolean).join(" · ");
}

// Proporciones de una receta sobre la base (sin los añadidos)
function proporciones(r) {
  const conCantidad = r.ingredientes.filter((i) => i.material && Number(i.cantidad) > 0);
  const base = conCantidad.filter((i) => !i.anadido).reduce((s, i) => s + Number(i.cantidad), 0);
  return {
    base,
    filas: base ? conCantidad.map((i) => ({ ...i, parte: Number(i.cantidad) / base })) : [],
    peligro: conCantidad.some((i) => material(i.material)?.[2]),
  };
}

// ---------- Fichas para ver, con carrusel de fotos y botón de compartir ----------

function carrusel(fotos, icono) {
  if (!fotos.length) return h("div", { class: "carrusel-vacio" }, icono);
  const pista = h("div", { class: "carrusel-pista" },
    fotos.map((foto, i) => h("img", { src: urlDe(foto), alt: `Foto ${i + 1} de ${fotos.length}` })));
  const contador = h("span", { class: "contador" }, `1 / ${fotos.length}`);
  const ir = (paso) => pista.scrollBy({ left: paso * pista.clientWidth, behavior: "smooth" });
  pista.addEventListener("scroll", () => {
    contador.textContent = `${Math.round(pista.scrollLeft / pista.clientWidth) + 1} / ${fotos.length}`;
  }, { passive: true });
  return h("div", { class: "carrusel" }, pista, fotos.length > 1 && [
    h("button", { type: "button", class: "flecha anterior", "aria-label": "Foto anterior", onclick: () => ir(-1) }, "‹"),
    h("button", { type: "button", class: "flecha siguiente", "aria-label": "Foto siguiente", onclick: () => ir(1) }, "›"),
    contador,
  ]);
}

const botonCerrar = () => h("form", { method: "dialog", class: "hoja-cierre" }, h("button", { class: "icono", "aria-label": "Cerrar" }, "✕"));
const botonCompartir = (onclick) => h("button", { type: "button", class: "secundario compartir", onclick },
  h("span", { innerHTML: ICONO_COMPARTIR }), "Compartir");

const tamano = (p) => [p.alto && `${p.alto} cm de alto`, p.ancho && `${p.ancho} cm de ancho`].filter(Boolean).join(" × ");

function textoPieza(p) {
  const coccion = [p.temperatura && `${p.temperatura} ºC`, p.atmosfera?.toLowerCase()].filter(Boolean).join(", ");
  return [
    `${p.nombre || "Pieza"}${p.fecha ? ` (${fecha(p.fecha)})` : ""}`,
    tamano(p) && `Tamaño: ${tamano(p)}`,
    p.pasta && `Pasta: ${p.pasta}`,
    coccion && `Cocción: ${coccion}`,
    p.capas.length && `Esmaltes:\n${p.capas.map((c, i) => `${i + 1}. ${nombreCapa(c)}${c.origen === "prodesco" ? " (Prodesco)" : ""}: ${detalleCapa(c)}${c.nota ? `. ${c.nota}` : ""}`).join("\n")}`,
    p.tecnicas.length && `Técnicas: ${p.tecnicas.join(", ")}`,
    p.notas && `Notas: ${p.notas}`,
    "Hecha en El Almacén",
  ].filter(Boolean).join("\n\n");
}

function textoReceta(r) {
  const { filas } = proporciones(r);
  return [
    r.nombre || "Receta de esmalte",
    [r.tipo, r.temperatura && `${r.temperatura} ºC`, r.atmosfera?.toLowerCase()].filter(Boolean).join(" · "),
    filas.length && filas.map((f) => `${f.anadido ? "+ " : ""}${f.material}: ${numero.format(f.parte * 100)} %`).join("\n"),
    r.notas && `Notas: ${r.notas}`,
    "Receta de El Almacén",
  ].filter(Boolean).join("\n\n");
}

// Abre la comunidad con la pieza o la receta ya puesta en «Publicar»
function botonComunidad(almacen, id, texto = "A la comunidad", clase = "boton secundario") {
  return h("button", { type: "button", class: clase, onclick: async () => {
    await guardarYa();
    try {
      sessionStorage.setItem("compartirComunidad", JSON.stringify({ almacen, id }));
      sessionStorage.removeItem("creandoParaComunidad");
    } catch {}
    location.href = "comunidad.html#publicar";
  } }, texto);
}

// Se ha venido desde «Publicar» de la comunidad a crear una pieza o un esmalte nuevo
const creandoParaComunidad = () => { try { return sessionStorage.getItem("creandoParaComunidad") === "1"; } catch { return false; } };

function abrirFicha(...contenido) {
  const hoja = $("#hoja-ver");
  hoja.replaceChildren(botonCerrar(), ...contenido.flat().filter((x) => x != null && x !== false));
  hoja.showModal();
  hoja.scrollTop = 0;
}

function verPieza(p) {
  const coccion = [p.temperatura && `${p.temperatura} ºC`, p.atmosfera?.toLowerCase()].filter(Boolean).join(", ");
  abrirFicha(
    carrusel(p.fotos, "🏺"),
    h("div", { class: "ficha-ver" },
      h("h2", {}, p.nombre || "Pieza sin nombre"),
      h("p", { class: "subtitulo" }, fecha(p.fecha),
        p.valoracion > 0 && h("span", { class: "valoracion", "aria-label": `${p.valoracion} de 5` }, "★".repeat(p.valoracion) + "☆".repeat(5 - p.valoracion))),
      (p.pasta || coccion || tamano(p)) && h("dl", { class: "datos" },
        tamano(p) && [h("dt", {}, "Tamaño"), h("dd", {}, tamano(p))],
        p.pasta && [h("dt", {}, "Pasta"), h("dd", {}, p.pasta)],
        coccion && [h("dt", {}, "Cocción"), h("dd", {}, coccion)]),
      p.capas.length > 0 && [
        h("h3", {}, "Esmaltes y capas"),
        h("ol", { class: "capas-ver" }, p.capas.map((c) => h("li", {},
          muestraCapa(c),
          h("div", {},
            h("strong", {}, nombreCapa(c)),
            h("small", {}, detalleCapa(c)),
            c.nota && h("small", { class: "nota" }, c.nota))))),
      ],
      p.tecnicas.length > 0 && [h("h3", {}, "Técnicas"), h("div", { class: "chips" }, p.tecnicas.map((t) => h("span", { class: "chip" }, t)))],
      p.fallo && [h("h3", {}, "Salió mal"), h("p", { class: "notas-ver" }, p.que_paso || "Sin apuntar qué pasó.")],
      p.notas && [h("h3", {}, "Notas"), h("p", { class: "notas-ver" }, p.notas)]),
    h("div", { class: "acciones-ver" },
      botonCompartir(() => compartir({ titulo: p.nombre || "Pieza", texto: textoPieza(p), imagenes: p.fotos, avisar })),
      botonComunidad("piezas", p.id),
      h("a", { href: `#/pieza/${p.id}`, class: "boton" }, "Editar")),
  );
}

function verReceta(r, piezas) {
  const { filas, peligro } = proporciones(r);
  const usadaEn = piezas.filter((p) => p.capas.some((c) => c.receta === r.id));
  abrirFicha(
    carrusel(r.fotos, "🧪"),
    h("div", { class: "ficha-ver" },
      h("h2", {}, r.nombre || "Receta sin nombre"),
      h("p", { class: "subtitulo" }, [r.tipo, r.temperatura && `${r.temperatura} ºC`, r.atmosfera].filter(Boolean).join(" · ")),
      filas.length > 0 && h("table", { class: "tabla-receta" },
        h("thead", {}, h("tr", {}, h("th", {}, "Material"), h("th", {}, "%"))),
        h("tbody", {}, filas.map((f) => h("tr", { class: f.anadido ? "anadido" : "" },
          h("td", {}, f.material, material(f.material)?.[2] && " ⚠"),
          h("td", {}, `${f.anadido ? "+" : ""}${numero.format(f.parte * 100)}`))))),
      peligro && h("p", { class: "aviso-peligro" }, "⚠ Lleva materiales tóxicos: guantes y mascarilla FFP2."),
      r.notas && [h("h3", {}, "Notas"), h("p", { class: "notas-ver" }, r.notas)],
      usadaEn.length > 0 && [h("h3", {}, "Piezas con este esmalte"),
        h("ul", { class: "usada-en" }, usadaEn.map((p) => h("li", {}, h("a", { href: "#/", onclick: (e) => { e.preventDefault(); verPieza(p); } }, p.nombre || "Pieza sin nombre"))))]),
    h("div", { class: "acciones-ver" },
      botonCompartir(() => compartir({ titulo: r.nombre || "Receta", texto: textoReceta(r), imagenes: r.fotos, avisar })),
      botonComunidad("recetas", r.id),
      h("a", { href: `#/esmalte/${r.id}`, class: "boton" }, "Editar")),
  );
}

// Primera tarjeta de cada lista: un dibujo sobre fondo oliva con un + para añadir
function tarjetaAnadir(href, ilustracion, texto, primera) {
  return h("a", { href, class: "tarjeta-pieza tarjeta-anadir" },
    h("span", { class: "ilustracion" },
      h("img", { src: ilustracion, alt: "" }),
      h("span", { class: "mas", "aria-hidden": "true" }, "+")),
    h("span", { class: "info" }, h("strong", {}, `＋ ${texto}`), primera && h("small", {}, primera)));
}

async function vistaPiezas() {
  const piezas = (await datos.todos("piezas")).sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? "") || b.modificado - a.modificado);
  pintar(
    h("h1", {}, "Piezas"),
    pestanas("piezas"),
    h("p", { class: "aviso" }, "Apunta cómo hiciste cada pieza: pasta, esmaltes, capas, pinceles y técnicas. Se guarda en este móvil."),
    h("div", { class: "tarjetas-piezas" },
      tarjetaAnadir("#/pieza/nueva", "ilustracion-pieza.svg", "Añadir pieza", piezas.length === 0 && "Apunta tu primera pieza"),
      piezas.map((p) =>
        h("a", { href: `#/pieza/${p.id}`, class: "tarjeta-pieza", onclick: (e) => { e.preventDefault(); verPieza(p); } },
          p.fotos[0] ? h("img", { src: urlDe(p.fotos[0]), alt: "" }) : h("span", { class: "sin-foto" }, "🏺"),
          h("span", { class: "info" },
            h("strong", {}, p.nombre || "Pieza sin nombre"),
            h("small", {}, [fecha(p.fecha), p.pasta].filter(Boolean).join(" · ")),
            p.capas.length > 0 && h("span", { class: "chips" }, p.capas.slice(0, 3).map((c) =>
              h("span", { class: "chip" }, nombreCapa(c), c.capas > 1 ? ` ×${c.capas}` : ""))))))),
  );
}

async function vistaRecetas() {
  const [recetas, piezas] = await Promise.all([datos.todos("recetas"), datos.todos("piezas")]);
  recetas.sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));
  const usos = (id) => piezas.filter((p) => p.capas.some((c) => c.receta === id)).length;
  pintar(
    h("h1", {}, "Mis esmaltes"),
    pestanas("esmaltes"),
    h("p", { class: "aviso" }, "Tus recetas de esmalte y engobe, con fotos de las pruebas. Luego puedes elegirlas al apuntar una pieza."),
    h("div", { class: "tarjetas-piezas" },
      tarjetaAnadir("#/esmalte/nuevo", "ilustracion-esmalte.svg", "Añadir esmalte", recetas.length === 0 && "Apunta tu primera receta"),
      recetas.map((r) =>
        h("a", { href: `#/esmalte/${r.id}`, class: "tarjeta-pieza", onclick: (e) => { e.preventDefault(); verReceta(r, piezas); } },
          r.fotos[0] ? h("img", { src: urlDe(r.fotos[0]), alt: "" }) : h("span", { class: "sin-foto" }, "🧪"),
          h("span", { class: "info" },
            h("strong", {}, r.nombre || "Receta sin nombre"),
            h("small", {}, [r.tipo, r.temperatura && `${r.temperatura} ºC`, r.atmosfera].filter(Boolean).join(" · ")),
            h("small", {}, `${r.ingredientes.length} materiales · ${usos(r.id) === 1 ? "1 pieza" : `${usos(r.id)} piezas`}`))))),
  );
}

// ---------- Ficha de una pieza ----------

async function vistaPieza(id) {
  const [existente, pastas, piezas] = await Promise.all([
    id === "nueva" ? null : datos.uno("piezas", id),
    fetch("pastas.json").then((r) => r.json()).catch(() => []),
    datos.todos("piezas"),
  ]);
  if (id !== "nueva" && !existente) return (location.hash = "#/");
  const p = existente ?? { id: nuevoId(), nombre: "", fecha: hoy(), fotos: [], pasta: "", temperatura: "", atmosfera: "", tecnicas: [], capas: [], notas: "", valoracion: 0, creado: Date.now() };
  p.alto ??= "";
  p.ancho ??= "";
  p.fallo ??= false;
  p.que_paso ??= "";
  const guardar = () => cambiado("piezas", p);
  // Pinceles ya usados en otras piezas, para no tener que escribirlos otra vez
  const pincelesUsados = [...new Set(piezas.flatMap((x) => x.capas.map((c) => c.pincel)).filter(Boolean))];
  const otrosUsados = [...new Set(piezas.flatMap((x) => x.capas.filter((c) => c.origen === "otro").map((c) => c.nombre)).filter(Boolean))];

  const texto = (clave, props = {}) => h("input", { type: "text", value: p[clave] ?? "", ...props, oninput: (e) => { p[clave] = e.target.value; guardar(); } });

  const capas = h("div", { class: "capas" });
  function pintarCapas() {
    capas.replaceChildren(...p.capas.map((c, i) => fichaCapa(c, i)),
      h("div", { class: "anadir-capa" },
        h("span", {}, "Añadir esmalte:"),
        h("button", { type: "button", class: "secundario", onclick: () => elegirProdesco((e) => nuevaCapa({ origen: "prodesco", codigo: e.codigo, nombre: e.nombre, serie: e.serie, miniatura: e.miniatura, url: e.url })) }, "Prodesco"),
        h("button", { type: "button", class: "secundario", onclick: () => elegirReceta((r) => nuevaCapa({ origen: "propio", receta: r.id, nombre: r.nombre })) }, "Mis esmaltes"),
        h("button", { type: "button", class: "secundario", onclick: () => nuevaCapa({ origen: "otro", nombre: "" }) }, "Otro")));
  }
  function nuevaCapa(datosCapa) {
    p.capas.push({ id: nuevoId(), capas: 1, aplicacion: "Pincel", pincel: "", zona: "", nota: "", ...datosCapa });
    guardar();
    pintarCapas();
  }
  function fichaCapa(c, i) {
    const cambia = (clave) => (e) => { c[clave] = e.target.type === "number" ? Number(e.target.value) : e.target.value; guardar(); };
    const mover = (paso) => () => {
      p.capas.splice(i + paso, 0, p.capas.splice(i, 1)[0]);
      guardar();
      pintarCapas();
    };
    const muestra = muestraCapa(c);
    const titulo = c.origen === "otro"
      ? selector({ valor: c.nombre, tipo: "esmalte", etiqueta: "Esmaltes", placeholder: "Nombre del esmalte", registrarComo: "Registrar esmalte",
          opciones: () => otrosUsados.map((v) => ({ valor: v, detalle: "Usado antes" })),
          alCambiar: (v) => { c.nombre = v; guardar(); } })
      : h("strong", {}, nombreCapa(c), c.origen === "propio" && h("a", { href: `#/esmalte/${c.receta}`, class: "ver" }, " ver receta"));
    return h("article", { class: "capa" },
      h("header", {},
        h("span", { class: "orden" }, i + 1),
        muestra,
        h("div", { class: "titulo-capa" }, titulo, c.origen === "prodesco" && h("small", {}, c.serie),
          c.origen === "prodesco" && inventarioTaller.marca(c))),
      h("div", { class: "rejilla-capa" },
        campo("Capas", h("input", { type: "number", min: 1, max: 10, step: 1, inputMode: "numeric", value: c.capas, oninput: cambia("capas") })),
        campo("Aplicación", h("select", { onchange: cambia("aplicacion") }, APLICACIONES.map((a) => h("option", { value: a, selected: a === c.aplicacion }, a)))),
        campo("Pincel o herramienta", selector({ valor: c.pincel, tipo: "pincel", etiqueta: "Pinceles", placeholder: "Paletina 20 mm", registrarComo: "Registrar pincel",
          opciones: () => [...pincelesUsados.map((v) => ({ valor: v, detalle: "Usado antes" })), ...PINCELES.map((v) => ({ valor: v }))],
          alCambiar: (v) => { c.pincel = v; guardar(); } })),
        campo("Zona", selector({ valor: c.zona, tipo: "zona", etiqueta: "Zonas", placeholder: "Exterior", registrarComo: "Registrar zona",
          opciones: ZONAS.map((v) => ({ valor: v })),
          alCambiar: (v) => { c.zona = v; guardar(); } }))),
      campo("Nota", h("input", { type: "text", value: c.nota, placeholder: "Diluido, en dos direcciones, sobre engobe…", oninput: cambia("nota") })),
      h("footer", { class: "mover" },
        h("button", { type: "button", "aria-label": "Subir", disabled: i === 0, onclick: mover(-1) }, "↑"),
        h("button", { type: "button", "aria-label": "Bajar", disabled: i === p.capas.length - 1, onclick: mover(1) }, "↓"),
        h("button", { type: "button", class: "quitar-capa", onclick: () => {
          if (!confirm(`¿Quitar ${nombreCapa(c)} de esta pieza?`)) return;
          p.capas.splice(i, 1);
          guardar();
          pintarCapas();
        } }, "Quitar")));
  }
  pintarCapas();

  const tecnicas = h("div", { class: "chips-elegir" });
  function pintarTecnicas() {
    const todas = [...new Set([...TECNICAS, ...propias("tecnica"), ...p.tecnicas])];
    tecnicas.replaceChildren(...todas.map((t) =>
      h("label", { class: "chip-elegir" },
        h("input", { type: "checkbox", checked: p.tecnicas.includes(t), onchange: (e) => {
          p.tecnicas = e.target.checked ? [...p.tecnicas, t] : p.tecnicas.filter((x) => x !== t);
          guardar();
        } }), t)),
      registrarTecnica);
  }
  const nuevaTecnica = h("input", { type: "text", placeholder: "Otra técnica", "aria-label": "Otra técnica",
    onkeydown: (e) => { if (e.key === "Enter") { e.preventDefault(); anadirTecnica(); } } });
  const registrarTecnica = h("div", { class: "registrar-tecnica" }, nuevaTecnica,
    h("button", { type: "button", class: "secundario", onclick: anadirTecnica }, "＋ Registrar técnica"));
  function anadirTecnica() {
    const t = nuevaTecnica.value.trim();
    if (!t) return nuevaTecnica.focus();
    registrar("tecnica", t);
    if (!p.tecnicas.includes(t)) p.tecnicas.push(t);
    nuevaTecnica.value = "";
    guardar();
    pintarTecnicas();
    avisar(`«${t}» registrada: saldrá en todas las piezas`);
  }
  pintarTecnicas();

  pintar(
    h("div", { class: "barra-ficha" },
      h("a", { href: "#/", class: "volver" }, "← Piezas"),
      h("span", { class: "estado-guardado" }, existente ? "Guardado ✓" : "Se guarda solo")),
    h("h1", {}, existente ? "Pieza" : "Nueva pieza"),
    h("section", { class: "bloque" },
      campo("Nombre", texto("nombre", { placeholder: "Taza de desayuno verde" })),
      campo("Fecha", h("input", { type: "date", value: p.fecha, oninput: (e) => { p.fecha = e.target.value; guardar(); } })),
      h("div", { class: "fila-campos" },
        campo("Alto", h("span", { class: "con-unidad" }, texto("alto", { inputMode: "decimal", placeholder: "12" }), " cm")),
        campo("Ancho", h("span", { class: "con-unidad" }, texto("ancho", { inputMode: "decimal", placeholder: "9" }), " cm"))),
      h("span", { class: "etiqueta" }, "Fotos"),
      editorFotos(p, guardar)),
    h("section", { class: "bloque" },
      h("h2", {}, "Pasta y cocción"),
      campo("Pasta", selector({ valor: p.pasta, tipo: "pasta", etiqueta: "Pastas", placeholder: "PRAI · Arcilla blanca alta temperatura", registrarComo: "Registrar pasta",
        opciones: pastas.map((x) => ({ valor: `${x.nombre} · ${x.descripcion}`, detalle: x.tipo })),
        alCambiar: (v) => { p.pasta = v; guardar(); } }), "Elige una de SIO-2 o registra la tuya"),
      h("div", { class: "fila-campos" },
        campo("Temperatura", h("span", { class: "con-unidad" }, h("input", { type: "number", inputMode: "numeric", value: p.temperatura, placeholder: "1250", oninput: (e) => { p.temperatura = e.target.value; guardar(); } }), " ºC")),
        campo("Atmósfera", h("select", { onchange: (e) => { p.atmosfera = e.target.value; guardar(); } },
          h("option", { value: "" }, "—"), ATMOSFERAS.map((a) => h("option", { value: a, selected: a === p.atmosfera }, a)))))),
    h("section", { class: "bloque" },
      h("h2", {}, "Esmaltes y capas"),
      h("p", { class: "ayuda" }, "En el orden en que los aplicaste."),
      capas),
    h("section", { class: "bloque" },
      h("h2", {}, "Técnicas"),
      tecnicas),
    h("section", { class: "bloque" },
      h("h2", {}, "Resultado"),
      estrellas(p, guardar),
      salioMal(p, guardar),
      campo("Notas", h("textarea", { rows: 4, value: p.notas, placeholder: "Qué salió bien, qué cambiarías, defectos…", oninput: (e) => { p.notas = e.target.value; guardar(); } }))),
    h("div", { class: "acciones-ficha" },
      creandoParaComunidad()
        ? botonComunidad("piezas", p.id, "Listo: compartir en la comunidad", "boton")
        : h("a", { href: "#/", class: "boton" }, "Listo"),
      existente && h("button", { type: "button", class: "peligro", onclick: async () => {
        if (!confirm("¿Borrar esta pieza y sus fotos?")) return;
        pendiente = null;
        await datos.borrar("piezas", p.id);
        location.hash = "#/";
      } }, "Borrar pieza")),
  );
}

// ---------- Ficha de una receta ----------

async function vistaReceta(id) {
  const [existente, piezas] = await Promise.all([id === "nuevo" ? null : datos.uno("recetas", id), datos.todos("piezas")]);
  if (id !== "nuevo" && !existente) return (location.hash = "#/esmaltes");
  const r = existente ?? { id: nuevoId(), nombre: "", tipo: "Esmalte", temperatura: "", atmosfera: "", unidad: "g", lote: 500,
    ingredientes: [{ material: "", cantidad: "", anadido: false }], fotos: [], notas: "", creado: Date.now() };
  const guardar = () => cambiado("recetas", r);
  const usadaEn = piezas.filter((p) => p.capas.some((c) => c.receta === r.id));

  const tabla = h("div", { class: "ingredientes" });
  const calculo = h("div", { class: "calculo" });

  function pintarIngredientes() {
    tabla.replaceChildren(
      h("div", { class: "fila-ingrediente cabecera-ingredientes" },
        h("span", {}, "Material"), h("span", {}, UNIDADES[r.unidad]), h("span", { title: "Se añade fuera del 100 % de la base" }, "Añadido"), h("span", {})),
      ...r.ingredientes.map((ing, i) => {
        const peligro = h("small", { class: "peligro-material", hidden: !material(ing.material)?.[2] }, "⚠ Tóxico: guantes y mascarilla");
        let materialElegido = ing.material; // el último elegido o confirmado, no lo que se va tecleando
        const anadido = h("input", { type: "checkbox", checked: ing.anadido, title: "Se añade fuera del 100 %",
          onchange: (e) => { ing.anadido = e.target.checked; guardar(); pintarCalculo(); } });
        return h("div", { class: "fila-ingrediente" },
          h("span", { class: "material" },
            selector({ valor: ing.material, tipo: "material", etiqueta: "Materiales", placeholder: "Feldespato potásico", registrarComo: "Registrar material",
              opciones: MATERIALES.map(([n, g, toxico]) => ({ valor: n, detalle: toxico ? `${g} ⚠` : g })),
              alCambiar: (v, final) => {
                ing.material = v;
                guardar();
                if (!final || v === materialElegido) return;
                materialElegido = v;
                // Colorantes, opacificantes y aditivos se suelen poner fuera del 100 %
                const elegido = material(v);
                if (elegido) ing.anadido = anadido.checked = SE_AÑADEN.has(elegido[1]);
                peligro.hidden = !elegido?.[2];
                pintarCalculo();
              } }),
            peligro),
          h("input", { type: "number", inputMode: "decimal", min: 0, step: "any", value: ing.cantidad, "aria-label": "Cantidad",
            oninput: (e) => { ing.cantidad = e.target.value; guardar(); pintarCalculo(); } }),
          h("label", { class: "marcar-anadido" }, anadido, h("span", {}, "Añadido")),
          h("button", { type: "button", class: "quitar-fila", "aria-label": "Quitar material", onclick: () => {
            r.ingredientes.splice(i, 1);
            guardar();
            pintarIngredientes();
          } }, "✕"));
      }),
      h("button", { type: "button", class: "secundario", onclick: () => {
        r.ingredientes.push({ material: "", cantidad: "", anadido: false });
        guardar();
        pintarIngredientes();
        tabla.querySelectorAll(".material input")[r.ingredientes.length - 1]?.focus();
      } }, "＋ Añadir material"));
    pintarCalculo();
  }

  // Proporciones sobre la base (sin los añadidos) y cuánto pesar para un lote
  function pintarCalculo() {
    const { base, filas, peligro } = proporciones(r);
    if (!base) {
      calculo.replaceChildren(h("p", { class: "ayuda" }, "Escribe materiales y cantidades para ver las proporciones."));
      return;
    }
    const unidadLote = r.unidad === "%" ? "g" : r.unidad;
    calculo.replaceChildren(
      h("h3", {}, "Proporciones"),
      h("p", { class: "ayuda" }, `La base suma ${numero.format(base)} ${UNIDADES[r.unidad]}. Los añadidos van como % sobre la base.`),
      h("label", { class: "lote" }, "Preparar con ",
        h("input", { type: "number", inputMode: "decimal", min: 0, step: "any", value: r.lote, "aria-label": "Cantidad de base",
          oninput: (e) => { r.lote = Number(e.target.value); guardar(); pintarCalculo(); } }),
        ` ${unidadLote === "g" ? "g" : unidadLote} de base`),
      h("table", { class: "tabla-receta" },
        h("thead", {}, h("tr", {}, h("th", {}, "Material"), h("th", {}, "%"), h("th", {}, unidadLote === "g" ? "g" : unidadLote))),
        h("tbody", {}, filas.map((f) => h("tr", { class: f.anadido ? "anadido" : "" },
          h("td", {}, f.material),
          h("td", {}, `${f.anadido ? "+" : ""}${numero.format(f.parte * 100)}`),
          h("td", {}, numero.format(f.parte * (Number(r.lote) || 0))))))),
      peligro &&
        h("p", { class: "aviso-peligro" }, "⚠ Esta receta lleva materiales tóxicos: pésalos con guantes y mascarilla FFP2, y no la uses en piezas para comida sin hacer pruebas."));
  }
  pintarIngredientes();

  const texto = (clave, props = {}) => h("input", { type: "text", value: r[clave] ?? "", ...props, oninput: (e) => { r[clave] = e.target.value; guardar(); } });

  pintar(
    h("div", { class: "barra-ficha" },
      h("a", { href: "#/esmaltes", class: "volver" }, "← Mis esmaltes"),
      h("span", { class: "estado-guardado" }, existente ? "Guardado ✓" : "Se guarda solo")),
    h("h1", {}, existente ? "Receta" : "Nueva receta"),
    h("section", { class: "bloque" },
      campo("Nombre", texto("nombre", { placeholder: "Celadón de la casa" })),
      h("div", { class: "fila-campos" },
        campo("Tipo", h("select", { onchange: (e) => { r.tipo = e.target.value; guardar(); } },
          ["Esmalte", "Engobe", "Engobe vítreo", "Otro"].map((t) => h("option", { value: t, selected: t === r.tipo }, t)))),
        campo("Temperatura", h("span", { class: "con-unidad" }, h("input", { type: "number", inputMode: "numeric", value: r.temperatura, placeholder: "1250",
          oninput: (e) => { r.temperatura = e.target.value; guardar(); } }), " ºC")),
        campo("Atmósfera", h("select", { onchange: (e) => { r.atmosfera = e.target.value; guardar(); } },
          h("option", { value: "" }, "—"), ATMOSFERAS.map((a) => h("option", { value: a, selected: a === r.atmosfera }, a)))))),
    h("section", { class: "bloque" },
      h("h2", {}, "Receta"),
      campo("Medir en", h("select", { onchange: (e) => { r.unidad = e.target.value; guardar(); pintarIngredientes(); } },
        Object.entries(UNIDADES).map(([valor, nombre]) => h("option", { value: valor, selected: valor === r.unidad }, nombre)))),
      tabla,
      calculo),
    h("section", { class: "bloque" },
      h("h2", {}, "Pruebas"),
      h("p", { class: "ayuda" }, "Fotos de las probetas o de cómo queda."),
      editorFotos(r, guardar),
      campo("Notas", h("textarea", { rows: 4, value: r.notas, placeholder: "Tamizar a malla 80, aplicar fino, mate si es grueso…", oninput: (e) => { r.notas = e.target.value; guardar(); } }))),
    usadaEn.length > 0 && h("section", { class: "bloque" },
      h("h2", {}, "Piezas con este esmalte"),
      h("ul", { class: "usada-en" }, usadaEn.map((p) => h("li", {}, h("a", { href: `#/pieza/${p.id}` }, p.nombre || "Pieza sin nombre"), ` · ${fecha(p.fecha)}`)))),
    h("div", { class: "acciones-ficha" },
      creandoParaComunidad()
        ? botonComunidad("recetas", r.id, "Listo: compartir en la comunidad", "boton")
        : h("a", { href: "#/esmaltes", class: "boton" }, "Listo"),
      existente && h("button", { type: "button", class: "peligro", onclick: async () => {
        const aviso = usadaEn.length ? ` Sale en ${usadaEn.length === 1 ? "1 pieza" : `${usadaEn.length} piezas`}: ahí se quedará solo el nombre.` : "";
        if (!confirm(`¿Borrar esta receta?${aviso}`)) return;
        pendiente = null;
        await datos.borrar("recetas", r.id);
        location.hash = "#/esmaltes";
      } }, "Borrar receta")),
  );
}

// ---------- Rutas ----------

async function enrutar() {
  await guardarYa(); // que no se pierda lo último escrito al cambiar de pantalla
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  urlsActivas.forEach(URL.revokeObjectURL);
  urlsActivas = [];
  const ruta = location.hash.replace(/^#\/?/, "");
  const [tipo, id] = ruta.split("/");
  if (tipo === "pieza" && id) await vistaPieza(id);
  else if (tipo === "esmalte" && id) await vistaReceta(id);
  else if (tipo === "esmaltes") await vistaRecetas();
  else await vistaPiezas();
  scrollTo(0, 0);
}

window.addEventListener("hashchange", enrutar);
window.addEventListener("pagehide", guardarYa);
document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && guardarYa());
navigator.storage?.persist?.();
// Con cuenta, se espera a tener los datos de la nube antes de pintar
Promise.resolve(window.nube?.listo).then(enrutar);
// Si llegan cambios de otro móvil, se repintan las listas (en una ficha a medio escribir no)
window.addEventListener("nube:actualizado", () => /^#?\/?(esmaltes)?$/.test(location.hash) && enrutar());
