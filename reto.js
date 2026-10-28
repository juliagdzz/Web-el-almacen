// ¿Qué hago hoy?: una pieza al azar según cómo trabajas (a mano o en el torno),
// tu nivel, lo que quieres practicar y lo que te gusta. Sale la forma, el tamaño,
// los colores y una técnica de esmaltado o decoración; en difícil, un reto extra
// y un cronómetro. Lo que eliges se recuerda en el móvil.

const $ = (sel) => document.querySelector(sel);
const azar = (lista) => lista[Math.floor(Math.random() * lista.length)];

// ---------- Las ideas ----------
// nivel: 1 fácil, 2 medio, 3 difícil. manual: cómo se hace a mano (si se puede).
// tamanos: pequeño, mediano y grande, en cm.
const FORMAS = [
  { id: "cuenco", nombre: "Cuenco", torno: 1, manual: { nivel: 1, como: "pellizco o churros" }, tamanos: ["8–10 cm de diámetro", "13–15 cm de diámetro", "18–22 cm de diámetro"], practica: ["centrar", "simetria"] },
  { id: "vaso", nombre: "Vaso sin asa", torno: 1, manual: { nivel: 1, como: "planchas enrolladas" }, tamanos: ["7 cm de alto", "10 cm de alto", "14 cm de alto"], practica: ["centrar", "paredes"] },
  { id: "taza", nombre: "Taza con asa", torno: 2, manual: { nivel: 2, como: "pellizco o plancha, con asa de churro" }, tamanos: ["taza de café (7 cm de alto)", "taza de desayuno (9 cm de alto)", "tazón grande (12 cm de alto)"], practica: ["asas"] },
  { id: "plato", nombre: "Plato llano", torno: 2, manual: { nivel: 1, como: "plancha sobre un molde" }, tamanos: ["platito de postre (15 cm)", "plato de pan (20 cm)", "plato llano (26 cm)"], practica: ["simetria"] },
  { id: "fuente", nombre: "Fuente honda", torno: 3, manual: { nivel: 2, como: "plancha sobre un molde de escayola o un cuenco" }, tamanos: ["20 cm", "26 cm", "32 cm"], practica: ["paredes"] },
  { id: "jarron", nombre: "Jarrón de cuello estrecho", torno: 3, manual: { nivel: 2, como: "churros" }, tamanos: ["15 cm de alto", "22 cm de alto", "30 cm de alto"], practica: ["cuellos", "paredes"] },
  { id: "jarra", nombre: "Jarra con pico y asa", torno: 3, manual: { nivel: 3, como: "churros, con pico pellizcado" }, tamanos: ["lechera de 250 ml", "jarra de 500 ml", "jarra de 1 l"], practica: ["asas", "picos"] },
  { id: "tarro", nombre: "Tarro con tapa", torno: 3, manual: { nivel: 2, como: "planchas, con tapa de plancha" }, tamanos: ["8 cm de alto", "12 cm de alto", "16 cm de alto"], practica: ["tapas"] },
  { id: "maceta", nombre: "Maceta con plato", torno: 2, manual: { nivel: 1, como: "churros o planchas" }, tamanos: ["10 cm de diámetro", "14 cm de diámetro", "20 cm de diámetro"], practica: ["paredes"] },
  { id: "portavelas", nombre: "Portavelas calado", torno: 2, manual: { nivel: 1, como: "pellizco, con agujeros hechos con un vaciador" }, tamanos: ["8 cm de alto", "12 cm de alto", "16 cm de alto"], practica: ["decoracion"] },
  { id: "salsera", nombre: "Cuencos pequeños para salsas (juego de 3)", torno: 2, manual: { nivel: 1, como: "pellizco" }, tamanos: ["6 cm cada uno", "8 cm cada uno", "10 cm cada uno"], practica: ["serie", "centrar"] },
  { id: "chawan", nombre: "Chawan (cuenco de té)", torno: 2, manual: { nivel: 2, como: "pellizco con pie añadido" }, tamanos: ["10 cm de diámetro", "12 cm de diámetro", "14 cm de diámetro"], practica: ["pies"] },
  { id: "espresso", nombre: "Tazas de café a juego (2 iguales)", torno: 3, manual: { nivel: 3, como: "pellizco, midiendo con calibre" }, tamanos: ["60 ml cada una", "90 ml cada una", "120 ml cada una"], practica: ["serie", "asas"] },
  { id: "botella", nombre: "Botella", torno: 3, manual: { nivel: 3, como: "churros, cerrando poco a poco" }, tamanos: ["12 cm de alto", "20 cm de alto", "28 cm de alto"], practica: ["cuellos", "paredes"] },
  { id: "mantequillera", nombre: "Mantequillera con tapa", torno: 3, manual: { nivel: 3, como: "planchas" }, tamanos: ["para 125 g", "para 250 g", "para 500 g"], practica: ["tapas"] },
  { id: "azulejo", nombre: "Azulejo en relieve", torno: null, manual: { nivel: 1, como: "plancha con relieve de sellos o modelado" }, tamanos: ["10 × 10 cm", "15 × 15 cm", "20 × 20 cm"], practica: ["decoracion"] },
  { id: "figura", nombre: "Figura de un animal", torno: null, manual: { nivel: 2, como: "modelado hueco (dos pellizcos unidos)" }, tamanos: ["8 cm", "14 cm", "20 cm"], practica: ["modelado"] },
  { id: "incienso", nombre: "Porta incienso", torno: null, manual: { nivel: 1, como: "plancha con borde levantado" }, tamanos: ["10 cm", "15 cm", "20 cm"], practica: ["decoracion"] },
  { id: "caja", nombre: "Caja cuadrada con tapa", torno: null, manual: { nivel: 3, como: "planchas en dureza de cuero, con ingletes" }, tamanos: ["8 cm de lado", "12 cm de lado", "16 cm de lado"], practica: ["tapas", "simetria"] },
  { id: "aceitera", nombre: "Aceitera con pico", torno: 3, manual: { nivel: 3, como: "churros, con pico de plancha" }, tamanos: ["150 ml", "300 ml", "500 ml"], practica: ["picos", "cuellos"] },
];

