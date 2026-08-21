Dixel.define('WavePlaneMesh', ['Mesh3D'], function (Mesh3D) {
  'use strict';

  class WavePlaneMesh extends Mesh3D {
    static defaults = Object.assign({}, Mesh3D.defaults, {
      size: 2.8,
      segments: 52,
      amplitude: 0.2,
      waveScale: 1,
      initialRotationX: -1.05,
      initialRotationY: 0.3,
      autoRotateX: 0,
      autoRotateY: 0.1,
      distance: 3.6
    });

    vertexChunk() {
      const amplitude = Number(this.options.amplitude).toFixed(4);
      const waveScale = Number(this.options.waveScale).toFixed(4);
      return [
        'const float WAVE_AMP = ' + amplitude + ';',
        'const float WAVE_SCALE = ' + waveScale + ';',
        'float waveHeight(vec2 q, float t) {',
        '  q *= WAVE_SCALE;',
        '  return (sin(q.x * 2.4 + t * 1.2) * 0.9 + sin(q.y * 2.0 + t * 0.9) * 0.8 + sin((q.x + q.y) * 3.3 + t * 1.6) * 0.4) * WAVE_AMP;',
        '}',
        'vec3 displace(vec3 p) {',
        '  return vec3(p.x, p.y, waveHeight(p.xy, u_time));',
        '}',
        'vec3 displaceNormal(vec3 p, vec3 n) {',
        '  vec2 q = p.xy * WAVE_SCALE;',
        '  float t = u_time;',
        '  float dzdx = (cos(q.x * 2.4 + t * 1.2) * 0.9 * 2.4 + cos((q.x + q.y) * 3.3 + t * 1.6) * 0.4 * 3.3) * WAVE_AMP * WAVE_SCALE;',
        '  float dzdy = (cos(q.y * 2.0 + t * 0.9) * 0.8 * 2.0 + cos((q.x + q.y) * 3.3 + t * 1.6) * 0.4 * 3.3) * WAVE_AMP * WAVE_SCALE;',
        '  return normalize(vec3(-dzdx, -dzdy, 1.0));',
        '}'
      ].join('\n');
    }

    createGeometry() {
      const options = this.options;
      const positions = [];
      const normals = [];
      const indices = [];
      const segments = options.segments;
      const size = options.size;
      for (let row = 0; row <= segments; row++) {
        const y = (row / segments - 0.5) * size;
        for (let column = 0; column <= segments; column++) {
          const x = (column / segments - 0.5) * size;
          positions.push(x, y, 0);
          normals.push(0, 0, 1);
        }
      }
      const stride = segments + 1;
      for (let row = 0; row < segments; row++) {
        for (let column = 0; column < segments; column++) {
          const a = row * stride + column;
          const b = a + stride;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
      return { positions, normals, indices, edges: Mesh3D.gridEdges(segments, segments) };
    }
  }

  return WavePlaneMesh;
});
