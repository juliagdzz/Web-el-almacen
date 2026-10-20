// Tableros de inspiración: todo se guarda en el propio navegador (IndexedDB).

const LADO_MAXIMO = 1600; // px; las fotos se reducen para ocupar poco
const $ = (sel) => document.querySelector(sel);

// ---------- Base de datos ----------

let dbPromesa;

function abrirDB() {
  dbPromesa ??= new Promise((resolve, reject) => {
    const peticion = indexedDB.open("elalmacen", 1);
    peticion.onupgradeneeded = () => {
      const db = peticion.result;
      db.createObjectStore("tableros", { keyPath: "id" });
      const pins = db.createObjectStore("pins", { keyPath: "id" });
      pins.createIndex("tablero", "tableroId");
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

const db = {
  tableros: () => operacion("tableros", "readonly", (s) => s.getAll()),
  tablero: (id) => operacion("tableros", "readonly", (s) => s.get(id)),
  guardarTablero: (t) => operacion("tableros", "readwrite", (s) => s.put(t)),
  pins: (tableroId) => operacion("pins", "readonly", (s) => s.index("tablero").getAll(tableroId)),
  guardarPin: (p) => operacion("pins", "readwrite", (s) => s.put(p)),
  borrarPin: (id) => operacion("pins", "readwrite", (s) => s.delete(id)),
  async borrarTablero(id) {
    const pins = await db.pins(id);
    await operacion("pins", "readwrite", (s) => pins.forEach((p) => s.delete(p.id)));
    await operacion("tableros", "readwrite", (s) => s.delete(id));
  },
};

const nuevoId = () => crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);
const porOrden = (a, b) => b.orden - a.orden;

// ---------- Imágenes ----------

// Reduce la foto y la convierte a JPEG para que no ocupe varios MB
async function prepararImagen(blob) {
  const bitmap = await createImageBitmap(blob);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // los PNG transparentes quedan sobre blanco
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const imagen = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  return { imagen, proporcion: canvas.height / canvas.width };
}

// URLs de imágenes que hay que liberar al cambiar de vista
let urlsActivas = [];
function urlDe(blob) {
  const url = URL.createObjectURL(blob);
  urlsActivas.push(url);
  return url;
}
function liberarUrls() {
  urlsActivas.forEach(URL.revokeObjectURL);
  urlsActivas = [];
}

// Número fijo para cada foto: decide su giro y el color de la chincheta
function huella(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}
// Pequeño giro para que parezcan fotos clavadas a mano
const giro = (id) => ((huella(id) % 50) / 10 - 2.5).toFixed(1) + "deg";
const limitar = (n, min, max) => Math.min(max, Math.max(min, n));

// ---------- Avisos ----------

let temporizadorAviso;
function avisar(texto) {
  const el = $("#aviso");
  el.textContent = texto;
  el.classList.add("visible");
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => el.classList.remove("visible"), 3000);
}

// ---------- Vistas ----------

let tableroActual = null;

async function mostrarLista() {
  tableroActual = null;
  liberarUrls();
  const tableros = (await db.tableros()).sort((a, b) => b.creado - a.creado);
  const lista = $("#lista-tableros");
  lista.replaceChildren();

  const nuevo = document.createElement("button");
  nuevo.className = "tarjeta-nuevo";
  nuevo.innerHTML = "<span>+</span>Nuevo tablero";
  nuevo.addEventListener("click", crearTablero);
  lista.append(nuevo);

  for (const t of tableros) {
    const pins = await db.pins(t.id);
    await colocarSinPosicion(pins);
    const tarjeta = document.createElement("a");
    tarjeta.className = "tarjeta-tablero";
    tarjeta.href = `#/t/${t.id}`;
    const collage = miniatura(pins);

    const info = document.createElement("div");
    info.className = "info";
    const nombre = document.createElement("strong");
    nombre.textContent = t.nombre;
    const cuenta = document.createElement("small");
    const fotos = pins.filter((p) => !p.esmalte).length;
    const esmaltes = pins.length - fotos;
    cuenta.textContent = [fotos && (fotos === 1 ? "1 foto" : `${fotos} fotos`), esmaltes && (esmaltes === 1 ? "1 esmalte" : `${esmaltes} esmaltes`)]
      .filter(Boolean).join(" · ") || "Vacío";
    info.append(nombre, cuenta);

    tarjeta.append(collage, info);
    lista.append(tarjeta);
  }

  document.body.classList.remove("en-tablero");
  $("#vista-tablero").hidden = true;
  $("#vista-lista").hidden = false;
}

async function mostrarTablero(id) {
  const tablero = await db.tablero(id);
  if (!tablero) return (location.hash = "#/");
  tableroActual = tablero;
  try { localStorage.setItem("ultimoTablero", id); } catch {}
  liberarUrls();
  $("#nombre-tablero").textContent = tablero.nombre;
  document.title = `${tablero.nombre} · El Almacén`;

  const pins = await db.pins(id);
  await colocarSinPosicion(pins);
  pins.sort((a, b) => a.orden - b.orden); // las más recientes quedan encima
  pinsActuales = new Map(pins.map((p) => [p.id, p]));
  seleccionado = null;
  zMaximo = 0;
  corcho.replaceChildren(...pins.map(crearPin));
  $("#corcho-vacio").hidden = pins.length > 0;

  const cambiaDeTablero = vista.dataset.tablero !== id;
  vista.dataset.tablero = id;
  document.body.classList.add("en-tablero");
  $("#vista-lista").hidden = true;
  $("#vista-tablero").hidden = false;
  medir();
  ajustarAlto();
  // Al abrir un tablero se empieza mirando la pantalla del centro
  if (cambiaDeTablero) vista.scrollTo(unidad, 0);
}

function crearPin(p) {
  const el = document.createElement("div");
  el.className = "pin";
  el.classList.toggle("oliva", huella(p.id) % 2 === 0);
  el.dataset.id = p.id;
  el.tabIndex = 0;
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", p.nota || "Foto de inspiración");
  el.style.setProperty("--giro", giro(p.id));
  el.style.zIndex = ++zMaximo;
  colocar(el, p);

  const img = document.createElement("img");
  img.src = urlDe(p.imagen);
  img.alt = "";
  img.draggable = false;
  img.style.aspectRatio = `1 / ${p.proporcion}`;
  if (p.esmalte) {
    // Chapa redonda con la muestra y el número debajo
    el.classList.add("chapa");
    el.setAttribute("aria-label", `Esmalte ${nombreEsmalte(p.esmalte)}`);
    const muestra = document.createElement("span");
    muestra.className = "muestra";
    muestra.append(img);
    const etiqueta = document.createElement("span");
    etiqueta.className = "etiqueta";
    etiqueta.textContent = nombreEsmalte(p.esmalte);
    el.append(muestra, etiqueta);
  } else {
    el.append(img);
  }
  if (p.nota) {
    const nota = document.createElement("span");
    nota.className = "nota";
    nota.textContent = p.nota;
    el.append(nota);
  }

  const editar = document.createElement("button");
  editar.className = "editar";
  editar.type = "button";
  editar.textContent = "✎";
  editar.setAttribute("aria-label", "Ver la foto y su nota");
  editar.addEventListener("click", () => abrirDetalle(p.id));
  const tirador = document.createElement("span");
  tirador.className = "tirador";
  tirador.setAttribute("aria-hidden", "true");
  el.append(editar, tirador);

  el.addEventListener("keydown", (e) => e.key === "Enter" && e.target === el && abrirDetalle(p.id));
  return el;
}

// ---------- Miniatura del tablero para la lista ----------
// Un SVG con el corcho y cada foto o chapa en su sitio, con su tamaño y su giro,
// a partir de lo guardado (x, y y ancho en «pantallas»)

const SVG = "http://www.w3.org/2000/svg";
function svg(etiqueta, atributos = {}, ...hijos) {
  const el = document.createElementNS(SVG, etiqueta);
  for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, v);
  el.append(...hijos);
  return el;
}

const MARCO = 6 / 390;         // borde blanco de la polaroid, en pantallas (6 px en un móvil)
const MARCO_ABAJO = 10 / 390;

function miniatura(pins) {
  const caja = document.createElement("div");
  caja.className = "collage";
  if (!pins.length) {
    caja.append(Object.assign(document.createElement("span"), { className: "collage-vacio", textContent: "Tablero vacío" }));
    return caja;
  }
  const alto = (p) => (p.esmalte ? p.ancho : p.ancho * p.proporcion + MARCO + MARCO_ABAJO);
  const margen = 0.06;
  const izquierda = Math.min(...pins.map((p) => p.x)) - margen;
  const arriba = Math.min(...pins.map((p) => p.y)) - margen;
  const ancho = Math.max(...pins.map((p) => p.x + p.ancho)) + margen - izquierda;
  const altoTotal = Math.max(...pins.map((p) => p.y + alto(p))) + margen - arriba;

  const dibujo = svg("svg", { viewBox: `${izquierda} ${arriba} ${ancho} ${altoTotal}`, preserveAspectRatio: "xMidYMid meet", "aria-hidden": "true" });
  const defs = svg("defs", {},
    svg("filter", { id: "sombra-mini", x: "-20%", y: "-20%", width: "140%", height: "140%" },
      svg("feDropShadow", { dx: 0, dy: 0.008, stdDeviation: 0.008, "flood-color": "#281400", "flood-opacity": 0.35 })));
  dibujo.append(defs);

  for (const p of [...pins].sort((a, b) => a.orden - b.orden)) {
    const imagen = urlDe(p.imagen);
    if (p.esmalte) {
      const r = p.ancho / 2;
      const cx = p.x + r;
      const cy = p.y + r;
      const recorte = `mini-${p.id}`;
      const lado = (r * 2 - 0.016) * 1.25; // igual que el recorte de la chapa en el corcho
      defs.append(svg("clipPath", { id: recorte }, svg("circle", { cx, cy, r: r - 0.008 })));
      dibujo.append(
        svg("circle", { cx, cy, r, fill: "#fffdf7", filter: "url(#sombra-mini)" }),
        svg("image", { href: imagen, x: cx - lado / 2, y: cy - lado / 2, width: lado, height: lado, "clip-path": `url(#${recorte})`, preserveAspectRatio: "xMidYMid slice" }));
    } else {
      const h = alto(p);
      const anchoFoto = p.ancho - 2 * MARCO;
      const grupo = svg("g", { transform: `rotate(${parseFloat(giro(p.id))} ${p.x + p.ancho / 2} ${p.y + h / 2})` },
        svg("rect", { x: p.x, y: p.y, width: p.ancho, height: h, fill: "#fffdf7", filter: "url(#sombra-mini)" }),
        svg("image", { href: imagen, x: p.x + MARCO, y: p.y + MARCO, width: anchoFoto, height: anchoFoto * p.proporcion, preserveAspectRatio: "xMidYMid slice" }),
        svg("circle", { cx: p.x + p.ancho / 2, cy: p.y + 0.004, r: 0.018, fill: huella(p.id) % 2 === 0 ? "#9b9a3a" : "#b85a2b" }));
      dibujo.append(grupo);
    }
  }
  caja.append(dibujo);
  return caja;
}

function enrutar() {
  // Al cambiar de pantalla (también con «atrás» del móvil) se cierra cualquier hoja abierta
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  const coincide = location.hash.match(/^#\/t\/(.+)$/);
  if (coincide) mostrarTablero(coincide[1]);
  else mostrarLista();
}

// ---------- Composición: mover y cambiar de tamaño ----------
// x, y y ancho se guardan en «pantallas» (unidad = ancho de lo que se ve,
// hasta 760 px), así la composición se ve igual en el móvil y en el ordenador.
// El corcho mide tres pantallas de ancho: x va de -1 (izquierda) a 2 (derecha)
// y las composiciones de antes, entre 0 y 1, quedan en la del centro.

const ANCHO_INICIAL = 0.42;
const ANCHO_MINIMO = 0.15;
const corcho = $("#corcho");
const vista = $("#corcho-vista");
const UNIDAD_MAXIMA = 760;
let unidad = 1;
let pinsActuales = new Map();
let seleccionado = null; // la foto con el marco oliva
let gesto = null;        // el arrastre en curso
let panoramica = null;   // desplazar el corcho con el ratón
let zMaximo = 0;

function medir() {
  const anterior = unidad;
  unidad = Math.min(vista.clientWidth, UNIDAD_MAXIMA) || 1;
  corcho.style.setProperty("--u", unidad + "px");
  corcho.style.width = Math.max(3 * unidad, vista.clientWidth) + "px";
  if (anterior > 1 && anterior !== unidad) {
    vista.scrollLeft *= unidad / anterior;
    vista.scrollTop *= unidad / anterior;
  }
}

function colocar(el, p) {
  el.style.setProperty("--x", p.x);
  el.style.setProperty("--y", p.y);
  el.style.setProperty("--w", p.ancho);
}

// Fotos guardadas antes de poder moverlas: se reparten en dos columnas
async function colocarSinPosicion(pins) {
  const alturas = [0.05, 0.05];
  for (const p of [...pins].sort(porOrden)) {
    if (p.x !== undefined) continue;
    if (!p.proporcion) {
      const bitmap = await createImageBitmap(p.imagen);
      p.proporcion = bitmap.height / bitmap.width;
      bitmap.close();
    }
    const col = alturas[0] <= alturas[1] ? 0 : 1;
    p.ancho = ANCHO_INICIAL;
    p.x = col === 0 ? 0.05 : 0.53;
    p.y = alturas[col];
    alturas[col] += p.ancho * p.proporcion + 0.1;
    await db.guardarPin(p);
  }
}

// El corcho crece hacia abajo para que siempre haya sitio libre
function ajustarAlto(soloCrecer = false) {
  let fondo = 0;
  for (const el of corcho.children) fondo = Math.max(fondo, el.offsetTop + el.offsetHeight);
  const alto = Math.max(fondo + vista.clientHeight * 0.6, vista.clientHeight);
  if (soloCrecer && alto < corcho.offsetHeight) return;
  corcho.style.height = alto + "px";
}

function seleccionar(el) {
  if (seleccionado === el) return;
  seleccionado?.classList.remove("seleccionado");
  seleccionado = el;
  el.classList.add("seleccionado");
  el.style.zIndex = ++zMaximo;
  const p = pinsActuales.get(el.dataset.id);
  p.orden = Date.now();
  db.guardarPin(p);
}

function deseleccionar() {
  seleccionado?.classList.remove("seleccionado");
  seleccionado = null;
}

function empezarArrastre() {
  if (!gesto) return;
  gesto.activo = true;
  seleccionar(gesto.el);
  gesto.el.classList.add("arrastrando");
  navigator.vibrate?.(10);
}

function terminarGesto() {
  clearTimeout(gesto.espera);
  gesto.el.classList.remove("arrastrando");
  gesto = null;
}

corcho.addEventListener("pointerdown", (e) => {
  const el = e.target.closest(".pin");
  if (!el) {
    deseleccionar();
    // Con el ratón, arrastrar el corcho vacío lo desplaza (con el dedo ya lo hace el navegador)
    if (e.pointerType === "mouse" && e.button === 0) {
      panoramica = { x: e.clientX, y: e.clientY, izquierda: vista.scrollLeft, arriba: vista.scrollTop };
      corcho.classList.add("panoramica");
      corcho.setPointerCapture(e.pointerId);
    }
    return;
  }
  if (e.target.closest(".editar") || e.button > 0) return;
  const p = pinsActuales.get(el.dataset.id);
  gesto = {
    el,
    p,
    tipo: e.target.closest(".tirador") ? "tamano" : "mover",
    estabaSeleccionada: el === seleccionado,
    // Con ratón se arrastra directamente. En el móvil, si la foto no está
    // seleccionada, hay que mantenerla pulsada para no estorbar al desplazarse.
    directo: e.pointerType === "mouse" || el === seleccionado,
    inicioX: e.clientX,
    inicioY: e.clientY,
    x0: p.x,
    y0: p.y,
    ancho0: p.ancho,
    activo: false,
  };
  el.setPointerCapture(e.pointerId);
  if (gesto.tipo === "tamano") empezarArrastre();
  else if (!gesto.directo) gesto.espera = setTimeout(empezarArrastre, 350);
});

corcho.addEventListener("pointermove", (e) => {
  if (panoramica) {
    vista.scrollLeft = panoramica.izquierda - (e.clientX - panoramica.x);
    vista.scrollTop = panoramica.arriba - (e.clientY - panoramica.y);
    return;
  }
  if (!gesto) return;
  const dx = e.clientX - gesto.inicioX;
  const dy = e.clientY - gesto.inicioY;
  if (!gesto.activo) {
    if (Math.hypot(dx, dy) < 6) return;
    if (!gesto.directo) return terminarGesto(); // se estaba desplazando por la página
    empezarArrastre();
  }
  const p = gesto.p;
  if (gesto.tipo === "mover") {
    p.x = limitar(gesto.x0 + dx / unidad, -1, 2 - p.ancho);
    p.y = Math.max(0, gesto.y0 + dy / unidad);
  } else {
    p.ancho = limitar(gesto.ancho0 + dx / unidad, ANCHO_MINIMO, Math.min(1, 2 - p.x));
  }
  colocar(gesto.el, p);
  ajustarAlto(true);
});

function terminarPanoramica() {
  panoramica = null;
  corcho.classList.remove("panoramica");
}

corcho.addEventListener("pointerup", async () => {
  if (panoramica) return terminarPanoramica();
  if (!gesto) return;
  const { activo, estabaSeleccionada, el, p } = gesto;
  terminarGesto();
  if (activo) {
    await db.guardarPin(p);
    ajustarAlto();
  } else if (estabaSeleccionada) {
    abrirDetalle(p.id);
  } else {
    seleccionar(el);
  }
});

corcho.addEventListener("pointercancel", () => {
  if (panoramica) return terminarPanoramica();
  if (!gesto) return;
  if (gesto.activo) db.guardarPin(gesto.p);
  terminarGesto();
});

// Tocar fuera del corcho también suelta la foto elegida
document.addEventListener("pointerdown", (e) => {
  if (!vista.contains(e.target) && !e.target.closest("dialog")) deseleccionar();
});

// Mientras se arrastra, que el dedo no desplace la página
corcho.addEventListener("touchmove", (e) => gesto?.activo && e.preventDefault(), { passive: false });
corcho.addEventListener("contextmenu", (e) => e.target.closest(".pin") && e.preventDefault());

// Al girar el móvil cambia el ancho de la pantalla y, con él, el tamaño de las fotos
let anchoAnterior = 0;
new ResizeObserver(() => {
  if (!tableroActual || vista.clientWidth === anchoAnterior) return;
  anchoAnterior = vista.clientWidth;
  medir();
  ajustarAlto();
}).observe(vista);

// ---------- Tableros ----------

async function crearTablero() {
  const nombre = prompt("Nombre del tablero", "Ideas de esmaltes")?.trim();
  if (!nombre) return;
  const t = { id: nuevoId(), nombre, creado: Date.now() };
  await db.guardarTablero(t);
  location.hash = `#/t/${t.id}`;
}

$("#btn-opciones").addEventListener("click", () => $("#hoja-opciones").showModal());

// ---------- Compartir el tablero como una imagen de la composición ----------

const COLORES_CHINCHETA = { oliva: ["#d9d78f", "#9b9a3a", "#3f4c1b"], oxido: ["#e9896b", "#b85a2b", "#6e2e17"] };

function sombra(ctx, activar) {
  ctx.shadowColor = activar ? "rgb(40 20 0 / 0.35)" : "transparent";
  ctx.shadowBlur = activar ? 8 : 0;
  ctx.shadowOffsetY = activar ? 4 : 0;
}

function capsula(ctx, x, y, ancho, alto) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, ancho, alto, alto / 2);
  else ctx.rect(x, y, ancho, alto);
}

