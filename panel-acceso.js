// Puerta del panel del taller: solo pasan los correos de la tabla admins.
// Mientras se comprueba no se enseña nada; cualquier otra persona vuelve a la
// portada. (Los datos además los protegen las reglas de Supabase.)
document.documentElement.classList.add("comprobando-acceso");

window.accesoTaller = (async () => {
  const nube = window.nube;
  const fuera = () => { location.replace("index.html"); return new Promise(() => {}); };
  if (!nube?.activa) return fuera();
  await nube.listo;
  if (!nube.usuario) {
    location.replace(`entrar.html?volver=${encodeURIComponent(location.pathname)}`);
    return new Promise(() => {});
  }
  const { data: esAdmin, error } = await nube.cliente.rpc("es_admin");
  if (error || !esAdmin) return fuera();
  document.documentElement.classList.remove("comprobando-acceso");
  return true;
})();
