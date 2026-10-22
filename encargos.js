// Encargos de piezas a medida: el formulario manda la idea, las fotos y,
// si quieres, la imagen de uno de tus tableros. Con la nube activa se guarda
// en Supabase (lo ve el taller en encargos-recibidos.html); sin ella, se
// comparte el texto y las fotos (WhatsApp, correo…).

const $ = (sel) => document.querySelector(sel);
const MAX_FOTOS = 6;
const LADO_MAXIMO = 1600;
const TIPOS = ["Taza", "Plato", "Cuenco", "Jarra", "Jarrón", "Maceta", "Vajilla o juego", "Figura", "Otra cosa"];

let temporizadorAviso;
function avisar(texto) {
  const el = $("#aviso");
  el.textContent = texto;
  el.classList.add("visible");
  clearTimeout(temporizadorAviso);
  temporizadorAviso = setTimeout(() => el.classList.remove("visible"), 2500);
}

// ---------- Tipo de pieza ----------

$("#tipos").replaceChildren(...TIPOS.map((tipo, i) => {
  const label = document.createElement("label");
  label.className = "chip-tipo";
  const input = Object.assign(document.createElement("input"), { type: "radio", name: "tipo", value: tipo, checked: i === 0 });
  label.append(input, tipo);
  return label;
}));

// ---------- Fotos ----------

const fotos = []; // { blob, url }

async function prepararImagen(blob) {
  const bitmap = await createImageBitmap(blob);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
}

function pintarFotos() {
  $("#fotos-encargo").replaceChildren(...fotos.map((f, i) => {
    const caja = document.createElement("div");
    caja.className = "foto-encargo";
    const img = Object.assign(document.createElement("img"), { src: f.url, alt: `Foto ${i + 1}` });
    const quitar = Object.assign(document.createElement("button"), { type: "button", className: "quitar-foto", textContent: "✕" });
    quitar.setAttribute("aria-label", "Quitar foto");
    quitar.addEventListener("click", () => {
      URL.revokeObjectURL(f.url);
      fotos.splice(i, 1);
      pintarFotos();
    });
    caja.append(img, quitar);
    return caja;
  }));
  $(".subir-fotos").hidden = fotos.length >= MAX_FOTOS;
}

$("#input-fotos-encargo").addEventListener("change", async (e) => {
  const archivos = [...e.target.files].slice(0, MAX_FOTOS - fotos.length);
  e.target.value = "";
  for (const archivo of archivos) {
    try {
      const blob = await prepararImagen(archivo);
      fotos.push({ blob, url: URL.createObjectURL(blob) });
    } catch {
      avisar("No he podido leer una de las imágenes");
    }
  }
  pintarFotos();
});

// ---------- Adjuntar un tablero ----------
// Los tableros están en el móvil (IndexedDB de tablero.js). Solo se abre la base
// si ya existe, para no crearla vacía.

const MARCO = 6 / 390; // igual que en tablero.js
const MARCO_ABAJO = 10 / 390;
let tableroAdjunto = null; // { nombre, blob, url }

function huella(id) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
}
const giro = (id) => (huella(id) % 50) / 10 - 2.5;

async function leerTableros() {
  try {
    if (!(await indexedDB.databases()).some((b) => b.name === "elalmacen")) return [];
  } catch {
    return [];
  }
  const db = await new Promise((ok, mal) => {
    const peticion = indexedDB.open("elalmacen");
    peticion.onsuccess = () => ok(peticion.result);
    peticion.onerror = () => mal(peticion.error);
  });
  if (!db.objectStoreNames.contains("tableros")) return db.close(), [];
  const leer = (almacen, fn) => new Promise((ok, mal) => {
    const peticion = fn(db.transaction(almacen).objectStore(almacen));
    peticion.onsuccess = () => ok(peticion.result);
    peticion.onerror = () => mal(peticion.error);
  });
  const tableros = await leer("tableros", (s) => s.getAll());
  for (const t of tableros) t.pins = await leer("pins", (s) => s.index("tablero").getAll(t.id));
  db.close();
  return tableros.filter((t) => t.pins.length).sort((a, b) => (b.creado ?? 0) - (a.creado ?? 0));
}