// Texto en varias líneas dentro de un ancho, como mucho «maximo» líneas
function textoEnLineas(ctx, texto, x, y, ancho, alto, maximo) {
  const lineas = [];
  let actual = "";
  for (const palabra of texto.split(/\s+/)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (ctx.measureText(prueba).width > ancho && actual) {
      lineas.push(actual);
      actual = palabra;
    } else actual = prueba;
  }
  if (actual) lineas.push(actual);
  if (lineas.length > maximo) lineas.splice(maximo - 1, Infinity, lineas.slice(maximo - 1).join(" ").slice(0, 40) + "…");
  lineas.forEach((l, i) => ctx.fillText(l, x, y + i * alto));
}

// Dibuja una foto o chapa tal y como está en el corcho (posición, tamaño y giro)
function dibujarPin(ctx, el) {
  const x = el.offsetLeft;
  const y = el.offsetTop;
  const ancho = el.offsetWidth;
  const alto = el.offsetHeight;
  ctx.save();
  if (el.classList.contains("chapa")) {
    const muestra = el.querySelector(".muestra");
    const d = muestra.offsetWidth;
    const cx = x + muestra.offsetLeft + d / 2;
    const cy = y + muestra.offsetTop + d / 2;
    sombra(ctx, true);
    ctx.beginPath();
    ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
    ctx.fillStyle = "#fffdf7";
    ctx.fill();
    sombra(ctx, false);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, d / 2 - 3, 0, Math.PI * 2);
    ctx.clip();
    const lado = (d - 6) * 1.25; // igual que el recorte de la chapa en pantalla
    ctx.drawImage(muestra.querySelector("img"), cx - lado / 2, cy - lado / 2, lado, lado);
    ctx.restore();
    const etiqueta = el.querySelector(".etiqueta");
    ctx.font = "600 11px 'DM Sans', sans-serif";
    const anchoEtiqueta = ctx.measureText(etiqueta.textContent).width + 16;
    const ey = y + etiqueta.offsetTop;
    ctx.fillStyle = "#f3e9d8";
    capsula(ctx, cx - anchoEtiqueta / 2, ey, anchoEtiqueta, 18);
    ctx.fill();
    ctx.fillStyle = "#2a1a1a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(etiqueta.textContent, cx, ey + 9.5);
  } else {
    ctx.translate(x + ancho / 2, y + alto / 2);
    ctx.rotate(((parseFloat(el.style.getPropertyValue("--giro")) || 0) * Math.PI) / 180);
    ctx.translate(-ancho / 2, -alto / 2);
    sombra(ctx, true);
    ctx.fillStyle = "#fffdf7";
    ctx.fillRect(0, 0, ancho, alto);
    sombra(ctx, false);
    const img = el.querySelector("img");
    ctx.drawImage(img, img.offsetLeft, img.offsetTop, img.offsetWidth, img.offsetHeight);
    const nota = el.querySelector(".nota");
    if (nota) {
      ctx.font = "12.5px 'DM Sans', sans-serif";
      ctx.fillStyle = "#2a1a1a";
      ctx.textBaseline = "top";
      textoEnLineas(ctx, nota.textContent, nota.offsetLeft, nota.offsetTop, nota.offsetWidth, 16, 3);
    }
    const [claro, medio, oscuro] = COLORES_CHINCHETA[el.classList.contains("oliva") ? "oliva" : "oxido"];
    const brillo = ctx.createRadialGradient(ancho / 2 - 2, 0, 1, ancho / 2, 2, 7);
    brillo.addColorStop(0, claro);
    brillo.addColorStop(0.6, medio);
    brillo.addColorStop(1, oscuro);
    sombra(ctx, true);
    ctx.beginPath();
    ctx.arc(ancho / 2, 2, 7, 0, Math.PI * 2);
    ctx.fillStyle = brillo;
    ctx.fill();
  }
  ctx.restore();
}

