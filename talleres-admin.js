// Gestión de talleres (solo el taller): agenda, alumnos y bonos, horarios,
// talleres de un día y días cerrados. Las reglas de Supabase impiden que
// cualquier otra cuenta lea o cambie nada de esto.

const $ = (sel) => document.querySelector(sel);
const euros = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2, minimumFractionDigits: 0 });
const DIAS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const TIPOS = { mensual: "Mensualidad", bono4: "Bono de 4", pack10: "Pack de 10" };
let horarios = [];

let temporizadorAviso;
function avisar(texto) {
  const el = $("#aviso");
  el.textContent = texto;
  el.classList.add("visible");
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => el.classList.remove("visible"), 3000);
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

const cliente = () => window.nube.cliente;
const aFecha = (iso) => new Date(iso + "T12:00");
const diaLargo = (iso) => aFecha(iso).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
const fechaCorta = (iso) => aFecha(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
const hoyIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
const sumarDias = (iso, n) => { const d = aFecha(iso); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv-SE"); };
const nombreHorario = (x) => `${DIAS[x.dia]} ${String(x.hora).slice(0, 5)} · ${x.actividad}`;

async function rpc(nombre, args) {
  const { data, error } = await cliente().rpc(nombre, args);
  if (error) throw error;
  return data;
}
async function hacer(promesa, ok) {
  const { error } = await promesa;
  if (error) { avisar(error.message || "No se ha podido guardar"); return false; }
  if (ok) avisar(ok);
  return true;
}

// ---------- Pestañas ----------

document.querySelectorAll(".pestanas-gestion button").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll(".pestanas-gestion button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
  document.querySelectorAll(".pestana").forEach((p) => (p.hidden = p.id !== `pestana-${b.dataset.pestana}`));
  ({ agenda: pintarAgenda, alumnos: pintarAlumnos, horarios: pintarHorarios, talleres: pintarTalleres, cierres: pintarCierres })[b.dataset.pestana]();
}));

// ---------- Agenda ----------

function asistentes(lista, clase) {
  return lista.length
    ? h("ul", { class: "asistentes" }, lista.map((a) => h("li", { class: `${clase}${a.estado === "pendiente" ? " sin-pagar" : ""}`, title: a.telefono || "" },
        a.nombre, a.estado === "pendiente" ? " (sin pagar)" : "")))
    : null;
}

async function pintarAgenda() {
  const hoy = hoyIso();
  let agenda;
  try { agenda = await rpc("agenda_admin", { p_desde: hoy, p_hasta: sumarDias(hoy, 14) }); }
  catch (e) { $("#agenda-admin").replaceChildren(h("p", { class: "ayuda" }, e.message)); return; }
  const porDia = new Map();
  const anadir = (fecha, el) => { if (!porDia.has(fecha)) porDia.set(fecha, []); porDia.get(fecha).push(el); };
  for (const c of agenda.clases) {
    const ocupadas = c.fijos.length + c.sueltos.length;
    anadir(c.fecha, h("div", { class: "clase-admin" },
      h("div", { class: "cabeza" }, h("strong", {}, c.hora), c.actividad,
        h("span", { class: "ocupacion" }, c.cerrado ? "Cerrado" : `${ocupadas}/${c.plazas}`)),
      asistentes(c.fijos, "fijo"), asistentes(c.sueltos, ""),
      !ocupadas && !c.cerrado && h("span", { class: "sin-nadie" }, "Nadie todavía")));
  }
  for (const t of agenda.talleres) {
    anadir(t.fecha, h("div", { class: "clase-admin" },
      h("div", { class: "cabeza" }, h("strong", {}, t.hora), `Taller: ${t.titulo}`,
        h("span", { class: "ocupacion" }, `${t.apuntados.length}/${t.plazas}`)),
      asistentes(t.apuntados, ""), !t.apuntados.length && h("span", { class: "sin-nadie" }, "Nadie apuntado todavía")));
  }
  const dias = [...porDia.keys()].sort();
  $("#agenda-admin").replaceChildren(...(dias.length
    ? dias.map((f) => h("section", { class: "dia-agenda" }, h("h3", {}, diaLargo(f)), porDia.get(f)))
    : [h("p", { class: "ayuda" }, "No hay clases en las próximas dos semanas. Crea un horario en la pestaña Horarios.")]));
}

// ---------- Alumnos y bonos ----------

