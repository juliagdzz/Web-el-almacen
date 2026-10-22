// Comunidad: foro para compartir esmaltes, recetas, piezas y problemas.
// Solo para cuentas (nube.js manda a entrar a quien no la tenga); publicar y comentar piden además un nombre público.
// Las reglas (quién toca qué, límites) están en supabase/esquema.sql.
// Rutas: #  (portada) · #p/<id> (una publicación) · #publicar

const $ = (sel) => document.querySelector(sel);
const LADO_MAXIMO = 1600;
const MAX_FOTOS = 6;
const CATEGORIAS = {
  esmaltes: { nombre: "Esmaltes", icono: "🎨" },
  recetas: { nombre: "Recetas", icono: "🧪" },
  problemas: { nombre: "Problemas y soluciones", icono: "🔧" },
  piezas: { nombre: "Piezas", icono: "🏺" },
  charla: { nombre: "Charla", icono: "💬" },
};
const numero = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });

const nube = window.nube;
let usuario = null;
let esAdmin = false;
let alias = null;
let filtro = { categoria: null, orden: "recientes", buscar: "" };
let cargadas = 0;

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

function haceCuanto(iso) {
  const segundos = (Date.now() - new Date(iso)) / 1000;
  if (segundos < 60) return "ahora";
  if (segundos < 3600) return `hace ${Math.floor(segundos / 60)} min`;
  if (segundos < 86400) return `hace ${Math.floor(segundos / 3600)} h`;
  const dias = Math.floor(segundos / 86400);
  if (dias === 1) return "ayer";
  if (dias < 7) return `hace ${dias} días`;
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: dias > 300 ? "numeric" : undefined });
}
const urlFoto = (ruta) => nube.cliente.storage.from("comunidad").getPublicUrl(ruta).data.publicUrl;
const entrarAqui = () => `entrar.html?volver=${encodeURIComponent("/comunidad.html")}`;
const mensajeError = (e) => /fetch|network/i.test(String(e?.message)) ? "No hay conexión. Prueba otra vez." : (e?.message || "Algo ha fallado. Prueba otra vez.");

async function rpc(nombre, args) {
  const { data, error } = await nube.cliente.rpc(nombre, args);
  if (error) throw error;
  return data;
}

function ver(vista) {
  for (const v of ["feed", "publicacion", "publicar"]) $(`#vista-${v}`).hidden = v !== vista;
  $("#cargando").hidden = true;
}

// ---------- Nombre público ----------

async function asegurarAlias() {
  if (alias) return true;
  return new Promise((resolver) => {
    const hoja = $("#hoja-alias");
    $("#error-alias").hidden = true;
    const alCerrar = () => { hoja.removeEventListener("close", alCerrar); resolver(Boolean(alias)); };
    hoja.addEventListener("close", alCerrar);
    hoja.showModal();
  });
}

$("#form-alias").addEventListener("submit", async (e) => {
  e.preventDefault();
  const valor = $("#alias").value.trim();
  if (valor.length < 2) {
    $("#error-alias").textContent = "Escribe al menos 2 letras.";
    $("#error-alias").hidden = false;
    return;
  }
  // Primero se intenta cambiar; si aún no hay perfil, se crea
  const { data: cambiado, error } = await nube.cliente.from("perfiles").update({ alias: valor }).eq("user_id", usuario.id).select("alias");
  const { error: error2 } = !error && cambiado?.length ? { error: null } : await nube.cliente.from("perfiles").insert({ alias: valor });
  if (error2) {
    $("#error-alias").textContent = mensajeError(error2);
    $("#error-alias").hidden = false;
    return;
  }
  alias = valor;
  $("#hoja-alias").close();
});

