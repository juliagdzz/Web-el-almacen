// Cuentas y copia en la nube con Supabase.
// Lo que guardas sigue yendo primero al móvil (IndexedDB y localStorage) y desde
// aquí se sube a tu cuenta y se baja en tus otros móviles. Sin cuenta (invitado)
// o sin configurar (nube-config.js vacío) todo se queda solo en este móvil.

(() => {
  const CONFIG = window.NUBE_CONFIG ?? {};
  const activa = Boolean(CONFIG.url && CONFIG.clave && window.supabase);
  const CLAVE_SESION = "almacen-sesion";
  // Las páginas de Mis creaciones piden elegir cuenta o invitado
  const PRIVADA = /\/(creaciones|inspiracion|piezas|medidas|perfil)(\.html)?$/.test(location.pathname);

  const ls = {
    leer(clave, porDefecto) {
      try { const v = localStorage.getItem(clave); return v == null ? porDefecto : JSON.parse(v); } catch { return porDefecto; }
    },
    escribir(clave, valor) { try { localStorage.setItem(clave, JSON.stringify(valor)); } catch {} },
    borrar(clave) { try { localStorage.removeItem(clave); } catch {} },
  };
  const haySesion = () => { try { return Boolean(localStorage.getItem(CLAVE_SESION)); } catch { return false; } };
  const esInvitado = () => ls.leer("modoInvitado", false) === true;

  const nube = {
    activa,
    usuario: null,
    estado: "",
    listo: Promise.resolve(),
    esInvitado,
    guardado() {},
    borrado() {},
  };
  window.nube = nube;
  if (!activa) return;

  if (PRIVADA && !haySesion() && !esInvitado()) {
    location.replace(`entrar.html?volver=${encodeURIComponent(location.pathname + location.search + location.hash)}`);
    nube.listo = new Promise(() => {}); // que la página no arranque mientras se va
    return;
  }

  const cliente = window.supabase.createClient(CONFIG.url, CONFIG.clave, {
    auth: { storageKey: CLAVE_SESION, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  nube.cliente = cliente;

  // ---------- Bases de datos del móvil ----------

  const BASES = { tableros: "elalmacen", pins: "elalmacen", piezas: "elalmacen-piezas", recetas: "elalmacen-piezas" };
  // Igual que en tablero.js y piezas.js: si la base aún no existe, se crea completa
  const ESQUEMAS = {
    elalmacen(db) {
      db.createObjectStore("tableros", { keyPath: "id" });
      db.createObjectStore("pins", { keyPath: "id" }).createIndex("tablero", "tableroId");
    },
    "elalmacen-piezas"(db) {
      db.createObjectStore("piezas", { keyPath: "id" });
      db.createObjectStore("recetas", { keyPath: "id" });
    },
  };
  // Ajustes de localStorage que también viajan con la cuenta
  const AJUSTES = ["seriesFavoritas", "listasPropias", "medidas"];

  const abiertas = {};
  function abrir(base) {
    abiertas[base] ??= new Promise((ok, mal) => {
      const peticion = indexedDB.open(base, 1);
      peticion.onupgradeneeded = () => ESQUEMAS[base](peticion.result);
      peticion.onsuccess = () => ok(peticion.result);
      peticion.onerror = () => mal(peticion.error);
    });
    return abiertas[base];
  }
  async function idb(almacen, modo, fn) {
    const db = await abrir(BASES[almacen]);
    return new Promise((ok, mal) => {
      const tx = db.transaction(almacen, modo);
      const peticion = fn(tx.objectStore(almacen));
      tx.oncomplete = () => ok(peticion?.result);
      tx.onerror = () => mal(tx.error);
    });
  }
  const local = {
    leer: (almacen, id) => idb(almacen, "readonly", (s) => s.get(id)),
    todos: (almacen) => idb(almacen, "readonly", (s) => s.getAll()),
    contar: (almacen) => idb(almacen, "readonly", (s) => s.count()),
    poner: (almacen, obj) => idb(almacen, "readwrite", (s) => s.put(obj)),
    quitar: (almacen, id) => idb(almacen, "readwrite", (s) => s.delete(id)),
    vaciar: (almacen) => idb(almacen, "readwrite", (s) => s.clear()),
  };

  // ---------- Fotos ----------
  // En la nube cada foto se guarda una vez, con su huella como nombre; en los
  // datos queda { $foto: ruta } en lugar de la imagen.

  const subidas = new Set();
  const bajadas = new Map();

  async function huella(blob) {
    const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
    return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  async function subirFoto(blob) {
    const ruta = `${nube.usuario.id}/${await huella(blob)}`;
    if (!subidas.has(ruta)) {
      const { error } = await cliente.storage.from("fotos").upload(ruta, blob, { contentType: blob.type || "image/jpeg", upsert: false });
      if (error && !(String(error.statusCode) === "409" || /exist|duplicate/i.test(error.message))) throw error;
      subidas.add(ruta);
    }
    return { $foto: ruta, tipo: blob.type };
  }
  async function bajarFoto(ref) {
    if (!bajadas.has(ref.$foto)) {
      const { data, error } = await cliente.storage.from("fotos").download(ref.$foto);
      if (error) throw error;
      bajadas.set(ref.$foto, data.type ? data : new Blob([data], { type: ref.tipo || "image/jpeg" }));
      subidas.add(ref.$foto);
    }
    return bajadas.get(ref.$foto);
  }
  // Copia el objeto cambiando las fotos (Blob ⇄ { $foto })
  async function recorrer(valor, alBlob, alRef) {
    if (valor instanceof Blob) return alBlob(valor);
    if (Array.isArray(valor)) return Promise.all(valor.map((v) => recorrer(v, alBlob, alRef)));
    if (valor && typeof valor === "object") {
      if (typeof valor.$foto === "string") return alRef(valor);
      const copia = {};
      for (const [clave, v] of Object.entries(valor)) copia[clave] = await recorrer(v, alBlob, alRef);
      return copia;
    }
    return valor;
  }

  // ---------- Cambios pendientes de subir ----------
  // { "almacen/id": marca }. Se quita al subir, si no ha vuelto a cambiar entre medias.

  const pendientes = () => ls.leer("nubePendientes", {});
  function marcar(almacen, id) {
    const p = pendientes();
    p[`${almacen}/${id}`] = Date.now() + Math.random();
    ls.escribir("nubePendientes", p);
  }
  function desmarcar(clave, marca) {
    const p = pendientes();
    if (p[clave] === marca) { delete p[clave]; ls.escribir("nubePendientes", p); }
  }
  // Versión de cada registro que ya tiene este móvil, para no bajar dos veces lo mismo
  const versiones = () => ls.leer("nubeVersiones", {});
  function apuntarVersion(clave, actualizado) {
    const v = versiones();
    v[clave] = actualizado;
    ls.escribir("nubeVersiones", v);
  }

  // Los ajustes no avisan al cambiar: se comparan con lo último que se subió
  function revisarAjustes() {
    const subidos = ls.leer("nubeAjustes", {});
    for (const clave of AJUSTES) {
      let actual = null;
      try { actual = localStorage.getItem(clave); } catch {}
      if ((subidos[clave] ?? null) !== actual) marcar("ajustes", clave);
    }
  }
  function apuntarAjuste(clave, texto) {
    const subidos = ls.leer("nubeAjustes", {});
    subidos[clave] = texto;
    ls.escribir("nubeAjustes", subidos);
  }

  // ---------- Sincronizar ----------

  function ponerEstado(estado) {
    nube.estado = estado;
    window.dispatchEvent(new CustomEvent("nube:estado", { detail: estado }));
  }

  let subiendo = null;
  function subirPendientes() {
    subiendo ??= (async () => {
      await null; // que «subiendo» quede asignado antes de que el finally lo limpie
      try {
        for (const [clave, marca] of Object.entries(pendientes())) {
          const corte = clave.indexOf("/");
          const almacen = clave.slice(0, corte);
          const id = clave.slice(corte + 1);
          let obj;
          let texto = null;
          if (almacen === "ajustes") {
            try { texto = localStorage.getItem(id); } catch {}
            obj = texto == null ? null : { valor: texto };
          } else if (BASES[almacen]) {
            obj = await local.leer(almacen, id);
          } else {
            desmarcar(clave, marca);
            continue;
          }
          const fila = {
            user_id: nube.usuario.id, almacen, id,
            borrado: obj == null,
            datos: obj == null ? null : await recorrer(obj, subirFoto, (ref) => ref),
          };
          const { data, error } = await cliente.from("registros").upsert(fila).select("actualizado").single();
          if (error) throw error;
          apuntarVersion(clave, data.actualizado);
          if (almacen === "ajustes") apuntarAjuste(id, texto);
          desmarcar(clave, marca);
        }
      } finally {
        subiendo = null;
      }
    })();
    return subiendo;
  }

  async function bajarCambios() {
    const claveDesde = `nubeDesde:${nube.usuario.id}`;
    const desde = ls.leer(claveDesde, null);
    // Un minuto de margen por si algo se guardó a la vez desde otro móvil
    const corte = desde ? new Date(new Date(desde).getTime() - 60_000).toISOString() : "1970-01-01T00:00:00Z";
    let ultimo = desde;
    let cambios = 0;
    const PAGINA = 200;
    for (let desdeFila = 0; ; desdeFila += PAGINA) {
      const { data, error } = await cliente.from("registros")
        .select("almacen,id,datos,borrado,actualizado")
        .gt("actualizado", corte)
        .order("actualizado", { ascending: true })
        .range(desdeFila, desdeFila + PAGINA - 1);
      if (error) throw error;
      const enEspera = pendientes();
      const conocidas = versiones();
      for (const fila of data) {
        const clave = `${fila.almacen}/${fila.id}`;
        if (!ultimo || fila.actualizado > ultimo) ultimo = fila.actualizado;
        if (conocidas[clave] === fila.actualizado) continue; // ya la tengo
        if (enEspera[clave]) continue; // lo de este móvil es más nuevo: se sube luego
        if (fila.almacen === "ajustes") {
          const texto = fila.borrado ? null : fila.datos?.valor ?? null;
          try { texto == null ? localStorage.removeItem(fila.id) : localStorage.setItem(fila.id, texto); } catch {}
          apuntarAjuste(fila.id, texto);
        } else if (BASES[fila.almacen]) {
          if (fila.borrado) await local.quitar(fila.almacen, fila.id);
          else await local.poner(fila.almacen, await recorrer(fila.datos, (b) => b, bajarFoto));
        } else continue;
        apuntarVersion(clave, fila.actualizado);
        cambios++;
      }
      if (data.length < PAGINA) break;
    }
    if (ultimo) ls.escribir(claveDesde, ultimo);
    return cambios;
  }

  let sincronizando = null;
  function sincronizar() {
    if (!nube.usuario || !navigator.onLine) return Promise.resolve(0);
    sincronizando ??= (async () => {
      await null; // igual que en subirPendientes
      ponerEstado("sincronizando");
      try {
        revisarAjustes();
        await subirPendientes();
        const cambios = await bajarCambios();
        ponerEstado(Object.keys(pendientes()).length ? "pendiente" : "al-dia");
        if (cambios) window.dispatchEvent(new CustomEvent("nube:actualizado", { detail: cambios }));
        return cambios;
      } catch (e) {
        console.warn("No se ha podido sincronizar", e);
        ponerEstado("sin-conexion");
        return 0;
      } finally {
        sincronizando = null;
      }
    })();
    return sincronizando;
  }

  let temporizador;
  function programarSubida() {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      if (!nube.usuario || !navigator.onLine) return;
      ponerEstado("sincronizando");
      subirPendientes()
        .then(() => ponerEstado(Object.keys(pendientes()).length ? "pendiente" : "al-dia"))
        .catch((e) => { console.warn("No se ha podido subir", e); ponerEstado("sin-conexion"); });
    }, 1500);
  }

  // tablero.js y piezas.js avisan de cada cambio
  nube.guardado = (almacen, obj) => {
    if (!haySesion() || !BASES[almacen] || !obj?.id) return;
    marcar(almacen, obj.id);
    programarSubida();
  };
  nube.borrado = (almacen, id) => {
    if (!haySesion() || !BASES[almacen]) return;
    marcar(almacen, id);
    programarSubida();
  };

  // ---------- Cuenta ----------

  // Lo que hay en este móvil sin dueño (de cuando se usó como invitado)
  nube.contarLocal = async () => {
    let total = 0;
    for (const almacen of ["tableros", "piezas", "recetas"]) total += await local.contar(almacen);
    return total;
  };
  // Al entrar: ¿de quién es lo que hay guardado en este móvil?
  // Devuelve "listo" o "preguntar" (hay cosas de invitado: ¿subirlas o descartarlas?)
  nube.prepararCuenta = async () => {
    const dueno = ls.leer("nubeDueno", null);
    if (dueno === nube.usuario.id) return "listo";
    if (dueno) await borrarLocal(); // de otra cuenta: no se mezcla
    else if (await nube.contarLocal()) return "preguntar";
    ls.escribir("nubeDueno", nube.usuario.id);
    return "listo";
  };
  nube.subirLoDeInvitado = async () => {
    for (const almacen of Object.keys(BASES)) {
      for (const obj of await local.todos(almacen)) marcar(almacen, obj.id);
    }
    ls.escribir("nubeDueno", nube.usuario.id);
    ls.borrar("modoInvitado");
    await sincronizar();
  };
  nube.descartarLoDeInvitado = async () => {
    await borrarLocal();
    ls.escribir("nubeDueno", nube.usuario.id);
    ls.borrar("modoInvitado");
  };

  async function borrarLocal() {
    for (const almacen of Object.keys(BASES)) await local.vaciar(almacen);
    for (const clave of [...AJUSTES, "ultimoTablero", "nubePendientes", "nubeVersiones", "nubeAjustes", "nubeDueno"]) ls.borrar(clave);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const clave = localStorage.key(i);
      if (clave?.startsWith("nubeDesde:")) ls.borrar(clave);
    }
  }

  // Al salir se sube lo que falte y se borra lo de este móvil (está en la nube)
  nube.salir = async () => {
    try { await sincronizar(); } catch {}
    const quedan = Object.keys(pendientes()).length;
    if (quedan && !confirm(`Hay ${quedan === 1 ? "1 cambio" : `${quedan} cambios`} sin subir a tu cuenta (¿estás sin conexión?). Si sales ahora, se pierden. ¿Salir igualmente?`)) return false;
    await cliente.auth.signOut();
    await borrarLocal();
    ls.borrar("modoInvitado");
    return true;
  };

  // ---------- Arranque ----------

  nube.listo = (async () => {
    try {
      const { data } = await cliente.auth.getSession();
      nube.usuario = data.session?.user ?? null;
    } catch {}
    window.dispatchEvent(new CustomEvent("nube:sesion", { detail: { usuario: nube.usuario } }));
    if (/\/entrar(\.html)?$/.test(location.pathname)) return;
    if (!nube.usuario) {
      // La sesión ha caducado: hay que volver a entrar
      if (PRIVADA && !esInvitado()) {
        location.replace(`entrar.html?volver=${encodeURIComponent(location.pathname + location.hash)}`);
        return new Promise(() => {});
      }
      return;
    }
    if ((await nube.prepararCuenta()) === "preguntar") {
      // Hay cosas de invitado sin decidir: lo pregunta la página de entrar
      location.replace(`entrar.html?volver=${encodeURIComponent(location.pathname + location.hash)}`);
      return new Promise(() => {});
    }
    // La primera vez en este móvil se espera a tener los datos; después no hace falta
    const primeraVez = !ls.leer(`nubeDesde:${nube.usuario.id}`, null);
    const sinc = sincronizar();
    if (primeraVez) await Promise.race([sinc, new Promise((ok) => setTimeout(ok, 15000))]);
  })();

  cliente.auth.onAuthStateChange((evento, sesion) => {
    const antes = nube.usuario?.id;
    nube.usuario = sesion?.user ?? null;
    if (antes !== nube.usuario?.id || evento === "PASSWORD_RECOVERY") {
      window.dispatchEvent(new CustomEvent("nube:sesion", { detail: { usuario: nube.usuario, evento } }));
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") sincronizar();
    else if (nube.usuario) { revisarAjustes(); subirPendientes().catch(() => {}); }
  });
  window.addEventListener("online", () => sincronizar());
})();
