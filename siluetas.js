// Siluetas para «¿Qué hago hoy?»: cada forma tiene varios perfiles (un cuenco
// cónico, redondo o de borde vuelto; una jarra panzuda, recta o con cintura…)
// y cada vez sale uno con las proporciones un poco cambiadas, con su asa, pico
// o tapa si la lleva. Se dibuja en SVG con los colores de la idea.
// siluetas.sortear("jarra") → { nombre: "panzuda, con asa en D y pico pellizcado", … }
// siluetas.dibujar(silueta, { cuerpo, interior, motas, trazo }) → "<svg …>"

(() => {
  const r = (a, b) => a + Math.random() * (b - a);
  const azar = (l) => l[Math.floor(Math.random() * l.length)];
  const BARRO = "#c9875a";
  const LINEA = "rgb(42 26 26 / 0.45)";

  // Perfiles: la mitad derecha de la pieza, del pie al borde, en [radio, alto].
  // El nombre concuerda con la pieza (el cuenco «redondo», la jarra «panzuda»)
  const PERFILES = {
    cuenco: [
      ["redondo", [[0.33, 0], [0.37, 0.03], [0.72, 0.15], [0.93, 0.33], [1, 0.52]]],
      ["cónico", [[0.24, 0], [0.27, 0.03], [0.62, 0.22], [1, 0.46]]],
      ["de borde vuelto", [[0.32, 0], [0.36, 0.03], [0.7, 0.16], [0.84, 0.36], [0.87, 0.43], [1, 0.5]]],
      ["de paredes rectas", [[0.42, 0], [0.46, 0.03], [0.78, 0.14], [0.9, 0.35], [0.93, 0.6]]],
      ["de borde cerrado", [[0.36, 0], [0.4, 0.03], [0.85, 0.22], [1, 0.45], [0.86, 0.6]]],
      ["con pie alto", [[0.32, 0], [0.33, 0.08], [0.2, 0.12], [0.25, 0.18], [0.65, 0.3], [0.92, 0.5], [1, 0.62]]],
      ["ancho y bajo", [[0.42, 0], [0.46, 0.02], [0.86, 0.17], [1, 0.32]]],
    ],
    chawan: [
      ["wan, redondo", [[0.4, 0], [0.4, 0.07], [0.32, 0.09], [0.7, 0.28], [0.95, 0.6], [1, 0.82]]],
      ["tsutsu, alto y recto", [[0.46, 0], [0.46, 0.07], [0.4, 0.09], [0.78, 0.22], [0.86, 0.6], [0.86, 1]]],
      ["hira, abierto y bajo", [[0.3, 0], [0.3, 0.06], [0.26, 0.08], [0.7, 0.22], [1, 0.45]]],
      ["con cintura", [[0.42, 0], [0.42, 0.07], [0.36, 0.09], [0.86, 0.3], [0.8, 0.55], [0.92, 0.82]]],
    ],
    fuente: [
      ["honda y redonda", [[0.5, 0], [0.54, 0.02], [0.85, 0.12], [1, 0.34]]],
      ["de paredes rectas", [[0.78, 0], [0.82, 0.02], [0.9, 0.06], [0.96, 0.2], [0.98, 0.3]]],
      ["con ala", [[0.55, 0], [0.58, 0.02], [0.75, 0.18], [0.82, 0.24], [1, 0.28]]],
      ["ancha y baja, de bandeja", [[0.75, 0], [0.8, 0.02], [0.95, 0.08], [1, 0.16]]],
    ],
    plato: [
      ["de ala ancha", [[0.5, 0], [0.53, 0.02], [0.6, 0.06], [0.68, 0.07], [0.95, 0.11], [1, 0.13]]],
      ["coupe, sin ala", [[0.55, 0], [0.6, 0.02], [0.88, 0.07], [1, 0.15]]],
      ["de borde levantado", [[0.68, 0], [0.72, 0.02], [0.9, 0.04], [0.97, 0.08], [1, 0.18]]],
      ["hondo", [[0.45, 0], [0.5, 0.02], [0.7, 0.12], [0.82, 0.16], [1, 0.2]]],
    ],
    vaso: [
      ["recto", [[0.38, 0], [0.4, 0.02], [0.4, 0.5], [0.4, 1]]],
      ["con cintura", [[0.38, 0], [0.42, 0.04], [0.44, 0.3], [0.34, 0.62], [0.42, 1]]],
      ["acampanado", [[0.3, 0], [0.32, 0.04], [0.34, 0.45], [0.48, 1]]],
      ["de barril", [[0.34, 0], [0.38, 0.04], [0.47, 0.5], [0.36, 1]]],
      ["más ancho abajo", [[0.46, 0], [0.47, 0.04], [0.4, 0.6], [0.33, 1]]],
    ],
    taza: [
      ["recta", [[0.38, 0], [0.42, 0.03], [0.43, 0.4], [0.43, 0.8]]],
      ["redondeada", [[0.3, 0], [0.36, 0.03], [0.5, 0.3], [0.5, 0.55], [0.45, 0.8]]],
      ["acampanada", [[0.28, 0], [0.31, 0.04], [0.36, 0.4], [0.5, 0.8]]],
      ["de tulipán", [[0.3, 0], [0.34, 0.03], [0.5, 0.35], [0.42, 0.65], [0.48, 0.8]]],
      ["abierta, de café con leche", [[0.25, 0], [0.28, 0.03], [0.42, 0.42], [0.56, 0.72]]],
    ],
    jarron: [
      ["de ánfora, con la panza alta", [[0.3, 0], [0.33, 0.05], [0.55, 0.5], [0.6, 0.9], [0.4, 1.25], [0.2, 1.45], [0.22, 1.6], [0.3, 1.65]]],
      ["de bola con cuello fino", [[0.28, 0], [0.35, 0.05], [0.6, 0.35], [0.5, 0.8], [0.15, 1], [0.12, 1.4], [0.2, 1.55]]],
      ["de lágrima", [[0.35, 0], [0.45, 0.08], [0.6, 0.3], [0.45, 0.75], [0.2, 1.15], [0.15, 1.4], [0.24, 1.55]]],
      ["de hombro marcado", [[0.35, 0], [0.38, 0.05], [0.42, 0.6], [0.55, 0.95], [0.3, 1.15], [0.18, 1.25], [0.2, 1.5], [0.26, 1.55]]],
      ["de cuello acampanado", [[0.3, 0], [0.34, 0.05], [0.5, 0.45], [0.4, 0.8], [0.18, 1.1], [0.22, 1.35], [0.38, 1.6]]],
      ["cilíndrico con cuello", [[0.4, 0], [0.42, 0.05], [0.43, 0.9], [0.35, 1.1], [0.18, 1.2], [0.18, 1.45], [0.24, 1.5]]],
    ],
    botella: [
      ["de cuello de grulla (tsurukubi)", [[0.32, 0], [0.38, 0.04], [0.55, 0.3], [0.45, 0.55], [0.12, 0.75], [0.09, 1.2], [0.12, 1.45]]],
      ["de hombro cuadrado", [[0.4, 0], [0.42, 0.04], [0.43, 0.75], [0.38, 0.88], [0.14, 0.95], [0.12, 1.2], [0.15, 1.25]]],
      ["de calabaza", [[0.3, 0], [0.4, 0.05], [0.52, 0.32], [0.4, 0.62], [0.26, 0.72], [0.34, 0.95], [0.26, 1.15], [0.11, 1.25], [0.11, 1.4], [0.15, 1.45]]],
      ["de lágrima", [[0.36, 0], [0.46, 0.08], [0.5, 0.35], [0.3, 0.8], [0.12, 1.1], [0.1, 1.3], [0.14, 1.35]]],
    ],
    jarra: [
      ["panzuda", [[0.38, 0], [0.43, 0.04], [0.55, 0.4], [0.44, 0.85], [0.42, 1.1]]],
      ["recta", [[0.4, 0], [0.42, 0.03], [0.43, 0.6], [0.43, 1.1]]],
      ["con cintura", [[0.4, 0], [0.45, 0.05], [0.5, 0.35], [0.36, 0.75], [0.44, 1.1]]],
      ["más ancha abajo", [[0.5, 0], [0.52, 0.04], [0.4, 0.7], [0.34, 1.1]]],
    ],
    tarro: [
      ["cilíndrico", [[0.42, 0], [0.45, 0.03], [0.46, 0.6], [0.46, 0.9]]],
      ["redondo", [[0.3, 0], [0.36, 0.04], [0.55, 0.35], [0.52, 0.7], [0.38, 0.88], [0.36, 0.92]]],
      ["de hombro", [[0.36, 0], [0.4, 0.04], [0.5, 0.55], [0.42, 0.78], [0.32, 0.86], [0.32, 0.92]]],
      ["de botica, con cintura", [[0.42, 0], [0.45, 0.04], [0.42, 0.3], [0.36, 0.55], [0.44, 0.92]]],
    ],
    mantequillera: [
      ["baja y ancha", [[0.6, 0], [0.62, 0.03], [0.64, 0.2], [0.66, 0.25]]],
      ["redondeada", [[0.45, 0], [0.5, 0.03], [0.62, 0.18], [0.64, 0.3]]],
    ],
    maceta: [
      ["cónica, de las de siempre", [[0.36, 0], [0.38, 0.03], [0.5, 0.78], [0.56, 0.8], [0.56, 0.95]]],
      ["cilíndrica", [[0.45, 0], [0.47, 0.03], [0.48, 0.5], [0.48, 0.95]]],
      ["de cuenco", [[0.3, 0], [0.36, 0.04], [0.58, 0.4], [0.62, 0.75]]],
      ["de barril", [[0.38, 0], [0.42, 0.04], [0.52, 0.45], [0.44, 0.9]]],
    ],
    portavelas: [
      ["cilíndrico", [[0.36, 0], [0.38, 0.02], [0.38, 0.5], [0.38, 0.85]]],
      ["de farolillo", [[0.3, 0], [0.36, 0.04], [0.46, 0.45], [0.3, 0.82], [0.22, 0.9]]],
      ["cónico", [[0.42, 0], [0.43, 0.03], [0.32, 0.5], [0.22, 0.85]]],
      ["de bola abierta", [[0.32, 0], [0.38, 0.04], [0.52, 0.3], [0.42, 0.58], [0.3, 0.65]]],
    ],
    aceitera: [
      ["de pera", [[0.34, 0], [0.4, 0.05], [0.48, 0.35], [0.3, 0.75], [0.14, 0.95], [0.14, 1.1], [0.18, 1.14]]],
      ["cilíndrica", [[0.36, 0], [0.38, 0.03], [0.38, 0.65], [0.3, 0.8], [0.13, 0.88], [0.13, 1], [0.16, 1.04]]],
      ["redonda", [[0.3, 0], [0.38, 0.05], [0.5, 0.3], [0.4, 0.6], [0.16, 0.78], [0.13, 0.95], [0.17, 1]]],
    ],
  };

  const ASAS = { oreja: "asa de oreja", d: "asa en D", larga: "asa larga", anillo: "asa de anillo" };
  const TAPAS = { pomo: "tapa con pomo", cupula: "tapa de cúpula", plana: "tapa plana", seta: "tapa con pomo de seta" };

  // Qué lleva cada pieza (los id son los de reto.js)
  const PIEZAS = {
    cuenco: { perfiles: "cuenco" },
    salsera: { perfiles: "cuenco", copias: 3 },
    chawan: { perfiles: "chawan" },
    fuente: { perfiles: "fuente", borde: 0.2, alto: 1.6 },
    plato: { perfiles: "plato", borde: 0.2, alto: 2.4 },
    vaso: { perfiles: "vaso" },
    taza: { perfiles: "taza", asas: ["oreja", "d", "larga", "anillo"] },
    espresso: { perfiles: "taza", asas: ["oreja", "d", "anillo"], copias: 2 },
    jarron: { perfiles: "jarron" },
    botella: { perfiles: "botella" },
    jarra: { perfiles: "jarra", asas: ["oreja", "d", "larga"], pico: "pellizco" },
    tarro: { perfiles: "tarro", tapas: ["pomo", "cupula", "plana", "seta"] },
    mantequillera: { perfiles: "mantequillera", tapas: ["cupula", "pomo", "seta"] },
    maceta: { perfiles: "maceta", platillo: true },
    portavelas: { perfiles: "portavelas", agujeros: true },
    aceitera: { perfiles: "aceitera", pico: "tubo" },
  };

  // Las que no son de revolución: se dibujan aparte
  const OTRAS = {
    caja: [["baja y ancha", { w: 1, h: 0.45, d: 0.7 }], ["cúbica", { w: 0.8, h: 0.8, d: 0.8 }], ["alta", { w: 0.55, h: 1, d: 0.55 }], ["alargada, para lápices", { w: 1.3, h: 0.35, d: 0.35 }]],
    incienso: [["de hoja", { forma: "hoja" }], ["redondo", { forma: "redondo" }], ["rectangular", { forma: "rectangular" }]],
    azulejo: [["con una flor", { motivo: "flor" }], ["geométrico", { motivo: "rombo" }], ["de ondas", { motivo: "ondas" }]],
  };

  // Un poco distinto cada vez: más ancho o más alto, y la curva algo movida
  function variar(pts) {
    const ancho = r(0.9, 1.1);
    const alto = r(0.9, 1.1);
    return pts.map(([x, y], i) => [x * ancho * (i && i < pts.length - 1 ? r(0.97, 1.03) : 1), y * alto]);
  }

  function sortear(id, antes) {
    const pieza = PIEZAS[id];
    if (!pieza && !OTRAS[id]) return null;
    for (let intento = 0; intento < 6; intento++) {
      const s = pieza ? sortearPerfil(id, pieza) : sortearOtra(id);
      if (!antes || s.nombre !== antes.nombre || intento === 5) return s;
    }
  }
  function sortearPerfil(id, pieza) {
    const [nombre, pts] = azar(PERFILES[pieza.perfiles]);
    // platos y fuentes: el lateral algo exagerado, para que se vea su perfil
    const perfil = variar(pts).map(([x, y]) => [x, y * (pieza.alto ?? 1)]);
    const s = { id, perfil, borde: pieza.borde ?? 0.16, copias: pieza.copias ?? 1, platillo: pieza.platillo, agujeros: pieza.agujeros, pico: pieza.pico };
    if (pieza.asas) s.asa = azar(pieza.asas);
    if (pieza.tapas) s.tapa = azar(pieza.tapas);
    const con = [ASAS[s.asa], TAPAS[s.tapa], { pellizco: "pico pellizcado", tubo: "pico de tubo" }[s.pico]].filter(Boolean);
    s.nombre = con.length ? `${nombre}, con ${con.join(" y ")}` : nombre;
    return s;
  }
  function sortearOtra(id) {
    const [nombre, datos] = azar(OTRAS[id]);
    const d = { ...datos };
    for (const k of ["w", "h", "d"]) if (d[k]) d[k] *= r(0.92, 1.08);
    return { id, nombre, otra: d };
  }

  // ---------- Dibujo ----------
  // Se dibuja en las unidades del perfil (y hacia arriba) dentro de un grupo
  // escalado; las líneas finas no se escalan (vector-effect)
  const n = (v) => +v.toFixed(3);
  const p = ([x, y]) => `${n(x)} ${n(y)}`;
  const fina = `stroke="${LINEA}" stroke-width="1.2" vector-effect="non-scaling-stroke" stroke-linejoin="round"`;
  let contador = 0;

  // Curva suave que pasa por los puntos (Catmull-Rom → Bézier)
  function curva(pts) {
    let d = "";
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${p(c1)} ${p(c2)} ${p(p2)}`;
    }
    return d;
  }

  // Radio del perfil a una altura (para colocar asas, picos y agujeros)
  function radioEn(pts, y) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      if (y >= Math.min(y1, y2) && y <= Math.max(y1, y2) && y1 !== y2) return x1 + ((y - y1) / (y2 - y1)) * (x2 - x1);
    }
    return pts.at(-1)[0];
  }

  // Cuerpo: contorno, pie sin esmaltar, motas o trazo, y la boca
  function cuerpo(pts, color, { borde = 0.16, abierta = true, dy = 0 } = {}) {
    const q = pts.map(([x, y]) => [x, y + dy]);
    const espejo = q.map(([x, y]) => [-x, y]).reverse();
    const pie = q[0][0];
    const ryPie = pie * 0.14;
    const H = q.at(-1)[1];
    const boca = q.at(-1)[0];
    const d = `M${p(q[0])}${curva(q)} L${p(espejo[0])}${curva(espejo)} A${n(pie)} ${n(ryPie)} 0 0 1 ${p(q[0])} Z`;
    const id = `sil-${++contador}`;
    const ancho = Math.max(...q.map(([x]) => x)) + 0.1;
    let s = `<clipPath id="${id}"><path d="${d}"/></clipPath>`;
    s += `<path d="${d}" fill="${color.cuerpo}"/>`;
    s += `<g clip-path="url(#${id})">`;
    s += `<rect x="${n(-ancho)}" y="${n(dy - ryPie - 0.05)}" width="${n(ancho * 2)}" height="${n(ryPie + 0.05 + Math.min(0.06, H * 0.08))}" fill="${BARRO}"/>`;
    // luz y sombra para que tenga volumen
    s += `<rect x="${n(-ancho)}" y="${n(dy - 1)}" width="${n(ancho * 0.75)}" height="${n(H + 2)}" fill="rgb(255 255 255 / 0.12)"/>`;
    s += `<rect x="${n(ancho * 0.45)}" y="${n(dy - 1)}" width="${n(ancho)}" height="${n(H + 2)}" fill="rgb(0 0 0 / 0.1)"/>`;
    if (color.motas) {
      for (let i = 0; i < 70; i++) s += `<circle cx="${n(r(-ancho, ancho))}" cy="${n(dy + r(0, H))}" r="${n(r(0.006, 0.014))}" fill="rgb(60 40 30 / 0.6)"/>`;
    }
    if (color.trazo) {
      const a = radioEn(pts, H * 0.4);
      s += `<path d="M${n(-a * 0.7)} ${n(dy + H * 0.32)} C${n(-a * 0.2)} ${n(dy + H * 0.55)} ${n(a * 0.2)} ${n(dy + H * 0.2)} ${n(a * 0.75)} ${n(dy + H * 0.5)}" fill="none" stroke="${color.trazo}" stroke-width="${n(Math.max(0.035, H * 0.05))}" stroke-linecap="round"/>`;
    }
    s += `</g><path d="${d}" fill="none" ${fina}/>`;
    if (abierta) s += `<ellipse cx="0" cy="${n(H)}" rx="${n(boca)}" ry="${n(boca * borde)}" fill="${color.interior}" ${fina}/>`;
    return s;
  }

  function asa(pts, tipo, color) {
    const H = pts.at(-1)[1];
    const [ya, yb, sale] = { oreja: [0.78, 0.3, 0.3], d: [0.8, 0.22, 0.24], larga: [0.92, 0.12, 0.2], anillo: [0.8, 0.52, 0.2] }[tipo];
    const a = radioEn(pts, H * ya), b = radioEn(pts, H * yb), m = Math.max(a, b);
    const puntos = tipo === "d"
      ? [[a - 0.03, H * ya], [m + sale * 0.8, H * ya], [m + sale, H * (ya + yb) / 2], [m + sale * 0.8, H * yb], [b - 0.03, H * yb]]
      : [[a - 0.03, H * ya], [m + sale * 0.7, H * ya + 0.04], [m + sale, H * (ya + yb) / 2 + 0.03], [m + sale * 0.6, H * yb - 0.01], [b - 0.03, H * yb]];
    const d = `M${p(puntos[0])}${curva(puntos)}`;
    const grosor = 0.065;
    return `<path d="${d}" fill="none" stroke="${LINEA}" stroke-width="${grosor + 0.025}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${color.cuerpo}" stroke-width="${grosor}" stroke-linecap="round"/>`;
  }

  function picoPellizcado(pts, color) {
    const H = pts.at(-1)[1], x = -pts.at(-1)[0];
    const d = `M${n(x + 0.04)} ${n(H - 0.16)} Q${n(x - 0.05)} ${n(H - 0.03)} ${n(x - 0.17)} ${n(H + 0.05)} L${n(x + 0.06)} ${n(H + 0.01)} Z`;
    return `<path d="${d}" fill="${color.cuerpo}" ${fina}/>`;
  }

  function picoTubo(pts, color) {
    const H = pts.at(-1)[1], y = H * 0.42, x = -radioEn(pts, y);
    const fin = [x - 0.32, H * 0.88];
    const d = `M${n(x + 0.05)} ${n(y)} L${p(fin)}`;
    return `<path d="${d}" fill="none" stroke="${LINEA}" stroke-width="0.105" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${color.cuerpo}" stroke-width="0.08" stroke-linecap="round"/>` +
      `<ellipse cx="${n(fin[0])}" cy="${n(fin[1])}" rx="0.04" ry="0.025" fill="${color.interior}" ${fina}/>`;
  }

  function tapa(pts, tipo, color) {
    const H = pts.at(-1)[1], b = pts.at(-1)[0] * 1.05;
    const alto = { cupula: b * 0.55, pomo: b * 0.28, plana: 0.05, seta: b * 0.3 }[tipo];
    let s = tipo === "plana"
      ? `<rect x="${n(-b)}" y="${n(H)}" width="${n(b * 2)}" height="${n(alto)}" rx="0.02" fill="${color.cuerpo}" ${fina}/>`
      : `<path d="M${n(-b)} ${n(H)} C${n(-b)} ${n(H + alto * 1.3)} ${n(b)} ${n(H + alto * 1.3)} ${n(b)} ${n(H)} Z" fill="${color.cuerpo}" ${fina}/>`;
    const arriba = H + (tipo === "plana" ? alto : alto * 0.97);
    if (tipo === "pomo" || tipo === "plana") s += `<rect x="-0.05" y="${n(arriba - 0.01)}" width="0.1" height="0.09" rx="0.04" fill="${color.cuerpo}" ${fina}/>`;
    if (tipo === "cupula") s += `<circle cx="0" cy="${n(arriba + 0.035)}" r="0.045" fill="${color.cuerpo}" ${fina}/>`;
    if (tipo === "seta") s += `<rect x="-0.025" y="${n(arriba - 0.01)}" width="0.05" height="0.07" fill="${color.cuerpo}" ${fina}/><ellipse cx="0" cy="${n(arriba + 0.075)}" rx="0.08" ry="0.04" fill="${color.cuerpo}" ${fina}/>`;
    return { s, alto: alto + 0.13 };
  }

  function agujeros(pts) {
    const H = pts.at(-1)[1];
    let s = "";
    [[0.3, [-0.55, 0, 0.55]], [0.55, [-0.3, 0.3]]].forEach(([fy, xs]) => {
      const y = H * fy, a = radioEn(pts, y);
      xs.forEach((fx) => { s += `<ellipse cx="${n(a * fx)}" cy="${n(y)}" rx="${n(0.045 * (1 - Math.abs(fx) * 0.5))}" ry="0.055" fill="rgb(42 26 26 / 0.7)"/>`; });
    });
    return s;
  }

  // Una pieza de revolución entera; devuelve el SVG y lo que ocupa
  function piezaPerfil(sil, color) {
    const pts = sil.perfil;
    const H = pts.at(-1)[1];
    const maxR = Math.max(...pts.map(([x]) => x));
    let s = "";
    let dy = 0;
    let derecha = maxR, izquierda = maxR, arriba = H + pts.at(-1)[0] * sil.borde;
    if (sil.platillo) {
      const pie = pts[0][0];
      s += cuerpo([[pie * 1.05, 0], [pie * 1.1, 0.02], [pie * 1.4, 0.09]], color, { borde: 0.2 });
      dy = 0.04;
      izquierda = derecha = Math.max(maxR, pie * 1.4);
    }
    const q = pts.map(([x, y]) => [x, y + dy]);
    if (sil.asa) { s += asa(q, sil.asa, color); derecha += 0.34; }
    if (sil.pico === "tubo") { s += picoTubo(q, color); izquierda += 0.36; }
    s += cuerpo(pts, color, { borde: sil.borde, abierta: !sil.tapa, dy });
    if (sil.agujeros) s += agujeros(q);
    if (sil.pico === "pellizco") { s += picoPellizcado(q, color); izquierda += 0.17; }
    if (sil.tapa) { const t = tapa(q, sil.tapa, color); s += t.s; arriba = H + t.alto; }
    if (sil.pico === "pellizco") arriba += 0.05;
    return { s, izquierda, derecha, arriba: arriba + dy, abajo: pts[0][0] * 0.14 + 0.02 };
  }

  function piezaOtra(sil, color) {
    const o = sil.otra;
    if (sil.id === "caja") {
      const { w, h, d } = o, dx = d * 0.45, dyy = d * 0.3, x0 = -w / 2 - dx / 2, x1 = x0 + w;
      const tapaY = h * 0.78;
      const s = `<rect x="${n(x0)}" y="0" width="${n(w)}" height="${n(h)}" fill="${color.cuerpo}" ${fina}/>` +
        `<path d="M${n(x1)} 0 L${n(x1 + dx)} ${n(dyy)} L${n(x1 + dx)} ${n(h + dyy)} L${n(x1)} ${n(h)} Z" fill="${color.cuerpo}" ${fina}/>` +
        `<path d="M${n(x1)} 0 L${n(x1 + dx)} ${n(dyy)} L${n(x1 + dx)} ${n(h + dyy)} L${n(x1)} ${n(h)} Z" fill="rgb(0 0 0 / 0.15)"/>` +
        `<path d="M${n(x0)} ${n(h)} L${n(x1)} ${n(h)} L${n(x1 + dx)} ${n(h + dyy)} L${n(x0 + dx)} ${n(h + dyy)} Z" fill="${color.interior}" ${fina}/>` +
        `<path d="M${n(x0)} ${n(tapaY)} L${n(x1)} ${n(tapaY)} L${n(x1 + dx)} ${n(tapaY + dyy)}" fill="none" ${fina}/>` +
        `<ellipse cx="${n(dx / 2 - dx / 2)}" cy="${n(h + dyy / 2 + 0.03)}" rx="0.07" ry="0.035" fill="${color.cuerpo}" ${fina}/>`;
      return { s, izquierda: w / 2 + dx / 2, derecha: w / 2 + dx / 2, arriba: h + dyy + 0.08, abajo: 0.03 };
    }
    if (sil.id === "incienso") {
      const g = 0.07;
      let top;
      if (o.forma === "redondo") top = (y) => `<ellipse cx="0" cy="${n(y)}" rx="0.9" ry="0.3"`;
      else if (o.forma === "hoja") top = (y) => `<path d="M-1 ${n(y)} C-0.5 ${n(y + 0.42)} 0.5 ${n(y + 0.42)} 1 ${n(y)} C0.5 ${n(y - 0.42)} -0.5 ${n(y - 0.42)} -1 ${n(y)} Z"`;
      else top = (y) => `<path d="M-0.95 ${n(y - 0.22)} L0.75 ${n(y - 0.22)} L0.95 ${n(y + 0.22)} L-0.75 ${n(y + 0.22)} Z"`;
      // el grueso: la misma forma apilada y más oscura
      let s = "";
      for (let y = 0.3; y < 0.3 + g; y += 0.012) s += `${top(y)} fill="${color.cuerpo}"/>${top(y)} fill="rgb(0 0 0 / 0.22)"/>`;
      s += `${top(0.3)} fill="none" ${fina}/>`;
      s += `${top(0.3 + g)} fill="${color.cuerpo}" ${fina}/>`;
      if (o.forma === "hoja") s += `<path d="M-0.85 ${n(0.3 + g)} Q0 ${n(0.3 + g + 0.05)} 0.85 ${n(0.3 + g)}" fill="none" ${fina}/>`;
      s += `<ellipse cx="0.35" cy="${n(0.3 + g)}" rx="0.035" ry="0.02" fill="rgb(42 26 26 / 0.8)"/>`;
      return { s, izquierda: 1.02, derecha: 1.02, arriba: 0.8, abajo: 0.02 };
    }
    // azulejo
    const t = 0.05;
    let s = `<path d="M0.5 0 L${0.5 + t} ${t} L${0.5 + t} ${1 + t} L0.5 1 Z" fill="${color.cuerpo}" ${fina}/><path d="M0.5 0 L${0.5 + t} ${t} L${0.5 + t} ${1 + t} L0.5 1 Z" fill="rgb(0 0 0 / 0.2)"/>`;
    s += `<rect x="-0.5" y="0" width="1" height="1" fill="${color.cuerpo}" ${fina}/>`;
    const relieve = `fill="none" stroke="${color.interior}" stroke-width="0.035" stroke-linecap="round"`;
    s += `<rect x="-0.42" y="0.08" width="0.84" height="0.84" ${relieve}/>`;
    if (o.motivo === "flor") {
      for (let i = 0; i < 6; i++) s += `<ellipse cx="0" cy="0.67" rx="0.07" ry="0.17" transform="rotate(${i * 60} 0 0.5)" ${relieve}/>`;
      s += `<circle cx="0" cy="0.5" r="0.06" fill="${color.interior}"/>`;
    } else if (o.motivo === "rombo") {
      s += `<path d="M0 0.12 L0.38 0.5 L0 0.88 L-0.38 0.5 Z M0 0.3 L0.2 0.5 L0 0.7 L-0.2 0.5 Z" ${relieve}/>`;
    } else {
      for (let i = 0; i < 4; i++) { const y = 0.24 + i * 0.17; s += `<path d="M-0.36 ${n(y)} Q-0.18 ${n(y + 0.08)} 0 ${n(y)} T0.36 ${n(y)}" ${relieve}/>`; }
    }
    return { s, izquierda: 0.5, derecha: 0.5 + t, arriba: 1 + t, abajo: 0.02 };
  }

  function dibujar(sil, color) {
    if (!sil) return "";
    const una = sil.otra ? piezaOtra(sil, color) : piezaPerfil(sil, color);
    const copias = sil.copias ?? 1;
    const anchoUna = una.izquierda + una.derecha;
    const hueco = anchoUna * 0.12;
    const ancho = copias * anchoUna + (copias - 1) * hueco;
    const alto = una.arriba + una.abajo;
    const k = Math.min(180 / ancho, 140 / alto);
    const tx = 100 - (ancho * k) / 2 + una.izquierda * k;
    const altoSvg = Math.max(80, alto * k + 28); // las piezas bajas, sin hueco encima
    const ty = altoSvg - 12 - una.abajo * k;
    let dentro = "";
    for (let i = 0; i < copias; i++) {
      const x = i * (anchoUna + hueco);
      dentro += `<ellipse cx="${n(x)}" cy="${n(-una.abajo * 0.6)}" rx="${n(anchoUna * 0.5)}" ry="${n(una.abajo * 0.8 + 0.02)}" fill="rgb(42 26 26 / 0.08)"/>`;
      dentro += `<g transform="translate(${n(x)} 0)">${i ? una.s.replace(/sil-(\d+)/g, `sil-$1-${i}`) : una.s}</g>`;
    }
    return `<svg viewBox="0 0 200 ${n(altoSvg)}" role="img" aria-label="Silueta: ${sil.nombre}"><g transform="translate(${n(tx)} ${n(ty)}) scale(${n(k)} ${n(-k)})">${dentro}</g></svg>`;
  }

  window.siluetas = { sortear, dibujar };
})();
