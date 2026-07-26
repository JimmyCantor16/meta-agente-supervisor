const fs = require('fs');
const path = require('path');

// El dominio vive en la raíz del proyecto: es EL contrato de todo el sistema.
const ruta = path.join(__dirname, '../dominio.json');
const dominio = JSON.parse(fs.readFileSync(ruta, 'utf8'));

module.exports = dominio;