// sinCorcho: solo las fotos y chapas, con el fondo transparente (para sacar su paleta)
async function imagenDelTablero({ sinCorcho = false } = {}) {
  const pins = [...corcho.querySelectorAll(".pin")].sort((a, b) => a.style.zIndex - b.style.zIndex);
  if (!pins.length) return null;
  deseleccionar();
  // Que todas las fotos estén cargadas antes de dibujarlas
  await Promise.all(pins.flatMap((el) => [...el.querySelectorAll("img")]).map((img) => img.decode().catch(() => {})));
  await document.fonts?.ready;

  const MARGEN = 32;
  const PIE = 40;
  const izquierda = Math.min(...pins.map((el) => el.offsetLeft));
  const arriba = Math.min(...pins.map((el) => el.offsetTop));
  const derecha = Math.max(...pins.map((el) => el.offsetLeft + el.offsetWidth));
  const abajo = Math.max(...pins.map((el) => el.offsetTop + el.offsetHeight + (el.classList.contains("chapa") ? 6 : 0)));
  const ancho = derecha - izquierda + 2 * MARGEN;
  const alto = abajo - arriba + 2 * MARGEN + PIE;
  const escala = Math.min(2.5, 3200 / Math.max(ancho, alto)); // nítida pero sin pasarse de tamaño

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(ancho * escala);
  canvas.height = Math.round(alto * escala);
  const ctx = canvas.getContext("2d");
  ctx.scale(escala, escala);

  // Corcho, con los mismos puntitos que en pantalla
  if (!sinCorcho) {
    ctx.fillStyle = "#c49a64";
    ctx.fillRect(0, 0, ancho, alto);
    for (const [paso, desfaseX, desfaseY, color] of [[7, 0, 0, "rgb(90 55 20 / 0.25)"], [11, 3, 5, "rgb(255 240 210 / 0.25)"]]) {
      ctx.fillStyle = color;
      for (let py = desfaseY; py < alto; py += paso) {
        for (let px = desfaseX; px < ancho; px += paso) ctx.fillRect(px - 0.75, py - 0.75, 1.5, 1.5);
      }
    }
  }

  ctx.save();
  ctx.translate(MARGEN - izquierda, MARGEN - arriba);
  for (const el of pins) dibujarPin(ctx, el);
  ctx.restore();

  if (sinCorcho) return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));

  // Pie con el nombre del tablero
  ctx.fillStyle = "rgb(255 253 247 / 0.92)";
  ctx.fillRect(0, alto - PIE, ancho, PIE);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = "#551c25";
  ctx.font = "700 17px 'Fraunces', serif";
  ctx.fillText(tableroActual.nombre, 14, alto - PIE / 2);
  ctx.textAlign = "right";
  ctx.fillStyle = "#4a5a23";
  ctx.font = "13px 'DM Sans', sans-serif";
  ctx.fillText("El Almacén", ancho - 14, alto - PIE / 2);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
}

