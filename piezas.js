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
const TECNICAS = ["Torno", "Pellizco", "Churros", "Planchas", "Molde o colada", "Modelado", "Esgrafiado", "Engobe",
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
  guardar: (almacen, obj) => operacion(almacen, "readwrite", (s) => s.put(obj)),
  borrar: (almacen, id) => operacion(almacen, "readwrite", (s) => s.delete(id)),
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

function listaDatos(id, valores) {
  return h("datalist", { id }, valores.map((v) => (Array.isArray(v) ? h("option", { value: v[0] }, v[1]) : h("option", { value: v }))));
}

// Fotos: miniaturas con botón de quitar, y botones de cámara y galería
function editorFotos(obj, alCambiar) {
  const caja = h("div", { class: "fotos" });
  function pintar() {
    caja.replaceChildren(
      ...obj.fotos.map((foto, i) =>
        h("figure", { class: "foto" },
          h("img", { src: urlDe(foto), alt: "" }),
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
  function botonFoto(icono, texto, extra) {
    const input = h("input", { type: "file", accept: "image/*", hidden: true, ...extra, onchange: async (e) => {
      for (const archivo of e.target.files) {
        try { obj.fotos.push(await prepararImagen(archivo)); } catch { avisar("No he podido leer esa imagen"); }
      }
      e.target.value = "";
      alCambiar();
      pintar();
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
      h("span", {}, e.codigo ? e.nombre || e.serie : e.serie))));
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
      : [h("p", {}, "Todavía no tienes recetas. Créalas en la pestaña «Mis esmaltes».")]));
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

async function vistaPiezas() {
  const piezas = (await datos.todos("piezas")).sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? "") || b.modificado - a.modificado);
  pintar(
    h("h1", {}, "Piezas"),
    pestanas("piezas"),
    h("p", { class: "aviso" }, "Apunta cómo hiciste cada pieza: pasta, esmaltes, capas, pinceles y técnicas. Se guarda en este móvil."),
    h("a", { href: "#/pieza/nueva", class: "boton nueva" }, "＋ Nueva pieza"),
    piezas.length
      ? h("div", { class: "tarjetas-piezas" }, piezas.map((p) =>
          h("a", { href: `#/pieza/${p.id}`, class: "tarjeta-pieza" },
            p.fotos[0] ? h("img", { src: urlDe(p.fotos[0]), alt: "" }) : h("span", { class: "sin-foto" }, "🏺"),
            h("span", { class: "info" },
              h("strong", {}, p.nombre || "Pieza sin nombre"),
              h("small", {}, [fecha(p.fecha), p.pasta].filter(Boolean).join(" · ")),
              p.capas.length > 0 && h("span", { class: "chips" }, p.capas.slice(0, 3).map((c) =>
                h("span", { class: "chip" }, nombreCapa(c), c.capas > 1 ? ` ×${c.capas}` : "")))))))
      : h("p", { class: "vacio" }, "Aún no has apuntado ninguna pieza."),
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
    h("a", { href: "#/esmalte/nuevo", class: "boton nueva" }, "＋ Nueva receta"),
    recetas.length
      ? h("div", { class: "tarjetas-piezas" }, recetas.map((r) =>
          h("a", { href: `#/esmalte/${r.id}`, class: "tarjeta-pieza" },
            r.fotos[0] ? h("img", { src: urlDe(r.fotos[0]), alt: "" }) : h("span", { class: "sin-foto" }, "🧪"),
            h("span", { class: "info" },
              h("strong", {}, r.nombre || "Receta sin nombre"),
              h("small", {}, [r.tipo, r.temperatura && `${r.temperatura} ºC`, r.atmosfera].filter(Boolean).join(" · ")),
              h("small", {}, `${r.ingredientes.length} materiales · ${usos(r.id) === 1 ? "1 pieza" : `${usos(r.id)} piezas`}`)))))
      : h("p", { class: "vacio" }, "Aún no tienes recetas."),
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
  const guardar = () => cambiado("piezas", p);
  // Pinceles ya usados en otras piezas, para no tener que escribirlos otra vez
  const pincelesUsados = [...new Set(piezas.flatMap((x) => x.capas.map((c) => c.pincel)).filter(Boolean))];

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
    const muestra = c.origen === "prodesco" && c.miniatura
      ? h("img", { class: "muestra", src: c.miniatura, alt: "" })
      : h("span", { class: "muestra sin-foto" }, c.origen === "propio" ? "🧪" : "🎨");
    const titulo = c.origen === "otro"
      ? h("input", { type: "text", value: c.nombre, placeholder: "Nombre del esmalte", "aria-label": "Nombre del esmalte", oninput: cambia("nombre") })
      : h("strong", {}, nombreCapa(c), c.origen === "propio" && h("a", { href: `#/esmalte/${c.receta}`, class: "ver" }, " ver receta"));
    return h("article", { class: "capa" },
      h("header", {},
        h("span", { class: "orden" }, i + 1),
        muestra,
        h("div", { class: "titulo-capa" }, titulo, c.origen === "prodesco" && h("small", {}, c.serie))),
      h("div", { class: "rejilla-capa" },
        campo("Capas", h("input", { type: "number", min: 1, max: 10, step: 1, inputMode: "numeric", value: c.capas, oninput: cambia("capas") })),
        campo("Aplicación", h("select", { onchange: cambia("aplicacion") }, APLICACIONES.map((a) => h("option", { value: a, selected: a === c.aplicacion }, a)))),
        campo("Pincel o herramienta", h("input", { type: "text", list: "lista-pinceles", value: c.pincel, placeholder: "Paletina 20 mm", oninput: cambia("pincel") })),
        campo("Zona", h("input", { type: "text", list: "lista-zonas", value: c.zona, placeholder: "Exterior", oninput: cambia("zona") }))),
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
    const todas = [...new Set([...TECNICAS, ...p.tecnicas])];
    tecnicas.replaceChildren(...todas.map((t) =>
      h("label", { class: "chip-elegir" },
        h("input", { type: "checkbox", checked: p.tecnicas.includes(t), onchange: (e) => {
          p.tecnicas = e.target.checked ? [...p.tecnicas, t] : p.tecnicas.filter((x) => x !== t);
          guardar();
        } }), t)),
      h("input", { type: "text", class: "otra-tecnica", placeholder: "Otra técnica + Intro", "aria-label": "Otra técnica", onkeydown: (e) => {
        if (e.key !== "Enter" || !e.target.value.trim()) return;
        e.preventDefault();
        p.tecnicas.push(e.target.value.trim());
        guardar();
        pintarTecnicas();
      } }));
  }
  pintarTecnicas();

  pintar(
    h("div", { class: "barra-ficha" },
      h("a", { href: "#/", class: "volver" }, "← Piezas"),
      h("span", { class: "estado-guardado" }, existente ? "Guardado ✓" : "Se guarda solo")),
    h("h1", {}, existente ? "Pieza" : "Nueva pieza"),
    listaDatos("lista-pastas", pastas.map((x) => [`${x.nombre} · ${x.descripcion}`, x.tipo])),
    listaDatos("lista-pinceles", [...new Set([...pincelesUsados, ...PINCELES])]),
    listaDatos("lista-zonas", ZONAS),
    h("section", { class: "bloque" },
      campo("Nombre", texto("nombre", { placeholder: "Taza de desayuno verde" })),
      campo("Fecha", h("input", { type: "date", value: p.fecha, oninput: (e) => { p.fecha = e.target.value; guardar(); } })),
      h("span", { class: "etiqueta" }, "Fotos"),
      editorFotos(p, guardar)),
    h("section", { class: "bloque" },
      h("h2", {}, "Pasta y cocción"),
      campo("Pasta", texto("pasta", { list: "lista-pastas", placeholder: "PRAI · Arcilla blanca alta temperatura" }), "Elige una de SIO-2 o escribe la tuya"),
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
      campo("Notas", h("textarea", { rows: 4, value: p.notas, placeholder: "Qué salió bien, qué cambiarías, defectos…", oninput: (e) => { p.notas = e.target.value; guardar(); } }))),
    h("div", { class: "acciones-ficha" },
      h("a", { href: "#/", class: "boton" }, "Listo"),
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
        const anadido = h("input", { type: "checkbox", checked: ing.anadido, title: "Se añade fuera del 100 %",
          onchange: (e) => { ing.anadido = e.target.checked; guardar(); pintarCalculo(); } });
        return h("div", { class: "fila-ingrediente" },
          h("span", { class: "material" },
            h("input", { type: "text", list: "lista-materiales", value: ing.material, placeholder: "Feldespato potásico", "aria-label": "Material",
              onchange: (e) => {
                ing.material = e.target.value;
                // Colorantes, opacificantes y aditivos se suelen poner fuera del 100 %
                const elegido = material(ing.material);
                if (elegido) ing.anadido = anadido.checked = SE_AÑADEN.has(elegido[1]);
                peligro.hidden = !elegido?.[2];
                guardar();
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
    const conCantidad = r.ingredientes.filter((i) => i.material && Number(i.cantidad) > 0);
    const base = conCantidad.filter((i) => !i.anadido).reduce((s, i) => s + Number(i.cantidad), 0);
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
        h("tbody", {}, conCantidad.map((i) => {
          const parte = Number(i.cantidad) / base;
          return h("tr", { class: i.anadido ? "anadido" : "" },
            h("td", {}, i.material),
            h("td", {}, `${i.anadido ? "+" : ""}${numero.format(parte * 100)}`),
            h("td", {}, numero.format(parte * (Number(r.lote) || 0))));
        }))),
      conCantidad.some((i) => material(i.material)?.[2]) &&
        h("p", { class: "aviso-peligro" }, "⚠ Esta receta lleva materiales tóxicos: pésalos con guantes y mascarilla FFP2, y no la uses en piezas para comida sin hacer pruebas."));
  }
  pintarIngredientes();

  const texto = (clave, props = {}) => h("input", { type: "text", value: r[clave] ?? "", ...props, oninput: (e) => { r[clave] = e.target.value; guardar(); } });

  pintar(
    h("div", { class: "barra-ficha" },
      h("a", { href: "#/esmaltes", class: "volver" }, "← Mis esmaltes"),
      h("span", { class: "estado-guardado" }, existente ? "Guardado ✓" : "Se guarda solo")),
    h("h1", {}, existente ? "Receta" : "Nueva receta"),
    listaDatos("lista-materiales", MATERIALES.map(([n, g, peligro]) => [n, peligro ? `${g} ⚠` : g])),
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
      h("a", { href: "#/esmaltes", class: "boton" }, "Listo"),
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
enrutar();
