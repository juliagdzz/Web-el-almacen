// Servicio de horneado: precio por el espacio que ocupa cada pieza en el horno
// (tarifas en horno-tarifas.js) y la animación del horno.

const $ = (sel) => document.querySelector(sel);
const euros = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const numero = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });

let temporizadorAviso;
function avisar(texto) {
  const el = $("#aviso");
  el.textContent = texto;
  el.classList.add("visible");
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => el.classList.remove("visible"), 2500);
}

// ---------- Opciones ----------

$("#opciones-coccion").replaceChildren(...Object.entries(TARIFAS.coccion).map(([clave, c], i) => {
  const label = document.createElement("label");
  label.className = "tarjeta-opcion";
  label.innerHTML = `<input type="radio" name="coccion" value="${clave}" ${i === 0 ? "checked" : ""}>
    <strong></strong><small></small><span class="precio-completo"></span>`;
  label.querySelector("strong").textContent = c.nombre;
  label.querySelector("small").textContent = c.detalle;
  label.querySelector(".precio-completo").textContent = `Horno completo: ${euros.format(c.completo)}`;
  return label;
}));
$("#texto-tripode").textContent = `Para piezas esmaltadas por debajo. La pieza sube ${numero.format(TARIFAS.tripode.altura)} cm y cada trípode son ${euros.format(TARIFAS.tripode.precio)}.`;

const elegido = (nombre) => document.querySelector(`input[name="${nombre}"]:checked`).value;
const valor = (id) => Math.max(0, parseFloat($(`#${id}`).value.replace(",", ".")) || 0);

// ---------- Cálculo ----------

function calcular() {
  const coccion = TARIFAS.coccion[elegido("coccion")];
  const tipo = elegido("tipo");
  const redonda = elegido("forma") === "redonda";
  const tripode = tipo === "esmaltado" && $("#tripode").checked;
  const alto = valor("alto");
  const ancho = valor("ancho");
  const fondo = redonda ? ancho : valor("fondo");
  const cantidad = Math.max(1, Math.round(valor("cantidad")));

  // El hueco que ocupa: la caja de la pieza más su margen alrededor
  let litros;
  if (tipo === "bizcocho") {
    const m = TARIFAS.bizcocho.holgura;
    litros = ((ancho + 2 * m) * (fondo + 2 * m) * (alto + m) * TARIFAS.bizcocho.apilado) / 1000;
  } else {
    const m = TARIFAS.esmaltado.holgura;
    const altura = alto + m + (tripode ? TARIFAS.tripode.altura : 0);
    litros = ((ancho + 2 * m) * (fondo + 2 * m) * altura) / 1000;
  }
  const util = TARIFAS.horno.litros * TARIFAS.horno.aprovechamiento;
  const parte = litros / util; // qué parte del horno ocupa una pieza
  const porEspacio = parte * coccion.completo;
  const redondear = (n) => Math.ceil(n / TARIFAS.redondeo - 1e-9) * TARIFAS.redondeo;
  const unidad = redondear(Math.max(TARIFAS.minimo, porEspacio) + (tripode ? TARIFAS.tripode.precio : 0));

  return { coccion, tipo, redonda, tripode, alto, ancho, fondo, cantidad, litros, parte, unidad, total: unidad * cantidad,
    minimo: porEspacio < TARIFAS.minimo, cabe: parte * cantidad <= 1 };
}

function pintar() {
  const tipo = elegido("tipo");
  const redonda = elegido("forma") === "redonda";
  $("#caja-tripode").hidden = tipo !== "esmaltado";
  $("#caja-fondo").hidden = redonda;
  $("#etiqueta-ancho").textContent = redonda ? "Diámetro" : "Ancho";
  document.documentElement.style.setProperty("--fuego", colorFuego());

  const r = calcular();
  const vacio = !r.alto || !r.ancho || !r.fondo;
  $("#precio").textContent = vacio ? "—" : euros.format(r.total);
  $("#precio-detalle").textContent = vacio ? "Escribe las medidas" : r.cantidad > 1 ? `${r.cantidad} × ${euros.format(r.unidad)}` : "";
  const porcentaje = Math.min(100, r.parte * r.cantidad * 100);
  $("#barra-ocupacion").style.width = `${vacio ? 0 : Math.max(porcentaje, 1)}%`;
  $("#desglose").textContent = vacio ? "" : [
    `${r.cantidad > 1 ? "Ocupan" : "Ocupa"} unos ${numero.format(r.litros * r.cantidad)} litros, el ${numero.format(porcentaje)} % del horno`,
    r.tipo === "bizcocho" ? "apiladas en bizcocho" : "con separación para el esmalte",
    r.tripode && "con trípode",
    r.minimo && `se aplica el mínimo de ${euros.format(TARIFAS.minimo)} por pieza`,
    !r.cabe && "no caben en una sola hornada: te lo confirmamos",
  ].filter(Boolean).join(" · ") + ".";
  $("#anadir-lista").disabled = vacio;
}

// ---------- Presupuesto ----------

let presupuesto = [];
try { presupuesto = JSON.parse(localStorage.getItem("presupuestoHorno")) ?? []; } catch {}

function guardarPresupuesto() {
  try { localStorage.setItem("presupuestoHorno", JSON.stringify(presupuesto)); } catch {}
}

