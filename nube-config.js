// Datos del proyecto de Supabase (Project Settings → API / Data API).
// Los dos son públicos: la seguridad la ponen las reglas de supabase/esquema.sql.
// Mientras estén vacíos, la web funciona como siempre: todo solo en el móvil.
window.NUBE_CONFIG = {
  url: "",   // https://xxxxxxxx.supabase.co
  clave: "", // anon public (eyJ…) o publishable (sb_publishable_…)
};
