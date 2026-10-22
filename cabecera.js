// Cabecera: se compacta al bajar y, en el móvil, el menú se abre con un botón.
(() => {
  const cabecera = document.querySelector(".cabecera");
  if (!cabecera) return;
  const nav = cabecera.querySelector("nav");

  // Sello con el nombre pegado al fondo de la pantalla
  const sello = document.createElement("div");
  sello.className = "sello";
  sello.setAttribute("aria-hidden", "true");
  sello.innerHTML = "<span>El Almacén</span>";
  document.body.append(sello);

  // Dos umbrales distintos para que no parpadee: al encogerse la cabecera
  // cambia un poco el desplazamiento
  let compacta = false;
  const revisar = () => {
    const y = window.scrollY;
    if (!compacta && y > 60) cabecera.classList.add("compacta"), (compacta = true);
    else if (compacta && y < 10) cabecera.classList.remove("compacta"), (compacta = false);
  };
  window.addEventListener("scroll", revisar, { passive: true });
  revisar();

  // Botón de menú (solo se ve en el móvil)
  nav.id = "menu-principal";
  const boton = document.createElement("button");
  boton.type = "button";
  boton.className = "boton-menu";
  boton.setAttribute("aria-controls", nav.id);
  boton.setAttribute("aria-expanded", "false");
  boton.setAttribute("aria-label", "Abrir menú");
  // Los dos iconos (☰ y ✕) están siempre; el CSS enseña uno u otro
  boton.innerHTML = '<svg class="icono-abrir" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>'
    + '<svg class="icono-cerrar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  cabecera.prepend(boton);

  // «panel» en el menú, solo para quien gestiona el taller. Es solo el enlace:
  // la puerta de verdad está en panel-acceso.js y en las reglas de Supabase.
  // En páginas sin cuenta (la portada) se usa lo último que se supo.
  const PAGINAS_PANEL = /\/(panel|encargos-recibidos|horneados-recibidos|talleres-admin)(\.html)?$/;
  const haySesion = () => { try { return Boolean(localStorage.getItem("almacen-sesion")); } catch { return false; } };
  const guardado = () => { try { return JSON.parse(localStorage.getItem("panelTaller")); } catch { return null; } };
  let enlacePanel = null;
  const pintarPanel = (datos) => {
    if (!datos?.admin || !haySesion()) {
      cabecera.classList.remove("hay-avisos");
      enlacePanel?.remove();
      enlacePanel = null;
      return;
    }
    if (!enlacePanel) {
      enlacePanel = document.createElement("a");
      enlacePanel.href = "panel.html";
      enlacePanel.className = "enlace-panel";
      if (PAGINAS_PANEL.test(location.pathname)) enlacePanel.setAttribute("aria-current", "page");
      nav.append(enlacePanel);
    }
    const n = datos.pendientes ?? 0;
    cabecera.classList.toggle("hay-avisos", n > 0); // un punto en el botón del móvil
    enlacePanel.replaceChildren("panel");
    enlacePanel.setAttribute("aria-label", n ? `Panel del taller: ${n} por mirar` : "Panel del taller");
    if (n) {
      const globo = document.createElement("span");
      globo.className = "globo-menu";
      globo.textContent = n > 99 ? "99+" : String(n);
      enlacePanel.append(globo);
    }
  };
  pintarPanel(guardado());
  const nube = window.nube;
  if (nube?.activa) {
    Promise.resolve(nube.listo).then(async () => {
      if (!nube.usuario) {
        try { localStorage.removeItem("panelTaller"); } catch {}
        return pintarPanel(null);
      }
      const { data: admin, error } = await nube.cliente.rpc("es_admin");
      if (error) return;
      let pendientes = 0;
      if (admin) {
        const { data } = await nube.cliente.rpc("resumen_panel");
        pendientes = (data?.encargos ?? 0) + (data?.horneados ?? 0) + (data?.bonos ?? 0) + (data?.avisos ?? 0);
      }
      const datos = { admin: Boolean(admin), pendientes };
      try { localStorage.setItem("panelTaller", JSON.stringify(datos)); } catch {}
      pintarPanel(datos);
    }).catch(() => {});
  }

  const abrir = (abierto) => {
    if (abierto) cerrarCuenta();
    cabecera.classList.toggle("menu-abierto", abierto);
    boton.setAttribute("aria-expanded", String(abierto));
    boton.setAttribute("aria-label", abierto ? "Cerrar menú" : "Abrir menú");
  };
  boton.addEventListener("click", () => abrir(!cabecera.classList.contains("menu-abierto")));
  nav.addEventListener("click", (e) => e.target.closest("a") && abrir(false));
  document.addEventListener("keydown", (e) => e.key === "Escape" && abrir(false));
  document.addEventListener("click", (e) => !cabecera.contains(e.target) && abrir(false));

  // ---------- Cuenta: la foto en la esquina y su menú ----------
  // Con sesión sale la foto (o la inicial) y un menú con tu cuenta, tu calendario,
  // Mis creaciones e insignias. Sin sesión, un icono para entrar o crear cuenta.
  // Se pinta al momento con lo último que se supo (localStorage) y se actualiza
  // cuando llega la cuenta.
  const CLAVE_CUENTA = "cuentaMenu";
  const PAGINAS_CUENTA = /\/(creaciones|inspiracion|piezas|medidas|perfil)(\.html)?$/;
  const ICONO_PERSONA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4.5-6 8-6s7 1.5 8 6"/></svg>';
  const crear = (etiqueta, props = {}, ...hijos) => {
    const el = document.createElement(etiqueta);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    el.append(...hijos.filter((x) => x != null && x !== false));
    return el;
  };
  const esInvitado = () => { try { return JSON.parse(localStorage.getItem("modoInvitado")) === true; } catch { return false; } };
  const leerCuenta = () => { try { return JSON.parse(localStorage.getItem(CLAVE_CUENTA)); } catch { return null; } };
  const nubeApagada = window.nube && window.nube.activa === false; // sin Supabase no hay cuentas

  const botonCuenta = crear("button", { type: "button", class: "boton-cuenta", "aria-haspopup": "true", "aria-expanded": "false", "aria-controls": "menu-cuenta" });
  const panelCuenta = crear("div", { id: "menu-cuenta", class: "panel-cuenta", hidden: true });
  const cuenta = crear("div", { class: "cuenta-menu" }, botonCuenta, panelCuenta);

  function cerrarCuenta() {
    panelCuenta.hidden = true;
    botonCuenta.setAttribute("aria-expanded", "false");
  }
  const avatar = (d, tamano = "") => crear("span", { class: `avatar ${tamano}`, "aria-hidden": "true" },
    d?.foto ? crear("img", { src: d.foto, alt: "" }) : (d?.alias || d?.email || "·").trim()[0].toUpperCase());

  function pintarCuenta() {
    const conSesion = haySesion();
    const d = conSesion ? leerCuenta() : null;
    const ocultas = d?.insignias === "ocultas";
    const nuevas = !ocultas && d?.nuevas > 0 ? d.nuevas : 0;
    botonCuenta.classList.toggle("con-sesion", conSesion);
    botonCuenta.classList.toggle("activa", PAGINAS_CUENTA.test(location.pathname));
    botonCuenta.replaceChildren();
    if (conSesion) {
      botonCuenta.setAttribute("aria-label", d?.alias ? `Tu cuenta: ${d.alias}` : "Tu cuenta");
      if (d?.foto) botonCuenta.append(crear("img", { src: d.foto, alt: "" }));
      else botonCuenta.append((d?.alias || d?.email || "·").trim()[0].toUpperCase());
      if (nuevas) botonCuenta.append(crear("span", { class: "punto", "aria-hidden": "true" }));
    } else {
      botonCuenta.setAttribute("aria-label", esInvitado() ? "Invitado: entrar o crear cuenta" : "Entrar o crear cuenta");
      botonCuenta.insertAdjacentHTML("afterbegin", ICONO_PERSONA);
    }

    const entrar = `entrar.html?volver=${encodeURIComponent(location.pathname + location.search + location.hash)}`;
    if (conSesion) {
      panelCuenta.replaceChildren(
        crear("div", { class: "cuenta-cabeza" }, avatar(d, "mediana"),
          crear("div", {}, crear("strong", {}, d?.alias || "Tu cuenta"), d?.email && crear("small", {}, d.email))),
        crear("a", { class: "item-cuenta", href: "perfil.html" }, "Mi cuenta"),
        crear("a", { class: "item-cuenta", href: "perfil.html#calendario" }, "Mi calendario"),
        crear("a", { class: "item-cuenta", href: "creaciones.html" }, "Mis creaciones"),
        !ocultas && crear("a", { class: "item-cuenta", href: "perfil.html#insignias" }, "Mis insignias",
          nuevas > 0 && crear("span", { class: "etiqueta-nuevas" }, nuevas === 1 ? "1 nueva" : `${nuevas} nuevas`)),
        crear("button", { type: "button", class: "item-cuenta salir", onclick: async () => {
          const salio = await window.nube?.salir?.();
          if (!salio) return;
          try { localStorage.removeItem(CLAVE_CUENTA); localStorage.removeItem("panelTaller"); } catch {}
          location.replace("entrar.html");
        } }, "Cerrar sesión"));
    } else {
      panelCuenta.replaceChildren(
        crear("p", { class: "cuenta-nota" }, esInvitado()
          ? "Estás como invitado: lo que guardas está solo en este móvil."
          : "Con una cuenta guardas tus piezas y tableros, reservas talleres y entras en la comunidad."),
        crear("a", { class: "item-cuenta", href: entrar }, "Entrar o crear cuenta"),
        crear("a", { class: "item-cuenta", href: "creaciones.html" }, "Mis creaciones"));
    }
  }

  async function refrescarCuenta() {
    const nube = window.nube;
    if (!nube?.activa) return;
    await nube.listo;
    if (!nube.usuario) {
      try { localStorage.removeItem(CLAVE_CUENTA); } catch {}
      return pintarCuenta();
    }
    try {
      const [{ data: perfiles }, { data: nuevas }] = await Promise.all([
        nube.cliente.from("perfiles").select("alias,foto,insignias").eq("user_id", nube.usuario.id),
        nube.cliente.from("insignias_ganadas").select("insignia_id").eq("user_id", nube.usuario.id).eq("vista", false),
      ]);
      const p = perfiles?.[0] ?? {};
      const datos = {
        email: nube.usuario.email,
        alias: p.alias ?? null,
        foto: p.foto ? nube.cliente.storage.from("comunidad").getPublicUrl(p.foto).data.publicUrl : null,
        insignias: p.insignias ?? "privadas",
        nuevas: nuevas?.length ?? 0,
      };
      try { localStorage.setItem(CLAVE_CUENTA, JSON.stringify(datos)); } catch {}
    } catch {}
    pintarCuenta();
  }

  if (!nubeApagada) {
    cabecera.append(cuenta);
    pintarCuenta();
    botonCuenta.addEventListener("click", () => {
      const abrir = panelCuenta.hidden;
      cerrarCuenta();
      if (!abrir) return;
      cabecera.classList.remove("menu-abierto");
      boton.setAttribute("aria-expanded", "false");
      panelCuenta.hidden = false;
      botonCuenta.setAttribute("aria-expanded", "true");
    });
    panelCuenta.addEventListener("click", (e) => e.target.closest("a") && cerrarCuenta());
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panelCuenta.hidden) { cerrarCuenta(); botonCuenta.focus(); } });
    document.addEventListener("click", (e) => !cuenta.contains(e.target) && cerrarCuenta());
    // Al volver a la app o cambiar la foto o el nombre, se actualiza
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && refrescarCuenta());
    document.addEventListener("perfil:cambiado", refrescarCuenta);
    window.addEventListener("storage", (e) => (e.key === CLAVE_CUENTA || e.key === "almacen-sesion") && pintarCuenta());
    refrescarCuenta();
  }
})();
