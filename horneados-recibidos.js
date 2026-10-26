// Panel del taller: los presupuestos de horneado que envía la gente desde horno.html.

const $ = (sel) => document.querySelector(sel);
const euros = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

const ESTADOS = {
  nuevo: "Nuevo",
  aceptado: "Aceptado",
  "en-horno": "En el horno",
  listo: "Listo para recoger",
  recogido: "Recogido",
  descartado: "Descartado",
};
const FILTROS = { pendientes: "Pendientes", ...ESTADOS, todos: "Todos" };
const CERRADOS = ["recogido", "descartado"];

let horneados = [];
let filtro = "pendientes";
let horarios = []; // las clases fijas activas: cuando se puede pasar a recoger
const PENDIENTES_DE_HORNO = ["nuevo", "aceptado", "en-horno"];

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

const fecha = (iso) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
function haceCuanto(iso) {
  const dias = Math.floor((Date.now() - new Date(iso)) / 86_400_000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 7) return `hace ${dias} días`;
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}
const piezas = (x) => x.piezas.reduce((n, p) => n + (parseInt(p.descripcion, 10) || 1), 0);

// ---------- Lista ----------

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
  $("#filtros").replaceChildren(...Object.entries(FILTROS).map(([clave, nombre]) => {
    const cuantos = clave === "todos" ? horneados.length
      : clave === "pendientes" ? horneados.filter((x) => !CERRADOS.includes(x.estado)).length
      : horneados.filter((x) => x.estado === clave).length;
    if (!cuantos && !["pendientes", "todos"].includes(clave)) return null;
    return h("button", { type: "button", role: "tab", class: "filtro", "aria-selected": String(filtro === clave), onclick: () => { filtro = clave; pintar(); } },
      `${nombre} `, h("span", { class: "cuantos" }, String(cuantos)));
  }).filter(Boolean));
  const visibles = horneados.filter((x) => filtro === "todos" || (filtro === "pendientes" ? !CERRADOS.includes(x.estado) : x.estado === filtro));
  $("#lista-encargos").replaceChildren(...(visibles.length ? visibles.map((x) =>
    h("article", { class: `tarjeta-horneado estado-${x.estado}` },
      h("button", { type: "button", class: `tarjeta-encargo estado-${x.estado}`, onclick: () => abrir(x) },
        h("span", { class: "linea-1" },
          h("strong", {}, `${piezas(x) === 1 ? "1 pieza" : `${piezas(x)} piezas`} · ${euros.format(x.precio_final ?? x.total)}`),
          h("span", { class: `etiqueta-estado estado-${x.estado}` }, ESTADOS[x.estado])),
        h("span", { class: "linea-2" }, `${x.nombre} · ${haceCuanto(x.creado)}${x.cuando ? ` · trae: ${x.cuando}` : ""}${recogida(x) ? ` · recoge: ${recogida(x)}` : ""}`),
        h("span", { class: "idea-corta" }, x.piezas.map((p) => p.descripcion).join(" · ")),
        preferencia(x)),
      accionesRapidas(x))
  ) : [h("p", { class: "vacio" }, filtro === "pendientes" ? "No tienes horneados pendientes." : "No hay horneados aquí.")]));
}

// Debajo de cada pedido: «Hecho» mientras se cuece; cuando está hecho, avisar
function accionesRapidas(x) {
  if (PENDIENTES_DE_HORNO.includes(x.estado)) {
    return h("div", { class: "acciones-tarjeta" },
      h("button", { type: "button", class: "boton hecho", onclick: () => marcarHecho(x) }, "✓ Hecho, ya está listo"));
  }
  if (x.estado !== "listo") return null;
  return h("div", { class: "acciones-tarjeta" },
    h("span", { class: `avisado${x.avisado ? "" : " sin-avisar"}` }, x.avisado ? `Avisado ${haceCuanto(x.avisado)}` : "Falta avisar"),
    ...botonesAviso(x, "listo", x.precio_final));
}

async function marcarHecho(x) {
  const { error } = await window.nube.cliente.from("horneados").update({ estado: "listo" }).eq("id", x.id);
  if (error) return avisar("No se ha podido marcar");
  x.estado = "listo";
  pintar();
  avisar("Hecho ✓ Ahora avísale para que pase a recogerlas");
}