// cuando: en qué momento se hace
const DECORACIONES = [
  { id: "burbujas", nombre: "Burbujas con pajita", nivel: 1, cuando: "sobre bizcocho", como: "mezcla esmalte con un poco de jabón y agua, sopla con una pajita para hacer espuma y apoya la pieza sobre las burbujas" },
  { id: "inmersion", nombre: "Doble inmersión", nivel: 1, cuando: "sobre bizcocho", como: "baña la pieza en un esmalte y, cuando seque, solo media pieza en el segundo: donde se solapan sale un tercer color" },
  { id: "cera", nombre: "Cera de reserva", nivel: 1, cuando: "sobre bizcocho", como: "dibuja con cera líquida y esmalta encima: lo encerado queda con el barro visto" },
  { id: "esponja", nombre: "Esponjado", nivel: 1, cuando: "sobre bizcocho", como: "da toques con una esponja natural mojada en esmalte o engobe" },
  { id: "salpicado", nombre: "Salpicado", nivel: 1, cuando: "sobre bizcocho", como: "sobre un esmalte de base, salpica otro con un cepillo de dientes" },
  { id: "sellos", nombre: "Texturas con sellos o encaje", nivel: 1, cuando: "en crudo, recién hecha", como: "presiona un encaje, una hoja o sellos en el barro y luego esmalta con un esmalte que rompa en los bordes" },
  { id: "pera", nombre: "Engobe con pera", nivel: 2, cuando: "en dureza de cuero", como: "dibuja líneas o puntos con engobe de otro color usando una pera o una jeringa" },
  { id: "esgrafiado", nombre: "Esgrafiado", nivel: 2, cuando: "en dureza de cuero", como: "cubre con engobe de otro color y raya el dibujo para que asome el barro" },
  { id: "pincel", nombre: "Pincelada con óxidos bajo esmalte", nivel: 2, cuando: "sobre bizcocho", como: "pinta trazos sueltos con óxido de hierro o cobalto y cubre con un transparente" },
  { id: "degradado", nombre: "Degradado con pulverizador", nivel: 2, cuando: "sobre bizcocho", como: "pulveriza un color de abajo arriba sobre otro, cada vez más fino" },
  { id: "bruñido", nombre: "Bruñido", nivel: 2, cuando: "en crudo, casi seca", como: "frota la superficie con una cuchara o una piedra lisa hasta que brille, sin esmalte" },
  { id: "mishima", nombre: "Mishima", nivel: 3, cuando: "en dureza de cuero", como: "graba líneas finas, rellénalas de engobe de otro color y raspa el sobrante cuando seque" },
  { id: "nerikomi", nombre: "Nerikomi", nivel: 3, cuando: "al hacer la pieza", como: "monta un bloque con pastas de dos o tres colores, córtalo en láminas y forma la pieza con ellas" },
  { id: "agateado", nombre: "Agateado en el torno", nivel: 3, cuando: "al tornear", como: "amasa poco dos pastas de colores para que queden vetas y tornéalas juntas" },
  { id: "cuerdaseca", nombre: "Cuerda seca", nivel: 3, cuando: "sobre bizcocho", como: "perfila el dibujo con una línea de manganeso y cera, y rellena cada zona con un esmalte" },
];

