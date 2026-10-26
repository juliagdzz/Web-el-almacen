// Panel del taller: los encargos que llegan desde encargos.html.
// Solo lo ven los correos de la tabla admins (lo comprueban las reglas de Supabase).

const $ = (sel) => document.querySelector(sel);
const euros = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

const ESTADOS = {
  nuevo: "Nuevo",
  presupuestado: "Presupuestado",
  aceptado: "Aceptado",
  "en-proceso": "En proceso",
  terminado: "Terminado",
  entregado: "Entregado",
  descartado: "Descartado",
};
const FILTROS = { pendientes: "Pendientes", ...ESTADOS, todos: "Todos" };
const CERRADOS = ["entregado", "descartado"];

let encargos = [];
let filtro = "pendientes";
let urls = [];

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

const fecha = (iso, opciones = { day: "numeric", month: "short" }) => new Date(iso).toLocaleDateString("es-ES", opciones);
function haceCuanto(iso) {
  const dias = Math.floor((Date.now() - new Date(iso)) / 86_400_000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 7) return `hace ${dias} días`;
  return fecha(iso);
}

// ---------- Lista ----------

function pintarFiltros() {
  $("#filtros").replaceChildren(...Object.entries(FILTROS).map(([clave, nombre]) => {
    const cuantos = clave === "todos" ? encargos.length
      : clave === "pendientes" ? encargos.filter((e) => !CERRADOS.includes(e.estado)).length
      : encargos.filter((e) => e.estado === clave).length;
    if (!cuantos && !["pendientes", "todos"].includes(clave)) return null;
    return h("button", { type: "button", role: "tab", class: "filtro", "aria-selected": String(filtro === clave),
      onclick: () => { filtro = clave; pintar(); } }, `${nombre} `, h("span", { class: "cuantos" }, String(cuantos)));
  }).filter(Boolean));
}

// Cómo prefiere que le contesten, con su icono: «Prefiere WhatsApp» / «Prefiere correo»
const ICONOS_CONTACTO = {
  whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 19.5l1.2-3.6A7.8 7.8 0 1 1 8.6 18.4z"/><path d="M9.3 9.2c.2 1.9 1.8 3.7 3.8 4.4l1.1-1.1 1.7.8-.4 1.4c-3.4.2-6.6-2.9-6.6-6.3l1.4-.4.8 1.7z"/></svg>',
  correo: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/></svg>',
};
function preferencia(x, grande = false) {
  const via = x.contestar_por === "whatsapp" ? "whatsapp" : "correo";
  const el = h("span", { class: `prefiere prefiere-${via}${grande ? " grande" : ""}` });
  el.innerHTML = ICONOS_CONTACTO[via];
  el.append(grande ? `Prefiere que le contestes por ${via === "whatsapp" ? "WhatsApp" : "correo"}` : `Prefiere ${via === "whatsapp" ? "WhatsApp" : "correo"}`);
  return el;
}

function pintar() {
  pintarFiltros();
  const visibles = encargos.filter((e) => filtro === "todos" || (filtro === "pendientes" ? !CERRADOS.includes(e.estado) : e.estado === filtro));
  $("#lista-encargos").replaceChildren(...(visibles.length ? visibles.map((e) =>
    h("button", { type: "button", class: `tarjeta-encargo estado-${e.estado}`, onclick: () => abrir(e) },
      h("span", { class: "linea-1" },
        h("strong", {}, `${e.tipo || "Pieza"}${e.cantidad > 1 ? ` × ${e.cantidad}` : ""}`),
        h("span", { class: `etiqueta-estado estado-${e.estado}` }, ESTADOS[e.estado] ?? e.estado)),
      h("span", { class: "linea-2" }, `${e.nombre} · ${haceCuanto(e.creado)}`, e.fotos?.length || e.tablero ? " · con adjuntos" : ""),
      preferencia(e),
      h("span", { class: "idea-corta" }, e.idea),
      e.precio != null && h("span", { class: "linea-3" }, `${euros.format(e.precio)}${e.plazo ? ` · ${e.plazo}` : ""}`))
  ) : [h("p", { class: "vacio" }, filtro === "pendientes" ? "No tienes encargos pendientes." : "No hay encargos aquí.")]));
}

