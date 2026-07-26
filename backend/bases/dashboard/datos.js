/* Datos del panel. El instanciador REEMPLAZA este archivo con el manifiesto
   real del usuario. Los valores de aquí son un ejemplo que ya se ve completo. */
window.DATOS = {
  nombre: "Panel de Control",
  titulo: "Resumen",
  descripcion: "Vista general de tu sistema, de un vistazo.",
  tema: "vidrio",
  secciones: ["Resumen", "Datos"],
  kpis: [
    { etiqueta: "Total de proyectos", valor: "12", delta: "+2 este mes", icono: "📦" },
    { etiqueta: "Recursos activos", valor: "34", delta: "+5", icono: "⚡" },
    { etiqueta: "Costo mensual", valor: "$4,800", delta: "-3%", baja: true, icono: "💳" },
    { etiqueta: "Alertas", valor: "3", delta: "2 nuevas", baja: true, icono: "🔔" }
  ],
  grafica_lineas: {
    titulo: "Evolución de costos",
    datos: [
      { etiqueta: "Ene", valor: 1500 }, { etiqueta: "Feb", valor: 1650 },
      { etiqueta: "Mar", valor: 1400 }, { etiqueta: "Abr", valor: 1820 },
      { etiqueta: "May", valor: 2100 }, { etiqueta: "Jun", valor: 1950 }
    ]
  },
  grafica_barras: {
    titulo: "Costo por proyecto",
    datos: [
      { etiqueta: "Alpha", valor: 3100 }, { etiqueta: "Beta", valor: 2500 },
      { etiqueta: "Gamma", valor: 1700 }, { etiqueta: "Delta", valor: 2200 }
    ]
  },
  tabla: {
    titulo: "Recursos",
    columnas: ["Nombre", "Tipo", "Uso", "Estado"],
    filas: [
      ["Servidor web", "VM", "40%", { texto: "Operativo", estado: "ok" }],
      ["Base de datos", "SQL", "70%", { texto: "Advertencia", estado: "alerta" }],
      ["Almacenamiento", "Blob", "90%", { texto: "Crítico", estado: "peligro" }],
      ["Red virtual", "VNet", "25%", { texto: "Operativo", estado: "ok" }]
    ]
  }
};
