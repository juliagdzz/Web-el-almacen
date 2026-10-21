// Insignias: los dibujos (frutos de la huerta en la paleta de El Almacén).
// Los nombres y lo que hay que hacer vienen de la tabla «insignias» de Supabase;
// aquí solo está cómo se ven. Lo usan perfil.js, creaciones.js y comunidad.js.

(() => {
  const T = "#A44E26", TC = "#C86A3E", TO = "#8F4220", G = "#551C25", O = "#9B9A3A", OO = "#4A5A23", C = "#F3E9D8";
  const svg = (titulo, cuerpo) => `<svg viewBox="0 0 64 64" role="img" aria-label="${titulo}">${cuerpo}</svg>`;

  const DIBUJOS = {
    // Naranja con los anillos del torno
    torno: svg("Naranja", `
      <circle cx="32" cy="36" r="20" fill="${TC}"/>
      <ellipse cx="24" cy="29" rx="5" ry="3" transform="rotate(-35 24 29)" fill="${C}" opacity=".6"/>
      <g fill="${TO}" opacity=".5"><circle cx="38" cy="40" r="1"/><circle cx="33" cy="47" r="1"/><circle cx="42" cy="32" r="1"/><circle cx="26" cy="44" r="1"/><circle cx="44" cy="45" r="1"/></g>
      <path d="M32 17c0-5 3-8 8-9-1 5-4 8-8 9z" fill="${OO}"/>
      <path d="M32 17v-4" stroke="${OO}" stroke-width="2.5" stroke-linecap="round"/>`),
    // Tomate brillante, como recién esmaltado
    esmalte: svg("Tomate", `
      <path d="M32 18c12 0 21 7 21 19S44 56 32 56 11 49 11 37s9-19 21-19z" fill="${T}"/>
      <ellipse cx="22" cy="31" rx="5" ry="3" transform="rotate(-30 22 31)" fill="${C}" opacity=".75"/>
      <path d="M32 21l-9-4 6 7-9 2 10 1-3 6 5-5 5 5-3-6 10-1-9-2 6-7z" fill="${OO}"/>
      <path d="M32 21v-9" stroke="${OO}" stroke-width="3" stroke-linecap="round"/>`),
    // Ñora con el rabo curvado, como un asa
    asa: svg("Ñora", `
      <path d="M20 26c6-6 18-6 24 0 4 10 0 24-12 28-12-4-16-18-12-28z" fill="${G}"/>
      <path d="M26 30c-1 7 1 14 5 19" fill="none" stroke="${C}" stroke-width="2" stroke-linecap="round" opacity=".35"/>
      <path d="M24 24c4-3 12-3 16 0" fill="${OO}" stroke="${OO}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M32 22c0-8 6-12 12-11" fill="none" stroke="${OO}" stroke-width="3.5" stroke-linecap="round"/>`),
    // Melón: la pieza grande
    grande: svg("Melón", `
      <ellipse cx="32" cy="36" rx="26" ry="18" fill="${O}" transform="rotate(-12 32 36)"/>
      <path d="M10 40c10-8 34-16 44-10M12 46c12-6 32-12 41-7M14 33c10-8 28-13 36-11" fill="none" stroke="${OO}" stroke-width="2" stroke-linecap="round" opacity=".7"/>
      <path d="M40 20c1-4 3-6 6-7" fill="none" stroke="${OO}" stroke-width="3" stroke-linecap="round"/>`),
    // Racimo de cinco uvas: cinco esmaltes
    cinco: svg("Uvas", `
      <path d="M34 14c6-6 15-5 18 1-6 4-13 4-18-1z" fill="${O}"/>
      <path d="M32 10v8" stroke="${OO}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="23" cy="25" r="7" fill="${G}"/><circle cx="37" cy="25" r="7" fill="${G}"/>
      <circle cx="30" cy="37" r="7" fill="${G}"/><circle cx="44" cy="36" r="7" fill="${G}" opacity=".85"/>
      <circle cx="35" cy="49" r="7" fill="${G}"/>
      <circle cx="21" cy="23" r="1.8" fill="${C}" opacity=".6"/><circle cx="28" cy="35" r="1.8" fill="${C}" opacity=".6"/>`),
    // Almendra: otra pasta
    pasta: svg("Almendra", `
      <path d="M32 8c12 10 16 28 10 40-3 6-17 6-20 0-6-12-2-30 10-40z" fill="${TC}"/>
      <path d="M32 14c-2 10-2 24 0 36M27 20c-3 8-3 18 0 26M37 20c3 8 3 18 0 26" fill="none" stroke="${TO}" stroke-width="1.8" stroke-linecap="round" opacity=".7"/>
      <ellipse cx="32" cy="55" rx="9" ry="2" fill="${TO}" opacity=".25"/>`),
    // Limón y su rodaja: mezclar dos esmaltes
    mezcla: svg("Limón", `
      <path d="M8 33c4-12 20-17 32-12 5 2 8 6 9 10-4 11-20 16-32 11-5-2-8-5-9-9z" fill="${O}" transform="rotate(-18 28 32)"/>
      <path d="M14 22c2-5 8-7 12-5-3 4-8 6-12 5z" fill="${OO}"/>
      <circle cx="46" cy="44" r="12" fill="${C}" stroke="${O}" stroke-width="3"/>
      <path d="M46 34v20M36 44h20M39 37l14 14M53 37L39 51" stroke="${O}" stroke-width="1.6" opacity=".7"/>`),
    // Rama de olivo con aceitunas: receta propia
    receta: svg("Aceitunas", `
      <path d="M10 50C22 40 36 26 54 14" fill="none" stroke="${OO}" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M22 41c-6-1-10 1-12-3 5-2 9-1 12 3zM34 30c-2-6 0-10-3-13-3 5-1 9 3 13zM42 24c6 0 10-3 12 0-5 3-9 3-12 0zM28 36c5 3 7 7 10 6-1-5-5-7-10-6z" fill="${O}"/>
      <ellipse cx="21" cy="49" rx="5" ry="7" transform="rotate(-30 21 49)" fill="${OO}"/>
      <ellipse cx="44" cy="34" rx="5" ry="7" transform="rotate(-30 44 34)" fill="${G}"/>
      <circle cx="42" cy="31" r="1.5" fill="${C}" opacity=".6"/>`),
    // Alcachofa: probetas a la carta
    probeta: svg("Alcachofa", `
      <path d="M32 58v-8" stroke="${OO}" stroke-width="4" stroke-linecap="round"/>
      <path d="M32 50c-14-2-20-12-18-22 6 3 10 8 12 14M32 50c14-2 20-12 18-22-6 3-10 8-12 14" fill="${OO}"/>
      <path d="M32 50c-10-4-13-16-9-26 5 4 8 12 9 19 1-7 4-15 9-19 4 10 1 22-9 26z" fill="${O}"/>
      <path d="M32 44c-5-6-5-20 0-30 5 10 5 24 0 30z" fill="${OO}"/>
      <path d="M32 14c-1-3-3-5-6-6M32 14c1-3 3-5 6-6" stroke="${G}" stroke-width="2.5" stroke-linecap="round" opacity=".8"/>`),
    // Flor de azahar: un buen consejo
    consejo: svg("Azahar", `
      <g fill="${C}" stroke="${OO}" stroke-width="1.6">
        <ellipse cx="32" cy="18" rx="7" ry="11"/>
        <ellipse cx="32" cy="18" rx="7" ry="11" transform="rotate(72 32 32)"/>
        <ellipse cx="32" cy="18" rx="7" ry="11" transform="rotate(144 32 32)"/>
        <ellipse cx="32" cy="18" rx="7" ry="11" transform="rotate(216 32 32)"/>
        <ellipse cx="32" cy="18" rx="7" ry="11" transform="rotate(288 32 32)"/>
      </g>
      <circle cx="32" cy="32" r="6" fill="${O}"/>
      <g fill="${T}"><circle cx="32" cy="24" r="1.6"/><circle cx="39" cy="29" r="1.6"/><circle cx="37" cy="38" r="1.6"/><circle cx="27" cy="38" r="1.6"/><circle cx="25" cy="29" r="1.6"/></g>`),
    // Higo abierto: el problema resuelto, por dentro
    solucion: svg("Higo", `
      <path d="M32 10c3 0 4 4 4 7 10 5 16 15 14 25-2 10-10 16-18 16S16 52 14 42c-2-10 4-20 14-25 0-3 1-7 4-7z" fill="${G}"/>
      <path d="M32 26c8 2 12 9 11 16-1 6-6 10-11 10s-10-4-11-10c-1-7 3-14 11-16z" fill="${TC}"/>
      <g fill="${C}"><circle cx="28" cy="36" r="1.3"/><circle cx="34" cy="33" r="1.3"/><circle cx="36" cy="41" r="1.3"/><circle cx="29" cy="44" r="1.3"/><circle cx="33" cy="47" r="1.3"/><circle cx="25" cy="40" r="1.3"/><circle cx="39" cy="37" r="1.3"/></g>
      <path d="M32 10c0-3 2-5 5-5" fill="none" stroke="${OO}" stroke-width="2.5" stroke-linecap="round"/>`),
    // Granada abierta: lo que sale mal también enseña lo de dentro
    error: svg("Granada abierta", `
      <path d="M26 14l2-6 4 4 4-4 2 6z" fill="${G}"/>
      <circle cx="32" cy="36" r="22" fill="${G}"/>
      <path d="M32 18l5 10-4 6 7 6-6 6 3 10H25l3-10-6-6 7-6-4-6z" fill="${C}"/>
      <g fill="${T}"><circle cx="31" cy="27" r="2"/><circle cx="29" cy="37" r="2.2"/><circle cx="35" cy="40" r="2.2"/><circle cx="30" cy="47" r="2.2"/><circle cx="34" cy="33" r="1.8"/><circle cx="33" cy="52" r="1.8"/></g>`),
  };

  const GRUPOS = {
    hitos: "Primeras veces",
    exploracion: "Explorar",
    comunidad: "Aportar a la comunidad",
    error: "Aprender del error",
  };

  window.insignias = {
    GRUPOS,
    dibujo: (id) => DIBUJOS[id] ?? svg("Insignia", `<circle cx="32" cy="32" r="20" fill="${O}"/>`),

    // El catálogo y las que tiene alguien (las suyas, o las de otra persona si las enseña)
    async cargar(cliente, userId) {
      const [{ data: catalogo, error }, { data: ganadas, error: error2 }] = await Promise.all([
        cliente.from("insignias").select("*").order("orden"),
        cliente.from("insignias_ganadas").select("insignia_id,ganada,vista").eq("user_id", userId),
      ]);
      if (error || error2) throw error || error2;
      const porId = new Map(ganadas.map((g) => [g.insignia_id, g]));
      return catalogo.map((i) => ({ ...i, ...porId.get(i.id), tiene: porId.has(i.id) }));
    },
  };
})();