// Dibuja el tablero como en el corcho: polaroids giradas y chapas de esmalte
async function imagenDeTablero(tablero) {
  const U = 600; // px por «pantalla»
  const MARGEN = 30;
  const PIE = 44;
  const pins = [...tablero.pins].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  const alto = (p) => (p.esmalte ? p.ancho + 0.06 : p.ancho * p.proporcion + MARCO + MARCO_ABAJO);
  const izquierda = Math.min(...pins.map((p) => p.x));
  const arriba = Math.min(...pins.map((p) => p.y));
  const ancho = (Math.max(...pins.map((p) => p.x + p.ancho)) - izquierda) * U + 2 * MARGEN;
  const altoTotal = (Math.max(...pins.map((p) => p.y + alto(p))) - arriba) * U + 2 * MARGEN + PIE;
  const escala = Math.min(2, 2400 / Math.max(ancho, altoTotal)); // nítida, sin pasarse de tamaño

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(ancho * escala);
  canvas.height = Math.round(altoTotal * escala);
  const ctx = canvas.getContext("2d");
  ctx.scale(escala, escala);
  // El fondo que tenga el tablero: corcho, un color o una foto
  const fondo = tablero.fondo;
  const fotoFondo = fondo?.tipo === "foto" && fondo.imagen instanceof Blob ? await createImageBitmap(fondo.imagen).catch(() => null) : null;
  if (fotoFondo) {
    const e = Math.max(ancho / fotoFondo.width, altoTotal / fotoFondo.height);
    ctx.drawImage(fotoFondo, (ancho - fotoFondo.width * e) / 2, (altoTotal - fotoFondo.height * e) / 2, fotoFondo.width * e, fotoFondo.height * e);
    fotoFondo.close();
  } else {
    const color = fondo?.tipo === "color";
    ctx.fillStyle = color ? fondo.color : "#c49a64";
    ctx.fillRect(0, 0, ancho, altoTotal);
    ctx.fillStyle = color ? "rgb(0 0 0 / 0.07)" : "rgb(90 55 20 / 0.25)";
    for (let py = 0; py < altoTotal; py += 7) for (let px = 0; px < ancho; px += 7) ctx.fillRect(px - 0.75, py - 0.75, 1.5, 1.5);
  }

  for (const p of pins) {
    if (!(p.imagen instanceof Blob)) continue;
    const bitmap = await createImageBitmap(p.imagen).catch(() => null);
    if (!bitmap) continue;
    const x = (p.x - izquierda) * U + MARGEN;
    const y = (p.y - arriba) * U + MARGEN;
    const w = p.ancho * U;
    ctx.save();
    ctx.shadowColor = "rgb(40 20 0 / 0.35)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    if (p.esmalte) {
      const r = w / 2;
      ctx.beginPath();
      ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
      ctx.fillStyle = "#fffdf7";
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.beginPath();
      ctx.arc(x + r, y + r, r - 4, 0, Math.PI * 2);
      ctx.clip();
      const lado = (w - 8) * 1.25;
      ctx.drawImage(bitmap, x + r - lado / 2, y + r - lado / 2, lado, lado);
      ctx.restore();
      const texto = p.esmalte.codigo || p.esmalte.nombre || "";
      if (texto) {
        ctx.font = "600 15px 'DM Sans', sans-serif";
        const anchoTexto = ctx.measureText(texto).width + 18;
        ctx.fillStyle = "#f3e9d8";
        ctx.beginPath();
        ctx.roundRect(x + r - anchoTexto / 2, y + w + 4, anchoTexto, 24, 12);
        ctx.fill();
        ctx.fillStyle = "#2a1a1a";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(texto, x + r, y + w + 16.5);
      }
    } else {
      const h = alto(p) * U;
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate((giro(p.id) * Math.PI) / 180);
      ctx.translate(-w / 2, -h / 2);
      ctx.fillStyle = "#fffdf7";
      ctx.fillRect(0, 0, w, h);
      ctx.shadowColor = "transparent";
      const m = MARCO * U;
      const anchoFoto = w - 2 * m;
      const altoFoto = anchoFoto * p.proporcion;
      // recorte «cover», como en el corcho
      const proporcionImagen = bitmap.height / bitmap.width;
      let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height;
      if (proporcionImagen > p.proporcion) { sh = bitmap.width * p.proporcion; sy = (bitmap.height - sh) / 2; }
      else { sw = bitmap.height / p.proporcion; sx = (bitmap.width - sw) / 2; }
      ctx.drawImage(bitmap, sx, sy, sw, sh, m, m, anchoFoto, altoFoto);
      ctx.restore();
    }
    bitmap.close();
  }

  await document.fonts?.ready;
  ctx.fillStyle = "rgb(255 253 247 / 0.92)";
  ctx.fillRect(0, altoTotal - PIE, ancho, PIE);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = "#551c25";
  ctx.font = "700 19px 'Fraunces', serif";
  ctx.fillText(tablero.nombre || "Mi tablero", 16, altoTotal - PIE / 2);
  ctx.textAlign = "right";
  ctx.fillStyle = "#4a5a23";
  ctx.font = "14px 'DM Sans', sans-serif";
  ctx.fillText("El Almacén", ancho - 16, altoTotal - PIE / 2);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
}

