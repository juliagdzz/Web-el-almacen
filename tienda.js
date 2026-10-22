// Tienda: escaparate de las piezas a la venta (tabla «tienda» de Supabase, fotos
// en el bucket público «tienda»). Todavía no se paga aquí: «Me interesa» lleva a
// Encargos con la pieza ya escrita. Quien gestiona el taller añade y edita las
// piezas desde esta misma página.

const $ = (sel) => document.querySelector(sel);
const euros = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", maximumFractionDigits: 2, minimumFractionDigits: 0 });
const CATEGORIAS = ["Tazas", "Cuencos", "Platos", "Jarrones", "Macetas", "Otras"];
const ESTADOS = { disponible: "Disponible", reservada: "Reservada", vendida: "Vendida", oculta: "Oculta" };
const MAX_FOTOS = 6;
const LADO_MAXIMO = 1600;

let piezas = [];
let categoria = null; // null = todas
let esTaller = false;
let faltaTabla = false;

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

const nube = window.nube;
const urlFoto = (ruta) => nube.cliente.storage.from("tienda").getPublicUrl(ruta).data.publicUrl;
const precioDe = (p) => (p.precio == null ? "A consultar" : euros.format(p.precio));
const agotada = (p) => p.estado === "vendida" || (p.estado === "disponible" && p.unidades === 0);

// ---------- Escaparate ----------

function pintarCategorias() {
  const hay = CATEGORIAS.filter((c) => piezas.some((p) => p.categoria === c));
  const caja = $("#categorias");
  caja.hidden = hay.length < 2;
  if (categoria && !hay.includes(categoria)) categoria = null;
  caja.replaceChildren(...[null, ...hay].map((c) => h("button", {
    type: "button", class: "chip-categoria", "aria-pressed": String(categoria === c),
    onclick: () => { categoria = c; pintar(); },
  }, c ?? "Todo")));
}

function tarjeta(p) {
  const etiqueta = agotada(p) ? "Vendida" : p.estado === "reservada" ? "Reservada" : p.estado === "oculta" ? "Oculta" : null;
  return h("article", { class: `tarjeta-tienda${agotada(p) ? " vendida" : ""}${p.estado === "oculta" ? " oculta" : ""}` },
    h("button", { type: "button", class: "abrir-pieza", "aria-label": `Ver ${p.nombre}`, onclick: () => abrirFicha(p) },
      h("span", { class: "foto-tienda" },
        p.fotos[0] ? h("img", { src: urlFoto(p.fotos[0]), alt: "", loading: "lazy" }) : iconos.el("pieza"),
        etiqueta && h("span", { class: `etiqueta-estado estado-${agotada(p) ? "vendida" : p.estado}` }, etiqueta)),
      h("span", { class: "info-tienda" },
        h("strong", {}, p.nombre),
        h("span", { class: "precio-tienda" }, precioDe(p)))),
    esTaller && h("button", { type: "button", class: "boton texto editar-pieza", onclick: () => abrirEditor(p) }, "Editar"));
}

function pintar() {
  pintarCategorias();
  const lista = $("#lista-tienda");
  const vistas = piezas.filter((p) => !categoria || p.categoria === categoria);
  if (!vistas.length) {
    lista.replaceChildren(h("div", { class: "tienda-vacia" },
      h("h2", {}, "La tienda abre muy pronto"),
      h("p", {}, "Estamos sacando las piezas del horno y haciéndoles fotos. Mientras tanto, si buscas algo concreto, te lo hacemos a medida."),
      h("a", { class: "boton", href: "encargos.html" }, "Pedir una pieza a medida")));
    return;
  }
  // Primero lo que se puede comprar; lo vendido al final
  vistas.sort((a, b) => agotada(a) - agotada(b) || a.orden - b.orden || b.creado.localeCompare(a.creado));
  lista.replaceChildren(...vistas.map(tarjeta));
}

async function cargar() {
  if (!nube?.activa) { piezas = []; return pintar(); }
  const { data, error } = await nube.cliente.from("tienda").select("*");
  faltaTabla = Boolean(error);
  piezas = error ? [] : data;
  pintar();
  pintarBarraTaller();
}