// Enlaces de WhatsApp y correo con el mensaje ya escrito; al usarlos se apunta
// que se le ha avisado (si el pedido está listo)
function botonesAviso(x, estadoDe, precioDe, textos = { whatsapp: "Avisar por WhatsApp", correo: "Avisar por correo" }) {
  const tel = telefonoWhatsApp(x.telefono);
  const estado = typeof estadoDe === "function" ? estadoDe : () => estadoDe;
  const precio = typeof precioDe === "function" ? precioDe : () => precioDe;
  const apuntar = async () => {
    if (estado() !== "listo") return;
    const ahora = new Date().toISOString();
    const { error } = await window.nube.cliente.from("horneados").update({ avisado: ahora }).eq("id", x.id);
    if (!error) { x.avisado = ahora; setTimeout(pintar, 300); }
  };
  const botones = [
    tel && h("a", { class: `boton pequeno${x.contestar_por === "whatsapp" ? "" : " secundario"}`, target: "_blank", rel: "noopener", href: `https://wa.me/${tel}`,
      onclick: (ev) => { ev.currentTarget.href = `https://wa.me/${tel}?text=${encodeURIComponent(mensaje(x, estado(), precio()))}`; apuntar(); } }, `${textos.whatsapp}${x.contestar_por === "whatsapp" ? " (lo prefiere)" : ""}`),
    x.correo && h("a", { class: `boton pequeno${x.contestar_por === "correo" ? "" : " secundario"}`, href: `mailto:${encodeURIComponent(x.correo)}`,
      onclick: (ev) => { ev.currentTarget.href = `mailto:${encodeURIComponent(x.correo)}?subject=${encodeURIComponent(asunto(estado()))}&body=${encodeURIComponent(mensaje(x, estado(), precio()))}`; apuntar(); } }, `${textos.correo}${x.contestar_por === "correo" ? " (lo prefiere)" : ""}`),
  ];
  return (x.contestar_por === "correo" ? botones.reverse() : botones).filter(Boolean);
}

async function cargar() {
  const { data, error } = await window.nube.cliente.from("horneados").select("*").order("creado", { ascending: false });
  if (error) throw error;
  horneados = data;
  pintar();
}

// ---------- Ficha ----------

function telefonoWhatsApp(telefono) {
  let n = (telefono || "").replace(/\D/g, "");
  if (n.startsWith("00")) n = n.slice(2);
  if (n.length === 9 && /^[6789]/.test(n)) n = "34" + n;
  return n;
}

// El mensaje cambia según el paso en que esté
function mensaje(x, estado, precio) {
  const importe = euros.format(precio ?? x.total);
  if (estado === "listo" || estado === "recogido") {
    const cuando = textoHorarios();
    return `Hola ${x.nombre}. ¡Tus piezas ya han salido del horno y están listas! ` +
      (cuando ? `Puedes pasar a recogerlas al taller cuando hay clase: ${cuando}.` : "Puedes pasar a recogerlas al taller cuando te venga bien; avísame antes.") +
      `${notaRecogida(x)} Son ${importe}. ¡Hasta pronto!`;
  }
  if (estado === "en-horno") return `Hola ${x.nombre}. Tus piezas ya están en el horno. Te aviso en cuanto salgan.`;
  if (estado === "descartado") return `Hola ${x.nombre}. Te escribo de El Almacén por tu horneado: esta vez no podemos cocerlo. Si quieres, te cuento por qué.`;
  return `Hola ${x.nombre}. Te escribo de El Almacén por tu horneado: son ${importe}. Puedes traer las piezas bien secas${x.cuando ? ` (${x.cuando})` : ""}${recogida(x) ? ` y te las tenemos para el ${recogida(x)}` : ""}. ¿Te viene bien?`;
}

// Qué día y a qué hora quiere recogerlas: «sábado 7 de noviembre, por la tarde»
const recogida = (x) => [x.recoger && new Date(`${x.recoger}T12:00:00`).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" }),
  x.recoger_horario?.toLowerCase()].filter(Boolean).join(", ");

// Si pidió un día: ¿ese día hay clase? (1 lunes … 7 domingo, como en horarios)
function notaRecogida(x) {
  if (!x.recoger) return "";
  const dia = ((new Date(`${x.recoger}T12:00:00`).getDay() + 6) % 7) + 1;
  const quiere = recogida(x);
  if (!horarios.length || horarios.some((c) => c.dia === dia)) return ` Querías recogerlas el ${quiere}: ese día ya las tienes.`;
  return ` Querías recogerlas el ${quiere}, pero ese día no hay clase: pásate en alguno de esos horarios.`;
}

const asunto = (estado) => (estado === "listo" ? "Tus piezas ya están listas · El Almacén" : "Tu horneado en El Almacén");

