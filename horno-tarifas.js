// Tarifas del servicio de horneado. Cambia aquí los números y se aplican en horno.html.

const TARIFAS = {
  horno: {
    nombre: "Horno eléctrico de 100 litros",
    litros: 100,
    // Un horno nunca se llena del todo (placas, soportes, huecos): el precio se reparte
    // sobre esta parte de su capacidad. 0.8 = el 80 %.
    aprovechamiento: 0.8,
  },

  // Precio del horno completo para cada tipo de cocción
  coccion: {
    baja: { nombre: "Baja temperatura", detalle: "Hasta unos 1050 ºC: loza, bizcocho, esmaltes de baja", completo: 85, temperatura: 1000 },
    alta: { nombre: "Alta temperatura", detalle: "Hasta unos 1260 ºC: gres y porcelana", completo: 120, temperatura: 1250 },
  },

  // Bizcocho: las piezas se pueden apilar y meter unas dentro de otras
  bizcocho: {
    apilado: 0.6,   // ocupan el 60 % de su volumen
    holgura: 0.5,   // cm de margen alrededor
  },

  // Esmaltado: las piezas no se pueden tocar
  esmaltado: {
    holgura: 1.5,   // cm de separación por cada lado y por arriba
  },

  // Trípode o soporte para piezas esmaltadas por debajo
  tripode: {
    altura: 1.5,    // cm que sube la pieza
    precio: 0.5,    // € por trípode
  },

  minimo: 2,        // € como mínimo por pieza
  redondeo: 0.1,    // los precios se redondean hacia arriba a 10 céntimos
};