const COLORES = [
  ["Terracota y crema", "satinado"], ["Verde oliva y miel", "brillo"], ["Azul cobalto sobre blanco", "brillo"],
  ["Granate con el borde en negro", "mate"], ["Turquesa y óxido de hierro", "brillo"], ["Rosa empolvado y gris piedra", "mate"],
  ["Mostaza y verde botella", "satinado"], ["Negro mate con interior transparente", "mate y brillo"], ["Celadón (verde agua)", "brillo"],
  ["Blanco moteado (speckle)", "satinado"], ["Ocre y azul noche", "brillo"], ["Barro visto con un solo color en el interior", "a tu gusto"],
  ["Tres verdes distintos", "brillo"], ["Blanco y un solo trazo de cobalto", "brillo"], ["Tonos tierra: ocre, siena y marrón", "mate"],
];

// En difícil: un reto más
const RETOS_EXTRA = [
  "paredes de 4 mm como mucho en toda la pieza",
  "sin usar herramientas de metal, solo manos, madera y esponja",
  "hazla dos veces: tienen que salir casi iguales",
  "altera el borde: ondulado, cortado o pellizcado",
  "añade un pie torneado o de churro bien marcado",
  "que la pieza tenga una parte sin esmaltar a propósito",
  "que el peso sea ligero: pésala al terminar y apúntalo",
];

const PRACTICAR = [
  ["centrar", "Centrar y subir el barro"], ["paredes", "Paredes finas y rectas"], ["asas", "Asas"], ["tapas", "Tapas que encajen"],
  ["picos", "Picos que no goteen"], ["cuellos", "Cuellos y cerrar formas"], ["pies", "Pies"], ["simetria", "Simetría"],
  ["serie", "Hacer piezas iguales"], ["modelado", "Modelado"], ["decoracion", "Decoración y esmaltado"],
];

// ---------- Preferencias (se recuerdan) ----------
const CLAVE = "retoPreferencias";
let prefs = { tecnica: "manual", nivel: "1", practicar: [], formas: {}, esmaltes: {}, minutos: 30 };
try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(CLAVE)) }; } catch {}
const guardarPrefs = () => { try { localStorage.setItem(CLAVE, JSON.stringify(prefs)); } catch {} };

function chip(texto, estado, alPulsar, clase = "") {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `chip-reto ${clase} ${estado ? `estado-${estado}` : ""}`.trim();
  b.setAttribute("aria-pressed", String(Boolean(estado)));
  b.textContent = texto;
  if (estado === "si") b.title = "Me gusta";
  if (estado === "no") b.title = "Mejor no";
  b.addEventListener("click", alPulsar);
  return b;
}

