// Talleres: talleres de un día, mensualidades y bonos, horarios con plazas libres
// y reservas. Las plazas y las reglas las controla Supabase (supabase/esquema.sql);
// aquí solo se enseñan y se llaman sus funciones.

const $ = (sel) => document.querySelector(sel);
const euros = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2, minimumFractionDigits: 0 });
const DIAS = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const T = TARIFAS_TALLERES;

let plan = null;       // mi_plan() con cuenta
let horarios = [];     // horarios activos
let hayCuenta = false;

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

const aFecha = (iso) => new Date(iso + "T12:00");
const diaLargo = (iso) => aFecha(iso).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
const diaCorto = (iso) => aFecha(iso).toLocaleDateString("es-ES", { weekday: "short", day: "numeric", month: "short" });
const mesNombre = (iso) => aFecha(iso).toLocaleDateString("es-ES", { month: "long" });
const hoyIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
const sumarDias = (iso, n) => { const d = aFecha(iso); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv-SE"); };
function horaFin(hora, minutos) {
  const [hh, mm] = hora.split(":").map(Number);
  const total = hh * 60 + mm + minutos;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
const volverAqui = () => `entrar.html?volver=${encodeURIComponent("/talleres.html")}`;
const mensajeError = (error) => /fetch|network/i.test(String(error?.message)) ? "No hay conexión. Prueba otra vez en un momento." : (error?.message || "Algo ha fallado. Prueba otra vez.");

async function rpc(nombre, args) {
  const { data, error } = await window.nube.cliente.rpc(nombre, args);
  if (error) throw error;
  return data;
}

// ---------- Mi plan ----------

function nombreBono(b) {
  if (b.tipo === "mensual") return `Mensualidad · ${DIAS[b.dia] ?? ""} ${b.hora ?? ""} · ${mesNombre(b.mes)}`;
  return T[b.tipo]?.nombre ?? b.tipo;
}

function pintarPlan() {
  const caja = $("#mi-plan");
  if (!plan || (!plan.bonos.length && !plan.reservas.length)) return (caja.hidden = true);
  caja.hidden = false;
  $("#mis-bonos").replaceChildren(...plan.bonos.map((b) => {
    const restantes = b.sesiones - b.usadas;
    return h("article", { class: `bono-mio ${b.estado}` },
      h("strong", {}, nombreBono(b)),
      b.estado === "pendiente"
        ? h("small", {}, "Pendiente: págalo en el taller y queda activo.")
        : b.tipo === "mensual"
          ? h("small", {}, `Tu puesto está guardado todos los ${DIAS[b.dia]} de ${mesNombre(b.mes)}.`)
          : h("small", {}, `Te quedan ${restantes} de ${b.sesiones} sesiones${b.caduca ? ` · caduca el ${aFecha(b.caduca).toLocaleDateString("es-ES", { day: "numeric", month: "long" })}` : ""}.`),
      b.tipo !== "mensual" && b.estado === "activo" && h("span", { class: "barra-sesiones", "aria-hidden": "true" },
        ...Array.from({ length: b.sesiones }, (_, i) => h("span", { class: i < b.usadas ? "usada" : "" }))));
  }));
  $("#mis-reservas").replaceChildren(...(plan.reservas.length
    ? plan.reservas.map((r) => h("li", {},
        h("span", {}, h("strong", {}, `${diaLargo(r.fecha)}, ${r.hora}`), ` · ${r.nombre}`),
        h("button", { type: "button", class: "boton texto", onclick: () => cancelar(r) }, "Cancelar")))
    : [h("li", { class: "vacio" }, "No tienes clases sueltas reservadas.")]));
}

async function cancelar(r) {
  if (!confirm(`¿Cancelar ${r.tipo === "taller" ? "tu plaza en" : "la clase de"} ${r.nombre} del ${diaLargo(r.fecha)}?`)) return;
  try {
    await rpc("cancelar_reserva", { p_reserva: r.id });
    avisar(r.tipo === "taller" ? "Plaza cancelada" : "Clase cancelada: la sesión vuelve a tu bono");
    await recargar();
  } catch (e) {
    avisar(mensajeError(e));
  }
}

// ---------- Talleres de un día ----------

async function pintarTalleres() {
  const lista = $("#lista-talleres");
  let talleres;
  try {
    talleres = await rpc("talleres_proximos", {});
  } catch {
    lista.replaceChildren(h("p", { class: "ayuda" }, "Ahora mismo no se pueden cargar los talleres. Prueba en un rato."));
    return;
  }
  if (!talleres.length) {
    lista.replaceChildren(h("p", { class: "vacio-talleres" }, "Estamos preparando los próximos talleres. Vuelve pronto o síguenos para enterarte."));
    return;
  }
  lista.replaceChildren(...talleres.map((t) => {
    const completo = t.libres <= 0;
    const fecha = aFecha(t.fecha);
    return h("article", { class: "taller-dia" },
      h("div", { class: "fecha-taller", "aria-hidden": "true" },
        h("span", { class: "dia-num" }, String(fecha.getDate())),
        h("span", { class: "mes-corto" }, fecha.toLocaleDateString("es-ES", { month: "short" }).replace(".", ""))),
      h("div", { class: "info-taller" },
        h("h3", {}, t.titulo),
        h("p", { class: "cuando" }, `${diaLargo(t.fecha)} · ${t.hora}–${horaFin(t.hora, t.duracion)}`),
        t.descripcion && h("p", { class: "descripcion" }, t.descripcion),
        h("p", { class: "datos-taller" },
          t.precio != null && h("strong", {}, euros.format(t.precio)),
          h("span", { class: completo ? "plazas completo" : "plazas" }, completo ? "Completo" : t.libres === 1 ? "Queda 1 plaza" : `Quedan ${t.libres} plazas`))),
      h("div", { class: "accion-taller" },
        t.reserva
          ? h("span", { class: "etiqueta-mia" }, "Apuntado ✓")
          : completo
            ? null
            : hayCuenta
              ? h("button", { type: "button", class: "boton", onclick: () => abrirTaller(t) }, "Apuntarme")
              : h("a", { class: "boton", href: volverAqui() }, "Entrar para apuntarme")));
  }));
}

let tallerElegido = null;
function abrirTaller(t) {
  tallerElegido = t;
  $("#titulo-taller").textContent = t.titulo;
  $("#texto-taller").textContent = `${diaLargo(t.fecha)}, de ${t.hora} a ${horaFin(t.hora, t.duracion)}${t.precio != null ? ` · ${euros.format(t.precio)}, se paga en el taller` : ""}. Puedes cancelar hasta 48 horas antes.`;
  $("#taller-nombre").value = plan?.nombre ?? "";
  $("#taller-telefono").value = plan?.telefono ?? "";
  $("#error-taller").hidden = true;
  $("#hoja-taller").showModal();
}

$("#form-taller").addEventListener("submit", async (e) => {
  e.preventDefault();
  const boton = $("#enviar-taller");
  boton.disabled = true;
  try {
    await rpc("apuntarse_taller", { p_taller: tallerElegido.id, p_nombre: $("#taller-nombre").value, p_telefono: $("#taller-telefono").value });
    $("#hoja-taller").close();
    avisar("¡Te has apuntado! Te esperamos en el taller");
    await recargar();
  } catch (err) {
    $("#error-taller").textContent = mensajeError(err);
    $("#error-taller").hidden = false;
  } finally {
    boton.disabled = false;
  }
});

// ---------- Modalidades ----------

function pintarModalidades() {
  $("#incluye").textContent = T.incluye;
  $("#modalidades").replaceChildren(...["mensual", "bono4", "pack10"].map((tipo) => {
    const m = T[tipo];
    return h("article", { class: `modalidad ${tipo === "mensual" ? "destacada" : ""}` },
      h("h3", {}, m.nombre),
      h("p", { class: "precio-modalidad" }, euros.format(m.precio), m.por && h("span", {}, ` ${m.por}`)),
      h("p", { class: "resumen" }, m.resumen),
      h("ul", {}, m.detalles.map((d) => h("li", {}, d))),
      hayCuenta
        ? h("button", { type: "button", class: tipo === "mensual" ? "boton claro" : "boton", onclick: () => abrirPedir(tipo) }, tipo === "mensual" ? "Elegir mi horario" : "Pedir este bono")
        : h("a", { class: tipo === "mensual" ? "boton claro" : "boton", href: volverAqui() }, "Entrar para pedirlo"));
  }));
}

let tipoPedido = null;
function abrirPedir(tipo) {
  tipoPedido = tipo;
  const m = T[tipo];
  $("#titulo-pedir").textContent = m.nombre;
  $("#texto-pedir").textContent = `${euros.format(m.precio)}${m.por ? ` ${m.por}` : ""}. Lo pagas en el taller y entonces queda activo.`;
  const mensual = tipo === "mensual";
  $("#caja-horario").hidden = !mensual;
  $("#caja-mes").hidden = !mensual;
  if (mensual) {
    $("#opciones-horario").replaceChildren(...(horarios.length
      ? horarios.map((x, i) => h("label", { class: "opcion-radio" },
          h("input", { type: "radio", name: "horario", value: x.id, checked: i === 0 }),
          `${DIAS[x.dia][0].toUpperCase()}${DIAS[x.dia].slice(1)} ${x.hora.slice(0, 5)} · ${x.actividad}`))
      : [h("p", { class: "ayuda" }, "Todavía no hay horarios publicados.")]));
    const hoy = hoyIso();
    const esteMes = hoy.slice(0, 8) + "01";
    const siguiente = sumarDias(esteMes, 32).slice(0, 8) + "01";
    $("#opciones-mes").replaceChildren(
      h("label", { class: "opcion-radio" }, h("input", { type: "radio", name: "mes", value: esteMes, checked: true }), `Este mes (${mesNombre(esteMes)}): las clases que quedan`),
      h("label", { class: "opcion-radio" }, h("input", { type: "radio", name: "mes", value: siguiente }), `Desde ${mesNombre(siguiente)}`));
  }
  $("#pedir-nombre").value = plan?.nombre ?? "";
  $("#pedir-telefono").value = plan?.telefono ?? "";
  $("#error-pedir").hidden = true;
  $("#hoja-pedir").showModal();
}

$("#form-pedir").addEventListener("submit", async (e) => {
  e.preventDefault();
  const boton = $("#enviar-pedir");
  boton.disabled = true;
  try {
    const mensual = tipoPedido === "mensual";
    await rpc("pedir_bono", {
      p_tipo: tipoPedido,
      p_nombre: $("#pedir-nombre").value,
      p_telefono: $("#pedir-telefono").value,
      p_horario: mensual ? document.querySelector('input[name="horario"]:checked')?.value ?? null : null,
      p_mes: mensual ? document.querySelector('input[name="mes"]:checked')?.value ?? null : null,
    });
    $("#hoja-pedir").close();
    avisar("Pedido. Págalo en el taller y queda activo");
    await recargar();
  } catch (err) {
    $("#error-pedir").textContent = mensajeError(err);
    $("#error-pedir").hidden = false;
  } finally {
    boton.disabled = false;
  }
});

document.querySelectorAll("[data-cerrar]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));

// ---------- Horarios y plazas ----------

function pintarSemana() {
  $("#semana").replaceChildren(...horarios.map((x) =>
    h("span", { class: "chip-horario" }, `${DIAS[x.dia][0].toUpperCase()}${DIAS[x.dia].slice(1)} ${x.hora.slice(0, 5)}–${horaFin(x.hora.slice(0, 5), x.duracion)} · ${x.actividad} · ${x.plazas} plazas`)));
}

function tieneBonoFlexible() {
  return plan?.bonos.some((b) => b.estado === "activo" && b.tipo !== "mensual" && b.sesiones > b.usadas);
}

async function pintarAgenda() {
  const hoy = hoyIso();
  const clases = await rpc("disponibilidad", { p_desde: hoy, p_hasta: sumarDias(hoy, T.diasReserva) });
  if (!clases.length) {
    $("#agenda").replaceChildren(h("p", { class: "ayuda" }, "Todavía no hay horarios publicados."));
    return;
  }
  const porDia = new Map();
  for (const c of clases) {
    if (c.empezada) continue;
    if (!porDia.has(c.fecha)) porDia.set(c.fecha, []);
    porDia.get(c.fecha).push(c);
  }
  $("#agenda").replaceChildren(...[...porDia].map(([fecha, lista]) =>
    h("section", { class: "dia-agenda" },
      h("h3", {}, diaLargo(fecha)),
      h("ul", {}, lista.map((c) => {
        let estado;
        if (c.cerrado) estado = h("span", { class: "plazas completo" }, "Cerrado");
        else if (c.fija) estado = h("span", { class: "etiqueta-mia" }, "Tu puesto fijo");
        else if (c.reserva) estado = h("span", { class: "etiqueta-mia" }, "Reservada ✓");
        else if (c.libres <= 0) estado = h("span", { class: "plazas completo" }, "Completa");
        else estado = h("span", { class: "plazas" }, c.libres === 1 ? "1 plaza" : `${c.libres} plazas`);
        const puedeReservar = !c.cerrado && !c.fija && !c.reserva && c.libres > 0;
        return h("li", { class: "clase" },
          h("span", { class: "hora" }, `${c.hora}–${horaFin(c.hora, c.duracion)}`),
          h("span", { class: "actividad" }, c.actividad),
          estado,
          puedeReservar && (hayCuenta
            ? h("button", { type: "button", class: "boton pequeno", onclick: () => reservar(c) }, "Reservar")
            : h("a", { class: "boton pequeno secundario", href: volverAqui() }, "Entrar")));
      }))))
  );
}

async function reservar(c) {
  if (!tieneBonoFlexible()) {
    avisar("Para reservar clases sueltas necesitas un bono activo");
    document.querySelector("#modalidades").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  try {
    const r = await rpc("reservar_clase", { p_horario: c.horario, p_fecha: c.fecha });
    avisar(`Reservada. Te ${r.restantes === 1 ? "queda 1 sesión" : `quedan ${r.restantes} sesiones`}`);
    await recargar();
  } catch (e) {
    avisar(mensajeError(e));
    await recargar();
  }
}

// ---------- Arranque ----------

async function recargar() {
  if (hayCuenta) {
    try { plan = await rpc("mi_plan", {}); } catch { plan = null; }
  }
  pintarPlan();
  pintarModalidades();
  await Promise.allSettled([pintarTalleres(), pintarAgenda().catch(() => {
    $("#agenda").replaceChildren(h("p", { class: "ayuda" }, "Ahora mismo no se pueden cargar los horarios. Prueba en un rato."));
  })]);
}

(async () => {
  $("#texto-horarios").textContent = `Las clases sueltas se reservan con bono, como mucho ${T.diasReserva} días antes, y se cancelan hasta 24 horas antes. Las mensualidades tienen su puesto guardado.`;
  pintarModalidades();
  const nube = window.nube;
  if (!nube?.activa) {
    $("#lista-talleres").replaceChildren(h("p", { class: "ayuda" }, "Pronto podrás apuntarte desde aquí."));
    $("#agenda").replaceChildren(h("p", { class: "ayuda" }, "Pronto podrás ver los horarios y reservar desde aquí."));
    return;
  }
  await nube.listo;
  hayCuenta = Boolean(nube.usuario);
  if (!hayCuenta) {
    const aviso = $("#aviso-cuenta");
    aviso.replaceChildren("Para apuntarte o reservar, ", h("a", { href: volverAqui() }, "entra con tu cuenta"), ". Mira los horarios sin entrar.");
    aviso.hidden = false;
  }
  try {
    const { data } = await nube.cliente.from("horarios").select("*").eq("activo", true).order("dia").order("hora");
    horarios = data ?? [];
  } catch {}
  pintarSemana();
  await recargar();
})();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
