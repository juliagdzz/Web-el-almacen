// Página de entrar: cuenta con Google o con correo, o invitado (todo en el móvil).

(() => {
  const $ = (sel) => document.querySelector(sel);
  const nube = window.nube;
  // El enlace del correo para cambiar la contraseña llega con #…type=recovery
  const esRecuperacion = /type=recovery/.test(location.hash);

  // Solo se vuelve a páginas de esta web
  const volver = (() => {
    const v = new URLSearchParams(location.search).get("volver");
    return v && v.startsWith("/") && !v.startsWith("//") ? v : "creaciones.html";
  })();
  const vieneDeOtraPagina = new URLSearchParams(location.search).has("volver");

  function ver(id) {
    document.querySelectorAll(".tarjeta-entrar").forEach((s) => (s.hidden = s.id !== id));
    $("#cargando").hidden = true;
  }
  function mensaje(titulo, texto) {
    $("#mensaje-titulo").textContent = titulo;
    $("#mensaje-texto").textContent = texto;
    ver("vista-mensaje");
  }
  function mostrarError(el, error) {
    el.textContent = traducir(error);
    el.hidden = false;
  }

  function traducir(error) {
    const m = String(error?.message ?? error ?? "");
    if (/invalid login credentials/i.test(m)) return "El correo o la contraseña no son correctos.";
    if (/already registered|already been registered/i.test(m)) return "Ya hay una cuenta con ese correo. Entra con tu contraseña o con Google.";
    if (/email not confirmed/i.test(m)) return "Aún no has confirmado tu correo: abre el enlace que te enviamos al crear la cuenta.";
    if (/at least 6|password should be/i.test(m)) return "La contraseña tiene que tener al menos 6 caracteres.";
    if (/rate limit|too many/i.test(m)) return "Demasiados intentos seguidos. Espera un poco y vuelve a probar.";
    if (/invalid email|unable to validate email/i.test(m)) return "Ese correo no parece válido.";
    if (/same.*password|different from the old/i.test(m)) return "La nueva contraseña tiene que ser distinta de la anterior.";
    if (/fetch|network/i.test(m)) return "No hay conexión. Comprueba internet y vuelve a probar.";
    return "Algo ha fallado. Vuelve a probar en un momento.";
  }

  // Tras entrar: si hay cosas de invitado se pregunta qué hacer; si no, a donde iba
  async function continuar() {
    $("#cargando").hidden = false;
    if ((await nube.prepararCuenta()) === "preguntar") {
      const n = await nube.contarLocal();
      $("#texto-subir").innerHTML = n === 1
        ? "Tienes <strong>1 cosa</strong> guardada en este móvil sin cuenta (tableros, piezas o esmaltes). ¿La subo a tu cuenta para no perderla?"
        : `Tienes <strong>${n} cosas</strong> guardadas en este móvil sin cuenta (tableros, piezas y esmaltes). ¿Las subo a tu cuenta para no perderlas?`;
      ver("vista-subir");
      return;
    }
    location.replace(volver);
  }

  // ---------- Google ----------

  $("#con-google").addEventListener("click", async () => {
    const destino = new URL("entrar.html", location.href);
    destino.searchParams.set("volver", volver.startsWith("/") ? volver : `/${volver}`);
    const { error } = await nube.cliente.auth.signInWithOAuth({ provider: "google", options: { redirectTo: destino.href } });
    if (error) mostrarError($("#error-entrar"), error);
  });

  // ---------- Correo y contraseña ----------

  let modo = "entrar";
  document.querySelectorAll(".pestanas-entrar button").forEach((b) => b.addEventListener("click", () => {
    modo = b.dataset.modo;
    document.querySelectorAll(".pestanas-entrar button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    $("#enviar-correo").textContent = modo === "crear" ? "Crear cuenta" : "Entrar";
    $("#clave").autocomplete = modo === "crear" ? "new-password" : "current-password";
    $("#olvide").hidden = modo === "crear";
    $("#error-entrar").hidden = true;
  }));

  $("#form-correo").addEventListener("submit", async (e) => {
    e.preventDefault();
    const correo = $("#correo").value.trim();
    const clave = $("#clave").value;
    const boton = $("#enviar-correo");
    $("#error-entrar").hidden = true;
    boton.disabled = true;
    try {
      if (modo === "crear") {
        const destino = new URL("entrar.html", location.href);
        destino.searchParams.set("volver", volver.startsWith("/") ? volver : `/${volver}`);
        const { data, error } = await nube.cliente.auth.signUp({ email: correo, password: clave, options: { emailRedirectTo: destino.href } });
        if (error) throw error;
        // Supabase no da error si el correo ya existe (para no desvelarlo): llega sin identidades
        if (data.user && data.user.identities?.length === 0) throw new Error("already registered");
        if (data.session) { nube.usuario = data.session.user; return continuar(); }
        mensaje("Mira tu correo", `Te he enviado un enlace a ${correo}. Ábrelo para activar tu cuenta y entrarás directamente.`);
      } else {
        const { data, error } = await nube.cliente.auth.signInWithPassword({ email: correo, password: clave });
        if (error) throw error;
        nube.usuario = data.user;
        await continuar();
      }
    } catch (error) {
      mostrarError($("#error-entrar"), error);
    } finally {
      boton.disabled = false;
    }
  });

  $("#olvide").addEventListener("click", async () => {
    const correo = $("#correo").value.trim();
    if (!$("#correo").checkValidity() || !correo) {
      $("#error-entrar").textContent = "Escribe primero tu correo y vuelve a pulsar «He olvidado mi contraseña».";
      $("#error-entrar").hidden = false;
      $("#correo").focus();
      return;
    }
    const { error } = await nube.cliente.auth.resetPasswordForEmail(correo, { redirectTo: new URL("entrar.html", location.href).href });
    if (error) return mostrarError($("#error-entrar"), error);
    mensaje("Mira tu correo", `Si hay una cuenta con ${correo}, te llegará un enlace para poner una contraseña nueva.`);
  });

  $("#mensaje-volver").addEventListener("click", () => ver("vista-entrar"));

  $("#form-nueva-clave").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#error-nueva").hidden = true;
    const { error } = await nube.cliente.auth.updateUser({ password: $("#nueva-clave").value });
    if (error) return mostrarError($("#error-nueva"), error);
    await continuar();
  });

  // ---------- Invitado ----------

  $("#invitado").addEventListener("click", () => $("#aviso-invitado").showModal());
  $("#cancelar-invitado").addEventListener("click", () => $("#aviso-invitado").close());
  $("#confirmar-invitado").addEventListener("click", () => {
    try { localStorage.setItem("modoInvitado", "true"); } catch {}
    location.replace(volver);
  });

  // ---------- Lo de invitado al entrar en la cuenta ----------

  $("#subir-local").addEventListener("click", async () => {
    $("#subir-local").disabled = true;
    $("#subir-local").textContent = "Subiendo…";
    await nube.subirLoDeInvitado();
    location.replace(volver);
  });
  $("#descartar-local").addEventListener("click", async () => {
    if (!confirm("Se borrará de este móvil lo que guardaste sin cuenta. ¿Seguro?")) return;
    await nube.descartarLoDeInvitado();
    location.replace(volver);
  });

  $("#salir").addEventListener("click", async () => {
    if (await nube.salir()) ver("vista-entrar");
  });

  // ---------- Arranque ----------

  if (!nube?.activa) {
    ver("vista-sin-nube");
    return;
  }
  // «Continuar con Google» solo si está activado en Supabase: se pregunta a
  // Supabase, así aparece solo en cuanto lo actives en el panel
  const mostrarGoogle = (si) => {
    $("#con-google").hidden = !si;
    $("#con-google").nextElementSibling.hidden = !si; // «o con tu correo»
  };
  mostrarGoogle(false);
  fetch(`${window.NUBE_CONFIG.url}/auth/v1/settings`, { headers: { apikey: window.NUBE_CONFIG.clave } })
    .then((r) => r.json())
    .then((ajustes) => mostrarGoogle(Boolean(ajustes?.external?.google)))
    .catch(() => mostrarGoogle(Boolean(window.NUBE_CONFIG.google)));
  window.addEventListener("nube:sesion", (e) => {
    if (e.detail?.evento === "PASSWORD_RECOVERY") ver("vista-nueva-clave");
  });
  nube.listo.then(() => {
    if (esRecuperacion && nube.usuario) return ver("vista-nueva-clave");
    if (!nube.usuario) return ver("vista-entrar");
    // Vuelve de Google o del enlace del correo: se sigue solo
    if (vieneDeOtraPagina) return continuar();
    $("#correo-dentro").textContent = nube.usuario.email ?? "";
    ver("vista-dentro");
  });
})();