document.querySelectorAll("[data-cerrar]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));

// ---------- Portada ----------

function pintarCategorias() {
  const opciones = [[null, "Todo"], ...Object.entries(CATEGORIAS).map(([k, c]) => [k, `${c.icono} ${c.nombre}`]), ...(esAdmin ? [["avisos", "⚑ Avisos"]] : [])];
  $("#categorias").replaceChildren(...opciones.map(([clave, nombre]) =>
    h("button", { type: "button", role: "tab", class: "chip-categoria", "aria-selected": String(clave === "avisos" ? filtro.orden === "avisos" : filtro.categoria === clave && filtro.orden !== "avisos"),
      onclick: () => {
        if (clave === "avisos") { filtro.categoria = null; filtro.orden = "avisos"; }
        else { filtro.categoria = clave; if (filtro.orden === "avisos") filtro.orden = "recientes"; }
        $("#orden").value = filtro.orden === "avisos" ? "recientes" : filtro.orden;
        pintarCategorias();
        cargarFeed();
      } }, nombre)));
}

// ---------- Autores: foto y perfil ----------

function avatar(nombre, foto, tamano = "") {
  return h("span", { class: `avatar ${tamano}`, "aria-hidden": "true" },
    foto ? h("img", { src: urlFoto(foto), alt: "", loading: "lazy" }) : (nombre || "?").trim()[0].toUpperCase());
}

function botonAutor(x) {
  return h("button", { type: "button", class: "autor", onclick: () => verPerfil(x) }, avatar(x.autor, x.autor_foto), h("strong", {}, x.autor));
}

// Ficha de una persona: su foto y, si las enseña, sus insignias
async function verPerfil(x) {
  const hoja = $("#hoja-perfil");
  const insignias = h("div", { class: "insignias-publicas" }, h("p", { class: "ayuda" }, "Cargando…"));
  $("#contenido-perfil").replaceChildren(avatar(x.autor, x.autor_foto, "grande"), h("h2", {}, x.autor), insignias);
  hoja.showModal();
  const { data: perfiles } = await nube.cliente.from("perfiles").select("insignias").eq("user_id", x.autor_id);
  const ensena = perfiles?.[0]?.insignias === "publicas";
  if (!ensena) return insignias.replaceChildren(h("p", { class: "ayuda" }, "Sus insignias son privadas."));
  try {
    const ganadas = (await window.insignias.cargar(nube.cliente, x.autor_id)).filter((i) => i.tiene);
    insignias.replaceChildren(ganadas.length
      ? h("ul", {}, ganadas.map((i) => h("li", { title: i.descripcion },
          h("span", { class: "medalla", innerHTML: window.insignias.dibujo(i.id) }), h("small", {}, i.nombre))))
      : h("p", { class: "ayuda" }, "Aún no tiene insignias."));
  } catch {
    insignias.replaceChildren(h("p", { class: "ayuda" }, "No se han podido cargar."));
  }
}

function tarjeta(p) {
  const cat = CATEGORIAS[p.categoria];
  return h("article", { class: "tarjeta-post" },
    botonUtil(p, "vertical"),
    h("a", { class: "cuerpo-post", href: `#p/${p.id}` },
      h("span", { class: "meta-post" },
        h("span", { class: `etiqueta-cat cat-${p.categoria}` }, `${cat.icono} ${cat.nombre}`),
        p.resuelto && h("span", { class: "resuelto" }, "✓ Resuelto"),
        p.adjunto === "receta" && h("span", { class: "con-receta" }, "Receta"),
        p.avisos > 0 && h("span", { class: "con-avisos" }, `⚑ ${p.avisos}`)),
      h("strong", { class: "titulo-post" }, p.titulo),
      p.extracto && h("span", { class: "extracto" }, p.extracto),
      h("span", { class: "pie-post" }, avatar(p.autor, p.autor_foto), `${p.autor} · ${haceCuanto(p.creado)} · 💬 ${p.comentarios}${p.fotos > 1 ? ` · 📷 ${p.fotos}` : ""}`)),
    p.foto && h("a", { class: "miniatura-post", href: `#p/${p.id}`, tabindex: "-1" }, h("img", { src: urlFoto(p.foto), alt: "", loading: "lazy" })));
}

function botonUtil(p, forma) {
  const boton = h("button", { type: "button", class: `util ${forma}${p.mi_voto ? " votado" : ""}`, "aria-pressed": String(Boolean(p.mi_voto)),
    "aria-label": `Útil: ${p.votos}`, title: "Me ha sido útil",
    onclick: async () => {
      if (!usuario) return (location.href = entrarAqui());
      try {
        const r = await rpc("votar", { p_publicacion: p.id });
        p.votos = r.votos;
        p.mi_voto = r.mi_voto;
        boton.replaceWith(botonUtil(p, forma));
      } catch (e) {
        avisar(mensajeError(e));
      }
    } }, h("span", { "aria-hidden": "true" }, "▲"), h("span", {}, String(p.votos)));
  return boton;
}

async function cargarFeed(mas = false) {
  if (!mas) cargadas = 0;
  let lista;
  try {
    lista = await rpc("comunidad_feed", { p_categoria: filtro.categoria, p_orden: filtro.orden, p_buscar: filtro.buscar || null, p_desde: cargadas });
  } catch {
    $("#lista-comunidad").replaceChildren(h("p", { class: "ayuda" }, "Ahora mismo no se puede cargar la comunidad. Prueba en un rato."));
    return;
  }
  cargadas += lista.length;
  const tarjetas = lista.map(tarjeta);
  if (mas) $("#lista-comunidad").append(...tarjetas);
  else $("#lista-comunidad").replaceChildren(...(tarjetas.length ? tarjetas : [h("div", { class: "vacio-comunidad" },
    h("p", {}, filtro.buscar ? `Nada con «${filtro.buscar}» todavía.` : "Aún no hay nada por aquí."),
    h("a", { class: "boton", href: "#publicar" }, "Sé la primera persona en publicar"))]));
  $("#cargar-mas").hidden = lista.length < 30;
}

let temporizadorBuscar;
$("#buscar").addEventListener("input", (e) => {
  clearTimeout(temporizadorBuscar);
  temporizadorBuscar = setTimeout(() => { filtro.buscar = e.target.value.trim(); cargarFeed(); }, 350);
});
$("#orden").addEventListener("change", (e) => { filtro.orden = e.target.value; pintarCategorias(); cargarFeed(); });
$("#cargar-mas").addEventListener("click", () => cargarFeed(true));

// ---------- Una publicación ----------

let actual = null;

function tablaReceta(a) {
  const filas = (a.ingredientes ?? []).filter((f) => f.material);
  const base = filas.filter((f) => !f.anadido).reduce((s, f) => s + (parseFloat(String(f.cantidad).replace(",", ".")) || 0), 0);
  return h("div", { class: "receta-adjunta" },
    h("h3", {}, `🧪 ${a.nombre || "Receta"}`),
    h("p", { class: "ayuda" }, [a.tipo_receta, a.temperatura && `${a.temperatura} ºC`, a.atmosfera].filter(Boolean).join(" · ")),
    filas.length > 0 && h("table", {}, h("tbody", {}, filas.map((f) => {
      const c = parseFloat(String(f.cantidad).replace(",", ".")) || 0;
      return h("tr", {}, h("td", {}, `${f.anadido ? "+ " : ""}${f.material}`), h("td", {}, base ? `${numero.format((c / base) * 100)} %` : String(f.cantidad || "")));
    }))),
    h("button", { type: "button", class: "boton secundario", onclick: () => guardarReceta(a) }, "Guardar en Mis esmaltes"));
}

// Copia la receta a «Mis esmaltes» (piezas.js), en este móvil y en la cuenta
async function guardarReceta(a) {
  const receta = {
    id: crypto.randomUUID(), nombre: a.nombre || "Receta de la comunidad", tipo: a.tipo_receta || "Esmalte",
    temperatura: a.temperatura || "", atmosfera: a.atmosfera || "", unidad: "g", lote: 500,
    ingredientes: (a.ingredientes ?? []).map((f) => ({ material: f.material || "", cantidad: f.cantidad ?? "", anadido: Boolean(f.anadido) })),
    fotos: [], notas: [a.notas, `De la comunidad de El Almacén (${actual?.autor ?? ""}).`].filter(Boolean).join("\n\n"),
    creado: Date.now(), modificado: Date.now(),
  };
  try {
    const db = await new Promise((ok, mal) => {
      const peticion = indexedDB.open("elalmacen-piezas", 1);
      peticion.onupgradeneeded = () => {
        peticion.result.createObjectStore("piezas", { keyPath: "id" });
        peticion.result.createObjectStore("recetas", { keyPath: "id" });
      };
      peticion.onsuccess = () => ok(peticion.result);
      peticion.onerror = () => mal(peticion.error);
    });
    await new Promise((ok, mal) => {
      const tx = db.transaction("recetas", "readwrite");
      tx.objectStore("recetas").put(receta);
      tx.oncomplete = ok;
      tx.onerror = () => mal(tx.error);
    });
    db.close();
    nube.guardado?.("recetas", receta);
    avisar("Guardada en Mis esmaltes");
  } catch {
    avisar("No se ha podido guardar la receta");
  }
}

async function abrirPublicacion(id) {
  let p;
  try { p = await rpc("comunidad_publicacion", { p_id: id }); } catch { p = null; }
  if (!p) {
    avisar("Esa publicación ya no existe");
    location.hash = "";
    return;
  }
  actual = p;
  const cat = CATEGORIAS[p.categoria];
  document.title = `${p.titulo} · Comunidad · El Almacén`;
  $("#publicacion").replaceChildren(...[
    h("p", { class: "meta-post" }, h("span", { class: `etiqueta-cat cat-${p.categoria}` }, `${cat.icono} ${cat.nombre}`), p.solucion && h("span", { class: "resuelto" }, "✓ Resuelto")),
    h("h1", {}, p.titulo),
    h("p", { class: "autor-post" }, botonAutor(p), ` · ${haceCuanto(p.creado)}${p.editado ? " · editado" : ""}`),
    p.fotos.length > 0 && h("div", { class: `fotos-post n${Math.min(p.fotos.length, 3)}` },
      p.fotos.map((f, i) => h("a", { href: urlFoto(f), target: "_blank", rel: "noopener" }, h("img", { src: urlFoto(f), alt: `Foto ${i + 1}` })))),
    p.cuerpo && h("p", { class: "texto-post" }, p.cuerpo),
    p.adjunto?.tipo === "receta" && tablaReceta(p.adjunto),
    h("div", { class: "acciones-post" },
      botonUtil(p, "horizontal"),
      h("button", { type: "button", class: "boton texto", onclick: () => compartir({ titulo: p.titulo, texto: `${p.titulo} · Comunidad de El Almacén\n${location.href}`, avisar }) }, "Compartir"),
      usuario && !p.es_mia && h("button", { type: "button", class: "boton texto", onclick: () => abrirAviso() }, "Avisar al taller"),
      p.puede_borrar && h("button", { type: "button", class: "boton texto peligro", onclick: () => borrarPublicacion(p) }, "Borrar")),
    esAdmin && p.avisos?.length > 0 && h("div", { class: "avisos-admin" },
      h("strong", {}, `⚑ ${p.avisos.length === 1 ? "1 aviso" : `${p.avisos.length} avisos`}`),
      h("ul", {}, p.avisos.map((a) => h("li", {}, a.motivo || "Sin motivo"))),
      h("button", { type: "button", class: "boton pequeno secundario", onclick: async () => {
        const { error } = await nube.cliente.from("avisos").delete().eq("publicacion_id", p.id);
        if (error) return avisar("No se ha podido");
        avisar("Avisos descartados");
        abrirPublicacion(p.id);
      } }, "Está bien: descartar avisos")),
  ].filter((x) => x != null && x !== false && x !== "")); // los apartados que no tocan, fuera
  pintarComentarios(p);
  ver("publicacion");
  scrollTo(0, 0);
}

function pintarComentarios(p) {
  $("#titulo-comentarios").textContent = p.comentarios.length === 1 ? "1 comentario" : `${p.comentarios.length} comentarios`;
  // La solución, primero
  const orden = [...p.comentarios].sort((a, b) => (b.id === p.solucion) - (a.id === p.solucion));
  $("#lista-comentarios").replaceChildren(...orden.map((c) => h("li", { class: `comentario${c.id === p.solucion ? " solucion" : ""}` },
    c.id === p.solucion && h("span", { class: "marca-solucion" }, "✓ Esto lo resolvió"),
    h("p", { class: "autor-comentario" }, botonAutor(c), c.del_autor && h("span", { class: "insignia" }, "autor"), ` · ${haceCuanto(c.creado)}`),
    h("p", { class: "texto-comentario" }, c.cuerpo),
    h("div", { class: "acciones-comentario" },
      p.es_mia && p.categoria === "problemas" && !c.del_autor && h("button", { type: "button", class: "boton texto", onclick: async () => {
        try {
          await rpc("marcar_solucion", { p_publicacion: p.id, p_comentario: c.id === p.solucion ? null : c.id });
          abrirPublicacion(p.id);
        } catch (e) { avisar(mensajeError(e)); }
      } }, c.id === p.solucion ? "Quitar como solución" : "Marcar como solución"),
      c.puede_borrar && h("button", { type: "button", class: "boton texto peligro", onclick: async () => {
        if (!confirm("¿Borrar este comentario?")) return;
        const { error } = await nube.cliente.from("comentarios").delete().eq("id", c.id);
        if (error) return avisar("No se ha podido borrar");
        abrirPublicacion(p.id);
      } }, "Borrar")))));
  $("#form-comentario").hidden = !usuario;
  $("#entrar-comentar").hidden = Boolean(usuario);
  if (!usuario) $("#entrar-comentar").replaceChildren("Para comentar, ", h("a", { href: entrarAqui() }, "entra con tu cuenta"), ".");
}

$("#form-comentario").addEventListener("submit", async (e) => {
  e.preventDefault();
  const texto = $("#texto-comentario").value.trim();
  if (!texto || !actual) return;
  if (!(await asegurarAlias())) return;
  const boton = e.target.querySelector("button");
  boton.disabled = true;
  const { error } = await nube.cliente.from("comentarios").insert({ publicacion_id: actual.id, cuerpo: texto });
  boton.disabled = false;
  if (error) return avisar(mensajeError(error));
  $("#texto-comentario").value = "";
  avisar("Comentario publicado");
  abrirPublicacion(actual.id);
});

async function borrarPublicacion(p) {
  if (!confirm(`¿Borrar «${p.titulo}»? También se borran sus comentarios.`)) return;
  if (p.fotos.length) await nube.cliente.storage.from("comunidad").remove(p.fotos);
  const { error } = await nube.cliente.from("publicaciones").delete().eq("id", p.id);
  if (error) return avisar("No se ha podido borrar");
  avisar("Publicación borrada");
  location.hash = "";
}

function abrirAviso() {
  $("#motivo-aviso").value = "";
  $("#hoja-aviso").showModal();
}
$("#form-aviso").addEventListener("submit", async (e) => {
  e.preventDefault();
  const { error } = await nube.cliente.from("avisos").insert({ publicacion_id: actual.id, motivo: $("#motivo-aviso").value.trim() || null });
  $("#hoja-aviso").close();
  avisar(error ? mensajeError(error) : "Gracias: el taller lo revisará");
});

// ---------- Publicar ----------

const nueva = { categoria: "esmaltes", fotos: [], adjunto: null };

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

function pintarCategoriasNueva() {
  $("#elegir-categoria").replaceChildren(...Object.entries(CATEGORIAS).map(([clave, c]) =>
    h("button", { type: "button", class: "chip-categoria", "aria-pressed": String(nueva.categoria === clave), onclick: () => { nueva.categoria = clave; pintarCategoriasNueva(); } }, `${c.icono} ${c.nombre}`)));
}

function pintarFotosNueva() {
  $("#p-fotos").replaceChildren(...nueva.fotos.map((f, i) => h("div", { class: "foto-publicar" },
    h("img", { src: f.url, alt: `Foto ${i + 1}` }),
    h("button", { type: "button", class: "quitar-foto", "aria-label": "Quitar foto", onclick: () => { URL.revokeObjectURL(f.url); nueva.fotos.splice(i, 1); pintarFotosNueva(); } }, "✕"))));
  $(".subir-fotos").hidden = nueva.fotos.length >= MAX_FOTOS;
}

$("#p-input-fotos").addEventListener("change", async (e) => {
  for (const archivo of [...e.target.files].slice(0, MAX_FOTOS - nueva.fotos.length)) {
    try {
      const blob = await prepararImagen(archivo);
      nueva.fotos.push({ blob, url: URL.createObjectURL(blob) });
    } catch { avisar("No he podido leer una de las imágenes"); }
  }
  e.target.value = "";
  pintarFotosNueva();
});

// Piezas y recetas de Mis creaciones (piezas.js las guarda en este móvil)
async function leerMisCreaciones() {
  try {
    if (!(await indexedDB.databases()).some((b) => b.name === "elalmacen-piezas")) return { piezas: [], recetas: [] };
  } catch { return { piezas: [], recetas: [] }; }
  const db = await new Promise((ok, mal) => { const r = indexedDB.open("elalmacen-piezas"); r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error); });
  const todos = (almacen) => new Promise((ok) => {
    if (!db.objectStoreNames.contains(almacen)) return ok([]);
    const r = db.transaction(almacen).objectStore(almacen).getAll();
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ok([]);
  });
  const resultado = { piezas: await todos("piezas"), recetas: await todos("recetas") };
  db.close();
  return resultado;
}