async function compartirTablero() {
  $("#hoja-opciones").open && $("#hoja-opciones").close();
  avisar("Preparando la imagen…");
  const imagen = await imagenDelTablero();
  if (!imagen) return avisar("El tablero está vacío");
  await compartir({ titulo: tableroActual.nombre, texto: `Mi tablero «${tableroActual.nombre}» · El Almacén`, imagenes: [imagen], avisar });
}

$("#btn-compartir").addEventListener("click", compartirTablero);
$("#btn-compartir-opciones").addEventListener("click", compartirTablero);

$("#btn-renombrar").addEventListener("click", async () => {
  const nombre = prompt("Nuevo nombre", tableroActual.nombre)?.trim();
  $("#hoja-opciones").close();
  if (!nombre) return;
  tableroActual.nombre = nombre;
  await db.guardarTablero(tableroActual);
  $("#nombre-tablero").textContent = nombre;
});

$("#btn-borrar-tablero").addEventListener("click", async () => {
  if (!confirm(`¿Borrar «${tableroActual.nombre}» y todas sus fotos?`)) return;
  $("#hoja-opciones").close();
  await db.borrarTablero(tableroActual.id);
  location.hash = "#/";
});

// ---------- Añadir fotos ----------

// extra: datos que se guardan con la foto (origen, esmalte, ancho…)
async function anadirImagenes(blobs, extra = {}) {
  if (!tableroActual) return;
  corcho.classList.add("cargando");
  // Una foto sola aparece en el centro de lo que se ve del corcho;
  // varias, repartidas en dos columnas desde la esquina de arriba de lo que se ve
  const izquierda = vista.scrollLeft / unidad - 1;
  const arriba = vista.scrollTop / unidad + 0.04;
  const centroX = izquierda + vista.clientWidth / unidad / 2;
  const centroY = (vista.scrollTop + vista.clientHeight / 2) / unidad;
  const alturas = [arriba, arriba];
  let anadidas = 0;
  let ultima = null;
  try {
    for (const blob of blobs) {
      try {
        const { imagen, proporcion } = await prepararImagen(blob);
        const anchoPin = extra.ancho ?? ANCHO_INICIAL;
        const alto = anchoPin * proporcion;
        let x = limitar(centroX - anchoPin / 2, -1, 2 - anchoPin);
        let y = Math.max(0.03, centroY - alto / 2);
        // Si ya hay algo en ese mismo sitio, la nueva se desplaza en diagonal
        const ocupado = (x, y) => [...pinsActuales.values()].some((p) => Math.abs(p.x - x) < 0.01 && Math.abs(p.y - y) < 0.01);
        for (let paso = 0; paso < 8 && ocupado(x, y); paso++) {
          x = limitar(x + 0.06, -1, 2 - anchoPin);
          y += 0.06;
        }
        if (blobs.length > 1) {
          const col = alturas[0] <= alturas[1] ? 0 : 1;
          x = izquierda + (col === 0 ? 0.05 : 0.53);
          y = alturas[col];
          alturas[col] += alto + 0.1;
        }
        ultima = nuevoId();
        await db.guardarPin({
          id: ultima,
          tableroId: tableroActual.id,
          imagen,
          proporcion,
          nota: "",
          origen: null,
          x,
          y,
          ancho: anchoPin,
          ...extra,
          orden: Date.now() + anadidas,
          creado: Date.now(),
        });
        anadidas++;
      } catch (e) {
        console.error(e);
      }
    }
  } finally {
    corcho.classList.remove("cargando");
  }
  if (anadidas === 0) return avisar("No he podido leer esa imagen");
  $("#hoja-anadir").open && $("#hoja-anadir").close();
  if (extra.esmalte) avisar(`Esmalte ${nombreEsmalte(extra.esmalte)} añadido`);
  else avisar(anadidas === 1 ? "Foto añadida: arrástrala donde quieras" : `${anadidas} fotos añadidas`);
  await mostrarTablero(tableroActual.id);
  const nueva = corcho.querySelector(`[data-id="${ultima}"]`);
  if (nueva) seleccionar(nueva);
}

