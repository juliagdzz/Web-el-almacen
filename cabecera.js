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
    cabecera.classList.toggle("menu-abierto", abierto);
    boton.setAttribute("aria-expanded", String(abierto));
    boton.setAttribute("aria-label", abierto ? "Cerrar menú" : "Abrir menú");
  };
  boton.addEventListener("click", () => abrir(!cabecera.classList.contains("menu-abierto")));
  nav.addEventListener("click", (e) => e.target.closest("a") && abrir(false));
  document.addEventListener("keydown", (e) => e.key === "Escape" && abrir(false));
  document.addEventListener("click", (e) => !cabecera.contains(e.target) && abrir(false));
})();
