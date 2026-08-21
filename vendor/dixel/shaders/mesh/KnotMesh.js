Dixel.define('KnotMesh', ['Mesh3D'], function (Mesh3D) {
  'use strict';

  function knotPoint(t, p, q, scale) {
    const r = 2 + Math.cos(q * t);
    return [
      r * Math.cos(p * t) * scale,
      Math.sin(q * t) * scale * 1.2,
      r * Math.sin(p * t) * scale
    ];
  }

  function subtract(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }

  function normalize(v) {
    const length = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / length, v[1] / length, v[2] / length];
  }

  class KnotMesh extends Mesh3D {
    static defaults = Object.assign({}, Mesh3D.defaults, {
      p: 2,
      q: 3,
      tubeRadius: 0.24,
      pathSegments: 150,
      tubeSegments: 12,
      distance: 3.8,
      initialRotationX: 0.5
    });

    createGeometry() {
      const options = this.options;
      const positions = [];
      const normals = [];
      const indices = [];
      const paths = options.pathSegments;
      const tubes = options.tubeSegments;
      const scale = 0.42;
      const epsilon = 0.001;
      for (let step = 0; step <= paths; step++) {
        const t = (step / paths) * Math.PI * 2;
        const center = knotPoint(t, options.p, options.q, scale);
        const ahead = knotPoint(t + epsilon, options.p, options.q, scale);
        const tangent = normalize(subtract(ahead, center));
        const binormal = normalize(cross(tangent, normalize(center)));
        const normal = normalize(cross(binormal, tangent));
        for (let tube = 0; tube <= tubes; tube++) {
          const angle = (tube / tubes) * Math.PI * 2;
          const cosA = Math.cos(angle);
          const sinA = Math.sin(angle);
          const nx = normal[0] * cosA + binormal[0] * sinA;
          const ny = normal[1] * cosA + binormal[1] * sinA;
          const nz = normal[2] * cosA + binormal[2] * sinA;
          positions.push(
            center[0] + nx * options.tubeRadius,
            center[1] + ny * options.tubeRadius,
            center[2] + nz * options.tubeRadius
          );
          normals.push(nx, ny, nz);
        }
      }
      const stride = tubes + 1;
      for (let step = 0; step < paths; step++) {
        for (let tube = 0; tube < tubes; tube++) {
          const a = step * stride + tube;
          const b = a + stride;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
      return { positions, normals, indices, edges: Mesh3D.gridEdges(paths, tubes) };
    }
  }

  return KnotMesh;
});
