Dixel.define('OctahedronMesh', ['Mesh3D'], function (Mesh3D) {
  'use strict';

  class OctahedronMesh extends Mesh3D {
    static defaults = Object.assign({}, Mesh3D.defaults, {
      radius: 1.3,
      initialRotationX: 0.45,
      initialRotationY: 0.35
    });

    createGeometry() {
      const radius = this.options.radius;
      const polygons = [];
      for (let sx = -1; sx <= 1; sx += 2) {
        for (let sy = -1; sy <= 1; sy += 2) {
          for (let sz = -1; sz <= 1; sz += 2) {
            polygons.push([
              [sx * radius, 0, 0],
              [0, sy * radius, 0],
              [0, 0, sz * radius]
            ]);
          }
        }
      }
      return Mesh3D.buildFacets(polygons);
    }
  }

  return OctahedronMesh;
});