// «los lunes de 18:00 a 20:00, los jueves de 10:00 a 12:00 y de 17:00 a 19:00»
const DIAS = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"];
function textoHorarios() {
  const hora = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  const porDia = new Map();
  for (const c of [...horarios].sort((a, b) => a.dia - b.dia || a.hora.localeCompare(b.hora))) {
    const [hh, mm] = c.hora.split(":").map(Number);
    const inicio = hh * 60 + mm;
    porDia.set(c.dia, [...(porDia.get(c.dia) ?? []), `de ${hora(inicio)} a ${hora(inicio + c.duracion)}`]);
  }
  const trozos = [...porDia].map(([dia, tramos]) => `los ${DIAS[dia]} ${tramos.join(" y ")}`);
  return trozos.length > 1 ? `${trozos.slice(0, -1).join(", ")} y ${trozos.at(-1)}` : trozos[0] ?? "";
}

function dato(etiqueta, valor) {
  return valor ? [h("dt", {}, etiqueta), h("dd", {}, valor)] : [];
}

function abrir(x) {
  const precio = h("input", { type: "number", inputmode: "decimal", min: "0", step: "0.1", value: x.precio_final ?? "", placeholder: String(x.total ?? "") });
  const estado = h("select", {}, ...Object.entries(ESTADOS).map(([clave, nombre]) => h("option", { value: clave, selected: x.estado === clave }, nombre)));
  const notas = h("textarea", { rows: 3, value: x.notas_taller ?? "", placeholder: "Solo las ves tú: en qué hornada va, en qué placa…" });
  const actual = () => ({ estado: estado.value, precio: precio.value ? Number(precio.value) : null });
  $("#contenido-ficha").replaceChildren(
    h("h2", {}, `Horneado de ${x.nombre}`),
    h("p", { class: "quien" }, `Enviado el ${fecha(x.creado)}`),
    preferencia(x, true),
    h("ul", { class: "lineas-horneado" }, x.piezas.map((p) => h("li", {}, h("span", {}, p.descripcion), p.total != null && h("strong", {}, euros.format(p.total))))),
    h("p", { class: "total-horneado" }, "Total orientativo ", h("strong", {}, euros.format(x.total ?? 0))),
    h("dl", { class: "datos-encargo" },
      ...dato("Teléfono", x.telefono), ...dato("Correo", x.correo),
      ...dato("Puede traerlas", x.cuando), ...dato("Quiere recogerlas", recogida(x)), ...dato("Notas", x.notas)),
    h("section", { class: "tu-respuesta" },
      h("h3", {}, "Tu respuesta"),
      h("div", { class: "fila-campos" },
        h("label", { class: "campo" }, "Precio final (€)", precio),
        h("label", { class: "campo" }, "Estado", estado)),
      h("label", { class: "campo" }, "Notas", notas),
      h("button", { type: "button", class: "guardar", onclick: async (ev) => {
        const boton = ev.currentTarget;
        boton.disabled = true;
        const cambios = { estado: estado.value, precio_final: actual().precio, notas_taller: notas.value.trim() || null };
        const { error } = await window.nube.cliente.from("horneados").update(cambios).eq("id", x.id);
        boton.disabled = false;
        if (error) return avisar("No se ha podido guardar");
        Object.assign(x, cambios);
        pintar();
        avisar("Guardado ✓");
      } }, "Guardar"),
      h("div", { class: "contestar" },
        ...botonesAviso(x, () => actual().estado, () => actual().precio, { whatsapp: "Contestar por WhatsApp", correo: "Contestar por correo" })),
      h("p", { class: "ayuda-aviso" }, "El mensaje cambia con el estado: con «Listo para recoger» le dice que ya puede pasar y los horarios de las clases fijas.")),
    h("button", { type: "button", class: "borrar-encargo", onclick: async () => {
      if (!confirm(`¿Borrar el horneado de ${x.nombre}?`)) return;
      const { error } = await window.nube.cliente.from("horneados").delete().eq("id", x.id);
      if (error) return avisar("No se ha podido borrar");
      horneados = horneados.filter((y) => y.id !== x.id);
      $("#ficha-encargo").close();
      pintar();
      avisar("Horneado borrado");
    } }, "Borrar horneado"),
  );
  $("#ficha-encargo").showModal();
  $("#ficha-encargo").scrollTop = 0;
}

$("#cerrar-ficha").addEventListener("click", () => $("#ficha-encargo").close());
$("#ficha-encargo").addEventListener("click", (e) => e.target === e.currentTarget && e.currentTarget.close());

// ---------- Arranque ----------

(async () => {
  await window.accesoTaller;
  // Las clases fijas, para decir cuándo se puede pasar a recoger
  window.nube.cliente.from("horarios").select("dia,hora,duracion").eq("activo", true)
    .then(({ data }) => { horarios = data ?? []; });
  try {
    await cargar();
    $("#estado-panel").hidden = true;
    $("#panel").hidden = false;
  } catch {
    $("#estado-panel").textContent = "No se han podido cargar los horneados. Comprueba la conexión y recarga.";
  }
})();
