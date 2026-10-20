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
    const pins = (await db.pins(t.id)).sort(porOrden);
    const tarjeta = document.createElement("a");
    tarjeta.className = "tarjeta-tablero";
    tarjeta.href = `#/t/${t.id}`;

    const collage = document.createElement("div");
    collage.className = "collage";
    for (const p of pins.slice(0, 4)) {
      const img = document.createElement("img");
      img.src = urlDe(p.imagen);
      img.alt = "";
      collage.append(img);
    }

    const info = document.createElement("div");
    info.className = "info";
    const nombre = document.createElement("strong");
    nombre.textContent = t.nombre;
    const cuenta = document.createElement("small");
    cuenta.textContent = pins.length === 1 ? "1 foto" : `${pins.length} fotos`;
    info.append(nombre, cuenta);

    tarjeta.append(collage, info);
    lista.append(tarjeta);
  }

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

  $("#vista-lista").hidden = true;
  $("#vista-tablero").hidden = false;
  ajustarAlto();
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
  el.append(img);
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

function enrutar() {
  const coincide = location.hash.match(/^#\/t\/(.+)$/);
  if (coincide) mostrarTablero(coincide[1]);
  else mostrarLista();
}

// ---------- Composición: mover y cambiar de tamaño ----------
// x, y y ancho se guardan como fracción del ancho del corcho,
// así la composición se ve igual en el móvil y en el ordenador.

const ANCHO_INICIAL = 0.42;
const ANCHO_MINIMO = 0.15;
const corcho = $("#corcho");
let pinsActuales = new Map();
let seleccionado = null; // la foto con el marco oliva
let gesto = null;        // el arrastre en curso
let zMaximo = 0;

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
  const alto = Math.max(fondo + innerHeight * 0.4, innerHeight * 0.7);
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
  if (!el) return deseleccionar();
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
  if (!gesto) return;
  const dx = e.clientX - gesto.inicioX;
  const dy = e.clientY - gesto.inicioY;
  if (!gesto.activo) {
    if (Math.hypot(dx, dy) < 6) return;
    if (!gesto.directo) return terminarGesto(); // se estaba desplazando por la página
    empezarArrastre();
  }
  const ancho = corcho.clientWidth;
  const p = gesto.p;
  if (gesto.tipo === "mover") {
    p.x = limitar(gesto.x0 + dx / ancho, 0, 1 - p.ancho);
    p.y = Math.max(0, gesto.y0 + dy / ancho);
  } else {
    p.ancho = limitar(gesto.ancho0 + dx / ancho, ANCHO_MINIMO, 1 - p.x);
  }
  colocar(gesto.el, p);
  ajustarAlto(true);
});

corcho.addEventListener("pointerup", async () => {
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
  if (!gesto) return;
  if (gesto.activo) db.guardarPin(gesto.p);
  terminarGesto();
});

// Tocar fuera del corcho también suelta la foto elegida
document.addEventListener("pointerdown", (e) => {
  if (!corcho.contains(e.target) && !e.target.closest("dialog")) deseleccionar();
});

// Mientras se arrastra, que el dedo no desplace la página
corcho.addEventListener("touchmove", (e) => gesto?.activo && e.preventDefault(), { passive: false });
corcho.addEventListener("contextmenu", (e) => e.target.closest(".pin") && e.preventDefault());

// Al girar el móvil cambia el ancho y, con él, el alto de las fotos
let anchoAnterior = 0;
new ResizeObserver(() => {
  if (!tableroActual || corcho.clientWidth === anchoAnterior) return;
  anchoAnterior = corcho.clientWidth;
  ajustarAlto();
}).observe(corcho);

// ---------- Tableros ----------

async function crearTablero() {
  const nombre = prompt("Nombre del tablero", "Ideas de esmaltes")?.trim();
  if (!nombre) return;
  const t = { id: nuevoId(), nombre, creado: Date.now() };
  await db.guardarTablero(t);
  location.hash = `#/t/${t.id}`;
}

$("#btn-opciones").addEventListener("click", () => $("#hoja-opciones").showModal());

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

async function anadirImagenes(blobs, origen = null) {
  if (!tableroActual) return;
  corcho.classList.add("cargando");
  // Una foto sola aparece en el centro de lo que se ve del corcho;
  // varias, repartidas en dos columnas desde arriba de lo que se ve
  const caja = corcho.getBoundingClientRect();
  const ancho = caja.width || 1;
  const arriba = Math.max(0, -caja.top) / ancho + 0.04;
  const centro = ((Math.max(caja.top, 0) + Math.min(caja.bottom, innerHeight)) / 2 - caja.top) / ancho;
  const alturas = [arriba, arriba];
  let anadidas = 0;
  let ultima = null;
  try {
    for (const blob of blobs) {
      try {
        const { imagen, proporcion } = await prepararImagen(blob);
        const alto = ANCHO_INICIAL * proporcion;
        let x = 0.5 - ANCHO_INICIAL / 2;
        let y = Math.max(0.03, centro - alto / 2);
        if (blobs.length > 1) {
          const col = alturas[0] <= alturas[1] ? 0 : 1;
          x = col === 0 ? 0.05 : 0.53;
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
          origen,
          x,
          y,
          ancho: ANCHO_INICIAL,
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
  avisar(anadidas === 1 ? "Foto añadida: arrástrala donde quieras" : `${anadidas} fotos añadidas`);
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
    await anadirImagenes([await respuesta.blob()], esPin ? url : null);
    $("#input-enlace").value = "";
  } catch (e) {
    avisar(e.message);
  }
}

$("#btn-anadir").addEventListener("click", () => $("#hoja-anadir").showModal());

$("#input-fotos").addEventListener("change", (e) => {
  anadirImagenes([...e.target.files]);
  e.target.value = "";
});

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

// ---------- Detalle de una foto ----------

let pinAbierto = null;

function abrirDetalle(id) {
  pinAbierto = pinsActuales.get(id);
  $("#detalle-img").src = urlDe(pinAbierto.imagen);
  $("#detalle-nota").value = pinAbierto.nota;
  const origen = $("#detalle-origen");
  origen.hidden = !pinAbierto.origen;
  if (pinAbierto.origen) origen.href = pinAbierto.origen;
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
