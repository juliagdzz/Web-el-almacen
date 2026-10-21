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

// Para el taller: acceso al panel con lo que espera (encargos, horneados, bonos)
async function pintarEncargos() {
  if (!nube?.usuario) return;
  try {
    const { data: esAdmin } = await nube.cliente.rpc("es_admin");
    if (!esAdmin) return;
    const { data } = await nube.cliente.rpc("resumen_panel");
    const n = (data?.encargos ?? 0) + (data?.horneados ?? 0) + (data?.bonos ?? 0);
    document.getElementById("texto-panel").textContent = n ? (n === 1 ? "1 cosa por mirar" : `${n} cosas por mirar`) : "Encargos, horneados y talleres";
    const globo = document.getElementById("globo-panel");
    globo.textContent = n > 99 ? "99+" : String(n);
    globo.hidden = !n;
    document.getElementById("enlace-panel").hidden = false;
  } catch {}
}

// Al volver a la app se actualiza el número de encargos nuevos
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && pintarEncargos());

Promise.resolve(nube?.listo).then(() => {
  pintarCuenta();
  pintarCuentas();
  pintarEncargos();
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