async function pintarTableros() {
  const lista = $("#lista-tableros-encargo");
  let tableros = [];
  try { tableros = await leerTableros(); } catch {}
  if (!tableros.length) {
    lista.innerHTML = '<p class="ayuda">Si guardas ideas en un <a href="inspiracion.html">tablero de inspiración</a>, aquí podrás adjuntarlo.</p>';
    return;
  }
  lista.replaceChildren(...tableros.map((t) => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "opcion-tablero";
    const primera = t.pins.find((p) => p.imagen instanceof Blob && !p.esmalte) ?? t.pins.find((p) => p.imagen instanceof Blob);
    if (primera) boton.append(Object.assign(document.createElement("img"), { src: URL.createObjectURL(primera.imagen), alt: "" }));
    const texto = document.createElement("span");
    texto.innerHTML = `<strong></strong><small>${t.pins.length === 1 ? "1 imagen" : `${t.pins.length} imágenes`}</small>`;
    texto.querySelector("strong").textContent = t.nombre || "Tablero";
    boton.append(texto);
    boton.addEventListener("click", async () => {
      boton.disabled = true;
      avisar("Preparando el tablero…");
      try {
        const blob = await imagenDeTablero(t);
        if (tableroAdjunto) URL.revokeObjectURL(tableroAdjunto.url);
        tableroAdjunto = { nombre: t.nombre || "Tablero", blob, url: URL.createObjectURL(blob) };
        $("#imagen-tablero-encargo").src = tableroAdjunto.url;
        $("#nombre-tablero-encargo").textContent = `Tablero «${tableroAdjunto.nombre}»`;
        $("#vista-tablero-encargo").hidden = false;
        lista.querySelectorAll(".opcion-tablero").forEach((b) => b.classList.toggle("elegido", b === boton));
      } catch {
        avisar("No he podido preparar ese tablero");
      } finally {
        boton.disabled = false;
      }
    });
    return boton;
  }));
}

$("#quitar-tablero").addEventListener("click", () => {
  if (tableroAdjunto) URL.revokeObjectURL(tableroAdjunto.url);
  tableroAdjunto = null;
  $("#vista-tablero-encargo").hidden = true;
  document.querySelectorAll(".opcion-tablero").forEach((b) => b.classList.remove("elegido"));
});

// ---------- Borrador: lo escrito se guarda en el móvil hasta enviarlo ----------

const form = $("#form-encargo");
const CAMPOS_BORRADOR = ["cantidad", "medidas", "colores", "idea", "para-cuando", "presupuesto-cliente", "nombre", "correo-encargo", "telefono"];
try {
  const borrador = JSON.parse(localStorage.getItem("borradorEncargo")) ?? {};
  for (const id of CAMPOS_BORRADOR) if (borrador[id] != null) $(`#${id}`).value = borrador[id];
  for (const nombre of ["tipo", "uso", "contestar_por"]) {
    if (borrador[nombre]) form.querySelector(`input[name="${nombre}"][value="${CSS.escape(borrador[nombre])}"]`)?.click();
  }
} catch {}

// Desde la tienda: «Me interesa» llega con la pieza (?pieza=Taza verde&precio=28)
{
  const params = new URLSearchParams(location.search);
  const pieza = params.get("pieza");
  if (pieza) {
    const precio = Number(params.get("precio"));
    const texto = /^una parecida/.test(pieza)
      ? `Me gustaría ${pieza}, de la tienda.`
      : `Me interesa la pieza «${pieza}» de la tienda${precio ? ` (${precio} €)` : ""}. ¿Me la guardas para recogerla en el taller?`;
    if (!$("#idea").value.includes(texto)) $("#idea").value = [texto, $("#idea").value.trim()].filter(Boolean).join("\n\n");
  }
}

form.addEventListener("input", () => {
  const borrador = Object.fromEntries(CAMPOS_BORRADOR.map((id) => [id, $(`#${id}`).value]));
  for (const nombre of ["tipo", "uso", "contestar_por"]) borrador[nombre] = form.querySelector(`input[name="${nombre}"]:checked`)?.value;
  try { localStorage.setItem("borradorEncargo", JSON.stringify(borrador)); } catch {}
});

// ---------- Enviar ----------

const valor = (id) => $(`#${id}`).value.trim();
const elegido = (nombre) => form.querySelector(`input[name="${nombre}"]:checked`)?.value ?? "";

