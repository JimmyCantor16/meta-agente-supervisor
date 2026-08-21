Dixel.define('IcosaMesh', ['Mesh3D', 'Utils'], function (Mesh3D, Utils) {
  'use strict';

  function buildIcosahedron() {
    const golden = (1 + Math.sqrt(5)) / 2;
    const vertices = [
      [-1, golden, 0], [1, golden, 0], [-1, -golden, 0], [1, -golden, 0],
      [0, -1, golden], [0, 1, golden], [0, -1, -golden], [0, 1, -golden],
      [golden, 0, -1], [golden, 0, 1], [-golden, 0, -1], [-golden, 0, 1]
    ];
    const faces = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
    ];
    return { vertices, faces };
  }

  class IcosaMesh extends Mesh3D {
    static defaults = Object.assign({}, Mesh3D.defaults, {
      detail: 1,
      radius: 1.15,
      initialRotationX: 0.35
    });

    createGeometry() {
      const base = buildIcosahedron();
      const vertices = base.vertices.map((v) => v.slice());
      let faces = base.faces;
      const detail = Math.round(Utils.clamp(this.options.detail, 0, 4));
      const midpointCache = new Map();
      const midpoint = (a, b) => {
        const key = Math.min(a, b) + '_' + Math.max(a, b);
        if (midpointCache.has(key)) return midpointCache.get(key);
        const va = vertices[a];
        const vb = vertices[b];
        vertices.push([(va[0] + vb[0]) / 2, (va[1] + vb[1]) / 2, (va[2] + vb[2]) / 2]);
        const index = vertices.length - 1;
        midpointCache.set(key, index);
        return index;
      };
      for (let level = 0; level < detail; level++) {
        const next = [];
        faces.forEach((face) => {
          const ab = midpoint(face[0], face[1]);
          const bc = midpoint(face[1], face[2]);
          const ca = midpoint(face[2], face[0]);
          next.push([face[0], ab, ca], [face[1], bc, ab], [face[2], ca, bc], [ab, bc, ca]);
        });
        faces = next;
      }
      const radius = this.options.radius;
      const positions = [];
      const normals = [];
      vertices.forEach((v) => {
        const length = Math.hypot(v[0], v[1], v[2]) || 1;
        const nx = v[0] / length;
        const ny = v[1] / length;
        const nz = v[2] / length;
        positions.push(nx * radius, ny * radius, nz * radius);
        normals.push(nx, ny, nz);
      });
      const indices = [];
      faces.forEach((face) => indices.push(face[0], face[1], face[2]));
      return { positions, normals, indices };
    }
  }

  return IcosaMesh;
});
