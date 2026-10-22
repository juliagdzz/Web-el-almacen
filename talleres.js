// Talleres: talleres de un día, mensualidades y bonos, horarios con plazas libres
// y reservas. Las plazas y las reglas las controla Supabase (supabase/esquema.sql);
// aquí solo se enseñan y se llaman sus funciones.

const $ = (sel) => document.querySelector(sel);
const euros = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2, minimumFractionDigits: 0 });
const DIAS = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const T = TARIFAS_TALLERES;

let plan = null;       // mi_plan() con cuenta
let horarios = [];     // horarios activos
let clases = [];       // disponibilidad(): cada clase de los próximos dos meses con sus plazas
let talleres = [];     // talleres_proximos()
let mesVisto = null;   // "2026-11-01": el mes que enseña el calendario
let diaElegido = null; // "2026-11-03"
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
const mesYAno = (iso) => aFecha(iso).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
const sumarMeses = (iso, n) => { const d = aFecha(iso.slice(0, 8) + "01"); d.setMonth(d.getMonth() + n); return d.toLocaleDateString("sv-SE"); };
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
  if (b.tipo === "mensual") return `Mensualidad · ${DIAS[b.dia] ?? ""} ${b.hora ?? ""}`;
  return T[b.tipo]?.nombre ?? b.tipo;
}

// Primer mes que aún se puede pausar o dejar (lo da mi_plan; esto es por si la base es antigua)
const mesCambiable = () => plan?.cambiable ?? sumarMeses(hoyIso(), Number(hoyIso().slice(8)) < 25 ? 1 : 2);

// La mensualidad sigue sola: aquí se pausa un mes o se deja
function detalleMensual(b) {
  const pausas = b.pausas ?? [];
  const texto = b.hasta
    ? `Tu puesto está guardado todos los ${DIAS[b.dia]} hasta final de ${mesNombre(b.hasta)}.`
    : `Tu puesto está guardado todos los ${DIAS[b.dia]}. Se renueva sola cada mes.`;
  const puedeCambiar = b.estado === "activo" || b.estado === "pendiente";
  // Meses que aún se pueden pausar: el primero cambiable y los dos siguientes
  const meses = [0, 1, 2].map((n) => sumarMeses(mesCambiable(), n)).filter((m) => m >= b.mes && (!b.hasta || m <= b.hasta));
  return [
    h("small", {}, b.estado === "pendiente" ? "Pendiente: págala en el taller y queda activa. " : "", texto),
    pausas.length > 0 && h("small", { class: "pausas" }, `En pausa: ${pausas.map(mesNombre).join(", ")}.`),
    puedeCambiar && !b.hasta && h("details", { class: "cambiar-mensual" },
      h("summary", {}, "Pausar o dejarla"),
      h("p", { class: "ayuda" }, `Los cambios del mes que viene se hacen hasta el día 24. El mes que pausas, tu puesto queda libre para clases sueltas y luego vuelve a ser tuyo.`),
      h("div", { class: "botones-pausa" }, meses.map((m) => {
        const pausado = pausas.includes(m);
        return h("button", { type: "button", class: `boton pequeno ${pausado ? "" : "secundario"}`, "aria-pressed": String(pausado),
          onclick: () => pausar(b, m, pausado) }, pausado ? `Volver en ${mesNombre(m)}` : `Pausar ${mesNombre(m)}`);
      })),
      h("button", { type: "button", class: "boton texto peligro", onclick: () => dejar(b) }, "Dejar la mensualidad")),
  ];
}

async function pausar(b, mes, pausado) {
  try {
    await rpc("pausar_mes", { p_bono: b.id, p_mes: mes });
    avisar(pausado ? `Vuelves en ${mesNombre(mes)} ✓` : `${mesNombre(mes)[0].toUpperCase()}${mesNombre(mes).slice(1)} en pausa`);
    await recargar();
  } catch (e) {
    avisar(mensajeError(e));
  }
}

async function dejar(b) {
  const ultimo = sumarMeses(mesCambiable(), -1);
  if (!confirm(`¿Dejar la mensualidad de los ${DIAS[b.dia]}? ${ultimo >= b.mes ? `Sigues viniendo hasta final de ${mesNombre(ultimo)}.` : "Aún no había empezado: se anula."}`)) return;
  try {
    await rpc("dejar_mensualidad", { p_bono: b.id });
    avisar("Hecho. Puedes volver a pedirla cuando quieras");
    await recargar();
  } catch (e) {
    avisar(mensajeError(e));
  }
}

