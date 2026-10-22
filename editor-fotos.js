// Editor de fotos: recortar, girar, quitar el fondo y poner otro (liso o una foto).
// editarFoto(blob) abre el editor y devuelve la foto nueva, o null si se cancela.
//
// El fondo se quita en el propio móvil, sin descargar nada: desde los bordes de la foto
// se van tomando los píxeles de color parecido (va muy bien con fondos lisos), y luego
// se retoca a mano tocando zonas de fondo o con el pincel de borrar y recuperar.

const EDITOR_LADO = 1600;
const EDITOR_FONDOS = [
  ["Original", "original"], ["Transparente", "transparente"], ["Crema", "#f3e9d8"], ["Blanco", "#ffffff"],
  ["Arcilla", "#f6e7dc"], ["Terracota", "#a44e26"], ["Oliva", "#9b9a3a"], ["Verde", "#4a5a23"],
  ["Granate", "#551c25"], ["Gris", "#8a8580"], ["Negro", "#1d1b1a"],
];
const EDITOR_PROPORCIONES = [["Libre", 0], ["1:1", 1], ["4:5", 4 / 5], ["3:4", 3 / 4], ["16:9", 16 / 9]];

function editorEl(etiqueta, props = {}, ...hijos) {
  const el = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k in el) el[k] = v;
    else el.setAttribute(k, v);
  }
  el.append(...hijos.flat().filter((x) => x != null && x !== false));
  return el;
}