async function pintarAlumnos() {
  let alumnos;
  try { alumnos = await rpc("alumnos_admin", {}); }
  catch (e) { $("#lista-alumnos").replaceChildren(h("p", { class: "ayuda" }, e.message)); return; }
  const pendientes = alumnos.filter((a) => a.estado === "pendiente").length;
  $("#pendientes").textContent = String(pendientes);
  $("#pendientes").hidden = !pendientes;
  $("#lista-alumnos").replaceChildren(...(alumnos.length ? alumnos.map((a) => {
    const detalle = a.tipo === "mensual"
      ? `${DIAS[a.dia] ?? ""} ${a.hora ?? ""} · ${aFecha(a.mes).toLocaleDateString("es-ES", { month: "long" })} · ${a.sesiones} clases`
      : a.estado === "activo" ? `${a.usadas} de ${a.sesiones} usadas${a.caduca ? ` · caduca ${fechaCorta(a.caduca)}` : ""}` : `${a.sesiones} sesiones`;
    return h("article", { class: `fila-gestion ${a.estado}` },
      h("div", {}, h("strong", {}, `${a.nombre} · ${TIPOS[a.tipo]}`),
        h("small", {}, [detalle, a.telefono, a.correo].filter(Boolean).join(" · ")),
        a.estado === "pendiente" && h("small", {}, ` · Pedido el ${fechaCorta(a.creado.slice(0, 10))}, sin pagar`)),
      h("div", { class: "botones-fila" },
        a.estado === "pendiente" && h("button", { type: "button", class: "boton pequeno", onclick: async () => {
          try { await rpc("activar_bono", { p_bono: a.id }); avisar(`Activado: ${a.nombre}`); pintarAlumnos(); } catch (e) { avisar(e.message); }
        } }, "Cobrado: activar"),
        h("button", { type: "button", class: "boton pequeno peligro", onclick: async () => {
          if (!confirm(`¿Cancelar ${TIPOS[a.tipo].toLowerCase()} de ${a.nombre}? Sus clases reservadas a partir de ahora se liberan.`)) return;
          try { await rpc("cancelar_bono", { p_bono: a.id }); avisar("Cancelado"); pintarAlumnos(); } catch (e) { avisar(e.message); }
        } }, "Cancelar")));
  }) : [h("p", { class: "ayuda" }, "Todavía nadie ha pedido una mensualidad o un bono.")]));
}

// ---------- Horarios ----------

async function cargarHorarios() {
  const { data } = await cliente().from("horarios").select("*").order("dia").order("hora");
  horarios = data ?? [];
  $("#c-horario").replaceChildren(h("option", { value: "" }, "Todo el día"), ...horarios.filter((x) => x.activo).map((x) => h("option", { value: x.id }, nombreHorario(x))));
}

async function pintarHorarios() {
  await cargarHorarios();
  $("#lista-horarios").replaceChildren(...(horarios.length ? horarios.map((x) => {
    const plazas = h("input", { type: "number", min: "1", max: "50", value: String(x.plazas), "aria-label": "Plazas" });
    return h("article", { class: `fila-gestion${x.activo ? "" : " apagada"}` },
      h("div", {}, h("strong", {}, nombreHorario(x)), h("small", {}, `${x.duracion} min${x.activo ? "" : " · desactivado: no sale en la web"}`)),
      h("div", { class: "botones-fila" },
        h("label", { class: "editar-plazas" }, "Plazas", plazas,
          h("button", { type: "button", class: "boton pequeno secundario", onclick: async () => {
            if (await hacer(cliente().from("horarios").update({ plazas: Number(plazas.value) }).eq("id", x.id), "Plazas guardadas")) pintarHorarios();
          } }, "Guardar")),
        h("button", { type: "button", class: "boton pequeno secundario", onclick: async () => {
          if (await hacer(cliente().from("horarios").update({ activo: !x.activo }).eq("id", x.id), x.activo ? "Horario desactivado" : "Horario activado")) pintarHorarios();
        } }, x.activo ? "Desactivar" : "Activar")));
  }) : [h("p", { class: "ayuda" }, "Todavía no hay horarios. Añade el primero arriba.")]));
}

$("#form-horario").addEventListener("submit", async (e) => {
  e.preventDefault();
  const ok = await hacer(cliente().from("horarios").insert({
    dia: Number($("#h-dia").value), hora: $("#h-hora").value, duracion: Number($("#h-duracion").value),
    plazas: Number($("#h-plazas").value), actividad: $("#h-actividad").value.trim(),
  }), "Horario añadido");
  if (ok) pintarHorarios();
});