function pintarOpciones() {
  document.querySelector(`input[name="tecnica"][value="${prefs.tecnica}"]`).checked = true;
  document.querySelector(`input[name="nivel"][value="${prefs.nivel}"]`).checked = true;
  $("#practicar").replaceChildren(...PRACTICAR.map(([id, texto]) => chip(texto, prefs.practicar.includes(id) && "si", () => {
    prefs.practicar = prefs.practicar.includes(id) ? prefs.practicar.filter((x) => x !== id) : [...prefs.practicar, id];
    guardarPrefs();
    pintarOpciones();
  })));
  // Me gusta → mejor no → nada
  const siguiente = (e) => (e === "si" ? "no" : e === "no" ? undefined : "si");
  const gustos = (caja, lista, mapa) => $(caja).replaceChildren(...lista.map((x) => chip(x.nombre, mapa[x.id], () => {
    const e = siguiente(mapa[x.id]);
    if (e) mapa[x.id] = e; else delete mapa[x.id];
    guardarPrefs();
    pintarOpciones();
  }, "gusto")));
  gustos("#gustos-formas", FORMAS, prefs.formas);
  gustos("#gustos-esmaltes", DECORACIONES, prefs.esmaltes);
  const si = Object.values(prefs.formas).concat(Object.values(prefs.esmaltes));
  const n = (v) => si.filter((x) => x === v).length;
  $("#resumen-gustos").textContent = si.length ? `${n("si")} me gustan · ${n("no")} mejor no` : "";
  $("#cronometro").hidden = prefs.nivel !== "3" || $("#resultado").hidden;
}

document.querySelectorAll('input[name="tecnica"], input[name="nivel"]').forEach((r) => r.addEventListener("change", () => {
  prefs.tecnica = document.querySelector('input[name="tecnica"]:checked').value;
  prefs.nivel = document.querySelector('input[name="nivel"]:checked').value;
  guardarPrefs();
  pintarOpciones();
}));
$("#borrar-gustos").addEventListener("click", () => {
  prefs.formas = {};
  prefs.esmaltes = {};
  guardarPrefs();
  pintarOpciones();
});

// ---------- Generar ----------

// Sorteo con peso: lo que te gusta sale el triple; lo que no, nunca (si queda algo)
function sorteo(lista, gustos, peso = () => 1) {
  const validas = lista.filter((x) => gustos[x.id] !== "no");
  const opciones = validas.length ? validas : lista;
  const pesos = opciones.map((x) => (gustos[x.id] === "si" ? 3 : 1) * peso(x));
  let r = Math.random() * pesos.reduce((a, b) => a + b, 0);
  return opciones.find((_, i) => (r -= pesos[i]) < 0) ?? opciones.at(-1);
}

let actual = null;

function generar() {
  const nivel = Number(prefs.nivel);
  // A mano o torno (con «me da igual», a suertes entre las que se pueden de las dos formas)
  const forma = (tecnica) => FORMAS.filter((f) => (tecnica === "torno" ? f.torno && f.torno <= nivel : f.manual && f.manual.nivel <= nivel));
  let tecnica = prefs.tecnica === "igual" ? azar(["manual", "torno"]) : prefs.tecnica;
  let posibles = forma(tecnica);
  if (!posibles.length) { tecnica = tecnica === "torno" ? "manual" : "torno"; posibles = forma(tecnica); }
  // Lo que quieres practicar pesa más; y en su nivel, las del nivel justo un poco más
  const nivelDe = (f) => (tecnica === "torno" ? f.torno : f.manual.nivel);
  const pieza = sorteo(posibles, prefs.formas, (f) => (prefs.practicar.some((p) => f.practica.includes(p)) ? 4 : 1) * (nivelDe(f) === nivel ? 2 : 1));
  const tamano = Math.floor(Math.random() * 3);
  const decoraciones = DECORACIONES.filter((d) => d.nivel <= nivel && (d.id !== "agateado" || tecnica === "torno"));
  const decoracion = sorteo(decoraciones, prefs.esmaltes, (d) => (prefs.practicar.includes("decoracion") && d.nivel === nivel ? 3 : 1));
  actual = {
    tecnica, nivel, pieza, tamano,
    tamanoTexto: ["Pequeña", "Mediana", "Grande"][tamano],
    colores: azar(COLORES),
    decoracion,
    extra: nivel === 3 ? azar(RETOS_EXTRA) : null,
  };
  pintarResultado();
}

const DADO = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r="1.1" fill="currentColor"/><circle cx="15" cy="15" r="1.1" fill="currentColor"/><circle cx="12" cy="12" r="1.1" fill="currentColor"/></svg>';

