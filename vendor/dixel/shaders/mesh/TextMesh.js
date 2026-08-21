Dixel.define('TextMesh', ['Mesh3D'], function (Mesh3D) {
  'use strict';

  class TextMesh extends Mesh3D {
    static defaults = Object.assign({}, Mesh3D.defaults, {
      text: 'DIXEL',
      font: 'Inter, system-ui, sans-serif',
      weight: 800,
      rows: 15,
      width: 3.6,
      depth: 0.5,
      wave: 0.18,
      waveSpeed: 1.4,
      initialRotationX: 0.12,
      initialRotationY: -0.3
    });

    rasterizeText() {
      const rows = Math.max(8, this.options.rows | 0);
      const probe = document.createElement('canvas');
      const probeContext = probe.getContext('2d', { willReadFrequently: true });
      const fontSize = 100;
      probeContext.font = this.options.weight + ' ' + fontSize + 'px ' + this.options.font;
      const metrics = probeContext.measureText(this.options.text);
      const textWidth = Math.max(metrics.width, 1);
      const columns = Math.max(4, Math.round((textWidth / fontSize) * rows * 1.02));
      probe.width = columns;
      probe.height = rows;
      probeContext.font = this.options.weight + ' ' + fontSize + 'px ' + this.options.font;
      probeContext.textAlign = 'center';
      probeContext.textBaseline = 'middle';
      probeContext.save();
      probeContext.scale(columns / textWidth, rows / (fontSize * 1.04));
      probeContext.fillStyle = '#fff';
      probeContext.fillText(this.options.text, textWidth / 2, fontSize * 0.54);
      probeContext.restore();
      const pixels = probeContext.getImageData(0, 0, columns, rows).data;
      const filled = [];
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          if (pixels[(row * columns + column) * 4 + 3] > 96) filled.push([column, row]);
        }
      }
      return { filled, columns, rows };
    }

    createGeometry() {
      const raster = this.rasterizeText();
      const columns = raster.columns;
      const rows = raster.rows;
      const cell = this.options.width / columns;
      const halfWidth = this.options.width / 2;
      const halfHeight = (rows * cell) / 2;
      const halfDepth = this.options.depth / 2;
      const occupied = new Set(raster.filled.map((entry) => entry[0] + ':' + entry[1]));
      const polygons = [];
      raster.filled.forEach((entry) => {
        const column = entry[0];
        const row = entry[1];
        const x0 = -halfWidth + column * cell;
        const x1 = x0 + cell;
        const y1 = halfHeight - row * cell;
        const y0 = y1 - cell;
        polygons.push([[x0, y0, halfDepth], [x1, y0, halfDepth], [x1, y1, halfDepth], [x0, y1, halfDepth]]);
        polygons.push([[x1, y0, -halfDepth], [x0, y0, -halfDepth], [x0, y1, -halfDepth], [x1, y1, -halfDepth]]);
        if (!occupied.has(column + ':' + (row - 1))) {
          polygons.push([[x0, y1, halfDepth], [x1, y1, halfDepth], [x1, y1, -halfDepth], [x0, y1, -halfDepth]]);
        }
        if (!occupied.has(column + ':' + (row + 1))) {
          polygons.push([[x1, y0, halfDepth], [x0, y0, halfDepth], [x0, y0, -halfDepth], [x1, y0, -halfDepth]]);
        }
        if (!occupied.has(column - 1 + ':' + row)) {
          polygons.push([[x0, y0, -halfDepth], [x0, y0, halfDepth], [x0, y1, halfDepth], [x0, y1, -halfDepth]]);
        }
        if (!occupied.has(column + 1 + ':' + row)) {
          polygons.push([[x1, y0, halfDepth], [x1, y0, -halfDepth], [x1, y1, -halfDepth], [x1, y1, halfDepth]]);
        }
      });
      return Mesh3D.buildFacets(polygons);
    }

    vertexChunk() {
      if (!this.options.wave) {
        return [
          'vec3 displace(vec3 p) { return p; }',
          'vec3 displaceNormal(vec3 p, vec3 n) { return n; }'
        ].join('\n');
      }
      const amplitude = Number(this.options.wave).toFixed(4);
      const speed = Number(this.options.waveSpeed).toFixed(4);
      return [
        'vec3 displace(vec3 p) {',
        '  float wave = sin(p.x * 2.1 + u_time * ' + speed + ') * ' + amplitude + ';',
        '  float twist = sin(p.x * 1.3 + u_time * ' + speed + ' * 0.7) * ' + amplitude + ' * 0.5;',
        '  return vec3(p.x, p.y + wave, p.z + twist);',
        '}',
        'vec3 displaceNormal(vec3 p, vec3 n) {',
        '  float slope = cos(p.x * 2.1 + u_time * ' + speed + ') * ' + amplitude + ' * 2.1;',
        '  return normalize(vec3(n.x - slope * n.y, n.y, n.z));',
        '}'
      ].join('\n');
    }
  }

  return TextMesh;
});