function comprobar() {
  if (!valor("idea")) return ["idea", "Cuéntame un poco tu idea."];
  if (!valor("nombre")) return ["nombre", "Escribe tu nombre."];
  const contestarPor = elegido("contestar_por");
  if (contestarPor === "whatsapp" && !/\d{6,}/.test(valor("telefono").replace(/\D/g, ""))) return ["telefono", "Para contestarte por WhatsApp necesito tu teléfono."];
  if (contestarPor === "correo" && !$("#correo-encargo").checkValidity()) return ["correo-encargo", "Ese correo no parece válido."];
  if (contestarPor === "correo" && !valor("correo-encargo")) return ["correo-encargo", "Para contestarte por correo necesito tu correo."];
  if (!$("#acepto").checked) return ["acepto", "Marca la casilla para que pueda guardar tus datos."];
  return null;
}

function textoDelEncargo() {
  return [
    `Encargo para El Almacén`,
    `${elegido("tipo")} · ${valor("cantidad") || 1} ${Number(valor("cantidad")) === 1 ? "unidad" : "unidades"} · ${elegido("uso")}`,
    valor("medidas") && `Tamaño: ${valor("medidas")}`,
    valor("colores") && `Colores: ${valor("colores")}`,
    "",
    valor("idea"),
    "",
    valor("para-cuando") && `Para: ${new Date(valor("para-cuando") + "T12:00").toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}`,
    valor("presupuesto-cliente") && `Presupuesto: ${valor("presupuesto-cliente")}`,
    `${valor("nombre")} · ${[valor("telefono"), valor("correo-encargo")].filter(Boolean).join(" · ")}`,
  ].filter((linea) => typeof linea === "string").join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function enviarANube() {
  const nube = window.nube;
  await nube.listo;
  const cliente = nube.cliente;
  const id = crypto.randomUUID();
  const subir = async (nombre, blob) => {
    const ruta = `${id}/${nombre}`;
    const { error } = await cliente.storage.from("encargos").upload(ruta, blob, { contentType: blob.type || "image/jpeg", upsert: false });
    if (error) throw error;
    return ruta;
  };
  const rutasFotos = [];
  for (const [i, f] of fotos.entries()) rutasFotos.push(await subir(`foto-${i + 1}.jpg`, f.blob));
  const tablero = tableroAdjunto ? { nombre: tableroAdjunto.nombre, imagen: await subir("tablero.jpg", tableroAdjunto.blob) } : null;
  const { error } = await cliente.from("encargos").insert({
    id,
    user_id: nube.usuario?.id ?? null,
    nombre: valor("nombre"),
    correo: valor("correo-encargo") || null,
    telefono: valor("telefono") || null,
    contestar_por: elegido("contestar_por"),
    tipo: elegido("tipo"),
    cantidad: Math.max(1, Math.min(500, parseInt(valor("cantidad"), 10) || 1)),
    medidas: valor("medidas") || null,
    colores: valor("colores") || null,
    uso: elegido("uso"),
    idea: valor("idea"),
    para_cuando: valor("para-cuando") || null,
    presupuesto_cliente: valor("presupuesto-cliente") || null,
    fotos: rutasFotos,
    tablero,
  });
  if (error) throw error;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const error = $("#error-encargo");
  error.hidden = true;
  const fallo = comprobar();
  if (fallo) {
    error.textContent = fallo[1];
    error.hidden = false;
    $(`#${fallo[0]}`).focus();
    return;
  }
  const boton = $("#enviar-encargo");
  boton.disabled = true;
  boton.textContent = "Enviando…";
  try {
    if (window.nube?.activa) {
      await enviarANube();
    } else {
      // Sin nube: se comparte (WhatsApp, correo…) con las fotos y el tablero
      const imagenes = [...fotos.map((f) => f.blob), ...(tableroAdjunto ? [tableroAdjunto.blob] : [])];
      await compartir({ titulo: "Encargo para El Almacén", texto: textoDelEncargo(), imagenes, avisar });
    }
    try { localStorage.removeItem("borradorEncargo"); } catch {}
    const por = elegido("contestar_por") === "whatsapp" ? "por WhatsApp" : "por correo";
    $("#texto-enviado").textContent = window.nube?.activa
      ? `Gracias, ${valor("nombre")}. Miro tu idea y te contesto ${por} con el presupuesto y el plazo.`
      : `Gracias, ${valor("nombre")}. Si has enviado el mensaje, miro tu idea y te contesto ${por} con el presupuesto y el plazo.`;
    form.hidden = true;
    document.querySelector(".pasos-encargo").hidden = true;
    $("#encargo-enviado").hidden = false;
    scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    console.warn(err);
    error.textContent = /fetch|network/i.test(String(err?.message)) ? "No hay conexión. Comprueba internet y vuelve a enviarlo: no se ha perdido nada." : "No se ha podido enviar. Vuelve a probar en un momento: lo que has escrito sigue aquí.";
    error.hidden = false;
  } finally {
    boton.disabled = false;
    boton.textContent = "Enviar mi idea";
  }
});

pintarFotos();
pintarTableros();
