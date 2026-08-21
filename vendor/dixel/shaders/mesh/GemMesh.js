Dixel.define('GemMesh', ['Mesh3D'], function (Mesh3D) {
  'use strict';

  class GemMesh extends Mesh3D {
    static defaults = Object.assign({}, Mesh3D.defaults, {
      facets: 8,
      radius: 1.05,
      tableRatio: 0.52,
      crownHeight: 0.38,
      pavilionDepth: 0.95,
      initialRotationX: 0.55
    });

    createGeometry() {
      const options = this.options;
      const count = Math.max(5, Math.round(options.facets));
      const radius = options.radius;
      const offsetY = (options.pavilionDepth - options.crownHeight) / 2;
      const girdleY = offsetY;
      const tableY = options.crownHeight + offsetY;
      const culet = [0, -options.pavilionDepth + offsetY, 0];
      const girdle = [];
      const table = [];
      for (let i = 0; i < count; i++) {
        const theta = (i / count) * Math.PI * 2;
        const thetaTable = ((i + 0.5) / count) * Math.PI * 2;
        girdle.push([Math.cos(theta) * radius, girdleY, Math.sin(theta) * radius]);
        table.push([
          Math.cos(thetaTable) * radius * options.tableRatio,
          tableY,
          Math.sin(thetaTable) * radius * options.tableRatio
        ]);
      }
      const polygons = [table.slice()];
      for (let i = 0; i < count; i++) {
        const next = (i + 1) % count;
        polygons.push([girdle[i], girdle[next], table[i]]);
        polygons.push([table[i], girdle[next], table[next]]);
        polygons.push([girdle[i], girdle[next], culet]);
      }
      return Mesh3D.buildFacets(polygons);
    }
  }

  return GemMesh;
});
