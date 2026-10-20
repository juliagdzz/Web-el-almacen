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
