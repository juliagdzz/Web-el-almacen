// Calculadora de contracción con las pastas de pastas.json que traen sus contracciones
// (SIO-2, Vicar, La Bisbal…).
// La pieza encoge primero al secarse y después, ya seca, al cocerse:
//   seca = húmeda × (1 − secado)      cocida = seca × (1 − cocción)
// Los volúmenes encogen al cubo de lo que encogen las medidas.

const $ = (sel) => document.querySelector(sel);
const CAMPOS = ["alto", "ancho", "fondo", "capacidad"];
const NOMBRES = { alto: "Alto", ancho: "Ancho", fondo: "Fondo", capacidad: "Capacidad" };

const cm = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });
const ml = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });

let pastas = [];

function leerGuardado() {
  try { return JSON.parse(localStorage.getItem("medidas")) ?? {}; } catch { return {}; }
}
function guardar(datos) {
  try { localStorage.setItem("medidas", JSON.stringify(datos)); } catch {}
}

const pastaElegida = () => pastas.find((p) => String(p.id) === $("#pasta").value);
const modo = () => document.querySelector('input[name="modo"]:checked').value;

function coccionElegida(pasta) {
  const temperatura = Number(document.querySelector('input[name="temperatura"]:checked')?.value);
  return pasta.cocciones.find((c) => c.temperatura === temperatura) ?? pasta.cocciones.at(-1);
}

function rellenarPastas() {
  const select = $("#pasta");
  // Un grupo por marca y tipo: «SIO-2 · Baja temperatura», «Vicar · Porcelana»…
  for (const grupoDe of [...new Set(pastas.map((p) => `${p.marca ?? "SIO-2"} · ${p.tipo}`))]) {
    const grupo = document.createElement("optgroup");
    grupo.label = grupoDe;
    for (const p of pastas.filter((x) => `${x.marca ?? "SIO-2"} · ${x.tipo}` === grupoDe)) {
      const chamota = p.chamota ? ` · chamota ${p.chamota}` : "";
      const colada = p.colada ? " · colada" : "";
      grupo.append(new Option(`${p.nombre}${p.descripcion ? ` · ${p.descripcion}` : ""}${chamota}${colada}`, p.id));
    }
    select.append(grupo);
  }
}

// ---------- Elegir la pasta: marcas y buscador, como en el registro de piezas ----------
// La marca elegida se recuerda y es la misma que en las piezas («marcaPastas»).

const marcaDe = (p) => p.marca ?? "SIO-2";
const leerMarca = () => { try { return localStorage.getItem("marcaPastas") || "todas"; } catch { return "todas"; } };
const sinAcentos = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const etiquetaPasta = (p) => `${marcaDe(p) === "SIO-2" ? "" : `${marcaDe(p)} · `}${p.nombre}${p.descripcion ? ` · ${p.descripcion}` : ""}`;
const detallePasta = (p) => [p.chamota && `chamota ${p.chamota}`, p.colada && "colada", p.coccion].filter(Boolean).join(" · ");

function pintarMarcas() {
  const cuenta = new Map();
  for (const p of pastas) cuenta.set(marcaDe(p), (cuenta.get(marcaDe(p)) ?? 0) + 1);
  const marcas = [...cuenta.keys()].sort((a, b) => cuenta.get(b) - cuenta.get(a));
  if (leerMarca() !== "todas" && !cuenta.has(leerMarca())) try { localStorage.setItem("marcaPastas", "todas"); } catch {}
  $("#marcas-pasta").replaceChildren(...["todas", ...marcas].map((m) => window.tarjetaMarca({
    marca: m, cuenta: m === "todas" ? pastas.length : cuenta.get(m), activa: leerMarca() === m,
    alPulsar: () => {
      try { localStorage.setItem("marcaPastas", m); } catch {}
      pintarMarcas();
      if (!$("#lista-pasta").hidden) pintarLista();
    },
  })));
}

