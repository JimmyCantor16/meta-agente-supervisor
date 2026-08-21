Dixel.define('Mesh3D', ['Component', 'Utils', 'Pointer'], function (Component, Utils, Pointer) {
  'use strict';

  function hexToVec3(hex) {
    const parts = Utils.channels(Utils.color(hex, 'primary'));
    if (!parts) return [0.5, 0.5, 0.5];
    return [parts[0] / 255, parts[1] / 255, parts[2] / 255];
  }

  function mat4Identity() {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  }

  function mat4Perspective(fovDegrees, aspect, near, far) {
    const m = new Float32Array(16);
    const f = 1 / Math.tan((fovDegrees * Math.PI) / 360);
    m[0] = f / aspect;
    m[5] = f;
    m[10] = (far + near) / (near - far);
    m[11] = -1;
    m[14] = (2 * far * near) / (near - far);
    return m;
  }

  function mat4LookAt(eye, target, up) {
    const zx = eye[0] - target[0];
    const zy = eye[1] - target[1];
    const zz = eye[2] - target[2];
    const zl = 1 / Math.hypot(zx, zy, zz);
    const z = [zx * zl, zy * zl, zz * zl];
    const xx = up[1] * z[2] - up[2] * z[1];
    const xy = up[2] * z[0] - up[0] * z[2];
    const xz = up[0] * z[1] - up[1] * z[0];
    const xl = 1 / Math.hypot(xx, xy, xz);
    const x = [xx * xl, xy * xl, xz * xl];
    const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    const m = mat4Identity();
    m[0] = x[0]; m[4] = x[1]; m[8] = x[2];
    m[1] = y[0]; m[5] = y[1]; m[9] = y[2];
    m[2] = z[0]; m[6] = z[1]; m[10] = z[2];
    m[12] = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]);
    m[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]);
    m[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]);
    return m;
  }

  function mat4RotationX(angle) {
    const m = mat4Identity();
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    m[5] = c; m[9] = -s;
    m[6] = s; m[10] = c;
    return m;
  }

  function mat4RotationY(angle) {
    const m = mat4Identity();
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    m[0] = c; m[8] = s;
    m[2] = -s; m[10] = c;
    return m;
  }

  function mat4Multiply(a, b) {
    const m = new Float32Array(16);
    for (let column = 0; column < 4; column++) {
      for (let row = 0; row < 4; row++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[column * 4 + k];
        m[column * 4 + row] = sum;
      }
    }
    return m;
  }

  function uniqueEdges(positions, pairs) {
    const keyOf = (index) =>
      positions[index * 3].toFixed(3) + ',' + positions[index * 3 + 1].toFixed(3) + ',' + positions[index * 3 + 2].toFixed(3);
    const seen = new Set();
    const edges = [];
    for (let i = 0; i < pairs.length; i += 2) {
      const a = keyOf(pairs[i]);
      const b = keyOf(pairs[i + 1]);
      if (a === b) continue;
      const key = a < b ? a + '|' + b : b + '|' + a;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push(pairs[i], pairs[i + 1]);
    }
    return edges;
  }

  function gridEdges(rows, columns) {
    const stride = columns + 1;
    const edges = [];
    for (let row = 0; row <= rows; row++) {
      for (let column = 0; column <= columns; column++) {
        const index = row * stride + column;
        if (column < columns) edges.push(index, index + 1);
        if (row < rows) edges.push(index, index + stride);
      }
    }
    return edges;
  }

  function buildFacets(polygons) {
    const positions = [];
    const normals = [];
    const indices = [];
    const outline = [];
    polygons.forEach((polygon) => {
      const [a, b, c] = polygon;
      let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]);
      let ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
      let nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
      const length = Math.hypot(nx, ny, nz) || 1;
      nx /= length;
      ny /= length;
      nz /= length;
      let cx = 0;
      let cy = 0;
      let cz = 0;
      polygon.forEach((point) => {
        cx += point[0];
        cy += point[1];
        cz += point[2];
      });
      let points = polygon;
      if (nx * cx + ny * cy + nz * cz < 0) {
        points = polygon.slice().reverse();
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      const base = positions.length / 3;
      points.forEach((point) => {
        positions.push(point[0], point[1], point[2]);
        normals.push(nx, ny, nz);
      });
      for (let i = 1; i < points.length - 1; i++) indices.push(base, base + i, base + i + 1);
      for (let i = 0; i < points.length; i++) outline.push(base + i, base + ((i + 1) % points.length));
    });
    return { positions, normals, indices, edges: uniqueEdges(positions, outline) };
  }

  const VERTEX_TEMPLATE = [
    'attribute vec3 a_position;',
    'attribute vec3 a_normal;',
    'uniform mat4 u_mvp;',
    'uniform mat4 u_model;',
    'uniform float u_time;',
    'varying vec3 v_normal;',
    'varying vec3 v_world;',
    'varying float v_viewZ;',
    '{{CHUNK}}',
    'void main() {',
    '  vec3 pos = displace(a_position);',
    '  vec3 nor = displaceNormal(a_position, a_normal);',
    '  mat3 rotation = mat3(u_model[0].xyz, u_model[1].xyz, u_model[2].xyz);',
    '  v_normal = normalize(rotation * nor);',
    '  vec4 world = u_model * vec4(pos, 1.0);',
    '  v_world = world.xyz;',
    '  vec4 clip = u_mvp * vec4(pos, 1.0);',
    '  v_viewZ = clip.w;',
    '  gl_Position = clip;',
    '}'
  ].join('\n');

  const DEFAULT_CHUNK = [
    'vec3 displace(vec3 p) { return p; }',
    'vec3 displaceNormal(vec3 p, vec3 n) { return n; }'
  ].join('\n');

  const WIREFRAME_FRAGMENT = [
    'precision mediump float;',
    'uniform vec3 u_colorA;',
    'uniform vec3 u_colorB;',
    'uniform float u_intensity;',
    'uniform vec2 u_depthRange;',
    'varying vec3 v_normal;',
    'varying vec3 v_world;',
    'varying float v_viewZ;',
    'void main() {',
    '  float depth = smoothstep(u_depthRange.x, u_depthRange.y, v_viewZ);',
    '  float fade = mix(1.0, 0.12, depth);',
    '  vec3 col = mix(mix(u_colorB, vec3(1.0), 0.42), u_colorA, depth);',
    '  gl_FragColor = vec4(col * fade * u_intensity * 1.25, 1.0);',
    '}'
  ].join('\n');

  const SOLID_FRAGMENT = [
    'precision mediump float;',
    'uniform vec3 u_colorA;',
    'uniform vec3 u_colorB;',
    'uniform vec3 u_colorC;',
    'uniform vec3 u_eye;',
    'uniform float u_intensity;',
    'varying vec3 v_normal;',
    'varying vec3 v_world;',
    'varying float v_viewZ;',
    'void main() {',
    '  vec3 n = normalize(v_normal);',
    '  if (!gl_FrontFacing) n = -n;',
    '  vec3 lightDir = normalize(vec3(-0.45, 0.85, 0.55));',
    '  vec3 viewDir = normalize(u_eye - v_world);',
    '  float diffuse = max(dot(n, lightDir), 0.0);',
    '  float fill = max(dot(n, normalize(vec3(0.6, -0.35, 0.35))), 0.0);',
    '  float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 2.6);',
    '  float specular = pow(max(dot(reflect(-lightDir, n), viewDir), 0.0), 26.0);',
    '  vec3 col = mix(u_colorA * 0.16, mix(u_colorA, u_colorB, 0.5), diffuse);',
    '  col += u_colorB * fill * 0.22;',
    '  col += u_colorC * fresnel * 0.85 * u_intensity;',
    '  col += vec3(1.0) * specular * 0.32;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  const CHROME_FRAGMENT = [
    'precision mediump float;',
    'uniform vec3 u_colorA;',
    'uniform vec3 u_colorB;',
    'uniform vec3 u_colorC;',
    'uniform vec3 u_eye;',
    'uniform float u_intensity;',
    'varying vec3 v_normal;',
    'varying vec3 v_world;',
    'varying float v_viewZ;',
    'vec3 studioEnvironment(vec2 m) {',
    '  vec3 col = mix(u_colorA * 0.18, mix(u_colorB, vec3(1.0), 0.55), smoothstep(-0.85, 0.9, m.y));',
    '  col += vec3(1.0) * exp(-abs(m.y + 0.12) * 16.0) * 0.75;',
    '  col += mix(u_colorC, vec3(1.0), 0.35) * exp(-abs(m.y - 0.58) * 10.0) * 0.55;',
    '  col += u_colorA * exp(-abs(m.y + 0.62) * 12.0) * 0.4;',
    '  col *= 0.9 + 0.1 * sin(m.x * 3.0);',
    '  return col;',
    '}',
    'void main() {',
    '  vec3 n = normalize(v_normal);',
    '  if (!gl_FrontFacing) n = -n;',
    '  vec3 viewDir = normalize(u_eye - v_world);',
    '  vec3 reflected = reflect(-viewDir, n);',
    '  vec3 col = studioEnvironment(reflected.xy) * (0.55 + 0.45 * u_intensity);',
    '  float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);',
    '  col += mix(u_colorB, vec3(1.0), 0.5) * fresnel * 0.9;',
    '  vec3 lightDir = normalize(vec3(-0.45, 0.85, 0.55));',
    '  float specular = pow(max(dot(reflect(-lightDir, n), viewDir), 0.0), 70.0);',
    '  col += vec3(1.0) * specular * 0.85;',
    '  float grazing = pow(max(dot(reflect(-normalize(vec3(0.7, 0.2, 0.5)), n), viewDir), 0.0), 30.0);',
    '  col += u_colorC * grazing * 0.35;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  class Mesh3D extends Component {
    static defaults = {
      colorA: 'primary',
      colorB: 'cyan',
      colorC: 'magenta',
      background: 'bg',
      mode: 'wireframe',
      speed: 1,
      intensity: 1,
      fov: 42,
      distance: 3.4,
      autoRotateX: 0.1,
      autoRotateY: 0.32,
      initialRotationX: 0.4,
      initialRotationY: 0.6,
      drag: true,
      dragStrength: 0.006,
      inertia: 1.6,
      parallax: 0.16,
      resolutionScale: 1,
      touchResolutionScale: 0.8,
      frozenRotationY: 0.9
    };

    createGeometry() {
      const faces = [
        { normal: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
        { normal: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
        { normal: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
        { normal: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
        { normal: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
        { normal: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] }
      ];
      const size = 0.85;
      const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      const polygons = faces.map((face) =>
        corners.map(([su, sv]) => [
          (face.normal[0] + face.u[0] * su + face.v[0] * sv) * size,
          (face.normal[1] + face.u[1] * su + face.v[1] * sv) * size,
          (face.normal[2] + face.u[2] * su + face.v[2] * sv) * size
        ])
      );
      return buildFacets(polygons);
    }

    vertexChunk() {
      return DEFAULT_CHUNK;
    }

    ready() {
      const mode = String(this.options.mode || 'wireframe').toLowerCase();
      this.renderMode = mode === 'solid' || mode === 'chrome' ? mode : 'wireframe';
      this.el.classList.add('dx-mesh');
      if (this.options.drag && !Utils.reducedMotion) this.el.classList.add('dx-mesh--drag');
      this.time = 0;
      this.sizeDirty = true;
      this.contextLost = false;
      this.staticDrawn = false;
      this.dragging = false;
      this.dragDX = 0;
      this.dragDY = 0;
      this.rotationX = this.options.initialRotationX;
      this.rotationY = this.options.initialRotationY;
      this.velocityX = this.options.autoRotateX * this.options.speed;
      this.velocityY = this.options.autoRotateY * this.options.speed;
      this.parallaxX = 0;
      this.parallaxY = 0;
      this.colorA = hexToVec3(this.options.colorA);
      this.colorB = hexToVec3(this.options.colorB);
      this.colorC = hexToVec3(this.options.colorC);
      this.backgroundColor = hexToVec3(this.options.background);
      this.canvas = Utils.el('canvas', 'dx-mesh-canvas');
      this.el.appendChild(this.canvas);
      this.gl = this.createContext();
      if (!this.gl) {
        this.enableFallback();
        return;
      }
      this.buildGeometry();
      this.setupProgram();
      this.uploadBuffers();
      this.measure();
      this.addCleanup(Pointer.use());
      this.addCleanup(() => this.dispose());
      this.listen(window, 'resize', this.measure);
      this.listen(this.canvas, 'webglcontextlost', this.handleContextLost);
      this.listen(this.canvas, 'webglcontextrestored', this.handleContextRestored);
      if (this.options.drag) {
        this.listen(this.el, 'pointerdown', this.handleDragStart);
        this.listen(window, 'pointermove', this.handleDragMove);
        this.listen(window, 'pointerup', this.handleDragEnd);
        this.listen(window, 'pointercancel', this.handleDragEnd);
      }
      this.whenVisible(() => {});
      this.onFrame(this.frame);
    }

    createContext() {
      const attributes = {
        alpha: false,
        antialias: true,
        depth: true,
        stencil: false,
        preserveDrawingBuffer: false
      };
      try {
        return (
          this.canvas.getContext('webgl', attributes) ||
          this.canvas.getContext('experimental-webgl', attributes)
        );
      } catch (error) {
        return null;
      }
    }

    buildGeometry() {
      const geometry = this.createGeometry();
      this.positions = geometry.positions instanceof Float32Array ? geometry.positions : new Float32Array(geometry.positions);
      this.normals = geometry.normals instanceof Float32Array ? geometry.normals : new Float32Array(geometry.normals);
      this.indices = geometry.indices instanceof Uint16Array ? geometry.indices : new Uint16Array(geometry.indices);
      this.vertexCount = this.positions.length / 3;
      let maxRadius = 0;
      for (let i = 0; i < this.positions.length; i += 3) {
        const length = Math.hypot(this.positions[i], this.positions[i + 1], this.positions[i + 2]);
        if (length > maxRadius) maxRadius = length;
      }
      this.radius = Math.max(maxRadius, 0.001);
      if (this.renderMode === 'wireframe') {
        const edges = geometry.edges || this.buildEdges(this.indices);
        this.edges = edges instanceof Uint16Array ? edges : new Uint16Array(edges);
      }
    }

    buildEdges(indices) {
      const seen = new Set();
      const edges = [];
      for (let i = 0; i < indices.length; i += 3) {
        for (let corner = 0; corner < 3; corner++) {
          const a = indices[i + corner];
          const b = indices[i + ((corner + 1) % 3)];
          const key = Math.min(a, b) * 65536 + Math.max(a, b);
          if (seen.has(key)) continue;
          seen.add(key);
          edges.push(a, b);
        }
      }
      return new Uint16Array(edges);
    }

    compileShader(type, source) {
      const gl = this.gl;
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
        const log = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error('Dixel ' + this.constructor.name + ' shader compile failed: ' + log);
      }
      return shader;
    }

    setupProgram() {
      const gl = this.gl;
      const vertexSource = VERTEX_TEMPLATE.replace('{{CHUNK}}', this.vertexChunk());
      const mode = this.renderMode;
      const fragmentSource = mode === 'solid' ? SOLID_FRAGMENT : mode === 'chrome' ? CHROME_FRAGMENT : WIREFRAME_FRAGMENT;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);
      const program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.bindAttribLocation(program, 0, 'a_position');
      gl.bindAttribLocation(program, 1, 'a_normal');
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
        const log = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error('Dixel ' + this.constructor.name + ' program link failed: ' + log);
      }
      this.program = program;
      gl.useProgram(program);
      this.cacheUniforms();
    }

    cacheUniforms() {
      const gl = this.gl;
      this.uniforms = {};
      const total = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < total; i++) {
        const info = gl.getActiveUniform(this.program, i);
        if (!info) continue;
        const name = info.name.replace('[0]', '');
        this.uniforms[name] = gl.getUniformLocation(this.program, info.name);
      }
    }

    uploadBuffers() {
      const gl = this.gl;
      this.positionBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.positions, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      this.normalBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.normals, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      this.indexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
      const elements = this.renderMode === 'wireframe' ? this.edges : this.indices;
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, elements, gl.STATIC_DRAW);
      this.elementCount = elements.length;
    }

    setFloat(name, value) {
      const location = this.uniforms[name];
      if (location) this.gl.uniform1f(location, value);
    }

    setVec2(name, x, y) {
      const location = this.uniforms[name];
      if (location) this.gl.uniform2f(location, x, y);
    }

    setVec3(name, value) {
      const location = this.uniforms[name];
      if (location) this.gl.uniform3f(location, value[0], value[1], value[2]);
    }

    setMat4(name, value) {
      const location = this.uniforms[name];
      if (location) this.gl.uniformMatrix4fv(location, false, value);
    }

    handleContextLost(event) {
      event.preventDefault();
      this.contextLost = true;
    }

    handleContextRestored() {
      this.contextLost = false;
      this.setupProgram();
      this.uploadBuffers();
      this.sizeDirty = true;
      this.staticDrawn = false;
    }

    handleDragStart(event) {
      if (Utils.reducedMotion || this.dragging) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      this.dragging = true;
      this.dragPointerId = event.pointerId;
      this.dragLastX = event.clientX;
      this.dragLastY = event.clientY;
      this.dragDX = 0;
      this.dragDY = 0;
      this.el.classList.add('dx-mesh--dragging');
    }

    handleDragMove(event) {
      if (!this.dragging || event.pointerId !== this.dragPointerId) return;
      this.dragDX += event.clientX - this.dragLastX;
      this.dragDY += event.clientY - this.dragLastY;
      this.dragLastX = event.clientX;
      this.dragLastY = event.clientY;
    }

    handleDragEnd(event) {
      if (!this.dragging) return;
      if (event && event.pointerId !== undefined && event.pointerId !== this.dragPointerId) return;
      this.dragging = false;
      this.el.classList.remove('dx-mesh--dragging');
    }

    measure() {
      const rect = this.el.getBoundingClientRect();
      this.cssWidth = Math.max(1, rect.width);
      this.cssHeight = Math.max(1, rect.height);
      this.sizeDirty = true;
      this.staticDrawn = false;
    }

    applySize() {
      const touchFactor = Utils.isTouch ? this.options.touchResolutionScale : 1;
      const scale = Utils.dpr * this.options.resolutionScale * touchFactor;
      const width = Math.max(1, Math.round(this.cssWidth * scale));
      const height = Math.max(1, Math.round(this.cssHeight * scale));
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }
      this.gl.viewport(0, 0, width, height);
      this.drawWidth = width;
      this.drawHeight = height;
      this.projection = mat4Perspective(this.options.fov, width / height, 0.1, this.options.distance + this.radius * 4);
      this.sizeDirty = false;
    }

    frame(time, delta) {
      if (!this.gl || this.contextLost || !this.visible || document.hidden) return;
      if (Utils.reducedMotion) {
        if (this.staticDrawn && !this.sizeDirty) return;
        this.rotationX = this.options.initialRotationX;
        this.rotationY = this.options.frozenRotationY;
        this.parallaxX = 0;
        this.parallaxY = 0;
        this.time = 4;
        this.draw();
        this.staticDrawn = true;
        return;
      }
      const options = this.options;
      if (this.dragging) {
        const stepY = this.dragDX * options.dragStrength;
        const stepX = this.dragDY * options.dragStrength;
        this.rotationY += stepY;
        this.rotationX += stepX;
        this.velocityY = stepY / Math.max(delta, 0.001);
        this.velocityX = stepX / Math.max(delta, 0.001);
        this.dragDX = 0;
        this.dragDY = 0;
      } else {
        this.velocityY = Utils.damp(this.velocityY, options.autoRotateY * options.speed, options.inertia, delta);
        this.velocityX = Utils.damp(this.velocityX, options.autoRotateX * options.speed, options.inertia, delta);
        this.rotationY += this.velocityY * delta;
        this.rotationX += this.velocityX * delta;
      }
      const parallaxTargetY = this.dragging ? 0 : Pointer.normalX * options.parallax;
      const parallaxTargetX = this.dragging ? 0 : Pointer.normalY * options.parallax;
      this.parallaxY = Utils.damp(this.parallaxY, parallaxTargetY, 3, delta);
      this.parallaxX = Utils.damp(this.parallaxX, parallaxTargetX, 3, delta);
      this.time += delta * options.speed;
      this.draw();
    }

    draw() {
      const gl = this.gl;
      if (this.sizeDirty) this.applySize();
      const distance = this.options.distance;
      const eye = [0, 0, distance];
      const view = mat4LookAt(eye, [0, 0, 0], [0, 1, 0]);
      const model = mat4Multiply(
        mat4RotationY(this.rotationY + this.parallaxY),
        mat4RotationX(this.rotationX + this.parallaxX)
      );
      const mvp = mat4Multiply(mat4Multiply(this.projection, view), model);
      gl.useProgram(this.program);
      this.setMat4('u_mvp', mvp);
      this.setMat4('u_model', model);
      this.setFloat('u_time', this.time);
      this.setFloat('u_intensity', this.options.intensity);
      this.setVec3('u_colorA', this.colorA);
      this.setVec3('u_colorB', this.colorB);
      this.setVec3('u_colorC', this.colorC);
      this.setVec3('u_eye', eye);
      this.setVec2('u_depthRange', distance - this.radius, distance + this.radius);
      const bg = this.backgroundColor;
      gl.clearColor(bg[0], bg[1], bg[2], 1);
      if (this.renderMode !== 'wireframe') {
        gl.disable(gl.BLEND);
        gl.enable(gl.DEPTH_TEST);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.drawElements(gl.TRIANGLES, this.elementCount, gl.UNSIGNED_SHORT, 0);
      } else {
        gl.disable(gl.DEPTH_TEST);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.lineWidth(1.5);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawElements(gl.LINES, this.elementCount, gl.UNSIGNED_SHORT, 0);
      }
    }

    enableFallback() {
      if (this.canvas) {
        this.canvas.remove();
        this.canvas = null;
      }
      const fallback = Utils.el('div', 'dx-mesh-fallback');
      fallback.style.setProperty('--dx-mesh-a', Utils.color(this.options.colorA, 'primary'));
      fallback.style.setProperty('--dx-mesh-b', Utils.color(this.options.colorB, 'cyan'));
      fallback.style.setProperty('--dx-mesh-c', Utils.color(this.options.colorC, 'magenta'));
      this.el.appendChild(fallback);
      this.fallback = fallback;
    }

    dispose() {
      const gl = this.gl;
      if (!gl) return;
      if (this.positionBuffer) gl.deleteBuffer(this.positionBuffer);
      if (this.normalBuffer) gl.deleteBuffer(this.normalBuffer);
      if (this.indexBuffer) gl.deleteBuffer(this.indexBuffer);
      if (this.program) gl.deleteProgram(this.program);
      const loseContext = gl.getExtension('WEBGL_lose_context');
      if (loseContext && !gl.isContextLost()) loseContext.loseContext();
      this.gl = null;
      this.program = null;
      this.positionBuffer = null;
      this.normalBuffer = null;
      this.indexBuffer = null;
      this.uniforms = {};
    }
  }

  Mesh3D.mat4Identity = mat4Identity;
  Mesh3D.mat4Perspective = mat4Perspective;
  Mesh3D.mat4LookAt = mat4LookAt;
  Mesh3D.mat4RotationX = mat4RotationX;
  Mesh3D.mat4RotationY = mat4RotationY;
  Mesh3D.mat4Multiply = mat4Multiply;
  Mesh3D.uniqueEdges = uniqueEdges;
  Mesh3D.gridEdges = gridEdges;
  Mesh3D.buildFacets = buildFacets;

  return Mesh3D;
});
