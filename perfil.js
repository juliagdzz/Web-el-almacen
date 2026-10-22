// Tu perfil: foto, nombre en la comunidad e insignias.
// Las insignias las da el servidor (supabase/esquema.sql, revisar_insignias);
// aquí solo se enseñan y se marcan como vistas.

const $ = (sel) => document.querySelector(sel);
const nube = window.nube;
const LADO_FOTO = 400;

let perfil = { alias: null, foto: null, insignias: "privadas" };

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
const urlFoto = (ruta) => nube.cliente.storage.from("comunidad").getPublicUrl(ruta).data.publicUrl;

// Primero se intenta cambiar; si aún no hay perfil, se crea
async function guardarPerfil(cambios) {
  const { data, error } = await nube.cliente.from("perfiles").update(cambios).eq("user_id", nube.usuario.id).select("user_id");
  if (error) throw error;
  if (!data?.length) {
    const { error: error2 } = await nube.cliente.from("perfiles").insert(cambios);
    if (error2) throw error2;
  }
  Object.assign(perfil, cambios);
  document.dispatchEvent(new Event("perfil:cambiado")); // la foto de la esquina
}

// ---------- Foto ----------

function pintarAvatar() {
  const avatar = $("#avatar");
  const inicial = (perfil.alias || nube.usuario.email || "?").trim()[0].toUpperCase();
  avatar.replaceChildren(perfil.foto ? h("img", { src: urlFoto(perfil.foto), alt: "" }) : inicial);
  avatar.classList.toggle("con-foto", Boolean(perfil.foto));
  $("#quitar-foto").hidden = !perfil.foto;
}