const nombreCapa = (c) => [c.codigo, c.nombre].filter(Boolean).join(" · ") || "Esmalte";
function textoPieza(p) {
  return [
    [p.pasta && `Pasta: ${p.pasta}`, (p.temperatura || p.atmosfera) && `Cocción: ${[p.temperatura && `${p.temperatura} ºC`, p.atmosfera?.toLowerCase()].filter(Boolean).join(", ")}`].filter(Boolean).join("\n"),
    p.capas?.length && `Esmaltes:\n${p.capas.map((c, i) => `${i + 1}. ${nombreCapa(c)}${c.origen === "prodesco" ? " (Prodesco)" : ""}${c.nota ? `: ${c.nota}` : ""}`).join("\n")}`,
    p.tecnicas?.length && `Técnicas: ${p.tecnicas.join(", ")}`,
    p.notas,
  ].filter(Boolean).join("\n\n");
}

function elegirAdjunto(tipo, x) {
  if (tipo === "pieza") {
    nueva.categoria = "piezas";
    $("#p-titulo").value = x.nombre || "Mi pieza";
    $("#p-cuerpo").value = textoPieza(x);
    nueva.adjunto = { tipo: "pieza", nombre: x.nombre || "" };
    nueva.fotos.forEach((f) => URL.revokeObjectURL(f.url));
    nueva.fotos = (x.fotos ?? []).filter((f) => f instanceof Blob).slice(0, MAX_FOTOS).map((blob) => ({ blob, url: URL.createObjectURL(blob) }));
  } else {
    nueva.categoria = "recetas";
    $("#p-titulo").value = x.nombre || "Mi receta";
    $("#p-cuerpo").value = x.notas || "";
    nueva.adjunto = {
      tipo: "receta", nombre: x.nombre || "", tipo_receta: x.tipo || "", temperatura: x.temperatura || "", atmosfera: x.atmosfera || "",
      ingredientes: (x.ingredientes ?? []).filter((f) => f.material).map((f) => ({ material: f.material, cantidad: f.cantidad, anadido: Boolean(f.anadido) })),
      notas: x.notas || "",
    };
    nueva.fotos.forEach((f) => URL.revokeObjectURL(f.url));
    nueva.fotos = (x.fotos ?? []).filter((f) => f instanceof Blob).slice(0, MAX_FOTOS).map((blob) => ({ blob, url: URL.createObjectURL(blob) }));
  }
  $("#adjunto-elegido").replaceChildren(
    h("span", {}, `${tipo === "pieza" ? "🏺" : "🧪"} Compartes ${tipo === "pieza" ? "tu pieza" : "tu receta"} «${x.nombre || "sin nombre"}»${tipo === "receta" ? " con sus proporciones" : ""}.`),
    h("button", { type: "button", class: "boton texto", onclick: () => { nueva.adjunto = null; $("#adjunto-elegido").hidden = true; } }, "Quitar"));
  $("#adjunto-elegido").hidden = false;
  pintarCategoriasNueva();
  pintarFotosNueva();
}