// Cambiar solo una parte de la idea
function otraParte(parte) {
  if (!actual) return;
  if (parte === "tamano") actual.tamano = (actual.tamano + 1 + Math.floor(Math.random() * 2)) % 3;
  if (parte === "tamano") actual.tamanoTexto = ["Pequeña", "Mediana", "Grande"][actual.tamano];
  if (parte === "colores") { let c; do c = azar(COLORES); while (c === actual.colores); actual.colores = c; }
  if (parte === "decoracion") {
    const lista = DECORACIONES.filter((d) => d.nivel <= actual.nivel && d !== actual.decoracion && (d.id !== "agateado" || actual.tecnica === "torno"));
    actual.decoracion = sorteo(lista, prefs.esmaltes);
  }
  if (parte === "extra") { let e; do e = azar(RETOS_EXTRA); while (e === actual.extra); actual.extra = e; }
  pintarResultado();
}

function pintarResultado() {
  const { tecnica, nivel, pieza, tamano, tamanoTexto, colores, decoracion, extra } = actual;
  $("#etiqueta-reto").textContent = `${tecnica === "torno" ? "En el torno" : "A mano"} · ${["", "Fácil", "Medio", "Difícil"][nivel]}`;
  $("#titulo-reto").textContent = pieza.nombre;
  const fila = (nombre, valor, detalle, parte) => {
    const dt = document.createElement("dt");
    dt.textContent = nombre;
    const dd = document.createElement("dd");
    const texto = document.createElement("span");
    texto.className = "valor-reto";
    const fuerte = document.createElement("strong");
    fuerte.textContent = valor;
    texto.append(fuerte);
    if (detalle) {
      const small = document.createElement("small");
      small.textContent = detalle;
      texto.append(small);
    }
    dd.append(texto);
    if (parte) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "otra-parte";
      b.innerHTML = DADO;
      b.setAttribute("aria-label", `Otro ${nombre.toLowerCase()}`);
      b.title = "Cambiar solo esto";
      b.addEventListener("click", () => otraParte(parte));
      dd.append(b);
    }
    return [dt, dd];
  };
  $("#partes-reto").replaceChildren(
    ...fila("Cómo", tecnica === "torno" ? "Torneada" : `A mano: ${pieza.manual.como}`, null, null),
    ...fila("Tamaño", tamanoTexto, pieza.tamanos[tamano], "tamano"),
    ...fila("Colores", colores[0], `Acabado ${colores[1]}`, "colores"),
    ...fila("Esmaltado", decoracion.nombre, `${decoracion.cuando[0].toUpperCase()}${decoracion.cuando.slice(1)}: ${decoracion.como}.`, "decoracion"),
    ...(extra ? fila("Reto extra", extra[0].toUpperCase() + extra.slice(1), null, "extra") : []),
  );
  $("#resultado").hidden = false;
  $("#cronometro").hidden = nivel !== 3;
  if (nivel === 3) prepararCronometro(tecnica === "torno" ? 25 : 45);
}

$("#form-reto").addEventListener("submit", (e) => {
  e.preventDefault();
  generar();
  $("#resultado").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
});
$("#otra-idea").addEventListener("click", generar);

// El texto de la idea, para compartir o apuntar
function textoIdea() {
  const { tecnica, pieza, tamano, tamanoTexto, colores, decoracion, extra } = actual;
  return [
    `${pieza.nombre} · ${tecnica === "torno" ? "en el torno" : `a mano (${pieza.manual.como})`}`,
    `Tamaño: ${tamanoTexto.toLowerCase()}, ${pieza.tamanos[tamano]}`,
    `Colores: ${colores[0].toLowerCase()}, acabado ${colores[1]}`,
    `Esmaltado: ${decoracion.nombre.toLowerCase()} ${decoracion.cuando}: ${decoracion.como}`,
    extra && `Reto extra: ${extra}`,
  ].filter(Boolean).join("\n");
}

$("#compartir-reto").addEventListener("click", () => compartir({ titulo: "Mi idea de pieza", texto: `${textoIdea()}\n\nIdea de «¿Qué hago hoy?» · El Almacén`, avisar }));

// Apuntarla: se abre una pieza nueva con el nombre, las técnicas y la idea en las notas
const TECNICA_PIEZA = { burbujas: null, inmersion: null, cera: "Cera de reserva", esponja: "Esponjado", salpicado: "Salpicado", sellos: "Estampado", pera: "Engobe",
  esgrafiado: "Esgrafiado", pincel: "Bajo cubierta", degradado: null, bruñido: "Bruñido", mishima: "Mishima", nerikomi: "Nerikomi", agateado: "Nerikomi", cuerdaseca: null };