// Pinterest no deja descargar sus fotos desde el navegador; lo hace /api/pin
async function anadirDesdeEnlace(texto) {
  const url = texto.match(/https?:\/\/\S+/)?.[0];
  if (!url) return avisar("Eso no parece un enlace");
  avisar("Buscando la foto…");
  try {
    const respuesta = await fetch(`/api/pin?url=${encodeURIComponent(url)}`);
    if (!respuesta.ok) {
      const { error } = await respuesta.json().catch(() => ({}));
      throw new Error(error || "No se pudo traer la foto");
    }
    const esPin = !/i\.pinimg\.com/.test(new URL(url).hostname);
    await anadirImagenes([await respuesta.blob()], { origen: esPin ? url : null });
    $("#input-enlace").value = "";
  } catch (e) {
    avisar(e.message);
  }
}

$("#btn-anadir").addEventListener("click", () => $("#hoja-anadir").showModal());

for (const input of [$("#input-fotos"), $("#input-camara")]) {
  input.addEventListener("change", (e) => {
    anadirImagenes([...e.target.files]);
    e.target.value = "";
  });
}

$("#form-enlace").addEventListener("submit", (e) => {
  e.preventDefault();
  anadirDesdeEnlace($("#input-enlace").value);
});

$("#btn-pegar").addEventListener("click", async () => {
  if (!navigator.clipboard?.read) {
    return avisar("Mantén pulsado el cuadro del enlace y elige Pegar");
  }
  try {
    const elementos = await navigator.clipboard.read();
    const imagenes = [];
    for (const el of elementos) {
      const tipo = el.types.find((t) => t.startsWith("image/"));
      if (tipo) imagenes.push(await el.getType(tipo));
      else if (el.types.includes("text/plain")) {
        const texto = await (await el.getType("text/plain")).text();
        if (/https?:\/\//.test(texto)) return anadirDesdeEnlace(texto);
      }
    }
    if (imagenes.length) anadirImagenes(imagenes);
    else avisar("No hay ninguna imagen copiada");
  } catch {
    avisar("El navegador no me deja leer lo copiado");
  }
});

// Pegar con Ctrl+V (ordenador) o mantener pulsado → Pegar en el cuadro del enlace (móvil)
document.addEventListener("paste", (e) => {
  if (!tableroActual) return;
  const imagenes = [...e.clipboardData.files].filter((f) => f.type.startsWith("image/"));
  if (imagenes.length) {
    e.preventDefault();
    anadirImagenes(imagenes);
  } else if (e.target !== $("#input-enlace")) {
    const texto = e.clipboardData.getData("text");
    if (/https?:\/\//.test(texto)) anadirDesdeEnlace(texto);
  }
});

// Arrastrar fotos desde el escritorio o desde otra pestaña
const vistaTablero = $("#vista-tablero");
vistaTablero.addEventListener("dragover", (e) => e.preventDefault());
vistaTablero.addEventListener("drop", (e) => {
  e.preventDefault();
  const archivos = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
  if (archivos.length) return anadirImagenes(archivos);
  const url = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
  if (url) anadirDesdeEnlace(url);
});

// ---------- Esmaltes de Prodesco ----------

let catalogo = null; // promesa con la lista, se pide una sola vez

const sinAcentos = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const soloLetrasYNumeros = (t) => sinAcentos(t).replace(/[^a-z0-9]/g, "");
const nombreEsmalte = (e) => [e.codigo, e.nombre].filter(Boolean).join(" · ") || e.serie;

function pedirCatalogo() {
  return fetch("/api/esmaltes").then((r) => {
    if (!r.ok) throw new Error();
    return r.json();
  });
}

// El catálogo se guarda también en el móvil: la segunda vez sale al momento
// y se actualiza por detrás para la siguiente
function cargarCatalogo() {
  catalogo ??= (async () => {
    let lista = null;
    try { lista = JSON.parse(localStorage.getItem("catalogoEsmaltes")); } catch {}
    const nueva = pedirCatalogo().then((l) => {
      try { localStorage.setItem("catalogoEsmaltes", JSON.stringify(l)); } catch {}
      return l;
    });
    if (lista) nueva.catch(() => {});
    else lista = await nueva;
    for (const e of lista) {
      e.texto = sinAcentos(`${e.codigo} ${e.nombre} ${e.serie}`);
      e.clave = soloLetrasYNumeros(e.codigo);
    }
    return lista;
  })().catch((e) => {
    catalogo = null; // se puede volver a intentar
    throw e;
  });
  return catalogo;
}

// "o 10579", "O10579" y "o-10579" encuentran el O-10579
function coincide(e, palabras) {
  return palabras.every((p) => e.texto.includes(p) || (soloLetrasYNumeros(p) && e.clave.includes(soloLetrasYNumeros(p))));
}

// Las series que salen arriba; las demás van a «Otros esmaltes»
const SERIES_POR_DEFECTO = ["Especiales EESP", "Transparentes ETSP", "Opacos EOSP", "PSE con Plomo", "ENSP"];

function leerSeries() {
  try {
    const guardadas = JSON.parse(localStorage.getItem("seriesFavoritas"));
    if (Array.isArray(guardadas)) return new Set(guardadas);
  } catch {}
  return new Set(SERIES_POR_DEFECTO);
}

function guardarSeries(series) {
  try { localStorage.setItem("seriesFavoritas", JSON.stringify([...series])); } catch {}
}

function crearCasillasSeries(lista) {
  const favoritas = leerSeries();
  const todas = [...new Set(lista.map((e) => e.serie))].sort((a, b) => a.localeCompare(b, "es"));
  $("#lista-series").replaceChildren(...todas.map((serie) => {
    const label = document.createElement("label");
    const casilla = document.createElement("input");
    casilla.type = "checkbox";
    casilla.value = serie;
    casilla.checked = favoritas.has(serie);
    casilla.addEventListener("change", () => {
      const marcadas = [...$("#lista-series").querySelectorAll("input:checked")].map((c) => c.value);
      guardarSeries(marcadas);
      mostrarEsmaltes();
    });
    label.append(casilla, serie);
    return label;
  }));
}

async function mostrarEsmaltes() {
  let lista;
  try {
    lista = await cargarCatalogo();
  } catch {
    $("#cuenta-esmaltes").textContent = "No he podido cargar el catálogo de Prodesco. Prueba otra vez en un rato.";
    return;
  }
  if (!$("#lista-series").children.length) crearCasillasSeries(lista);

  const favoritas = leerSeries();
  const palabras = sinAcentos($("#buscar-esmalte").value).split(/\s+/).filter(Boolean);
  const encontrados = lista.filter((e) => coincide(e, palabras));
  const principales = encontrados.filter((e) => favoritas.has(e.serie));
  const otros = encontrados.filter((e) => !favoritas.has(e.serie));

  const cuantos = (n) => (n === 1 ? "1 esmalte" : `${n} esmaltes`);
  $("#cuenta-esmaltes").textContent = principales.length
    ? `${cuantos(principales.length)} en tus series`
    : palabras.length ? "Ninguno en tus series" : "No has elegido ninguna serie";
  $("#esmaltes-principales").replaceChildren(...principales.map(crearOpcionEsmalte));
  $("#esmaltes-otros").replaceChildren(...otros.map(crearOpcionEsmalte));
  const otrosEsmaltes = $("#otros-esmaltes");
  otrosEsmaltes.hidden = !otros.length;
  otrosEsmaltes.querySelector("summary").textContent = `Otros esmaltes (${otros.length})`;
  // Si lo que buscas solo está en otras series, se despliega solo, y se vuelve a plegar después
  const abrirSolo = palabras.length > 0 && !principales.length && otros.length > 0;
  if (abrirSolo && !otrosEsmaltes.open) {
    otrosEsmaltes.open = true;
    otrosEsmaltes.dataset.abiertoSolo = "si";
  } else if (!abrirSolo && otrosEsmaltes.dataset.abiertoSolo) {
    otrosEsmaltes.open = false;
    delete otrosEsmaltes.dataset.abiertoSolo;
  }
}

// Si lo abres o cierras tú, se queda como lo dejes
$("#otros-esmaltes summary").addEventListener("click", () => delete $("#otros-esmaltes").dataset.abiertoSolo);

function crearOpcionEsmalte(e) {
  const boton = document.createElement("button");
  boton.type = "button";
  boton.className = "opcion-esmalte";
  const img = document.createElement("img");
  img.src = e.miniatura;
  img.alt = "";
  img.loading = "lazy";
  const codigo = document.createElement("strong");
  codigo.textContent = e.codigo || e.nombre;
  const nombre = document.createElement("span");
  nombre.textContent = e.codigo ? e.nombre || e.serie : e.serie;
  boton.append(img, codigo, nombre);
  if (e.plomo) {
    const plomo = document.createElement("small");
    plomo.className = "plomo";
    plomo.textContent = "Con plomo";
    boton.append(plomo);
  }
  boton.addEventListener("click", () => anadirEsmalte(e, boton));
  return boton;
}

async function anadirEsmalte(e, boton) {
  boton.classList.add("cargando");
  try {
    const respuesta = await fetch(`/api/esmaltes?imagen=${encodeURIComponent(e.muestra)}`);
    if (!respuesta.ok) throw new Error();
    $("#hoja-esmaltes").close();
    const { codigo, nombre, serie, plomo, url } = e;
    await anadirImagenes([await respuesta.blob()], { esmalte: { codigo, nombre, serie, plomo, url }, ancho: 0.24 });
  } catch {
    avisar("No he podido traer la muestra de Prodesco");
  } finally {
    boton.classList.remove("cargando");
  }
}

$("#btn-esmaltes").addEventListener("click", () => {
  $("#hoja-esmaltes").showModal();
  mostrarEsmaltes();
});
$("#buscar-esmalte").addEventListener("input", mostrarEsmaltes);

// ---------- Paleta desde una foto ----------
// Color Thief saca los 5 colores dominantes y, para cada uno, se buscan los esmaltes
// cuyo azulejo de muestra se le parece más (colores-esmaltes.json, ver scripts/).

let coloresEsmaltes = null;
const cargarColores = () => (coloresEsmaltes ??= fetch("colores-esmaltes.json").then((r) => r.json()).catch(() => { coloresEsmaltes = null; return {}; }));

const aHex = ([r, g, b]) => "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
const deHex = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// RGB → CIELAB, para medir parecidos como los ve el ojo
function aLab([r, g, b]) {
  const lineal = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [R, G, B] = [lineal(r), lineal(g), lineal(b)];
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (t * 24389 / 27 + 16) / 116);
  const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const y = f(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

// Diferencia de color CIEDE2000: por debajo de 2 casi no se nota, por encima de 20 son colores distintos
function diferencia([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = a1 * (1 + G), a2p = a2 * (1 + G);
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h1p = (Math.atan2(b1, a1p) / rad + 360) % 360, h2p = (Math.atan2(b2, a2p) / rad + 360) % 360;
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = C1p * C2p === 0 ? 0 : h2p - h1p;
  if (dhp > 180) dhp -= 360; else if (dhp < -180) dhp += 360;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * rad) / 2);
  const Lm = (L1 + L2) / 2, Cmp = (C1p + C2p) / 2;
  let hm = h1p + h2p;
  if (C1p * C2p !== 0) hm = Math.abs(h1p - h2p) > 180 ? (h1p + h2p + (h1p + h2p < 360 ? 360 : -360)) / 2 : (h1p + h2p) / 2;
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad);
  const SL = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2), SC = 1 + 0.045 * Cmp, SH = 1 + 0.015 * Cmp * T;
  const RT = -2 * Math.sqrt(Cmp ** 7 / (Cmp ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hm - 275) / 25) ** 2)) * rad);
  return Math.sqrt((dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH));
}

