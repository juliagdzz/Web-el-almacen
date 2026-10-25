// Inventario de esmaltes del taller: qué hay y qué queda poco (tabla
// inventario_esmaltes de Supabase). Lo usan los tableros, las piezas y la página
// del inventario. Se guarda una copia en el móvil para verlo también sin conexión.
//
// Un esmalte de Prodesco se reconoce por su enlace (y si no, por su código).
// Si el taller aún no ha apuntado nada, no se enseña ninguna marca.

(() => {
  // Una sola vez: las líneas de Tecniglaze favoritas del taller (Speckglaze Picas y
  // Reactivos) pasan a «mis series» también si ya habías elegido series antes
  try {
    const guardadas = JSON.parse(localStorage.getItem("seriesFavoritas"));
    if (Array.isArray(guardadas) && !localStorage.getItem("seriesTecniglaze")) {
      localStorage.setItem("seriesFavoritas", JSON.stringify([...new Set([...guardadas, "Speckglaze Esmaltes Picas", "Esmaltes Reactivos"])]));
    }
    localStorage.setItem("seriesTecniglaze", "1");
  } catch {}

  const CLAVE = "inventarioTaller";
  const normal = (t) => String(t ?? "").trim().toLowerCase();
  const clave = (e) => e?.url || (e?.codigo ? `codigo:${normal(e.codigo)}` : null);

  let mapa = new Map();
  let porCodigo = new Map();
  function poner(lista) {
    mapa = new Map(lista.map((x) => [x.clave, x]));
    porCodigo = new Map(lista.filter((x) => x.codigo).map((x) => [normal(x.codigo), x]));
  }
  try { poner(JSON.parse(localStorage.getItem(CLAVE)) ?? []); } catch {}

  let promesa = null;
  function cargar(forzar = false) {
    if (forzar) promesa = null;
    promesa ??= (async () => {
      const cliente = window.nube?.cliente;
      if (!cliente) return mapa;
      const { data, error } = await cliente.from("inventario_esmaltes").select("clave,codigo,nombre,serie,color,miniatura,estado,nota");
      if (error) throw error;
      poner(data);
      try { localStorage.setItem(CLAVE, JSON.stringify(data)); } catch {}
      repintar();
      document.dispatchEvent(new Event("inventario:actualizado"));
      return mapa;
    })().catch(() => mapa);
    return promesa;
  }

  // "hay", "poco", "no" o null (el taller no ha apuntado nada todavía)
  function estado(e) {
    if (!mapa.size || !e) return null;
    const x = mapa.get(clave(e)) ?? (e.codigo ? porCodigo.get(normal(e.codigo)) : null);
    return x?.estado ?? "no";
  }

  const TEXTOS = {
    hay: { corto: "En el taller", icono: "✓" },
    poco: { corto: "Queda poco", icono: "!" },
    no: { corto: "No hay en el taller", icono: "✕" },
  };

  // Marca pequeña: <span class="stock stock-hay">✓ En el taller</span>.
  // forma "punto" deja solo el icono (para las chapas del corcho)
  function marca(e, forma = "texto") {
    const el = document.createElement("span");
    el.dataset.stockClave = clave(e) ?? "";
    el.dataset.stockCodigo = e?.codigo ?? "";
    el.dataset.stockForma = forma;
    pintarMarca(el);
    return el;
  }
  function pintarMarca(el) {
    const e = { url: el.dataset.stockClave.startsWith("codigo:") ? null : el.dataset.stockClave, codigo: el.dataset.stockCodigo };
    const s = estado(e);
    el.hidden = !s;
    if (!s) return;
    el.className = `stock stock-${s} stock-${el.dataset.stockForma}`;
    el.title = TEXTOS[s].corto;
    el.setAttribute("aria-label", TEXTOS[s].corto);
    el.textContent = el.dataset.stockForma === "punto" ? TEXTOS[s].icono : `${TEXTOS[s].icono} ${TEXTOS[s].corto}`;
  }
  function repintar(raiz = document) {
    raiz.querySelectorAll("[data-stock-forma]").forEach(pintarMarca);
  }

  window.inventarioTaller = {
    clave, cargar, estado, marca, repintar,
    texto: (e) => TEXTOS[estado(e)]?.corto ?? "",
    hayDatos: () => mapa.size > 0,
    todos: () => [...mapa.values()],
  };
  Promise.resolve(window.nube?.listo).then(() => cargar());
})();

// Fabricantes del catálogo: Prodesco y Tecniglaze (Díez Ceramic). Una etiqueta
// para cada esmalte y una fila de botones para elegir de cuál ver. La elección se
// recuerda en el móvil y vale para tableros, piezas e inventario.
(() => {
  const MARCAS = ["Prodesco", "Tecniglaze"];
  const CLAVE = "marcaEsmaltes";
  const marcaDe = (e) => e?.marca || (/diezceramic\.com/.test(e?.url ?? e?.clave ?? "") ? "Tecniglaze" : "Prodesco");
  const leer = () => { try { const v = localStorage.getItem(CLAVE); return MARCAS.includes(v) ? v : "todas"; } catch { return "todas"; } };
  const guardar = (v) => { try { localStorage.setItem(CLAVE, v); } catch {} };

  function etiqueta(e) {
    const marca = marcaDe(e);
    const el = document.createElement("span");
    el.className = `marca-esmalte marca-${marca.toLowerCase()}`;
    el.textContent = marca;
    return el;
  }

  // Fila «Todas · Prodesco · Tecniglaze» con cuántos hay de cada una
  function filtro(caja, lista, alCambiar) {
    const actual = leer();
    const cuenta = (m) => (m === "todas" ? lista.length : lista.filter((e) => marcaDe(e) === m).length);
    caja.replaceChildren(...["todas", ...MARCAS].map((m) => window.tarjetaMarca({
      marca: m, cuenta: cuenta(m), activa: actual === m,
      clase: m === "todas" ? "" : `marca-${m.toLowerCase()}`,
      alPulsar: () => { guardar(m); alCambiar(m); },
    })));
  }

  const encaja = (e, marca = leer()) => marca === "todas" || marcaDe(e) === marca;
  window.marcasEsmaltes = { MARCAS, marcaDe, etiqueta, filtro, elegida: leer, encaja };
})();
