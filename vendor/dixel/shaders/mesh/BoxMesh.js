Dixel.define('BoxMesh', ['Mesh3D'], function (Mesh3D) {
  'use strict';

  const AXES = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

  function scaled(axis, factor) {
    return [axis[0] * factor, axis[1] * factor, axis[2] * factor];
  }

  function sum3(a, b, c) {
    return [a[0] + b[0] + c[0], a[1] + b[1] + c[1], a[2] + b[2] + c[2]];
  }

  class BoxMesh extends Mesh3D {
    static defaults = Object.assign({}, Mesh3D.defaults, {
      size: 1.7,
      bevel: 0.14,
      initialRotationX: 0.5,
      initialRotationY: 0.75
    });

    createGeometry() {
      const half = this.options.size / 2;
      const bevel = Math.min(Math.max(this.options.bevel, 0), half * 0.45);
      const inner = half - bevel;
      const polygons = [];
      for (let axis = 0; axis < 3; axis++) {
        const u = AXES[(axis + 1) % 3];
        const v = AXES[(axis + 2) % 3];
        for (let sign = -1; sign <= 1; sign += 2) {
          const face = scaled(AXES[axis], sign * half);
          polygons.push(CORNERS.map(([su, sv]) => sum3(face, scaled(u, su * inner), scaled(v, sv * inner))));
        }
      }
      if (bevel > 0.001) {
        const pairs = [[0, 1, 2], [0, 2, 1], [1, 2, 0]];
        pairs.forEach(([a1, a2, w]) => {
          for (let s1 = -1; s1 <= 1; s1 += 2) {
            for (let s2 = -1; s2 <= 1; s2 += 2) {
              const edgeA = sum3(scaled(AXES[a1], s1 * half), scaled(AXES[a2], s2 * inner), [0, 0, 0]);
              const edgeB = sum3(scaled(AXES[a1], s1 * inner), scaled(AXES[a2], s2 * half), [0, 0, 0]);
              polygons.push([
                sum3(edgeA, scaled(AXES[w], -inner), [0, 0, 0]),
                sum3(edgeA, scaled(AXES[w], inner), [0, 0, 0]),
                sum3(edgeB, scaled(AXES[w], inner), [0, 0, 0]),
                sum3(edgeB, scaled(AXES[w], -inner), [0, 0, 0])
              ]);
            }
          }
        });
        for (let sx = -1; sx <= 1; sx += 2) {
          for (let sy = -1; sy <= 1; sy += 2) {
            for (let sz = -1; sz <= 1; sz += 2) {
              polygons.push([
                [sx * half, sy * inner, sz * inner],
                [sx * inner, sy * half, sz * inner],
                [sx * inner, sy * inner, sz * half]
              ]);
            }
          }
        }
      }
      return Mesh3D.buildFacets(polygons);
    }
  }

  return BoxMesh;
});