// La lista: lo que encaja con lo escrito, en grupos «Marca · tipo»
function pintarLista() {
  const buscar = $("#buscar-pasta");
  const elegida = pastaElegida();
  const texto = buscar.value === (elegida && etiquetaPasta(elegida)) ? "" : buscar.value;
  const palabras = sinAcentos(texto).split(/\s+/).filter(Boolean);
  const encajan = pastas.filter((p) => (leerMarca() === "todas" || marcaDe(p) === leerMarca())
    && palabras.every((pal) => sinAcentos(`${marcaDe(p)} ${p.nombre} ${p.descripcion} ${p.codigo ?? ""} ${p.tipo} ${detallePasta(p)}`).includes(pal)));
  const lista = $("#lista-pasta");
  const filas = [];
  let grupo = null;
  for (const p of encajan) {
    const g = `${marcaDe(p)} · ${p.tipo}`;
    if (g !== grupo) {
      const cabeza = document.createElement("li");
      cabeza.className = "grupo-pastas";
      cabeza.setAttribute("role", "presentation");
      cabeza.textContent = (grupo = g);
      filas.push(cabeza);
    }
    const li = document.createElement("li");
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", String(p === elegida));
    const boton = document.createElement("button");
    boton.type = "button";
    boton.addEventListener("pointerdown", (e) => e.preventDefault()); // que no se cierre antes de elegir
    boton.addEventListener("click", () => elegirPasta(p));
    const nombre = document.createElement("span");
    nombre.textContent = `${p.nombre}${p.descripcion ? ` · ${p.descripcion}` : ""}`;
    const detalle = document.createElement("small");
    detalle.textContent = detallePasta(p);
    boton.append(nombre, detalle);
    li.append(boton);
    filas.push(li);
  }
  if (!encajan.length) {
    const vacio = document.createElement("li");
    vacio.className = "vacio-lista";
    vacio.textContent = leerMarca() === "todas" ? "Ninguna pasta con contracciones encaja con eso." : `Ninguna de ${leerMarca()} encaja: prueba con «Todas».`;
    filas.push(vacio);
  }
  lista.replaceChildren(...filas);
  lista.hidden = false;
  buscar.setAttribute("aria-expanded", "true");
}

function cerrarLista() {
  $("#lista-pasta").hidden = true;
  $("#buscar-pasta").setAttribute("aria-expanded", "false");
  const elegida = pastaElegida();
  if (elegida) $("#buscar-pasta").value = etiquetaPasta(elegida);
}

function elegirPasta(p) {
  $("#pasta").value = String(p.id);
  $("#pasta").dispatchEvent(new Event("change"));
  cerrarLista();
  $("#buscar-pasta").blur();
}

function prepararBuscador() {
  const buscar = $("#buscar-pasta");
  buscar.addEventListener("focus", () => {
    buscar.select();
    pintarLista();
    // arriba de la pantalla, para que la lista se vea entera
    buscar.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });
  buscar.addEventListener("input", pintarLista);
  buscar.addEventListener("blur", cerrarLista);
  buscar.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { cerrarLista(); buscar.blur(); }
    if (e.key !== "Enter") return;
    e.preventDefault();
    $("#lista-pasta li[role=option] button")?.click();
  });
  pintarMarcas();
  cerrarLista();
}

// Las pastas «Hobby cerámico» traen contracción a baja y a alta: se elige
function rellenarTemperaturas(pasta, guardada) {
  const caja = $("#temperaturas");
  caja.hidden = pasta.cocciones.length < 2;
  caja.replaceChildren(...pasta.cocciones.map((c, i) => {
    const label = document.createElement("label");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "temperatura";
    radio.value = c.temperatura;
    radio.checked = guardada ? c.temperatura === guardada : i === pasta.cocciones.length - 1;
    radio.addEventListener("change", calcular);
    label.append(radio, ` Cocida a ${c.temperatura} ºC`);
    return label;
  }));
}

function mostrarFicha(pasta, coccion, total) {
  const filas = [
    ["Cocción", pasta.coccion ?? `${coccion.temperatura} ºC`],
    ["Contracción al secar", `${pct.format(pasta.secado)} %`],
    [`Contracción al cocer (${coccion.temperatura} ºC)`, `${pct.format(coccion.contraccion)} %`],
    ["Contracción total", `${pct.format(total)} %`],
  ];
  if (pasta.porosidad != null) filas.push(["Absorción de agua", `${pct.format(pasta.porosidad)} %`]);
  $("#ficha").replaceChildren(...filas.flatMap(([termino, valor], i) => {
    const dt = document.createElement("dt");
    dt.textContent = termino;
    const dd = document.createElement("dd");
    dd.textContent = valor;
    if (i === 3) dd.className = "total";
    return [dt, dd];
  }));
  const enlace = document.createElement("a");
  enlace.href = pasta.url;
  enlace.target = "_blank";
  enlace.rel = "noopener";
  enlace.textContent = `Ficha en ${pasta.tienda ?? "SIO-2"} ↗`;
  const dd = document.createElement("dd");
  dd.className = "enlace";
  dd.append(enlace);
  $("#ficha").append(dd);
}