async function editarFoto(blob) {
  // ---------- Estado ----------
  let lienzo;            // la foto (canvas), como mucho EDITOR_LADO px de lado
  let pixeles;           // sus píxeles, para quitar el fondo
  let mascara;           // 255 = se queda, 0 = es fondo
  let quitado = false;   // si ya se ha quitado algo de fondo
  let recorte;           // { x, y, w, h } en píxeles de la foto
  let proporcion = 0;
  let fondo = "original";
  let fondoImagen = null;
  let modo = "recortar";
  let herramienta = "varita";
  let pincel = 28;
  let sensibilidad = 40;
  let historial = [];
  let primerPlano = null; // la foto con el fondo quitado (transparente), lista para dibujar

  async function cargar(origen) {
    const bitmap = await createImageBitmap(origen);
    const escala = Math.min(1, EDITOR_LADO / Math.max(bitmap.width, bitmap.height));
    lienzo = document.createElement("canvas");
    lienzo.width = Math.round(bitmap.width * escala);
    lienzo.height = Math.round(bitmap.height * escala);
    lienzo.getContext("2d").drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
    bitmap.close();
    pixeles = lienzo.getContext("2d").getImageData(0, 0, lienzo.width, lienzo.height);
    mascara = new Uint8Array(lienzo.width * lienzo.height).fill(255);
    quitado = false;
    recorte = { x: 0, y: 0, w: lienzo.width, h: lienzo.height };
    historial = [];
    primerPlano = null;
  }
  await cargar(blob);

  // ---------- Deshacer ----------
  function guardarPaso() {
    historial.push({ lienzo, pixeles, mascara: mascara.slice(), quitado, recorte: { ...recorte }, fondo });
    if (historial.length > 12) historial.shift();
  }
  function deshacer() {
    const paso = historial.pop();
    if (!paso) return;
    ({ lienzo, pixeles, quitado, fondo } = paso);
    mascara = paso.mascara;
    recorte = paso.recorte;
    actualizarPrimerPlano();
    pintarControles();
    dibujar();
  }

  // ---------- Quitar el fondo ----------
  const distancia = (d, i, j) => {
    const r = d[i] - d[j], g = d[i + 1] - d[j + 1], b = d[i + 2] - d[j + 2];
    return Math.sqrt(r * r + g * g + b * b);
  };

  // Se extiende desde las semillas a los píxeles vecinos de color parecido:
  // poco salto entre vecinos y no muy lejos del color de partida (aguanta sombras suaves)
  function rellenar(semillas) {
    const { width: w, height: h, data } = pixeles;
    const paso = 6 + sensibilidad * 0.35;
    const maximo = 20 + sensibilidad * 2;
    const visto = new Uint8Array(w * h);
    const cola = new Int32Array(w * h);
    let inicio = 0, fin = 0;
    let rr = 0, gg = 0, bb = 0;
    for (const s of semillas) { rr += data[s * 4]; gg += data[s * 4 + 1]; bb += data[s * 4 + 2]; }
    const ref = new Uint8ClampedArray([rr / semillas.length, gg / semillas.length, bb / semillas.length, 255]);
    const lejos = (i) => {
      const r = data[i * 4] - ref[0], g = data[i * 4 + 1] - ref[1], b = data[i * 4 + 2] - ref[2];
      return Math.sqrt(r * r + g * g + b * b) > maximo;
    };
    for (const s of semillas) if (!visto[s] && !lejos(s)) { visto[s] = 1; cola[fin++] = s; }
    while (inicio < fin) {
      const p = cola[inicio++];
      mascara[p] = 0;
      const x = p % w, y = (p - x) / w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q < 0 || visto[q]) continue;
        if (distancia(data, p * 4, q * 4) <= paso && !lejos(q)) { visto[q] = 1; cola[fin++] = q; }
      }
    }
    return fin;
  }

  // Automático: desde los bordes de la foto (lo que toca el borde suele ser fondo)
  function quitarFondo() {
    guardarPaso();
    mascara.fill(255);
    const { width: w, height: h } = pixeles;
    const borde = [];
    for (let x = 0; x < w; x += 2) borde.push(x, (h - 1) * w + x);
    for (let y = 0; y < h; y += 2) borde.push(y * w, y * w + w - 1);
    const cuantos = rellenar(borde);
    quitado = cuantos > 0;
    if (fondo === "original") fondo = "#f3e9d8";
    actualizarPrimerPlano();
    pintarControles();
    dibujar();
    avisarEditor(cuantos ? "Toca las zonas de fondo que queden, o usa el pincel para retocar" : "No he encontrado fondo liso: usa el pincel");
  }

  // Suaviza el borde (que no quede dentado) y prepara la foto sin fondo
  function actualizarPrimerPlano() {
    if (!quitado) return (primerPlano = null);
    const { width: w, height: h, data } = pixeles;
    const salida = new ImageData(w, h);
    const s = salida.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        let suma = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            suma += mascara[yy * w + xx];
            n++;
          }
        }
        s[i * 4] = data[i * 4];
        s[i * 4 + 1] = data[i * 4 + 1];
        s[i * 4 + 2] = data[i * 4 + 2];
        s[i * 4 + 3] = suma / n;
      }
    }
    primerPlano ??= document.createElement("canvas");
    primerPlano.width = w;
    primerPlano.height = h;
    primerPlano.getContext("2d").putImageData(salida, 0, 0);
  }

  function pintarMascara(x, y, radio, valor) {
    const { width: w, height: h } = pixeles;
    const r2 = radio * radio;
    for (let yy = Math.max(0, Math.floor(y - radio)); yy <= Math.min(h - 1, Math.ceil(y + radio)); yy++) {
      for (let xx = Math.max(0, Math.floor(x - radio)); xx <= Math.min(w - 1, Math.ceil(x + radio)); xx++) {
        if ((xx - x) ** 2 + (yy - y) ** 2 <= r2) mascara[yy * w + xx] = valor;
      }
    }
  }

  // ---------- Girar ----------
  function girar() {
    guardarPaso();
    const { width: w, height: h } = lienzo;
    const nuevo = document.createElement("canvas");
    nuevo.width = h;
    nuevo.height = w;
    const ctx = nuevo.getContext("2d");
    ctx.translate(h, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(lienzo, 0, 0);
    const nuevaMascara = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) nuevaMascara[x * h + (h - 1 - y)] = mascara[y * w + x];
    lienzo = nuevo;
    pixeles = ctx.getImageData(0, 0, h, w);
    mascara = nuevaMascara;
    recorte = { x: 0, y: 0, w: h, h: w };
    if (proporcion) ajustarProporcion();
    actualizarPrimerPlano();
    dibujar();
  }

  // El recorte más grande con esa proporción, centrado
  function ajustarProporcion() {
    const { width: W, height: H } = lienzo;
    if (!proporcion) return (recorte = { x: 0, y: 0, w: W, h: H });
    let w = W, h = W / proporcion;
    if (h > H) { h = H; w = H * proporcion; }
    recorte = { x: (W - w) / 2, y: (H - h) / 2, w, h };
  }

  // ---------- Dibujar ----------
  function dibujarFondo(ctx, ancho, alto) {
    if (fondo === "transparente") {
      // cuadritos para que se vea que no hay fondo
      const lado = 12;
      for (let y = 0; y < alto; y += lado) for (let x = 0; x < ancho; x += lado) {
        ctx.fillStyle = ((x + y) / lado) % 2 ? "#ddd" : "#fff";
        ctx.fillRect(x, y, lado, lado);
      }
    } else if (fondo === "imagen" && fondoImagen) {
      const escala = Math.max(ancho / fondoImagen.width, alto / fondoImagen.height);
      const w = fondoImagen.width * escala, h = fondoImagen.height * escala;
      ctx.drawImage(fondoImagen, (ancho - w) / 2, (alto - h) / 2, w, h);
    } else if (fondo !== "original") {
      ctx.fillStyle = fondo;
      ctx.fillRect(0, 0, ancho, alto);
    }
  }

  // Compone la zona «area» de la foto en un canvas de ancho × alto
  function componer(ctx, area, ancho, alto, conCuadritos = true) {
    if (fondo === "original" || !quitado) {
      ctx.drawImage(lienzo, area.x, area.y, area.w, area.h, 0, 0, ancho, alto);
      return;
    }
    if (fondo !== "transparente" || conCuadritos) dibujarFondo(ctx, ancho, alto);
    ctx.drawImage(primerPlano, area.x, area.y, area.w, area.h, 0, 0, ancho, alto);
  }

  const zona = editorEl("div", { class: "editor-zona" });
  const visor = editorEl("canvas", { class: "editor-lienzo" });
  zona.append(visor);
  let vista = { escala: 1, area: null }; // qué parte de la foto se ve y a qué escala

  function dibujar() {
    const area = modo === "recortar" ? { x: 0, y: 0, w: lienzo.width, h: lienzo.height } : recorte;
    const maxW = zona.clientWidth - 24, maxH = zona.clientHeight - 24;
    const escala = Math.min(maxW / area.w, maxH / area.h);
    const ancho = Math.max(1, Math.round(area.w * escala)), alto = Math.max(1, Math.round(area.h * escala));
    const ppp = devicePixelRatio || 1;
    visor.width = ancho * ppp;
    visor.height = alto * ppp;
    visor.style.width = `${ancho}px`;
    visor.style.height = `${alto}px`;
    vista = { escala, area };
    const ctx = visor.getContext("2d");
    ctx.setTransform(ppp, 0, 0, ppp, 0, 0);
    componer(ctx, area, ancho, alto);
    if (modo === "recortar") {
      // Oscurecer lo que queda fuera y marcar el recorte con sus esquinas
      const r = { x: recorte.x * escala, y: recorte.y * escala, w: recorte.w * escala, h: recorte.h * escala };
      ctx.fillStyle = "rgb(0 0 0 / 0.55)";
      ctx.beginPath();
      ctx.rect(0, 0, ancho, alto);
      ctx.rect(r.x, r.y, r.w, r.h);
      ctx.fill("evenodd");
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = "rgb(255 255 255 / 0.5)";
      ctx.lineWidth = 1;
      for (const f of [1 / 3, 2 / 3]) {
        ctx.beginPath();
        ctx.moveTo(r.x + r.w * f, r.y); ctx.lineTo(r.x + r.w * f, r.y + r.h);
        ctx.moveTo(r.x, r.y + r.h * f); ctx.lineTo(r.x + r.w, r.y + r.h * f);
        ctx.stroke();
      }
      ctx.fillStyle = "#fff";
      for (const [x, y] of [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) {
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ---------- Gestos sobre la foto ----------
  let gesto = null;
  const enFoto = (e) => {
    const caja = visor.getBoundingClientRect();
    return { x: vista.area.x + (e.clientX - caja.left) / vista.escala, y: vista.area.y + (e.clientY - caja.top) / vista.escala };
  };

  visor.addEventListener("pointerdown", (e) => {
    visor.setPointerCapture(e.pointerId);
    const p = enFoto(e);
    if (modo === "recortar") {
      const cerca = 26 / vista.escala;
      const esquinas = { nw: [recorte.x, recorte.y], ne: [recorte.x + recorte.w, recorte.y], sw: [recorte.x, recorte.y + recorte.h], se: [recorte.x + recorte.w, recorte.y + recorte.h] };
      const esquina = Object.entries(esquinas).find(([, [x, y]]) => Math.hypot(p.x - x, p.y - y) < cerca)?.[0];
      const dentro = p.x > recorte.x && p.x < recorte.x + recorte.w && p.y > recorte.y && p.y < recorte.y + recorte.h;
      if (esquina || dentro) gesto = { tipo: esquina ?? "mover", inicio: p, original: { ...recorte }, guardado: false };
      return;
    }
    guardarPaso();
    if (herramienta === "varita") {
      const x = Math.floor(p.x), y = Math.floor(p.y);
      if (x < 0 || y < 0 || x >= pixeles.width || y >= pixeles.height) return;
      const cuantos = rellenar([y * pixeles.width + x]);
      if (cuantos) {
        quitado = true;
        if (fondo === "original") fondo = "#f3e9d8";
        pintarControles();
      }
      actualizarPrimerPlano();
      dibujar();
      return;
    }
    gesto = { tipo: herramienta };
    quitado = true;
    if (fondo === "original") { fondo = "#f3e9d8"; pintarControles(); }
    pintarMascara(p.x, p.y, pincel / vista.escala, herramienta === "borrar" ? 0 : 255);
    actualizarPrimerPlano();
    dibujar();
  });

  let pendienteDibujo = false;
  visor.addEventListener("pointermove", (e) => {
    if (!gesto) return;
    const p = enFoto(e);
    if (gesto.tipo === "borrar" || gesto.tipo === "recuperar") {
      pintarMascara(p.x, p.y, pincel / vista.escala, gesto.tipo === "borrar" ? 0 : 255);
      if (!pendienteDibujo) {
        pendienteDibujo = true;
        requestAnimationFrame(() => { pendienteDibujo = false; actualizarPrimerPlano(); dibujar(); });
      }
      return;
    }
    if (!gesto.guardado) { guardarPaso(); gesto.guardado = true; }
    const o = gesto.original;
    const W = lienzo.width, H = lienzo.height, minimo = 40;
    const dx = p.x - gesto.inicio.x, dy = p.y - gesto.inicio.y;
    if (gesto.tipo === "mover") {
      recorte.x = Math.min(Math.max(0, o.x + dx), W - o.w);
      recorte.y = Math.min(Math.max(0, o.y + dy), H - o.h);
    } else {
      // La esquina contraria se queda quieta
      const fijaX = gesto.tipo.includes("w") ? o.x + o.w : o.x;
      const fijaY = gesto.tipo.includes("n") ? o.y + o.h : o.y;
      let w = Math.max(minimo, Math.abs(p.x - fijaX));
      let h = Math.max(minimo, Math.abs(p.y - fijaY));
      if (proporcion) {
        if (w / h > proporcion) w = h * proporcion; else h = w / proporcion;
      }
      let x = gesto.tipo.includes("w") ? fijaX - w : fijaX;
      let y = gesto.tipo.includes("n") ? fijaY - h : fijaY;
      // Que no se salga de la foto
      if (x < 0) { w += x; x = 0; if (proporcion) h = w / proporcion; }
      if (y < 0) { h += y; y = 0; if (proporcion) w = h * proporcion; }
      if (x + w > W) { w = W - x; if (proporcion) h = w / proporcion; }
      if (y + h > H) { h = H - y; if (proporcion) w = h * proporcion; }
      if (gesto.tipo.includes("w")) x = fijaX - w;
      if (gesto.tipo.includes("n")) y = fijaY - h;
      recorte = { x, y, w, h };
    }
    dibujar();
  });
  visor.addEventListener("pointerup", () => (gesto = null));
  visor.addEventListener("pointercancel", () => (gesto = null));

  // ---------- Controles ----------
  const aviso = editorEl("p", { class: "editor-aviso" });
  function avisarEditor(texto) { aviso.textContent = texto; }

  const panelRecortar = editorEl("div", { class: "editor-panel" });
  const panelFondo = editorEl("div", { class: "editor-panel" });
  const pestanaRecortar = editorEl("button", { type: "button", onclick: () => cambiarModo("recortar") }, "Recortar");
  const pestanaFondo = editorEl("button", { type: "button", onclick: () => cambiarModo("fondo") }, "Fondo");

  function cambiarModo(nuevo) {
    modo = nuevo;
    pintarControles();
    dibujar();
    avisarEditor(modo === "recortar"
      ? "Arrastra las esquinas para recortar, o el recuadro para moverlo"
      : quitado ? "Toca zonas de fondo o retoca con el pincel" : "Pulsa «Quitar fondo», o toca el fondo para quitarlo");
  }

  function boton(texto, activo, onclick, extra = {}) {
    return editorEl("button", { type: "button", class: activo ? "activo" : "", onclick, ...extra }, texto);
  }

  function pintarControles() {
    pestanaRecortar.className = modo === "recortar" ? "activo" : "";
    pestanaFondo.className = modo === "fondo" ? "activo" : "";
    panelRecortar.hidden = modo !== "recortar";
    panelFondo.hidden = modo !== "fondo";

    panelRecortar.replaceChildren(
      editorEl("div", { class: "editor-fila" },
        EDITOR_PROPORCIONES.map(([nombre, valor]) => boton(nombre, proporcion === valor, () => {
          guardarPaso();
          proporcion = valor;
          ajustarProporcion();
          pintarControles();
          dibujar();
        }))),
      editorEl("div", { class: "editor-fila" },
        boton("⟳ Girar", false, girar),
        boton("↶ Deshacer", false, deshacer, { disabled: !historial.length }),
        boton("Volver a la original", false, async () => { await cargar(blob); fondo = "original"; proporcion = 0; pintarControles(); dibujar(); })));

    const fondoInput = editorEl("input", { type: "file", accept: "image/*", hidden: true, onchange: async (e) => {
      const archivo = e.target.files[0];
      e.target.value = "";
      if (!archivo) return;
      guardarPaso();
      fondoImagen = await createImageBitmap(archivo);
      fondo = "imagen";
      pintarControles();
      dibujar();
    } });
    panelFondo.replaceChildren(...[
      editorEl("div", { class: "editor-fila" },
        boton("Quitar fondo", false, quitarFondo, { class: "principal" }),
        editorEl("label", { class: "editor-deslizador" }, "Sensibilidad",
          editorEl("input", { type: "range", min: 5, max: 100, value: sensibilidad, oninput: (e) => (sensibilidad = Number(e.target.value)),
            onchange: () => quitado && herramienta && avisarEditor("Vuelve a pulsar «Quitar fondo» para aplicarla") }))),
      editorEl("div", { class: "editor-fila" },
        boton("Tocar fondo", herramienta === "varita", () => { herramienta = "varita"; pintarControles(); avisarEditor("Toca una zona de fondo para quitarla"); }),
        boton("Borrar", herramienta === "borrar", () => { herramienta = "borrar"; pintarControles(); avisarEditor("Pasa el dedo por lo que quieras quitar"); }),
        boton("Recuperar", herramienta === "recuperar", () => { herramienta = "recuperar"; pintarControles(); avisarEditor("Pasa el dedo por lo que se haya borrado de más"); }),
        boton("↶", false, deshacer, { disabled: !historial.length, "aria-label": "Deshacer", title: "Deshacer" })),
      herramienta !== "varita" && editorEl("label", { class: "editor-deslizador" }, "Tamaño del pincel",
        editorEl("input", { type: "range", min: 6, max: 80, value: pincel, oninput: (e) => (pincel = Number(e.target.value)) })),
      editorEl("div", { class: "editor-fila editor-fondos" },
        EDITOR_FONDOS.map(([nombre, valor]) => editorEl("button", {
          type: "button", title: nombre, "aria-label": `Fondo ${nombre.toLowerCase()}`,
          class: `muestra-fondo ${fondo === valor ? "activo" : ""} ${valor === "original" ? "es-original" : ""} ${valor === "transparente" ? "es-transparente" : ""}`,
          style: valor.startsWith("#") ? `background:${valor}` : "",
          onclick: () => { guardarPaso(); fondo = valor; pintarControles(); dibujar(); },
        }, valor === "original" ? "Orig." : "")),
        editorEl("label", { class: `muestra-fondo es-color ${fondo.startsWith("#") && !EDITOR_FONDOS.some(([, v]) => v === fondo) ? "activo" : ""}`, title: "Otro color" },
          editorEl("span", { "aria-hidden": "true", class: "punto-color" }), editorEl("input", { type: "color", value: fondo.startsWith("#") ? fondo : "#f3e9d8", oninput: (e) => { fondo = e.target.value; dibujar(); }, onchange: () => pintarControles() })),
        editorEl("label", { class: `muestra-fondo es-foto ${fondo === "imagen" ? "activo" : ""}`, title: "Una foto de fondo" }, "Foto", fondoInput)),
    ].filter(Boolean)); // el tamaño del pincel solo sale con Borrar y Recuperar
  }

  // ---------- La hoja ----------
  return new Promise((resolve) => {
    const hoja = editorEl("dialog", { class: "editor-foto" },
      editorEl("header", {},
        editorEl("button", { type: "button", class: "texto", onclick: () => cerrar(null) }, "Cancelar"),
        editorEl("strong", {}, "Editar foto"),
        editorEl("button", { type: "button", class: "guardar", onclick: guardar }, "Guardar")),
      zona,
      aviso,
      editorEl("nav", { class: "editor-pestanas" }, pestanaRecortar, pestanaFondo),
      panelRecortar,
      panelFondo);
    hoja.addEventListener("cancel", (e) => { e.preventDefault(); cerrar(null); });
    document.body.append(hoja);
    hoja.showModal();
    const alCambiarTamano = new ResizeObserver(() => dibujar());
    alCambiarTamano.observe(zona);
    cambiarModo("recortar");

    function cerrar(resultado) {
      alCambiarTamano.disconnect();
      hoja.close();
      hoja.remove();
      resolve(resultado);
    }

    function guardar() {
      const salida = document.createElement("canvas");
      salida.width = Math.round(recorte.w);
      salida.height = Math.round(recorte.h);
      const ctx = salida.getContext("2d");
      const transparente = quitado && fondo === "transparente";
      if (!transparente) { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, salida.width, salida.height); }
      componer(ctx, recorte, salida.width, salida.height, false);
      // Sin fondo se guarda en PNG para no perder la transparencia
      salida.toBlob((nueva) => cerrar(nueva), transparente ? "image/png" : "image/jpeg", 0.9);
    }
  });
}
