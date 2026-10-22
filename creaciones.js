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

// ---------- Invitado ----------
// Con cuenta no se enseña nada aquí: tu correo, tu foto y el estado de la copia
// están en tu cuenta (la foto de la esquina). Solo se avisa a quien va como invitado.

const nube = window.nube;

function pintarCuenta() {
  if (!nube?.activa) return;
  document.getElementById("cuenta").hidden = Boolean(nube.usuario);
}

window.addEventListener("nube:actualizado", pintarCuentas);

Promise.resolve(nube?.listo).then(() => {
  pintarCuenta();
  pintarCuentas();
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
