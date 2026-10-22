// Precios de las clases semanales. Cámbialos aquí: la web los enseña tal cual.
// Las reglas (plazas, 14 días, 24 h para cancelar, cambios de la mensualidad hasta el día 24)
// están en supabase/esquema.sql; si cambias una, cambia también su texto aquí.
const TARIFAS_TALLERES = {
  mensual: {
    nombre: "Mensualidad fija",
    precio: 80,
    por: "al mes",
    resumen: "Tu día y tu hora todas las semanas, con el puesto guardado.",
    detalles: ["Una clase a la semana en tu horario (4 o 5 al mes)", "Se renueva sola cada mes: tu puesto sigue siendo tuyo", "Pausa un mes o déjala cuando quieras, avisando hasta el día 24 del mes anterior"],
  },
  bono4: {
    nombre: "Bono de 4 sesiones",
    precio: 85,
    por: "",
    resumen: "Para venir una o dos veces al mes cuando te venga bien.",
    detalles: ["Reservas cada clase según las plazas libres", "Caduca a los 2 meses", "Cancelas hasta 24 h antes y recuperas la sesión"],
  },
  pack10: {
    nombre: "Pack de 10 clases",
    precio: 190,
    por: "",
    resumen: "Más clases, más margen para organizarte.",
    detalles: ["Reservas cada clase según las plazas libres", "Caduca a los 4 meses", "Cancelas hasta 24 h antes y recuperas la sesión"],
  },
  incluye: "Barro, esmaltes y cocciones incluidos.",
  diasReserva: 14,
};