function calcular() {
  const pasta = pastaElegida();
  if (!pasta) return;
  const coccion = coccionElegida(pasta);
  const seca = 1 - pasta.secado / 100;            // de húmeda a seca
  const cocida = seca * (1 - coccion.contraccion / 100); // de húmeda a cocida
  const total = (1 - cocida) * 100;
  mostrarFicha(pasta, coccion, total);

  const valores = Object.fromEntries(CAMPOS.map((c) => [c, parseFloat($(`#${c}`).value.replace(",", "."))]));
  const deCocida = modo() === "cocida";
  // Todo se pasa a «medida en húmedo» y desde ahí a seca y cocida
  const filas = CAMPOS.filter((c) => valores[c] > 0).map((campo) => {
    const potencia = campo === "capacidad" ? 3 : 1;
    const humeda = deCocida ? valores[campo] / cocida ** potencia : valores[campo];
    const formato = campo === "capacidad" ? (n) => `${ml.format(n)} ml` : (n) => `${cm.format(n)} cm`;
    return { campo, humeda: formato(humeda), seca: formato(humeda * seca ** potencia), cocida: formato(humeda * cocida ** potencia) };
  });

  $("#tabla").replaceChildren(...filas.map((f) => {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.scope = "row";
    th.textContent = NOMBRES[f.campo];
    tr.append(th);
    for (const columna of ["humeda", "seca", "cocida"]) {
      const td = document.createElement("td");
      td.textContent = f[columna];
      // Se resalta la columna que se ha calculado, no la que se ha escrito
      if ((deCocida && columna === "humeda") || (!deCocida && columna === "cocida")) td.className = "calculada";
      tr.append(td);
    }
    return tr;
  }));

  const ejemplo = filas[0];
  $("#resumen").textContent = !ejemplo
    ? "Escribe al menos una medida."
    : deCocida
      ? `Con ${pasta.nombre} la pieza encoge un ${pct.format(total)} %: para que cocida mida ${ejemplo.cocida} de ${NOMBRES[ejemplo.campo].toLowerCase()}, modélala de ${ejemplo.humeda}.`
      : `Con ${pasta.nombre} la pieza encoge un ${pct.format(total)} %: si en húmedo mide ${ejemplo.humeda}, cocida medirá ${ejemplo.cocida}.`;

  $("#barra-seca").style.width = `${seca * 100}%`;
  $("#barra-seca span").textContent = `Seca ${pct.format(seca * 100)} %`;
  $("#barra-cocida").style.width = `${cocida * 100}%`;
  $("#barra-cocida span").textContent = `Cocida ${pct.format(cocida * 100)} %`;

  guardar({
    pasta: pasta.id,
    temperatura: coccion.temperatura,
    modo: modo(),
    ...Object.fromEntries(CAMPOS.map((c) => [c, $(`#${c}`).value])),
  });
}

async function arrancar() {
  try {
    // Solo las que traen contracción al secar y al cocer
    pastas = (await (await fetch("pastas.json")).json()).filter((p) => p.secado != null && p.cocciones?.length);
  } catch {
    $("#resumen").textContent = "No he podido cargar las pastas.";
    return;
  }
  rellenarPastas();
  const guardado = leerGuardado();
  if (pastas.some((p) => String(p.id) === String(guardado.pasta))) $("#pasta").value = guardado.pasta;
  if (guardado.modo) document.querySelector(`input[name="modo"][value="${guardado.modo}"]`).checked = true;
  for (const c of CAMPOS) if (guardado[c]) $(`#${c}`).value = guardado[c];
  rellenarTemperaturas(pastaElegida(), guardado.temperatura);
  prepararBuscador();

  $("#pasta").addEventListener("change", () => {
    rellenarTemperaturas(pastaElegida());
    calcular();
  });
  document.querySelectorAll('input[name="modo"]').forEach((r) => r.addEventListener("change", calcular));
  for (const c of CAMPOS) $(`#${c}`).addEventListener("input", calcular);
  calcular();
}

arrancar();
