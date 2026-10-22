// Mis creaciones: cuántos tableros, piezas y esmaltes tienes guardados.
// Solo abre las bases de datos que ya existen: abrir una que no existe la crearía
// vacía en versión 1 y tablero.js o piezas.js ya no crearían sus almacenes.

async function contar(base, almacenes) {
  try {
    const bases = await indexedDB.databases();
    if (!bases.some((b) => b.name === base)) return null;
  } catch {
    return null; // navegador sin indexedDB.databases(): mejor no mostrar nada
  }
  const db = await new Promise((ok, mal) => {
    const peticion = indexedDB.open(base);
    peticion.onsuccess = () => ok(peticion.result);
    peticion.onerror = () => mal(peticion.error);
  });
  try {
    const cuentas = {};
    for (const almacen of almacenes) {
      if (!db.objectStoreNames.contains(almacen)) { cuentas[almacen] = 0; continue; }
      cuentas[almacen] = await new Promise((ok, mal) => {
        const peticion = db.transaction(almacen).objectStore(almacen).count();
        peticion.onsuccess = () => ok(peticion.result);
        peticion.onerror = () => mal(peticion.error);
      });
    }
    return cuentas;
  } finally {
    db.close();
  }
}

function escribir(id, n, uno, varios) {
  document.getElementById(id).textContent = n ? `${n} ${n === 1 ? uno : varios}` : "";
}

function pintarCuentas() {
  contar("elalmacen", ["tableros"]).then((c) => c && escribir("cuenta-tableros", c.tableros, "tablero", "tableros")).catch(() => {});
  contar("elalmacen-piezas", ["piezas", "recetas"]).then((c) => {
    if (!c) return;
    escribir("cuenta-piezas", c.piezas, "pieza", "piezas");
    escribir("cuenta-esmaltes", c.recetas, "receta", "recetas");
  }).catch(() => {});
}

// ---------- Cuenta ----------

const nube = window.nube;
const ESTADOS = {
  sincronizando: "Sincronizando…",
  "al-dia": "Todo guardado en tu cuenta ✓",
  pendiente: "Hay cambios esperando para subir",
  "sin-conexion": "Sin conexión: se subirá cuando vuelva internet",
};

function pintarCuenta() {
  if (!nube?.activa) return;
  const caja = document.getElementById("cuenta");
  caja.hidden = false;
  const conCuenta = Boolean(nube.usuario);
  caja.classList.toggle("invitado", !conCuenta);
  document.getElementById("cuenta-texto").textContent = conCuenta
    ? `Has entrado como ${nube.usuario.email}.`
    : "Estás como invitado: lo que guardas está solo en este móvil.";
  document.getElementById("cuenta-estado").textContent = conCuenta ? ESTADOS[nube.estado] ?? "" : "Crea una cuenta para no perderlo y verlo en otros móviles.";
  document.getElementById("cuenta-crear").hidden = conCuenta;
  document.getElementById("cuenta-salir").hidden = !conCuenta;
}

document.getElementById("cuenta-salir").addEventListener("click", async () => {
  if (await nube.salir()) location.replace("entrar.html");
});
window.addEventListener("nube:estado", pintarCuenta);
window.addEventListener("nube:actualizado", pintarCuentas);

// Tu perfil: foto, nombre y, si las ves, las insignias nuevas desde la última vez
async function pintarPerfil() {
  if (!nube?.usuario) return;
  try {
    const [{ data: perfiles }, { data: nuevas }] = await Promise.all([
      nube.cliente.from("perfiles").select("alias,foto,insignias").eq("user_id", nube.usuario.id),
      nube.cliente.from("insignias_ganadas").select("insignia_id").eq("user_id", nube.usuario.id).eq("vista", false),
    ]);
    const perfil = perfiles?.[0] ?? {};
    const avatar = document.getElementById("avatar-perfil");
    if (perfil.foto) {
      const img = document.createElement("img");
      img.src = nube.cliente.storage.from("comunidad").getPublicUrl(perfil.foto).data.publicUrl;
      img.alt = "";
      avatar.replaceChildren(img);
    } else {
      avatar.textContent = (perfil.alias || nube.usuario.email || "?").trim()[0].toUpperCase();
    }
    document.getElementById("nombre-perfil").textContent = perfil.alias || "Tu perfil";
    const n = perfil.insignias === "ocultas" ? 0 : nuevas?.length ?? 0;
    const texto = document.getElementById("texto-perfil");
    texto.textContent = n ? (n === 1 ? "¡Tienes 1 insignia nueva!" : `¡Tienes ${n} insignias nuevas!`) : perfil.insignias === "ocultas" ? "Foto y nombre" : "Foto e insignias";
    texto.classList.toggle("hay-nuevas", n > 0);
    document.getElementById("enlace-perfil").hidden = false;
  } catch {}
}

Promise.resolve(nube?.listo).then(() => {
  pintarCuenta();
  pintarCuentas();
  pintarPerfil();
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