const describir = (p) => `${p.cantidad > 1 ? `${p.cantidad} piezas` : "1 pieza"} de ${numero.format(p.alto)} × ${numero.format(p.ancho)}${p.redonda ? " ⌀" : ` × ${numero.format(p.fondo)}`} cm · ${p.tipo}${p.tripode ? " con trípode" : ""} · ${p.coccion.toLowerCase()}`;

function pintarPresupuesto() {
  $("#presupuesto").hidden = !presupuesto.length;
  $("#lista-presupuesto").replaceChildren(...presupuesto.map((p, i) => {
    const li = document.createElement("li");
    const texto = document.createElement("span");
    texto.textContent = describir(p);
    const precio = document.createElement("strong");
    precio.textContent = euros.format(p.total);
    const quitar = document.createElement("button");
    quitar.type = "button";
    quitar.className = "quitar";
    quitar.textContent = "✕";
    quitar.setAttribute("aria-label", "Quitar del presupuesto");
    quitar.addEventListener("click", () => { presupuesto.splice(i, 1); guardarPresupuesto(); pintarPresupuesto(); });
    li.append(texto, precio, quitar);
    return li;
  }));
  $("#total").textContent = euros.format(presupuesto.reduce((s, p) => s + p.total, 0));
}

$("#anadir-lista").addEventListener("click", () => {
  const r = calcular();
  presupuesto.push({ ...r, coccion: r.coccion.nombre });
  guardarPresupuesto();
  pintarPresupuesto();
  avisar("Añadido al presupuesto");
  animarHorno();
});

$("#vaciar").addEventListener("click", () => {
  if (!confirm("¿Vaciar el presupuesto?")) return;
  presupuesto = [];
  guardarPresupuesto();
  pintarPresupuesto();
});

$("#compartir-presupuesto").addEventListener("click", () => {
  const total = presupuesto.reduce((s, p) => s + p.total, 0);
  const texto = [
    "Presupuesto de horneado · El Almacén",
    ...presupuesto.map((p) => `· ${describir(p)}: ${euros.format(p.total)}`),
    `Total: ${euros.format(total)}`,
  ].join("\n");
  compartir({ titulo: "Presupuesto de horneado", texto, avisar });
});

// ---------- Animación del horno ----------

const reducido = matchMedia("(prefers-reduced-motion: reduce)").matches;
const colorFuego = () => (elegido("coccion") === "alta" ? "#ffc24a" : "#ff8a3d");
let animacion = 0;

// Suavizado: empieza y acaba despacio
const suave = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const tramo = (t, inicio, fin) => Math.min(1, Math.max(0, (t - inicio) / (fin - inicio)));

function pintarFotograma(t) {
  // 0-1 s abre · 1-2,2 s entra la pieza · 2,2-3,2 s cierra · 3,2-6,5 s calienta
  const abierta = suave(tramo(t, 0, 1)) - suave(tramo(t, 2.2, 3.2));
  $("#tapa").setAttribute("transform", `rotate(${72 * abierta} 256 96)`);
  const baja = suave(tramo(t, 1, 2.2));
  // La pieza aparece justo encima de la boca cuando la tapa ya está abierta y baja hasta dentro
  $("#pieza").setAttribute("transform", `translate(0 ${-55 + baja * 75})`);
  $("#pieza").style.opacity = t < 0.9 || t > 2.6 ? 0 : Math.min(1, (t - 0.9) * 6);
  const calor = suave(tramo(t, 3.2, 6.5));
  const destino = TARIFAS.coccion[elegido("coccion")].temperatura;
  $("#pantalla").textContent = `${Math.round(20 + calor * (destino - 20))} ºC`;
  $("#interior").setAttribute("opacity", abierta > 0.1 ? 0.15 * calor : 0);
  $("#aura").setAttribute("opacity", 0.45 * calor);
  $("#mirilla").setAttribute("opacity", calor);
  $("#calor").setAttribute("opacity", 0.8 * calor);
  $("#led").setAttribute("fill", t > 3.2 ? "#ff5a3a" : "#4b5257");
  $("#estado-horno").textContent = t < 1 ? "Abriendo el horno…" : t < 2.2 ? "Colocando la pieza…" : t < 3.2 ? "Cerrando…" : calor < 1 ? "Subiendo temperatura…" : `Cociendo a ${destino} ºC`;
}

function animarHorno() {
  cancelAnimationFrame(animacion);
  if (reducido) return pintarFotograma(10);
  const inicio = performance.now();
  const paso = (ahora) => {
    const t = (ahora - inicio) / 1000;
    pintarFotograma(t);
    if (t < 6.5) animacion = requestAnimationFrame(paso);
    else document.querySelector(".escena-horno").classList.add("cociendo");
  };
  document.querySelector(".escena-horno").classList.remove("cociendo");
  animacion = requestAnimationFrame(paso);
}

$("#ver-otra-vez").addEventListener("click", animarHorno);

// ---------- Arranque ----------

document.querySelectorAll("input").forEach((el) => el.addEventListener("input", pintar));
document.querySelectorAll('input[name="coccion"]').forEach((el) => el.addEventListener("change", () => {
  // si ya está cociendo, la pantalla pasa a la nueva temperatura
  if (document.querySelector(".escena-horno").classList.contains("cociendo")) pintarFotograma(10);
}));
pintar();
pintarPresupuesto();
// La animación empieza cuando el horno se ve en pantalla
new IntersectionObserver(([entrada], observador) => {
  if (!entrada.isIntersecting) return;
  observador.disconnect();
  animarHorno();
}, { threshold: 0.5 }).observe($("#horno"));