// ---------- Ficha ----------

function abrirFicha(p) {
  const pedir = `encargos.html?pieza=${encodeURIComponent(p.nombre)}${p.precio != null ? `&precio=${p.precio}` : ""}`;
  $("#ficha-pieza").replaceChildren(
    p.fotos.length
      ? h("div", { class: "fotos-ficha" }, p.fotos.map((f, i) => h("img", { src: urlFoto(f), alt: `${p.nombre}, foto ${i + 1} de ${p.fotos.length}` })))
      : h("div", { class: "fotos-ficha sin-fotos" }, iconos.el("pieza")),
    h("p", { class: "categoria-ficha" }, p.categoria),
    h("h2", {}, p.nombre),
    h("p", { class: "precio-ficha" }, precioDe(p),
      agotada(p) ? h("span", { class: "etiqueta-estado estado-vendida" }, "Vendida")
        : p.estado === "reservada" ? h("span", { class: "etiqueta-estado estado-reservada" }, "Reservada")
        : p.unidades > 1 && h("small", {}, `Quedan ${p.unidades}`)),
    p.medidas && h("p", { class: "medidas-ficha" }, p.medidas),
    p.descripcion && h("p", { class: "descripcion-ficha" }, p.descripcion),
    agotada(p)
      ? h("a", { class: "boton", href: `encargos.html?pieza=${encodeURIComponent(`una parecida a «${p.nombre}»`)}` }, "Quiero una parecida")
      : p.estado === "reservada"
        ? h("p", { class: "ayuda" }, "Alguien la tiene apartada. Si al final no se la lleva, vuelve a estar disponible.")
        : h("a", { class: "boton", href: pedir }, "Me interesa"),
    h("p", { class: "ayuda pie-ficha" }, "Se recoge en el taller. El pago en la web llegará pronto."));
  $("#hoja-pieza").showModal();
  $("#hoja-pieza").scrollTop = 0;
}

// ---------- Taller: añadir y editar ----------

let editando = null; // la pieza que se edita (null = nueva)
let fotosEditor = []; // { ruta } ya subida o { blob, url } nueva

function pintarBarraTaller() {
  $("#barra-taller").hidden = !esTaller;
  $("#aviso-taller").textContent = faltaTabla
    ? "Para guardar piezas falta un paso en Supabase: vuelve a ejecutar supabase/esquema.sql (SQL Editor → Run)."
    : "Solo tú ves este botón y los de «Editar».";
}

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

function pintarFotosEditor() {
  $("#fotos-pieza").replaceChildren(...fotosEditor.map((f, i) => h("div", { class: "foto-editor" },
    h("img", { src: f.url ?? urlFoto(f.ruta), alt: `Foto ${i + 1}` }),
    i > 0 && h("button", { type: "button", class: "portada", "aria-label": "Poner de portada",
      onclick: () => { fotosEditor.unshift(...fotosEditor.splice(i, 1)); pintarFotosEditor(); } }, "Portada"),
    h("button", { type: "button", class: "quitar-foto", "aria-label": "Quitar foto",
      onclick: () => { if (f.url) URL.revokeObjectURL(f.url); fotosEditor.splice(i, 1); pintarFotosEditor(); } }, "✕"))));
  $(".anadir-fotos").hidden = fotosEditor.length >= MAX_FOTOS;
}

function abrirEditor(p = null) {
  editando = p;
  $("#titulo-editar").textContent = p ? "Editar pieza" : "Nueva pieza";
  $("#pieza-nombre").value = p?.nombre ?? "";
  $("#pieza-precio").value = p?.precio ?? "";
  $("#pieza-unidades").value = p?.unidades ?? 1;
  $("#pieza-categoria").value = p?.categoria ?? (categoria || "Tazas");
  $("#pieza-estado").value = p?.estado ?? "disponible";
  $("#pieza-medidas").value = p?.medidas ?? "";
  $("#pieza-descripcion").value = p?.descripcion ?? "";
  $("#borrar-pieza").hidden = !p;
  $("#error-pieza").hidden = true;
  fotosEditor = (p?.fotos ?? []).map((ruta) => ({ ruta }));
  pintarFotosEditor();
  $("#hoja-editar").showModal();
}

