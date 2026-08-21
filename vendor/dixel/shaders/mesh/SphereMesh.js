Dixel.define('SphereMesh', ['Mesh3D'], function (Mesh3D) {
  'use strict';

  class SphereMesh extends Mesh3D {
    static defaults = Object.assign({}, Mesh3D.defaults, {
      radius: 1.15,
      widthSegments: 28,
      heightSegments: 18,
      initialRotationX: 0.35
    });

    createGeometry() {
      const options = this.options;
      const positions = [];
      const normals = [];
      const indices = [];
      const edges = [];
      const widths = options.widthSegments;
      const heights = options.heightSegments;
      const radius = options.radius;
      for (let row = 0; row <= heights; row++) {
        const phi = (row / heights) * Math.PI;
        const sinPhi = Math.sin(phi);
        const cosPhi = Math.cos(phi);
        for (let column = 0; column <= widths; column++) {
          const theta = (column / widths) * Math.PI * 2;
          const nx = sinPhi * Math.cos(theta);
          const ny = cosPhi;
          const nz = sinPhi * Math.sin(theta);
          positions.push(nx * radius, ny * radius, nz * radius);
          normals.push(nx, ny, nz);
        }
      }
      const stride = widths + 1;
      for (let row = 0; row < heights; row++) {
        for (let column = 0; column < widths; column++) {
          const a = row * stride + column;
          const b = a + stride;
          if (row > 0) indices.push(a, b, a + 1);
          if (row < heights - 1) indices.push(a + 1, b, b + 1);
          edges.push(a, b);
          if (row > 0) edges.push(a, a + 1);
        }
      }
      return { positions, normals, indices, edges };
    }
  }

  return SphereMesh;
});