async function abrirPublicar() {
  if (!usuario) return (location.href = entrarAqui());
  ver("publicar");
  pintarCategoriasNueva();
  pintarFotosNueva();
  const mias = await leerMisCreaciones();
  const opciones = [
    ...mias.piezas.map((x) => ["pieza", x]),
    ...mias.recetas.map((x) => ["receta", x]),
  ];
  $("#lista-adjuntar").replaceChildren(
    botonNuevo(),
    ...opciones.slice(0, 30).map(([tipo, x]) => {
    const foto = (x.fotos ?? []).find((f) => f instanceof Blob);
    return h("button", { type: "button", class: "opcion-adjuntar", onclick: () => elegirAdjunto(tipo, x) },
      foto ? h("img", { src: URL.createObjectURL(foto), alt: "" }) : h("span", { class: "sin-foto" }, tipo === "pieza" ? "🏺" : "🧪"),
      h("span", {}, x.nombre || (tipo === "pieza" ? "Pieza sin nombre" : "Receta sin nombre")));
    }));
  // Viene de «Compartir en la comunidad» en una pieza o una receta
  try {
    const pedido = JSON.parse(sessionStorage.getItem("compartirComunidad"));
    sessionStorage.removeItem("compartirComunidad");
    const x = pedido && (pedido.almacen === "piezas" ? mias.piezas : mias.recetas).find((y) => y.id === pedido.id);
    if (x) elegirAdjunto(pedido.almacen === "piezas" ? "pieza" : "receta", x);
  } catch {}
  // Lo que ya habías escrito antes de ir a crear la pieza o el esmalte
  try {
    const borrador = JSON.parse(sessionStorage.getItem("borradorComunidad"));
    sessionStorage.removeItem("borradorComunidad");
    if (borrador?.titulo) $("#p-titulo").value = borrador.titulo;
    if (borrador?.cuerpo) $("#p-cuerpo").value = borrador.cuerpo;
  } catch {}
}