// ---------- Talleres de un día ----------

async function pintarTalleres() {
  const { data } = await cliente().from("talleres").select("*").order("fecha", { ascending: false }).order("hora");
  const talleres = data ?? [];
  $("#lista-talleres-admin").replaceChildren(...(talleres.length ? talleres.map((t) => h("article", { class: `fila-gestion${t.publicado ? "" : " apagada"}` },
    h("div", {}, h("strong", {}, t.titulo),
      h("small", {}, [`${diaLargo(t.fecha)}, ${String(t.hora).slice(0, 5)}`, `${t.plazas} plazas`, t.precio != null && euros.format(t.precio), !t.publicado && "sin publicar"].filter(Boolean).join(" · "))),
    h("div", { class: "botones-fila" },
      h("button", { type: "button", class: "boton pequeno secundario", onclick: async () => {
        if (await hacer(cliente().from("talleres").update({ publicado: !t.publicado }).eq("id", t.id), t.publicado ? "Retirado de la web" : "Publicado")) pintarTalleres();
      } }, t.publicado ? "Retirar" : "Publicar"),
      h("button", { type: "button", class: "boton pequeno peligro", onclick: async () => {
        if (!confirm(`¿Borrar «${t.titulo}»? También se borran las plazas de quien se haya apuntado.`)) return;
        if (await hacer(cliente().from("talleres").delete().eq("id", t.id), "Taller borrado")) pintarTalleres();
      } }, "Borrar"))))
    : [h("p", { class: "ayuda" }, "Todavía no has creado ningún taller de un día.")]));
}

$("#form-taller-dia").addEventListener("submit", async (e) => {
  e.preventDefault();
  const precio = $("#t-precio").value;
  const ok = await hacer(cliente().from("talleres").insert({
    titulo: $("#t-titulo").value.trim(), descripcion: $("#t-descripcion").value.trim() || null,
    fecha: $("#t-fecha").value, hora: $("#t-hora").value, duracion: Number($("#t-duracion").value),
    plazas: Number($("#t-plazas").value), precio: precio === "" ? null : Number(precio), publicado: $("#t-publicado").checked,
  }), "Taller creado");
  if (ok) {
    e.target.reset();
    pintarTalleres();
  }
});

// ---------- Días cerrados ----------

async function pintarCierres() {
  await cargarHorarios();
  const { data } = await cliente().from("cierres").select("*").gte("fecha", hoyIso()).order("fecha");
  const cierres = data ?? [];
  $("#lista-cierres").replaceChildren(...(cierres.length ? cierres.map((c) => {
    const horario = horarios.find((x) => x.id === c.horario_id);
    return h("article", { class: "fila-gestion" },
      h("div", {}, h("strong", {}, diaLargo(c.fecha)), h("small", {}, [horario ? nombreHorario(horario) : "Todo el día", c.motivo].filter(Boolean).join(" · "))),
      h("div", { class: "botones-fila" }, h("button", { type: "button", class: "boton pequeno secundario", onclick: async () => {
        if (await hacer(cliente().from("cierres").delete().eq("id", c.id), "Día abierto de nuevo")) pintarCierres();
      } }, "Abrir de nuevo")));
  }) : [h("p", { class: "ayuda" }, "No hay días cerrados próximamente.")]));
}

$("#form-cierre").addEventListener("submit", async (e) => {
  e.preventDefault();
  const ok = await hacer(cliente().from("cierres").insert({
    fecha: $("#c-fecha").value, horario_id: $("#c-horario").value || null, motivo: $("#c-motivo").value.trim() || null,
  }), "Día cerrado");
  if (ok) pintarCierres();
});

// ---------- Arranque ----------

(async () => {
  const nube = window.nube;
  const estado = $("#estado-gestion");
  if (!nube?.activa) return (estado.textContent = "Esta página necesita la web conectada a Supabase.");
  await nube.listo;
  if (!nube.usuario) {
    estado.replaceChildren("Entra con tu cuenta del taller. ", h("a", { href: `entrar.html?volver=${encodeURIComponent("/talleres-admin.html")}` }, "Entrar"));
    return;
  }
  const { data: esAdmin } = await nube.cliente.rpc("es_admin");
  if (!esAdmin) return (estado.textContent = "Esta página es solo para el taller.");
  $("#t-fecha").min = hoyIso();
  $("#c-fecha").min = hoyIso();
  estado.hidden = true;
  $("#gestion").hidden = false;
  await Promise.all([pintarAgenda(), pintarAlumnos()]);
})();
