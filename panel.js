// Panel del taller: lo que espera en encargos, horneados y talleres
(async () => {
  await window.accesoTaller;
  const { data, error } = await window.nube.cliente.rpc("resumen_panel");
  if (error || !data) return;
  const poner = (id, n, uno, varios, sinNada) => {
    const globo = document.getElementById(`globo-${id}`);
    globo.textContent = n > 99 ? "99+" : String(n);
    globo.hidden = !n;
    if (n) document.getElementById(`texto-${id === "bonos" ? "talleres" : id}`).textContent = n === 1 ? uno : varios.replace("N", n);
    else if (sinNada) document.getElementById(`texto-${id === "bonos" ? "talleres" : id}`).textContent = sinNada;
  };
  poner("encargos", data.encargos, "1 encargo nuevo", "N encargos nuevos", "Ningún encargo nuevo");
  poner("horneados", data.horneados, "1 horneado nuevo", "N horneados nuevos", "Ningún horneado nuevo");
  poner("avisos", data.avisos ?? 0, "1 publicación con avisos", "N publicaciones con avisos", "Sin avisos");
  // Esmaltes del taller: cuántos hay y de cuántos queda poco
  window.nube.cliente.from("inventario_esmaltes").select("estado").then(({ data: esmaltes }) => {
    if (!esmaltes?.length) return;
    const poco = esmaltes.filter((x) => x.estado === "poco").length;
    document.getElementById("texto-inventario").textContent =
      `${esmaltes.length === 1 ? "1 esmalte" : `${esmaltes.length} esmaltes`}${poco ? ` · queda poco de ${poco}` : ""}`;
  });
  poner("bonos", data.bonos, "1 bono o mensualidad por activar", "N bonos o mensualidades por activar",
    data.clases_hoy ? `Hoy hay ${data.clases_hoy === 1 ? "1 clase" : `${data.clases_hoy} clases`}` : "Agenda, alumnos y horarios");
})();

// Tienda: cuántas piezas hay a la venta
(async () => {
  await window.accesoTaller;
  const { data } = await window.nube.cliente.from("tienda").select("estado");
  if (!data?.length) return;
  const disponibles = data.filter((p) => p.estado === "disponible").length;
  document.getElementById("texto-tienda").textContent =
    `${disponibles === 1 ? "1 pieza a la venta" : `${disponibles} piezas a la venta`}${data.length > disponibles ? ` · ${data.length - disponibles} reservadas, vendidas u ocultas` : ""}`;
})();