// «Nuevo»: con la misma forma que las piezas guardadas. Pregunta si es una pieza
// o un esmalte, se crea en Mis creaciones y, al darle a «Listo», vuelve aquí ya
// puesto. Lo escrito se guarda mientras tanto.
function botonNuevo() {
  return h("button", { type: "button", class: "opcion-adjuntar nueva", onclick: () => $("#hoja-nuevo").showModal() },
    h("span", { class: "ilustracion-nueva" }, h("img", { src: "ilustracion-pieza.svg", alt: "" }), h("span", { class: "mas", "aria-hidden": "true" }, "+")),
    h("span", {}, "Nuevo"));
}

document.querySelectorAll("#hoja-nuevo [data-crear]").forEach((b) => b.addEventListener("click", () => {
  if (nueva.fotos.length && !nueva.adjunto && !confirm("Las fotos que has añadido aquí se quitarán. ¿Seguir?")) return;
  try {
    sessionStorage.setItem("creandoParaComunidad", "1");
    sessionStorage.setItem("borradorComunidad", JSON.stringify({ titulo: $("#p-titulo").value, cuerpo: $("#p-cuerpo").value }));
  } catch {}
  location.href = b.dataset.crear === "pieza" ? "piezas.html#/pieza/nueva" : "piezas.html#/esmalte/nuevo";
}));