// Recorta al centro en cuadrado y la deja en 400 px: pesa poco y se ve nítida
async function fotoCuadrada(archivo) {
  const bitmap = await createImageBitmap(archivo);
  const lado = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = Math.min(LADO_FOTO, lado);
  canvas.getContext("2d").drawImage(bitmap, (bitmap.width - lado) / 2, (bitmap.height - lado) / 2, lado, lado, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const webp = await new Promise((ok) => canvas.toBlob(ok, "image/webp", 0.85));
  return webp?.type === "image/webp" ? webp : new Promise((ok) => canvas.toBlob(ok, "image/jpeg", 0.88));
}

$("#elegir-foto").addEventListener("change", async (e) => {
  const archivo = e.target.files[0];
  e.target.value = "";
  if (!archivo) return;
  avisar("Subiendo foto…");
  try {
    const blob = await fotoCuadrada(archivo);
    const ruta = `${nube.usuario.id}/perfil-${Date.now()}.${blob.type === "image/webp" ? "webp" : "jpg"}`;
    const { error } = await nube.cliente.storage.from("comunidad").upload(ruta, blob, { contentType: blob.type });
    if (error) throw error;
    const anterior = perfil.foto;
    await guardarPerfil({ foto: ruta });
    if (anterior) nube.cliente.storage.from("comunidad").remove([anterior]);
    pintarAvatar();
    avisar("Foto cambiada ✓");
  } catch {
    avisar("No se ha podido subir la foto");
  }
});

$("#quitar-foto").addEventListener("click", async () => {
  const anterior = perfil.foto;
  try {
    await guardarPerfil({ foto: null });
    nube.cliente.storage.from("comunidad").remove([anterior]);
    pintarAvatar();
    avisar("Foto quitada");
  } catch {
    avisar("No se ha podido quitar");
  }
});

// ---------- Nombre ----------

$("#form-alias").addEventListener("submit", async (e) => {
  e.preventDefault();
  const alias = $("#alias").value.trim();
  if (alias.length < 2) return avisar("Escribe al menos 2 letras");
  try {
    await guardarPerfil({ alias });
    pintarAvatar();
    avisar("Guardado ✓");
  } catch {
    avisar("No se ha podido guardar");
  }
});

// ---------- Insignias ----------

async function pintarInsignias() {
  const seccion = $("#insignias");
  seccion.hidden = perfil.insignias === "ocultas";
  if (seccion.hidden) return;
  let lista;
  try {
    lista = await window.insignias.cargar(nube.cliente, nube.usuario.id);
  } catch {
    $("#lista-insignias").replaceChildren(h("p", { class: "nota" }, "No se han podido cargar las insignias."));
    return;
  }
  const ganadas = lista.filter((i) => i.tiene).length;
  $("#cuenta-insignias").textContent = `${ganadas} de ${lista.length}`;
  $("#lista-insignias").replaceChildren(...Object.entries(window.insignias.GRUPOS).map(([grupo, titulo]) => {
    const delGrupo = lista.filter((i) => i.grupo === grupo);
    if (!delGrupo.length) return null;
    return h("div", { class: "grupo-insignias" },
      h("h3", {}, titulo),
      h("ul", { class: "rejilla-insignias" }, delGrupo.map((i) =>
        h("li", { class: `insignia-perfil${i.tiene ? " ganada" : ""}${i.tiene && !i.vista ? " nueva" : ""}` },
          h("span", { class: "medalla", innerHTML: window.insignias.dibujo(i.id) }),
          h("strong", {}, i.nombre),
          h("small", {}, i.tiene ? `Desde el ${fecha(i.ganada)}` : i.descripcion),
          i.tiene && !i.vista && h("span", { class: "etiqueta-nueva" }, "¡Nueva!")))));
  }));
  // Se ven al entrar: a partir de ahora ya no salen como nuevas
  if (lista.some((i) => i.tiene && !i.vista)) {
    nube.cliente.from("insignias_ganadas").update({ vista: true }).eq("user_id", nube.usuario.id).eq("vista", false)
      .then(() => document.dispatchEvent(new Event("perfil:cambiado")));
  }
}

$("#opciones-insignias").addEventListener("change", async (e) => {
  const valor = e.target.value;
  const antes = perfil.insignias;
  try {
    await guardarPerfil({ insignias: valor });
    avisar(valor === "publicas" ? "Ahora se ven en tu perfil de la comunidad" : valor === "ocultas" ? "Insignias ocultas" : "Solo las ves tú");
    pintarInsignias();
  } catch {
    document.querySelector(`input[name="ver-insignias"][value="${antes}"]`).checked = true;
    avisar("No se ha podido guardar");
  }
});

// ---------- Cuenta: correo, copia y salir ----------

const ESTADOS_COPIA = {
  sincronizando: "Sincronizando…",
  "al-dia": "Todo guardado en tu cuenta ✓",
  pendiente: "Hay cambios esperando para subir",
  "sin-conexion": "Sin conexión: se subirá cuando vuelva internet",
};
function pintarCopia() {
  $("#estado-copia").textContent = ESTADOS_COPIA[nube.estado] ?? "";
}
window.addEventListener("nube:estado", pintarCopia);

$("#salir-cuenta").addEventListener("click", async () => {
  if (!(await nube.salir())) return;
  try { localStorage.removeItem("cuentaMenu"); localStorage.removeItem("panelTaller"); } catch {}
  location.replace("entrar.html");
});

// ---------- Calendario: mis clases y talleres ----------

const DIAS = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const TIPOS = { fija: "Tu puesto fijo", suelta: "Clase reservada", taller: "Taller de un día" };
const hoyIso = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Madrid" });
const aFecha = (iso) => new Date(iso + "T12:00");
const diaLargo = (iso) => aFecha(iso).toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" });
const mesYAno = (iso) => aFecha(iso).toLocaleDateString("es-ES", { month: "long", year: "numeric" });
const sumarDias = (iso, n) => { const d = aFecha(iso); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv-SE"); };
const sumarMeses = (iso, n) => { const d = aFecha(iso.slice(0, 8) + "01"); d.setMonth(d.getMonth() + n); return d.toLocaleDateString("sv-SE"); };
const horaFin = (hora, min) => {
  const [hh, mm] = hora.split(":").map(Number);
  const t = hh * 60 + mm + min;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
const MESES_VISIBLES = 6; // el actual y los cinco siguientes

let eventos = [];
let mesVisto = null;
let diaElegido = null;

async function cargarCalendario() {
  const primero = hoyIso().slice(0, 8) + "01";
  const { data, error } = await nube.cliente.rpc("mi_calendario", { p_desde: primero, p_hasta: sumarDias(primero, 200) });
  if (error) throw error;
  eventos = data ?? [];
  mesVisto ??= primero;
  pintarCalendario();
  pintarProximas();
}

function pintarCalendario() {
  const hoy = hoyIso();
  const primerMes = hoy.slice(0, 8) + "01";
  $("#cal-titulo").textContent = mesYAno(mesVisto);
  $("#cal-anterior").disabled = mesVisto <= primerMes;
  $("#cal-siguiente").disabled = sumarMeses(mesVisto, 1) > sumarMeses(primerMes, MESES_VISIBLES - 1);

  const porDia = new Map();
  for (const e of eventos) porDia.set(e.fecha, [...(porDia.get(e.fecha) ?? []), e]);
  const vacios = (aFecha(mesVisto).getDay() + 6) % 7; // empieza en lunes
  const dias = new Date(aFecha(mesVisto).getFullYear(), aFecha(mesVisto).getMonth() + 1, 0).getDate();
  const celdas = Array.from({ length: vacios }, () => h("span", { class: "dia-cal vacio", "aria-hidden": "true" }));
  for (let n = 1; n <= dias; n++) {
    const fecha = mesVisto.slice(0, 8) + String(n).padStart(2, "0");
    const delDia = porDia.get(fecha) ?? [];
    const hay = delDia.length > 0;
    const etiqueta = hay ? `${diaLargo(fecha)}: ${delDia.map((e) => `${TIPOS[e.tipo].toLowerCase()} a las ${e.hora}`).join(", ")}` : diaLargo(fecha);
    celdas.push(h(hay ? "button" : "span", {
      type: hay ? "button" : null,
      class: `dia-cal${fecha < hoy ? " pasado" : ""}${hay ? " con-eventos" : ""}${fecha === hoy ? " hoy" : ""}${fecha === diaElegido ? " elegido" : ""}`,
      "aria-label": etiqueta,
      "aria-pressed": hay ? String(fecha === diaElegido) : null,
      onclick: hay ? () => elegirDia(fecha) : null,
    },
      h("span", { class: "numero" }, String(n)),
      delDia.slice(0, 2).map((e) => h("span", { class: `ev ${e.tipo}${e.cerrado ? " cerrado" : ""}${e.pendiente ? " pendiente" : ""}`, "aria-hidden": "true" }, e.hora)),
      delDia.length > 2 && h("span", { class: "ev mas", "aria-hidden": "true" }, `+${delDia.length - 2}`)));
  }
  $("#cal-rejilla").replaceChildren(...celdas);
  if (diaElegido) pintarDia(diaElegido);
}

function elegirDia(fecha) {
  diaElegido = fecha;
  pintarCalendario();
  const panel = $("#cal-dia");
  panel.classList.remove("abriendo");
  void panel.offsetWidth;
  panel.classList.add("abriendo");
  panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function pintarDia(fecha) {
  const panel = $("#cal-dia");
  const delDia = eventos.filter((e) => e.fecha === fecha);
  panel.hidden = false;
  panel.replaceChildren(...[
    h("img", { class: "ramita", src: "maranta-rama.svg", alt: "", "aria-hidden": "true" }),
    h("div", { class: "cabeza-dia" },
      h("h3", {}, diaLargo(fecha)),
      h("button", { type: "button", class: "cerrar-dia", "aria-label": "Cerrar", onclick: () => { diaElegido = null; panel.hidden = true; pintarCalendario(); } }, "✕")),
    delDia.map((e) => h("article", { class: `evento-dia ${e.tipo}` },
      h("div", {},
        h("strong", {}, `${e.hora}–${horaFin(e.hora, e.duracion)} · ${e.titulo}`),
        h("small", {}, e.cerrado ? "El taller está cerrado ese día" : e.pendiente ? `${TIPOS[e.tipo]} · pendiente de pago en el taller` : TIPOS[e.tipo])),
      e.fecha < hoyIso() ? null
        : e.tipo === "fija" ? h("a", { class: "boton texto", href: "talleres.html" }, "Pausar o dejar")
        : e.cancelable ? h("button", { type: "button", class: "boton pequeno secundario", onclick: () => cancelar(e) }, "Cancelar")
        : h("small", { class: "no-cancelable" }, "Ya no se cancela en la web"))),
  ].flat().filter(Boolean));
}

async function cancelar(e) {
  if (!confirm(`¿Cancelar ${e.tipo === "taller" ? "tu plaza en" : "la clase de"} ${e.titulo} del ${diaLargo(e.fecha)}?`)) return;
  const { error } = await nube.cliente.rpc("cancelar_reserva", { p_reserva: e.id });
  if (error) return avisar(error.message || "No se ha podido cancelar");
  avisar(e.tipo === "taller" ? "Plaza cancelada" : "Clase cancelada: la sesión vuelve a tu bono");
  await cargarCalendario();
  pintarPlan();
}

function pintarProximas() {
  const hoy = hoyIso();
  const ahora = new Date().toLocaleTimeString("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit" });
  const futuras = eventos.filter((e) => !e.cerrado && (e.fecha > hoy || (e.fecha === hoy && e.hora >= ahora))).slice(0, 6);
  $("#cal-proximas").replaceChildren(...(futuras.length
    ? futuras.map((e) => h("li", { class: e.tipo },
        h("span", { class: "cuando" }, `${diaLargo(e.fecha)} · ${e.hora}`),
        h("span", { class: "que" }, e.titulo, h("small", {}, ` · ${TIPOS[e.tipo]}`))))
    : [h("li", { class: "vacio" }, "No tienes clases ni talleres próximos. ", h("a", { href: "talleres.html" }, "Mira el calendario de talleres"), ".")]));
}

$("#cal-anterior").addEventListener("click", () => { mesVisto = sumarMeses(mesVisto, -1); pintarCalendario(); });
$("#cal-siguiente").addEventListener("click", () => { mesVisto = sumarMeses(mesVisto, 1); pintarCalendario(); });

// Resumen de lo que tienes contratado; se gestiona en Talleres
async function pintarPlan() {
  const caja = $("#cal-plan");
  const { data: plan, error } = await nube.cliente.rpc("mi_plan");
  if (error || !plan?.bonos?.length) return caja.replaceChildren();
  const T = typeof TARIFAS_TALLERES === "undefined" ? {} : TARIFAS_TALLERES;
  caja.replaceChildren(h("h3", { class: "sub-cal" }, "Lo que tienes"), ...plan.bonos.map((b) => {
    const nombre = b.tipo === "mensual" ? `Mensualidad · ${DIAS[b.dia] ?? ""} ${b.hora ?? ""}` : T[b.tipo]?.nombre ?? b.tipo;
    const detalle = b.estado === "pendiente" ? "Pendiente: págalo en el taller y queda activo"
      : b.tipo === "mensual" ? (b.hasta ? `Termina a final de ${aFecha(b.hasta).toLocaleDateString("es-ES", { month: "long" })}` : "Se renueva sola cada mes")
      : `Te quedan ${b.sesiones - b.usadas} de ${b.sesiones} sesiones${b.caduca ? ` · caduca el ${aFecha(b.caduca).toLocaleDateString("es-ES", { day: "numeric", month: "long" })}` : ""}`;
    return h("a", { class: `bono-resumen ${b.estado}`, href: "talleres.html" }, h("strong", {}, nombre), h("small", {}, detalle));
  }));
}

// ---------- Arranque ----------

Promise.resolve(nube?.listo).then(async () => {
  const estado = $("#estado-perfil");
  if (!nube?.usuario) {
    estado.replaceChildren("Para tener foto, calendario e insignias necesitas una cuenta. ",
      h("a", { href: "entrar.html?volver=perfil.html" }, "Crea una o entra"), ".");
    return;
  }
  const { data, error } = await nube.cliente.from("perfiles").select("alias,foto,insignias").eq("user_id", nube.usuario.id);
  if (error) {
    estado.textContent = "No se ha podido cargar tu perfil. Comprueba la conexión y recarga.";
    return;
  }
  if (data[0]) perfil = data[0];
  $("#alias").value = perfil.alias ?? "";
  document.querySelector(`input[name="ver-insignias"][value="${perfil.insignias}"]`).checked = true;
  pintarAvatar();
  $("#correo-cuenta").textContent = nube.usuario.email;
  pintarCopia();
  estado.hidden = true;
  $("#contenido-perfil").hidden = false;
  pintarInsignias();
  cargarCalendario().catch(() => $("#cal-rejilla").replaceChildren(h("p", { class: "nota" }, "Ahora mismo no se puede cargar tu calendario. Prueba en un rato.")));
  pintarPlan().catch(() => {});
  // Llegando desde el menú (#calendario o #insignias), ahora que ya está el contenido
  if (location.hash) setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView(), 50);
});