const parecido = (d) => (d < 6 ? "Casi igual" : d < 12 ? "Muy parecido" : d < 20 ? "Parecido" : "Lo más cercano");

let paletaActual = null; // { colores: [[r,g,b]…] }

async function abrirPaleta(blob) {
  if (!window.ColorThief) return avisar("No se ha podido cargar Color Thief; prueba con conexión");
  const url = urlDe(blob);
  const img = $("#paleta-foto");
  img.src = url;
  await img.decode();
  // Color Thief a veces da uno menos de los pedidos: se piden 6 y se quedan 5
  const colores = new ColorThief().getPalette(img, 6, 5).slice(0, 5);
  paletaActual = { colores };
  $("#paleta-colores").replaceChildren(...colores.map((c) =>
    Object.assign(document.createElement("span"), { className: "color-paleta", title: aHex(c), style: `background:${aHex(c)}` })));
  $("#paleta-sugerencias").replaceChildren(Object.assign(document.createElement("p"), { className: "cuenta-esmaltes", textContent: "Buscando esmaltes parecidos…" }));
  $("#hoja-paleta").showModal();
  pintarSugerencias();
}

async function pintarSugerencias() {
  if (!paletaActual) return;
  let lista, colores;
  try {
    [lista, colores] = await Promise.all([cargarCatalogo(), cargarColores()]);
  } catch {
    $("#paleta-sugerencias").replaceChildren(Object.assign(document.createElement("p"), { textContent: "No he podido cargar el catálogo de Prodesco." }));
    return;
  }
  const soloMias = $("#paleta-mis-series").checked;
  const favoritas = leerSeries();
  const candidatos = lista
    .filter((e) => colores[e.id] && (!soloMias || favoritas.has(e.serie)))
    .map((e) => ({ e, lab: aLab(deHex(colores[e.id])) }));

  $("#paleta-sugerencias").replaceChildren(...paletaActual.colores.map((c) => {
    const lab = aLab(c);
    const mejores = candidatos.map((x) => ({ ...x, d: diferencia(lab, x.lab) })).sort((a, b) => a.d - b.d).slice(0, 3);
    const fila = document.createElement("section");
    fila.className = "fila-paleta";
    const muestra = Object.assign(document.createElement("div"), { className: "color-grande" });
    muestra.style.background = aHex(c);
    muestra.append(Object.assign(document.createElement("span"), { textContent: aHex(c).toUpperCase() }));
    const opciones = document.createElement("div");
    opciones.className = "esmaltes-parecidos";
    for (const { e, d } of mejores) {
      const boton = document.createElement("button");
      boton.type = "button";
      boton.className = "opcion-esmalte";
      const img = Object.assign(document.createElement("img"), { src: e.miniatura, alt: "", loading: "lazy" });
      boton.append(img,
        Object.assign(document.createElement("strong"), { textContent: e.codigo || e.nombre }),
        Object.assign(document.createElement("span"), { textContent: e.codigo ? e.nombre || e.serie : e.serie }),
        Object.assign(document.createElement("small"), { className: "parecido", textContent: parecido(d) }));
      boton.addEventListener("click", async () => {
        await anadirEsmalte(e, boton);
        boton.classList.add("anadido");
      });
      opciones.append(boton);
    }
    if (!mejores.length) opciones.append(Object.assign(document.createElement("p"), { textContent: "Ninguno en tus series: quita «Solo mis series»." }));
    fila.append(muestra, opciones);
    return fila;
  }));
}