function pintarPlan() {
  const caja = $("#mi-plan");
  if (!plan || (!plan.bonos.length && !plan.reservas.length)) return (caja.hidden = true);
  caja.hidden = false;
  $("#mis-bonos").replaceChildren(...plan.bonos.map((b) => {
    const restantes = b.sesiones - b.usadas;
    return h("article", { class: `bono-mio ${b.estado}` },
      h("strong", {}, nombreBono(b)),
      b.tipo === "mensual"
        ? detalleMensual(b)
        : b.estado === "pendiente"
          ? h("small", {}, "Pendiente: págalo en el taller y queda activo.")
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
  $("#texto-pedir").textContent = `${euros.format(m.precio)}${m.por ? ` ${m.por}` : ""}. Lo pagas en el taller y entonces queda activo.${tipo === "mensual" ? " Se renueva sola cada mes hasta que la pauses o la dejes." : ""}`;
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

// ---------- Calendario ----------

// Cómo está una clase para quien mira: suya, cerrada, completa, con pocas plazas o libre
function estadoClase(c) {
  if (c.cerrado) return "cerrada";
  if (c.fija || c.reserva) return "mia";
  if (c.libres <= 0) return "llena";
  if (c.libres <= Math.max(1, Math.floor(c.plazas / 3))) return "pocas";
  return "libre";
}

async function cargarClases() {
  const hoy = hoyIso();
  clases = (await rpc("disponibilidad", { p_desde: hoy, p_hasta: sumarDias(hoy, 62) })).filter((c) => !c.empezada);
}

function pintarCalendario() {
  const hoy = hoyIso();
  const primerMes = hoy.slice(0, 8) + "01";
  const ultimoDia = sumarDias(hoy, 62);
  mesVisto ??= primerMes;
  $("#titulo-mes").textContent = mesYAno(mesVisto);
  $("#mes-anterior").disabled = mesVisto <= primerMes;
  $("#mes-siguiente").disabled = sumarMeses(mesVisto, 1) > ultimoDia;

  const porDia = Map.groupBy ? Map.groupBy(clases, (c) => c.fecha) : clases.reduce((m, c) => m.set(c.fecha, [...(m.get(c.fecha) ?? []), c]), new Map());
  const tallerDe = (fecha) => talleres.filter((t) => t.fecha === fecha);
  const huecosAntes = (aFecha(mesVisto).getDay() + 6) % 7; // el calendario empieza en lunes
  const diasMes = new Date(aFecha(mesVisto).getFullYear(), aFecha(mesVisto).getMonth() + 1, 0).getDate();

  const celdas = Array.from({ length: huecosAntes }, () => h("span", { class: "dia vacio", "aria-hidden": "true" }));
  for (let n = 1; n <= diasMes; n++) {
    const fecha = mesVisto.slice(0, 8) + String(n).padStart(2, "0");
    const delDia = porDia.get(fecha) ?? [];
    const delTaller = tallerDe(fecha);
    const pasado = fecha < hoy;
    const hayAlgo = !pasado && (delDia.length || delTaller.length);
    const libres = delDia.filter((c) => !c.cerrado).reduce((t, c) => t + c.libres, 0);
    const etiqueta = hayAlgo
      ? `${diaLargo(fecha)}: ${[delDia.length && `${delDia.length === 1 ? "1 clase" : `${delDia.length} clases`}, ${libres === 1 ? "1 plaza libre" : `${libres} plazas libres`}`,
          delTaller.length && "taller de un día"].filter(Boolean).join(", ")}`
      : diaLargo(fecha);
    celdas.push(h(hayAlgo ? "button" : "span", {
      type: hayAlgo ? "button" : null,
      class: `dia${pasado ? " pasado" : ""}${hayAlgo ? " con-clases" : ""}${fecha === hoy ? " hoy" : ""}${fecha === diaElegido ? " elegido" : ""}`,
      "aria-label": etiqueta,
      "aria-pressed": hayAlgo ? String(fecha === diaElegido) : null,
      onclick: hayAlgo ? () => elegirDia(fecha) : null,
    },
      h("span", { class: "numero" }, String(n)),
      !pasado && delDia.map((c) => {
        const estado = estadoClase(c);
        const ocupadas = c.plazas - c.libres;
        return h("span", { class: `hueco ${estado}`, "aria-hidden": "true" },
          h("span", { class: "hora-hueco" }, c.hora),
          h("span", { class: "barra-plazas" }, h("span", { style: `width:${c.cerrado ? 100 : Math.round((ocupadas / c.plazas) * 100)}%` })),
          h("span", { class: "libres-hueco" }, c.cerrado ? "—" : estado === "mia" ? "tú" : String(c.libres)));
      }),
      !pasado && delTaller.length > 0 && h("span", { class: "marca-taller", "aria-hidden": "true" }, "taller")));
  }
  $("#rejilla-calendario").replaceChildren(...celdas);
  if (diaElegido) pintarDia(diaElegido);
}

function elegirDia(fecha) {
  diaElegido = fecha;
  pintarCalendario();
  const panel = $("#dia-elegido");
  // La hoja de monstera crece cada vez que se abre un día
  panel.classList.remove("abriendo");
  void panel.offsetWidth;
  panel.classList.add("abriendo");
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// Plazas de una clase, una a una: las ocupadas llenas y las libres en hueco
function asientos(c) {
  const ocupadas = c.plazas - c.libres;
  return h("span", { class: "asientos", "aria-hidden": "true" },
    Array.from({ length: c.plazas }, (_, i) => h("span", { class: i < ocupadas ? (i === 0 && (c.fija || c.reserva) ? "asiento tuyo" : "asiento ocupado") : "asiento" })));
}

function pintarDia(fecha) {
  const panel = $("#dia-elegido");
  const hoy = hoyIso();
  const limite = sumarDias(hoy, T.diasReserva);
  const delDia = clases.filter((c) => c.fecha === fecha);
  const delTaller = talleres.filter((t) => t.fecha === fecha);
  panel.hidden = false;
  panel.replaceChildren(...[
    h("img", { class: "ramita", src: "monstera-hoja.svg", alt: "", "aria-hidden": "true" }),
    h("div", { class: "cabeza-dia" },
      h("h3", {}, diaLargo(fecha)),
      h("button", { type: "button", class: "cerrar-dia", "aria-label": "Cerrar", onclick: () => { diaElegido = null; panel.hidden = true; pintarCalendario(); } }, "✕")),
    delTaller.map((t) => h("article", { class: "clase-dia taller" },
      h("div", { class: "datos-clase" },
        h("strong", {}, `${t.hora}–${horaFin(t.hora, t.duracion)} · ${t.titulo}`),
        h("small", {}, `Taller de un día${t.precio != null ? ` · ${euros.format(t.precio)}` : ""}`),
        asientos({ plazas: t.plazas, libres: t.libres }),
        h("small", { class: "cuenta-plazas" }, `${t.plazas - t.libres} ocupadas · ${t.libres === 1 ? "1 libre" : `${t.libres} libres`}`)),
      t.reserva ? h("span", { class: "etiqueta-mia" }, "Apuntado ✓")
        : t.libres <= 0 ? h("span", { class: "plazas completo" }, "Completo")
        : hayCuenta ? h("button", { type: "button", class: "boton pequeno", onclick: () => abrirTaller(t) }, "Apuntarme")
        : h("a", { class: "boton pequeno secundario", href: volverAqui() }, "Entrar"))),
    delDia.map((c) => {
      const ocupadas = c.plazas - c.libres;
      let accion;
      if (c.cerrado) accion = h("span", { class: "plazas completo" }, "Cerrado");
      else if (c.fija) accion = h("span", { class: "etiqueta-mia" }, "Tu puesto fijo");
      else if (c.reserva) accion = h("button", { type: "button", class: "boton pequeno secundario", onclick: () => cancelar({ id: c.reserva, tipo: "clase", nombre: c.actividad, fecha: c.fecha }) }, "Cancelar mi plaza");
      else if (c.libres <= 0) accion = h("span", { class: "plazas completo" }, "Completa");
      else if (fecha > limite) accion = h("small", { class: "se-abre" }, `Se reserva desde el ${aFecha(sumarDias(fecha, -T.diasReserva)).toLocaleDateString("es-ES", { day: "numeric", month: "long" })}`);
      else if (!hayCuenta) accion = h("a", { class: "boton pequeno secundario", href: volverAqui() }, "Entrar");
      else accion = h("button", { type: "button", class: "boton pequeno", onclick: () => reservar(c) }, "Reservar");
      return h("article", { class: `clase-dia ${estadoClase(c)}` },
        h("div", { class: "datos-clase" },
          h("strong", {}, `${c.hora}–${horaFin(c.hora, c.duracion)} · ${c.actividad}`),
          c.pausa && h("small", {}, "Tu mensualidad está en pausa este mes."),
          !c.cerrado && asientos(c),
          !c.cerrado && h("small", { class: "cuenta-plazas" }, `${ocupadas === 1 ? "1 ocupada" : `${ocupadas} ocupadas`} · ${c.libres === 1 ? "queda 1 libre" : `quedan ${c.libres} libres`}`)),
        accion);
    }),
  ].flat());
}

$("#mes-anterior").addEventListener("click", () => { mesVisto = sumarMeses(mesVisto, -1); pintarCalendario(); });
$("#mes-siguiente").addEventListener("click", () => { mesVisto = sumarMeses(mesVisto, 1); pintarCalendario(); });

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
  // Si algo de «Mi plan» falla, que no se lleve por delante el calendario
  try { pintarPlan(); } catch (e) { console.error(e); $("#mi-plan").hidden = true; }
  pintarModalidades();
  const [, horas] = await Promise.allSettled([pintarTalleres(), cargarClases()]);
  if (horas.status === "rejected") {
    $("#rejilla-calendario").replaceChildren(h("p", { class: "ayuda" }, "Ahora mismo no se pueden cargar los horarios. Prueba en un rato."));
    return;
  }
  pintarCalendario();
}

(async () => {
  $("#texto-horarios").textContent = `Toca un día para ver sus clases, las plazas ocupadas y las que quedan. Las clases sueltas se reservan con bono, como mucho ${T.diasReserva} días antes, y se cancelan hasta 24 horas antes.`;
  pintarModalidades();
  const nube = window.nube;
  if (!nube?.activa) {
    $("#lista-talleres").replaceChildren(h("p", { class: "ayuda" }, "Pronto podrás apuntarte desde aquí."));
    $("#rejilla-calendario").replaceChildren(h("p", { class: "ayuda" }, "Pronto podrás ver los horarios y reservar desde aquí."));
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