$("#apuntar-pieza").addEventListener("click", () => {
  const { tecnica, pieza, decoracion } = actual;
  const comoAMano = { "pellizco": "Pellizco", "churros": "Churros", "plancha": "Planchas", "planchas": "Planchas", "modelado": "Modelado" };
  const tecnicas = [
    tecnica === "torno" ? "Torno" : Object.entries(comoAMano).find(([k]) => pieza.manual.como.includes(k))?.[1],
    /asa/.test(pieza.nombre.toLowerCase()) && "Asas",
    TECNICA_PIEZA[decoracion.id],
  ].filter(Boolean);
  try { sessionStorage.setItem("ideaPieza", JSON.stringify({ nombre: pieza.nombre, notas: `Idea de «¿Qué hago hoy?»:\n${textoIdea()}`, tecnicas: [...new Set(tecnicas)] })); } catch {}
  location.href = "piezas.html#/pieza/nueva";
});

// ---------- Cronómetro (nivel difícil) ----------
const MINUTOS = [15, 20, 25, 30, 45, 60, 90];
let total = 0;        // segundos
let quedan = 0;
let corriendo = null; // setInterval
let finEn = 0;        // cuándo acaba (ms), para no desviarse si el móvil se duerme
let bloqueoPantalla = null;

const formato = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
function pintarReloj() {
  $("#reloj").textContent = formato(Math.max(0, quedan));
  $("#barra-tiempo").style.width = `${total ? (100 * (total - quedan)) / total : 0}%`;
  $("#cronometro").classList.toggle("poco-tiempo", corriendo && quedan <= 60);
  $("#empezar").textContent = corriendo ? "Pausar" : quedan < total && quedan > 0 ? "Seguir" : "Empezar";
}
function pintarMinutos() {
  $("#minutos").replaceChildren(...MINUTOS.map((m) => chip(`${m} min`, prefs.minutos === m && "si", () => {
    if (corriendo) return;
    prefs.minutos = m;
    guardarPrefs();
    ponerTiempo(m);
  })));
}
function ponerTiempo(m) {
  total = quedan = m * 60;
  $("#cronometro").classList.remove("terminado");
  pintarMinutos();
  pintarReloj();
}
function prepararCronometro(sugeridos) {
  if (corriendo || (quedan > 0 && quedan < total)) return; // no cortar uno en marcha
  $("#ayuda-tiempo").textContent = `Ponte un límite: para esta pieza, unos ${sugeridos} minutos están bien. Cuando acabe, suena y vibra.`;
  if (!MINUTOS.includes(prefs.minutos)) prefs.minutos = sugeridos;
  ponerTiempo(prefs.minutos);
}

function pitar() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.32);
    });
  } catch {}
  navigator.vibrate?.([300, 150, 300, 150, 600]);
}

async function mantenerPantalla(si) {
  try {
    if (si && "wakeLock" in navigator) bloqueoPantalla = await navigator.wakeLock.request("screen");
    else { await bloqueoPantalla?.release(); bloqueoPantalla = null; }
  } catch {}
}

function parar() {
  clearInterval(corriendo);
  corriendo = null;
  mantenerPantalla(false);
}

$("#empezar").addEventListener("click", () => {
  if (corriendo) { parar(); pintarReloj(); return; }
  if (quedan <= 0) ponerTiempo(prefs.minutos);
  finEn = Date.now() + quedan * 1000;
  mantenerPantalla(true);
  corriendo = setInterval(() => {
    quedan = Math.round((finEn - Date.now()) / 1000);
    if (quedan <= 0) {
      quedan = 0;
      parar();
      $("#cronometro").classList.add("terminado");
      pitar();
      avisar("¡Tiempo! Suelta las herramientas");
    }
    pintarReloj();
  }, 250);
  pintarReloj();
});
$("#reiniciar").addEventListener("click", () => { parar(); ponerTiempo(prefs.minutos); });
// Al volver a la página, si estaba en marcha, que siga (la pantalla se pudo apagar)
document.addEventListener("visibilitychange", () => { if (!document.hidden && corriendo) mantenerPantalla(true); });

// ---------- Avisos ----------
let temporizadorAviso;
function avisar(texto) {
  const el = $("#aviso");
  el.textContent = texto;
  el.classList.add("visible");
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => el.classList.remove("visible"), 3000);
}

pintarOpciones();
