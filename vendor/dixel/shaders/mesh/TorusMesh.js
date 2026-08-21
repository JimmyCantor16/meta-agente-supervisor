Dixel.define('TorusMesh', ['Mesh3D'], function (Mesh3D) {
  'use strict';

  class TorusMesh extends Mesh3D {
    static defaults = Object.assign({}, Mesh3D.defaults, {
      ringRadius: 1,
      tubeRadius: 0.38,
      ringSegments: 48,
      tubeSegments: 22,
      initialRotationX: 0.7
    });

    createGeometry() {
      const options = this.options;
      const positions = [];
      const normals = [];
      const indices = [];
      const rings = options.ringSegments;
      const tubes = options.tubeSegments;
      for (let ring = 0; ring <= rings; ring++) {
        const u = (ring / rings) * Math.PI * 2;
        const cosU = Math.cos(u);
        const sinU = Math.sin(u);
        for (let tube = 0; tube <= tubes; tube++) {
          const v = (tube / tubes) * Math.PI * 2;
          const cosV = Math.cos(v);
          const sinV = Math.sin(v);
          const centerDistance = options.ringRadius + options.tubeRadius * cosV;
          positions.push(centerDistance * cosU, options.tubeRadius * sinV, centerDistance * sinU);
          normals.push(cosV * cosU, sinV, cosV * sinU);
        }
      }
      const stride = tubes + 1;
      for (let ring = 0; ring < rings; ring++) {
        for (let tube = 0; tube < tubes; tube++) {
          const a = ring * stride + tube;
          const b = a + stride;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
      return { positions, normals, indices, edges: Mesh3D.gridEdges(rings, tubes) };
    }
  }

  return TorusMesh;
});
