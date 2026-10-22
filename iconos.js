// Iconos de trazo de El Almacén: línea fina del color del texto, nunca emojis.
// iconos.el("pieza") da un <svg> listo para meter; iconos.svg("pieza") el texto.

(() => {
  const TRAZOS = {
    // Vasija con cuello y asas
    pieza: '<path d="M9 3h6M10 3v3c-3 1.5-5 4-5 7.5C5 18 8 21 12 21s7-3 7-7.5C19 10 17 7.5 14 6V3"/><path d="M6.5 10h11"/>',
    // Probeta de pruebas de esmalte
    receta: '<path d="M9 3h6M10 3v7l-5 8.5A1.7 1.7 0 0 0 6.5 21h11a1.7 1.7 0 0 0 1.5-2.5L14 10V3"/><path d="M7.5 15h9"/>',
    // Cámara de fotos
    foto: '<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13.5" r="3.5"/>',
    // Imagen de la galería
    galeria: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="9.5" r="1.6"/><path d="M4 17l5-5 4 4 2.5-2.5L20 18"/>',
    // Gota de esmalte (elegir un color)
    color: '<path d="M12 3.5c3.5 4.5 6 7.8 6 10.8A6 6 0 0 1 6 14.3c0-3 2.5-6.3 6-10.8z"/>',
    // Buzón de encargos
    encargos: '<path d="M4 9.5 12 4l8 5.5V19H4z"/><path d="m4 9.5 8 5.5 8-5.5"/>',
    // Llama del horno
    horno: '<path d="M12 3c1 4 5 5.5 5 10.5a5 5 0 0 1-10 0c0-2.5 1.2-4 2.5-5 .3 2 1.2 3 2.3 3.3C11 9 11.3 6 12 3z"/>',
    // Bocadillo de conversación
    charla: '<path d="M4.5 5.5h15v10h-8l-4 3.5v-3.5h-3z"/>',
    // Calendario
    calendario: '<rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  };

  const svg = (nombre) =>
    `<svg class="icono-trazo" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TRAZOS[nombre] ?? ""}</svg>`;

  function el(nombre) {
    const caja = document.createElement("template");
    caja.innerHTML = svg(nombre);
    return caja.content.firstElementChild;
  }

  window.iconos = { svg, el };
})();
