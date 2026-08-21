Dixel.define('ConeMesh', ['Mesh3D'], function (Mesh3D) {
  'use strict';

  class ConeMesh extends Mesh3D {
    static defaults = Object.assign({}, Mesh3D.defaults, {
      radius: 1,
      height: 1.8,
      radialSegments: 30,
      initialRotationX: 0.45
    });

    createGeometry() {
      const options = this.options;
      const positions = [];
      const normals = [];
      const indices = [];
      const edges = [];
      const segments = options.radialSegments;
      const radius = options.radius;
      const height = options.height;
      const baseY = -height * 0.42;
      const apexY = height * 0.58;
      const slant = Math.hypot(height, radius);
      const ny = radius / slant;
      const scale = height / slant;
      for (let column = 0; column <= segments; column++) {
        const theta = (column / segments) * Math.PI * 2;
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        positions.push(cos * radius, baseY, sin * radius);
        normals.push(cos * scale, ny, sin * scale);
      }
      const apexBase = positions.length / 3;
      for (let column = 0; column < segments; column++) {
        const theta = ((column + 0.5) / segments) * Math.PI * 2;
        positions.push(0, apexY, 0);
        normals.push(Math.cos(theta) * scale, ny, Math.sin(theta) * scale);
      }
      for (let column = 0; column < segments; column++) {
        indices.push(column, apexBase + column, column + 1);
        edges.push(column, column + 1);
        if (column % 2 === 0) edges.push(column, apexBase + column);
      }
      const center = positions.length / 3;
      positions.push(0, baseY, 0);
      normals.push(0, -1, 0);
      for (let column = 0; column <= segments; column++) {
        const theta = (column / segments) * Math.PI * 2;
        positions.push(Math.cos(theta) * radius, baseY, Math.sin(theta) * radius);
        normals.push(0, -1, 0);
      }
      for (let column = 0; column < segments; column++) {
        indices.push(center, center + 1 + column, center + 2 + column);
      }
      return { positions, normals, indices, edges };
    }
  }

  return ConeMesh;
});
