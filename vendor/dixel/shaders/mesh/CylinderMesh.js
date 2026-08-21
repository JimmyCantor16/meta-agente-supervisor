Dixel.define('CylinderMesh', ['Mesh3D'], function (Mesh3D) {
  'use strict';

  class CylinderMesh extends Mesh3D {
    static defaults = Object.assign({}, Mesh3D.defaults, {
      radius: 0.85,
      height: 1.7,
      radialSegments: 30,
      initialRotationX: 0.55
    });

    createGeometry() {
      const options = this.options;
      const positions = [];
      const normals = [];
      const indices = [];
      const edges = [];
      const segments = options.radialSegments;
      const radius = options.radius;
      const halfHeight = options.height / 2;
      const stride = segments + 1;
      for (let row = 0; row < 2; row++) {
        const y = row === 0 ? -halfHeight : halfHeight;
        for (let column = 0; column <= segments; column++) {
          const theta = (column / segments) * Math.PI * 2;
          const cos = Math.cos(theta);
          const sin = Math.sin(theta);
          positions.push(cos * radius, y, sin * radius);
          normals.push(cos, 0, sin);
        }
      }
      for (let column = 0; column < segments; column++) {
        const a = column;
        const b = column + stride;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
        edges.push(a, a + 1, b, b + 1, a, b);
      }
      for (let side = -1; side <= 1; side += 2) {
        const y = side * halfHeight;
        const center = positions.length / 3;
        positions.push(0, y, 0);
        normals.push(0, side, 0);
        for (let column = 0; column <= segments; column++) {
          const theta = (column / segments) * Math.PI * 2;
          positions.push(Math.cos(theta) * radius, y, Math.sin(theta) * radius);
          normals.push(0, side, 0);
        }
        for (let column = 0; column < segments; column++) {
          indices.push(center, center + 1 + column, center + 2 + column);
        }
      }
      return { positions, normals, indices, edges };
    }
  }

  return CylinderMesh;
});
