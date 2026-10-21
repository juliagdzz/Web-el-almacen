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
  const seccion = $("#seccion-insignias");
  seccion.hidden = perfil.insignias === "ocultas";
  if (seccion.hidden) return;
  let lista;
  try {
    lista = await window.insignias.cargar(nube.cliente, nube.usuario.id);
  } catch {
    $("#insignias").replaceChildren(h("p", { class: "nota" }, "No se han podido cargar las insignias."));
    return;
  }
  const ganadas = lista.filter((i) => i.tiene).length;
  $("#cuenta-insignias").textContent = `${ganadas} de ${lista.length}`;
  $("#insignias").replaceChildren(...Object.entries(window.insignias.GRUPOS).map(([grupo, titulo]) => {
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
    nube.cliente.from("insignias_ganadas").update({ vista: true }).eq("user_id", nube.usuario.id).eq("vista", false).then(() => {});
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

// ---------- Arranque ----------

Promise.resolve(nube?.listo).then(async () => {
  const estado = $("#estado-perfil");
  if (!nube?.usuario) {
    estado.replaceChildren("Para tener foto e insignias necesitas una cuenta. ",
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
  estado.hidden = true;
  $("#contenido-perfil").hidden = false;
  pintarInsignias();
});