async function cargar() {
  const { data, error } = await window.nube.cliente.from("encargos").select("*").order("creado", { ascending: false });
  if (error) throw error;
  encargos = data;
  pintar();
}

// ---------- Ficha ----------

async function urlFoto(ruta) {
  const { data, error } = await window.nube.cliente.storage.from("encargos").download(ruta);
  if (error) throw error;
  const url = URL.createObjectURL(data);
  urls.push(url);
  return url;
}

function telefonoWhatsApp(telefono) {
  let n = (telefono || "").replace(/\D/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  if (n.length === 9 && /^[6789]/.test(n)) n = "34" + n; // número español sin prefijo
  return n;
}

function mensajeRespuesta(e, { precio, plazo }) {
  const partes = [`Hola ${e.nombre}. Te escribo de El Almacén por tu encargo (${(e.tipo || "pieza").toLowerCase()}${e.cantidad > 1 ? `, ${e.cantidad} unidades` : ""}).`];
  if (precio) partes.push(`El presupuesto es de ${euros.format(precio)}${plazo ? ` y el plazo, ${plazo}` : ""}.`);
  else if (plazo) partes.push(`El plazo sería ${plazo}.`);
  partes.push("¿Te encaja?");
  return partes.join(" ");
}

function dato(etiqueta, valor) {
  return valor ? [h("dt", {}, etiqueta), h("dd", {}, valor)] : [];
}

async function abrir(e) {
  urls.forEach(URL.revokeObjectURL);
  urls = [];
  const precio = h("input", { type: "number", inputmode: "decimal", min: "0", step: "0.5", value: e.precio ?? "", placeholder: "45" });
  const plazo = h("input", { type: "text", maxLength: 120, value: e.plazo ?? "", placeholder: "unas 4 semanas" });
  const estado = h("select", {}, ...Object.entries(ESTADOS).map(([clave, nombre]) => h("option", { value: clave, selected: e.estado === clave }, nombre)));
  const notas = h("textarea", { rows: 3, value: e.notas ?? "", placeholder: "Solo las ves tú: pasta, esmalte, cuándo meterlo en el horno…" });
  const actual = () => ({ precio: precio.value ? Number(precio.value) : null, plazo: plazo.value.trim() });

  const telefono = telefonoWhatsApp(e.telefono);
  const porWhatsApp = telefono && h("a", { class: `boton${e.contestar_por === "whatsapp" ? "" : " secundario"}`, target: "_blank", rel: "noopener", href: `https://wa.me/${telefono}`,
    onclick: (ev) => { ev.currentTarget.href = `https://wa.me/${telefono}?text=${encodeURIComponent(mensajeRespuesta(e, actual()))}`; } },
    `Contestar por WhatsApp${e.contestar_por === "whatsapp" ? " (lo prefiere)" : ""}`);
  const porCorreo = e.correo && h("a", { class: `boton${e.contestar_por === "correo" ? "" : " secundario"}`, href: `mailto:${e.correo}`,
    onclick: (ev) => { ev.currentTarget.href = `mailto:${e.correo}?subject=${encodeURIComponent("Tu encargo en El Almacén")}&body=${encodeURIComponent(mensajeRespuesta(e, actual()))}`; } },
    `Contestar por correo${e.contestar_por === "correo" ? " (lo prefiere)" : ""}`);
  // El que prefiere, primero
  const contestar = h("div", { class: "contestar" }, ...(e.contestar_por === "whatsapp" ? [porWhatsApp, porCorreo] : [porCorreo, porWhatsApp]));

  const galeria = h("div", { class: "galeria-encargo" });
  $("#contenido-ficha").replaceChildren(
    h("h2", {}, `${e.tipo || "Pieza"}${e.cantidad > 1 ? ` × ${e.cantidad}` : ""}`),
    h("p", { class: "quien" }, `${e.nombre} · ${fecha(e.creado, { day: "numeric", month: "long", year: "numeric" })}`),
    preferencia(e, true),
    h("p", { class: "idea" }, e.idea),
    h("dl", { class: "datos-encargo" },
      ...dato("Uso", e.uso),
      ...dato("Tamaño", e.medidas),
      ...dato("Colores", e.colores),
      ...dato("Para cuándo", e.para_cuando && fecha(e.para_cuando + "T12:00", { day: "numeric", month: "long", year: "numeric" })),
      ...dato("Quiere gastar", e.presupuesto_cliente),
      ...dato("Teléfono", e.telefono),
      ...dato("Correo", e.correo)),
    galeria,
    h("section", { class: "tu-respuesta" },
      h("h3", {}, "Tu respuesta"),
      h("div", { class: "fila-campos" },
        h("label", { class: "campo" }, "Presupuesto (€)", precio),
        h("label", { class: "campo" }, "Plazo", plazo)),
      h("label", { class: "campo" }, "Estado", estado),
      h("label", { class: "campo" }, "Notas", notas),
      h("button", { type: "button", class: "guardar", onclick: async (ev) => {
        const boton = ev.currentTarget;
        boton.disabled = true;
        const cambios = { ...actual(), plazo: actual().plazo || null, estado: estado.value, notas: notas.value.trim() || null };
        // Si pones precio a un encargo nuevo, pasa solo a «presupuestado»
        if (cambios.precio != null && e.estado === "nuevo" && cambios.estado === "nuevo") cambios.estado = "presupuestado";
        const { error } = await window.nube.cliente.from("encargos").update(cambios).eq("id", e.id);
        boton.disabled = false;
        if (error) return avisar("No se ha podido guardar");
        Object.assign(e, cambios);
        estado.value = e.estado;
        pintar();
        avisar("Guardado ✓");
      } }, "Guardar"),
      contestar),
    h("button", { type: "button", class: "borrar-encargo", onclick: async () => {
      if (!confirm(`¿Borrar el encargo de ${e.nombre} y sus fotos?`)) return;
      const rutas = [...(e.fotos ?? []), e.tablero?.imagen].filter(Boolean);
      if (rutas.length) await window.nube.cliente.storage.from("encargos").remove(rutas);
      const { error } = await window.nube.cliente.from("encargos").delete().eq("id", e.id);
      if (error) return avisar("No se ha podido borrar");
      encargos = encargos.filter((x) => x.id !== e.id);
      $("#ficha-encargo").close();
      pintar();
      avisar("Encargo borrado");
    } }, "Borrar encargo"),
  );
  $("#ficha-encargo").showModal();
  $("#ficha-encargo").scrollTop = 0;

  // Fotos y tablero, cuando lleguen
  const imagenes = [...(e.fotos ?? []).map((ruta, i) => ({ ruta, texto: `Foto ${i + 1}` })), ...(e.tablero?.imagen ? [{ ruta: e.tablero.imagen, texto: `Tablero «${e.tablero.nombre}»`, tablero: true }] : [])];
  for (const imagen of imagenes) {
    try {
      const url = await urlFoto(imagen.ruta);
      galeria.append(h("a", { href: url, target: "_blank", class: imagen.tablero ? "tablero" : "" },
        h("img", { src: url, alt: imagen.texto }), imagen.tablero && h("span", {}, imagen.texto)));
    } catch {
      galeria.append(h("span", { class: "sin-foto" }, `${imagen.texto}: no se ha podido cargar`));
    }
  }
}

$("#cerrar-ficha").addEventListener("click", () => $("#ficha-encargo").close());
$("#ficha-encargo").addEventListener("click", (e) => e.target === e.currentTarget && e.currentTarget.close());

// ---------- Arranque ----------

(async () => {
  await window.accesoTaller;
  const estado = $("#estado-panel");
  try {
    await cargar();
    estado.hidden = true;
    $("#panel").hidden = false;
  } catch {
    estado.textContent = "No se han podido cargar los encargos. Comprueba la conexión y recarga.";
  }
})();
