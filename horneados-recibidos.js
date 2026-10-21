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
    h("button", { type: "button", class: `tarjeta-encargo estado-${x.estado}`, onclick: () => abrir(x) },
      h("span", { class: "linea-1" },
        h("strong", {}, `${piezas(x) === 1 ? "1 pieza" : `${piezas(x)} piezas`} · ${euros.format(x.precio_final ?? x.total)}`),
        h("span", { class: `etiqueta-estado estado-${x.estado}` }, ESTADOS[x.estado])),
      h("span", { class: "linea-2" }, `${x.nombre} · ${haceCuanto(x.creado)}${x.cuando ? ` · trae: ${x.cuando}` : ""}`),
      h("span", { class: "idea-corta" }, x.piezas.map((p) => p.descripcion).join(" · ")))
  ) : [h("p", { class: "vacio" }, filtro === "pendientes" ? "No tienes horneados pendientes." : "No hay horneados aquí.")]));
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
  if (estado === "listo" || estado === "recogido") return `Hola, ${x.nombre}. ¡Tus piezas ya han salido del horno! Puedes pasar a recogerlas al taller. Son ${importe}.`;
  if (estado === "en-horno") return `Hola, ${x.nombre}. Tus piezas ya están en el horno. Te aviso en cuanto salgan.`;
  if (estado === "descartado") return `Hola, ${x.nombre}. Te escribo de El Almacén por tu horneado: esta vez no podemos cocerlo. Si quieres, te cuento por qué.`;
  return `Hola, ${x.nombre}. Te escribo de El Almacén por tu horneado: son ${importe}. Puedes traer las piezas bien secas${x.cuando ? ` (${x.cuando})` : ""}. ¿Te viene bien?`;
}

function dato(etiqueta, valor) {
  return valor ? [h("dt", {}, etiqueta), h("dd", {}, valor)] : [];
}

function abrir(x) {
  const precio = h("input", { type: "number", inputmode: "decimal", min: "0", step: "0.1", value: x.precio_final ?? "", placeholder: String(x.total ?? "") });
  const estado = h("select", {}, ...Object.entries(ESTADOS).map(([clave, nombre]) => h("option", { value: clave, selected: x.estado === clave }, nombre)));
  const notas = h("textarea", { rows: 3, value: x.notas_taller ?? "", placeholder: "Solo las ves tú: en qué hornada va, en qué placa…" });
  const actual = () => ({ estado: estado.value, precio: precio.value ? Number(precio.value) : null });
  const tel = telefonoWhatsApp(x.telefono);
  $("#contenido-ficha").replaceChildren(
    h("h2", {}, `Horneado de ${x.nombre}`),
    h("p", { class: "quien" }, `Enviado el ${fecha(x.creado)}`),
    h("ul", { class: "lineas-horneado" }, x.piezas.map((p) => h("li", {}, h("span", {}, p.descripcion), p.total != null && h("strong", {}, euros.format(p.total))))),
    h("p", { class: "total-horneado" }, "Total orientativo ", h("strong", {}, euros.format(x.total ?? 0))),
    h("dl", { class: "datos-encargo" },
      ...dato("Teléfono", x.telefono), ...dato("Correo", x.correo),
      ...dato("Prefiere", x.contestar_por === "whatsapp" ? "WhatsApp" : "Correo"),
      ...dato("Puede traerlas", x.cuando), ...dato("Notas", x.notas)),
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
        tel && h("a", { class: `boton${x.contestar_por === "whatsapp" ? "" : " secundario"}`, target: "_blank", rel: "noopener", href: `https://wa.me/${tel}`,
          onclick: (ev) => { ev.currentTarget.href = `https://wa.me/${tel}?text=${encodeURIComponent(mensaje(x, actual().estado, actual().precio))}`; } }, "Contestar por WhatsApp"),
        x.correo && h("a", { class: `boton${x.contestar_por === "correo" ? "" : " secundario"}`, href: `mailto:${encodeURIComponent(x.correo)}`,
          onclick: (ev) => { ev.currentTarget.href = `mailto:${encodeURIComponent(x.correo)}?subject=${encodeURIComponent("Tu horneado en El Almacén")}&body=${encodeURIComponent(mensaje(x, actual().estado, actual().precio))}`; } }, "Contestar por correo"))),
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
  try {
    await cargar();
    $("#estado-panel").hidden = true;
    $("#panel").hidden = false;
  } catch {
    $("#estado-panel").textContent = "No se han podido cargar los horneados. Comprueba la conexión y recarga.";
  }
})();