$("#pieza-categoria").replaceChildren(...CATEGORIAS.map((c) => h("option", { value: c }, c)));
$("#nueva-pieza").addEventListener("click", () => abrirEditor());
$("#hoja-editar [data-cerrar]").addEventListener("click", () => $("#hoja-editar").close());

$("#input-fotos").addEventListener("change", async (e) => {
  const archivos = [...e.target.files].slice(0, MAX_FOTOS - fotosEditor.length);
  e.target.value = "";
  for (const archivo of archivos) {
    try {
      const blob = await prepararImagen(archivo);
      fotosEditor.push({ blob, url: URL.createObjectURL(blob) });
    } catch { avisar("No he podido leer esa imagen"); }
  }
  pintarFotosEditor();
});

function mostrarError(texto) {
  const el = $("#error-pieza");
  el.textContent = texto;
  el.hidden = false;
}

$("#form-pieza").addEventListener("submit", async (e) => {
  e.preventDefault();
  const boton = $("#guardar-pieza");
  boton.disabled = true;
  boton.textContent = "Guardando…";
  $("#error-pieza").hidden = true;
  try {
    const id = editando?.id ?? crypto.randomUUID();
    // Sube las fotos nuevas; las que ya estaban se quedan con su ruta
    const rutas = [];
    for (const f of fotosEditor) {
      if (f.ruta) { rutas.push(f.ruta); continue; }
      const ruta = `${id}/${crypto.randomUUID()}.jpg`;
      const { error } = await nube.cliente.storage.from("tienda").upload(ruta, f.blob, { contentType: "image/jpeg" });
      if (error) throw error;
      rutas.push(ruta);
    }
    const precio = $("#pieza-precio").value.trim();
    const fila = {
      id,
      nombre: $("#pieza-nombre").value.trim(),
      precio: precio === "" ? null : Number(precio.replace(",", ".")),
      unidades: Math.max(0, Number($("#pieza-unidades").value) || 0),
      categoria: $("#pieza-categoria").value,
      estado: $("#pieza-estado").value,
      medidas: $("#pieza-medidas").value.trim() || null,
      descripcion: $("#pieza-descripcion").value.trim() || null,
      fotos: rutas,
    };
    const { error } = await nube.cliente.from("tienda").upsert(fila);
    if (error) throw error;
    // Fotos que se han quitado al editar
    const quitadas = (editando?.fotos ?? []).filter((r) => !rutas.includes(r));
    if (quitadas.length) await nube.cliente.storage.from("tienda").remove(quitadas);
    $("#hoja-editar").close();
    avisar(editando ? "Pieza guardada ✓" : "Pieza añadida a la tienda ✓");
    await cargar();
  } catch (error) {
    mostrarError(faltaTabla || /relation|does not exist|schema cache|bucket/i.test(error?.message ?? "")
      ? "Falta un paso en Supabase: vuelve a ejecutar supabase/esquema.sql y prueba otra vez."
      : "No se ha podido guardar. Revisa la conexión y prueba otra vez.");
  } finally {
    boton.disabled = false;
    boton.textContent = "Guardar";
  }
});

$("#borrar-pieza").addEventListener("click", async () => {
  if (!editando || !confirm(`¿Borrar «${editando.nombre}» de la tienda? No se puede deshacer.`)) return;
  const { error } = await nube.cliente.from("tienda").delete().eq("id", editando.id);
  if (error) return mostrarError("No se ha podido borrar. Prueba otra vez.");
  if (editando.fotos.length) await nube.cliente.storage.from("tienda").remove(editando.fotos);
  $("#hoja-editar").close();
  avisar("Pieza borrada");
  await cargar();
});

// ---------- Arranque ----------

(async () => {
  await cargar();
  if (!nube?.activa) return;
  await nube.listo;
  if (!nube.usuario) return;
  const { data } = await nube.cliente.rpc("es_admin");
  esTaller = Boolean(data);
  if (esTaller) await cargar(); // con permiso de taller se ven también las ocultas
})();
