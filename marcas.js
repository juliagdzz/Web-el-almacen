// Sellos de las marcas (esmaltes y pastas): un cuadrado de color con sus siglas,
// para reconocerlas de un vistazo en las filas de marcas. No son sus logos.
// selloMarca("Vicar") → <span class="sello-marca" style="--marca:…">V</span>

(() => {
  const SELLOS = {
    todas: { siglas: null, color: "#4a5a23" },
    Prodesco: { siglas: "P", color: "#8f4220" },
    Tecniglaze: { siglas: "TG", color: "#2f4a73" },
    "SIO-2": { siglas: "S2", color: "#4a5a23" },
    Vicar: { siglas: "V", color: "#551c25" },
    "Vicente Díez": { siglas: "VD", color: "#2f4a73" },
    Sibelco: { siglas: "Sb", color: "#5b6670" },
    "La Bisbal": { siglas: "LB", color: "#a44e26" },
    Limoges: { siglas: "L", color: "#7a6a8a" },
    "Saint-Amand": { siglas: "SA", color: "#6b5a3a" },
    ANPER: { siglas: "A", color: "#9b9a3a" },
  };
  // «Todas»: cuatro cuadraditos, como el menú
  const TODAS = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>';

  window.selloMarca = (marca) => {
    const datos = SELLOS[marca] ?? { siglas: marca.split(/[\s-]+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase(), color: "#6b5a4a" };
    const el = document.createElement("span");
    el.className = "sello-marca";
    el.setAttribute("aria-hidden", "true");
    el.style.setProperty("--marca", datos.color);
    if (datos.siglas) el.textContent = datos.siglas;
    else el.innerHTML = TODAS;
    return el;
  };

  // El rectángulo entero: sello, nombre y cuántos hay
  window.tarjetaMarca = ({ marca, cuenta, activa, alPulsar, clase = "" }) => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = `chip-marca ${clase}`.trim();
    boton.setAttribute("aria-pressed", String(activa));
    const texto = document.createElement("span");
    texto.className = "texto-marca";
    const nombre = document.createElement("strong");
    nombre.textContent = marca === "todas" ? "Todas" : marca;
    const n = document.createElement("small");
    n.textContent = cuenta === 1 ? "1 producto" : `${cuenta} productos`;
    texto.append(nombre, n);
    const sello = window.selloMarca(marca);
    boton.style.setProperty("--marca-activa", sello.style.getPropertyValue("--marca")); // elegida: borde de su color
    boton.append(sello, texto);
    boton.addEventListener("click", alPulsar);
    return boton;
  };
})();
