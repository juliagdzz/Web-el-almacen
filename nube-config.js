// Datos del proyecto de Supabase (Project Settings → API Keys).
// Los dos son públicos: la seguridad la ponen las reglas de supabase/esquema.sql.
// Si se dejan vacíos, la web funciona como antes: todo solo en el móvil.
window.NUBE_CONFIG = {
  url: "https://gzhvetzlzhkapvvoelly.supabase.co",
  clave: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6aHZldHpsemhrYXB2dm9lbGx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI0ODgzNDMsImV4cCI6MjEwODA2NDM0M30.0ZM_GAYktN6NhvMYrGSGoy3v0yz_mriwXlj-T-fUZrA",
  // El botón de Google aparece solo cuando está activado en Supabase
  // (entrar.js lo pregunta); esto solo se usa si no se puede preguntar
  google: false,
};