$("#paleta-mis-series").addEventListener("change", pintarSugerencias);
$("#detalle-paleta").addEventListener("click", () => {
  const blob = pinAbierto?.imagen;
  $("#hoja-detalle").close();
  if (blob) abrirPaleta(blob);
});
$("#btn-paleta-tablero").addEventListener("click", async () => {
  $("#hoja-opciones").close();
  avisar("Mirando los colores del tablero…");
  const imagen = await imagenDelTablero({ sinCorcho: true }); // Color Thief no cuenta lo transparente
  if (!imagen) return avisar("El tablero está vacío");
  abrirPaleta(imagen);
});

// ---------- Detalle de una foto ----------

let pinAbierto = null;

function abrirDetalle(id) {
  pinAbierto = pinsActuales.get(id);
  $("#detalle-img").src = urlDe(pinAbierto.imagen);
  $("#detalle-nota").value = pinAbierto.nota;
  const esmalte = pinAbierto.esmalte;
  $("#detalle-esmalte").hidden = !esmalte;
  $("#detalle-paleta").hidden = Boolean(esmalte); // la paleta tiene sentido en las fotos, no en las chapas
  if (esmalte) {
    $("#detalle-esmalte-nombre").textContent = nombreEsmalte(esmalte);
    $("#detalle-esmalte-serie").textContent = esmalte.serie;
    $("#detalle-esmalte-plomo").hidden = !esmalte.plomo;
  }
  const origen = $("#detalle-origen");
  const enlace = esmalte?.url ?? pinAbierto.origen;
  origen.hidden = !enlace;
  if (enlace) {
    origen.href = enlace;
    origen.textContent = esmalte ? "Ver en Prodesco ↗" : "Ver en Pinterest ↗";
  }
  $("#hoja-detalle").showModal();
}

