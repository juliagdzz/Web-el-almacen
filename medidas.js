// Calculadora de contracción con las pastas de SIO-2 (pastas.json).
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

const pastaElegida = () => pastas.find((p) => p.id === Number($("#pasta").value));
const modo = () => document.querySelector('input[name="modo"]:checked').value;

function coccionElegida(pasta) {
  const temperatura = Number(document.querySelector('input[name="temperatura"]:checked')?.value);
  return pasta.cocciones.find((c) => c.temperatura === temperatura) ?? pasta.cocciones.at(-1);
}

function rellenarPastas() {
  const select = $("#pasta");
  for (const tipo of [...new Set(pastas.map((p) => p.tipo))]) {
    const grupo = document.createElement("optgroup");
    grupo.label = tipo;
    for (const p of pastas.filter((x) => x.tipo === tipo)) {
      const chamota = p.chamota ? ` · chamota ${p.chamota}` : "";
      grupo.append(new Option(`${p.nombre} · ${p.descripcion}${chamota}`, p.id));
    }
    select.append(grupo);
  }
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
    ["Cocción", pasta.coccion],
    ["Contracción al secar", `${pct.format(pasta.secado)} %`],
    [`Contracción al cocer (${coccion.temperatura} ºC)`, `${pct.format(coccion.contraccion)} %`],
    ["Contracción total", `${pct.format(total)} %`],
  ];
  if (pasta.porosidad !== null) filas.push(["Absorción de agua", `${pct.format(pasta.porosidad)} %`]);
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
  enlace.textContent = "Ficha en SIO-2 ↗";
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
    pastas = await (await fetch("pastas.json")).json();
  } catch {
    $("#resumen").textContent = "No he podido cargar las pastas.";
    return;
  }
  rellenarPastas();
  const guardado = leerGuardado();
  if (pastas.some((p) => p.id === guardado.pasta)) $("#pasta").value = guardado.pasta;
  if (guardado.modo) document.querySelector(`input[name="modo"][value="${guardado.modo}"]`).checked = true;
  for (const c of CAMPOS) if (guardado[c]) $(`#${c}`).value = guardado[c];
  rellenarTemperaturas(pastaElegida(), guardado.temperatura);

  $("#pasta").addEventListener("change", () => {
    rellenarTemperaturas(pastaElegida());
    calcular();
  });
  document.querySelectorAll('input[name="modo"]').forEach((r) => r.addEventListener("change", calcular));
  for (const c of CAMPOS) $(`#${c}`).addEventListener("input", calcular);
  calcular();
}

arrancar();