$("#form-publicar").addEventListener("submit", async (e) => {
  e.preventDefault();
  const error = (texto) => { $("#error-publicar").textContent = texto; $("#error-publicar").hidden = false; };
  $("#error-publicar").hidden = true;
  const titulo = $("#p-titulo").value.trim();
  if (titulo.length < 3) return error("Ponle un título (al menos 3 letras).");
  if (!(await asegurarAlias())) return;
  const boton = $("#enviar-publicar");
  boton.disabled = true;
  boton.textContent = "Publicando…";
  try {
    const rutas = [];
    for (const f of nueva.fotos) {
      const ruta = `${usuario.id}/${crypto.randomUUID()}.jpg`;
      const { error: fallo } = await nube.cliente.storage.from("comunidad").upload(ruta, f.blob, { contentType: "image/jpeg", upsert: false });
      if (fallo) throw fallo;
      rutas.push(ruta);
    }
    const { data, error: fallo } = await nube.cliente.from("publicaciones")
      .insert({ categoria: nueva.categoria, titulo, cuerpo: $("#p-cuerpo").value.trim(), fotos: rutas, adjunto: nueva.adjunto })
      .select("id").single();
    if (fallo) throw fallo;
    e.target.reset();
    nueva.fotos.forEach((f) => URL.revokeObjectURL(f.url));
    Object.assign(nueva, { categoria: "esmaltes", fotos: [], adjunto: null });
    $("#adjunto-elegido").hidden = true;
    avisar("¡Publicado!");
    location.hash = `#p/${data.id}`;
  } catch (err) {
    error(/row-level security/i.test(String(err?.message)) ? "Has publicado mucho hoy: prueba mañana." : mensajeError(err));
  } finally {
    boton.disabled = false;
    boton.textContent = "Publicar";
  }
});

// ---------- Rutas y arranque ----------

async function enrutar() {
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  const ruta = location.hash.replace(/^#/, "");
  if (ruta.startsWith("p/")) return abrirPublicacion(ruta.slice(2));
  if (ruta === "publicar") return abrirPublicar();
  if (ruta === "avisos" && esAdmin) { filtro.categoria = null; filtro.orden = "avisos"; }
  document.title = "Comunidad · El Almacén";
  ver("feed");
  pintarCategorias();
  await cargarFeed();
}

(async () => {
  if (!nube?.activa) {
    $("#cargando").textContent = "La comunidad estará disponible muy pronto.";
    return;
  }
  await nube.listo;
  usuario = nube.usuario;
  if (usuario) {
    const [{ data: admin }, { data: perfil }] = await Promise.all([
      nube.cliente.rpc("es_admin"),
      nube.cliente.from("perfiles").select("alias").eq("user_id", usuario.id),
    ]);
    esAdmin = Boolean(admin);
    alias = perfil?.[0]?.alias ?? null;
    $("#alias").value = alias ?? "";
  }
  window.addEventListener("hashchange", enrutar);
  enrutar();
})();

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