$("#hoja-detalle").addEventListener("close", async () => {
  if (!pinAbierto) return;
  const nota = $("#detalle-nota").value.trim();
  if (nota !== pinAbierto.nota) {
    pinAbierto.nota = nota;
    await db.guardarPin(pinAbierto);
    mostrarTablero(tableroActual.id);
  }
  pinAbierto = null;
});

$("#detalle-fondo").addEventListener("click", async () => {
  pinAbierto.orden = Math.min(...[...pinsActuales.values()].map((p) => p.orden)) - 1;
  await db.guardarPin(pinAbierto);
  $("#hoja-detalle").close();
  mostrarTablero(tableroActual.id);
});

$("#detalle-borrar").addEventListener("click", async () => {
  if (!confirm("¿Borrar esta foto del tablero?")) return;
  await db.borrarPin(pinAbierto.id);
  pinAbierto = null;
  $("#hoja-detalle").close();
  mostrarTablero(tableroActual.id);
});

// Cerrar las hojas tocando fuera
document.querySelectorAll("dialog").forEach((d) =>
  d.addEventListener("click", (e) => e.target === d && d.close())
);

// ---------- Compartir desde Pinterest (Android, con la web instalada) ----------

async function recibirCompartido() {
  const params = new URLSearchParams(location.search);
  const compartido = [params.get("url"), params.get("text"), params.get("title")].find((v) => /https?:\/\//.test(v ?? ""));
  if (!compartido) return false;

  // Va al último tablero abierto, o crea uno si no hay ninguno
  let destino = await db.tablero(leerUltimo() ?? "");
  if (!destino) {
    destino = (await db.tableros()).sort((a, b) => b.creado - a.creado)[0];
  }
  if (!destino) {
    destino = { id: nuevoId(), nombre: "Inspiración", creado: Date.now() };
    await db.guardarTablero(destino);
  }
  history.replaceState(null, "", `${location.pathname}#/t/${destino.id}`);
  await mostrarTablero(destino.id);
  anadirDesdeEnlace(compartido);
  return true;
}

function leerUltimo() {
  try { return localStorage.getItem("ultimoTablero"); } catch { return null; }
}

// ---------- Arranque ----------

window.addEventListener("hashchange", enrutar);
navigator.storage?.persist?.(); // pide al navegador que no borre los datos
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
recibirCompartido().then((compartido) => compartido || enrutar());
