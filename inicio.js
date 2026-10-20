// Portada: cada bloque marcado con .aparece entra al llegar a él deslizando.
// Dentro de una sección los bloques salen uno detrás de otro (--orden).

document.querySelectorAll(".seccion").forEach((seccion) => {
  seccion.querySelectorAll(".aparece").forEach((el, i) => el.style.setProperty("--orden", i));
});

const bloques = document.querySelectorAll(".aparece");
if ("IntersectionObserver" in window) {
  const observador = new IntersectionObserver((entradas) => {
    for (const entrada of entradas) {
      if (!entrada.isIntersecting) continue;
      entrada.target.classList.add("visible");
      observador.unobserve(entrada.target);
    }
  }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });
  bloques.forEach((el) => observador.observe(el));
} else {
  bloques.forEach((el) => el.classList.add("visible"));
}

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
