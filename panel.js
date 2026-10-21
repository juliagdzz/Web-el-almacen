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
  poner("bonos", data.bonos, "1 bono o mensualidad por activar", "N bonos o mensualidades por activar",
    data.clases_hoy ? `Hoy hay ${data.clases_hoy === 1 ? "1 clase" : `${data.clases_hoy} clases`}` : "Agenda, alumnos y horarios");
})();
