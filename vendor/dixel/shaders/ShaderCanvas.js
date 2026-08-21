Dixel.define('ShaderCanvas', ['Component', 'Utils', 'Pointer', 'Ticker'], function (Component, Utils, Pointer, Ticker) {
  'use strict';

  const VERTEX_SOURCE = [
    'attribute vec2 a_position;',
    'void main() {',
    '  gl_Position = vec4(a_position, 0.0, 1.0);',
    '}'
  ].join('\n');

  const FRAGMENT_HEADER = [
    'precision mediump float;',
    'uniform float u_time;',
    'uniform vec2 u_resolution;',
    'uniform vec2 u_pointer;',
    'uniform float u_scroll;',
    'uniform vec3 u_colorA;',
    'uniform vec3 u_colorB;',
    'uniform vec3 u_colorC;',
    'uniform float u_intensity;',
    'uniform float u_scale;',
    'uniform vec3 u_background;'
  ].join('\n');

  function hexToVec3(hex) {
    const parts = Utils.channels(Utils.color(hex, 'primary'));
    if (!parts) return [0.5, 0.5, 0.5];
    return [parts[0] / 255, parts[1] / 255, parts[2] / 255];
  }

  class ShaderCanvas extends Component {
    static defaults = {
      colorA: 'primary',
      colorB: 'cyan',
      colorC: 'magenta',
      speed: 1,
      intensity: 1,
      scale: 1,
      resolutionScale: 0.75,
      touchResolutionScale: 0.75,
      interactive: true,
      background: null,
      frozenTime: 12
    };

    fragmentShader() {
      return `
float blend(vec2 uv, float t) {
  return 0.5 + 0.5 * sin(uv.x * 4.0 + t) * cos(uv.y * 3.0 - t * 0.7);
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float t = u_time * 0.4;
  vec3 col = mix(u_colorA, u_colorB, blend(uv * u_scale, t));
  col = mix(col, u_colorC, 0.3 * blend(uv * u_scale + 3.0, t * 0.8));
  gl_FragColor = vec4(col * (0.3 + 0.3 * u_intensity), 1.0);
}`;
    }

    onDraw() {}

    ready() {
      this.el.classList.add('dx-shader');
      if (this.options.interactive) this.el.classList.add('dx-shader--interactive');
      this.time = 0;
      this.sizeDirty = true;
      this.contextLost = false;
      this.staticDrawn = false;
      this.colorA = hexToVec3(this.options.colorA);
      this.colorB = hexToVec3(this.options.colorB);
      this.colorC = hexToVec3(this.options.colorC);
      this.background = hexToVec3(this.options.background || 'bg');
      this.canvas = Utils.el('canvas', 'dx-shader-canvas');
      this.el.appendChild(this.canvas);
      this.gl = this.createContext();
      if (!this.gl) {
        this.enableFallback();
        return;
      }
      this.setupProgram();
      this.measure();
      this.addCleanup(() => this.dispose());
      this.listen(window, 'resize', this.measure);
      this.listen(this.canvas, 'webglcontextlost', this.handleContextLost);
      this.listen(this.canvas, 'webglcontextrestored', this.handleContextRestored);
      this.frameBound = this.frame.bind(this);
      this.stopFrame = null;
      this.fpsAccumulated = 0;
      this.fpsSamples = 0;
      this.whenVisible((visible, entry) => {
        if (entry) {
          const rect = entry.boundingClientRect;
          this.rectLeft = rect.left;
          this.rectTopDocument = rect.top + (window.scrollY || 0);
        }
        if (visible && !this.stopFrame) {
          this.stopFrame = Ticker.add(this.frameBound);
        } else if (!visible && this.stopFrame) {
          this.stopFrame();
          this.stopFrame = null;
        }
      });
      this.addCleanup(() => {
        if (this.stopFrame) {
          this.stopFrame();
          this.stopFrame = null;
        }
      });
    }

    createContext() {
      const attributes = {
        alpha: false,
        antialias: false,
        depth: false,
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
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, VERTEX_SOURCE);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, FRAGMENT_HEADER + '\n' + this.fragmentShader());
      const program = gl.createProgram();
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.bindAttribLocation(program, 0, 'a_position');
      gl.linkProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
        const log = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error('Dixel ' + this.constructor.name + ' program link failed: ' + log);
      }
      this.program = program;
      this.buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
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

    handleContextLost(event) {
      event.preventDefault();
      this.contextLost = true;
    }

    handleContextRestored() {
      this.contextLost = false;
      try {
        this.setupProgram();
      } catch (error) {
        this.dispose();
        this.enableFallback();
        return;
      }
      this.sizeDirty = true;
      this.staticDrawn = false;
    }

    measure() {
      const rect = this.el.getBoundingClientRect();
      this.cssWidth = Math.max(1, rect.width);
      this.cssHeight = Math.max(1, rect.height);
      this.rectLeft = rect.left;
      this.rectTopDocument = rect.top + (window.scrollY || 0);
      this.sizeDirty = true;
      this.staticDrawn = false;
    }

    applySize() {
      const touchFactor = Utils.isTouch ? this.options.touchResolutionScale : 1;
      this.lastDpr = Utils.dpr;
      const scale = this.lastDpr * this.options.resolutionScale * touchFactor;
      const width = Math.max(1, Math.round(this.cssWidth * scale));
      const height = Math.max(1, Math.round(this.cssHeight * scale));
      if (this.canvas.width !== width || this.canvas.height !== height) {
        this.canvas.width = width;
        this.canvas.height = height;
      }
      this.gl.viewport(0, 0, width, height);
      this.drawWidth = width;
      this.drawHeight = height;
      this.sizeDirty = false;
    }

    frame(time, delta) {
      if (!this.gl || this.contextLost || !this.visible || document.hidden) return;
      if (this.lastDpr !== undefined && Utils.dpr !== this.lastDpr) this.sizeDirty = true;
      if (Utils.reducedMotion) {
        if (this.staticDrawn && !this.sizeDirty) return;
        this.time = this.options.frozenTime;
        this.draw(delta);
        this.staticDrawn = true;
        return;
      }
      this.fpsAccumulated += delta;
      this.fpsSamples += 1;
      if (this.fpsSamples >= 60) {
        const average = this.fpsAccumulated / this.fpsSamples;
        this.fpsAccumulated = 0;
        this.fpsSamples = 0;
        if (average > 0.022 && this.options.resolutionScale > 0.4) {
          this.options.resolutionScale = Math.max(0.4, this.options.resolutionScale * 0.75);
          this.sizeDirty = true;
        }
      }
      this.time += delta * this.options.speed;
      this.draw(delta);
    }

    draw(delta) {
      const gl = this.gl;
      if (this.sizeDirty) this.applySize();
      const scrollTop = window.scrollY || 0;
      const top = this.rectTopDocument - scrollTop;
      const pointerX = this.options.interactive ? Utils.clamp((Pointer.x - this.rectLeft) / this.cssWidth, 0, 1) : 0.5;
      const pointerY = this.options.interactive ? Utils.clamp(1 - (Pointer.y - top) / this.cssHeight, 0, 1) : 0.5;
      this.setFloat('u_time', this.time);
      this.setVec2('u_resolution', this.drawWidth, this.drawHeight);
      this.setVec2('u_pointer', pointerX, pointerY);
      this.setFloat('u_scroll', scrollTop / Math.max(window.innerHeight, 1));
      this.setVec3('u_colorA', this.colorA);
      this.setVec3('u_colorB', this.colorB);
      this.setVec3('u_colorC', this.colorC);
      this.setVec3('u_background', this.background);
      this.setFloat('u_intensity', this.options.intensity);
      this.setFloat('u_scale', this.options.scale);
      this.onDraw(gl, delta);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    enableFallback() {
      if (this.canvas) {
        this.canvas.remove();
        this.canvas = null;
      }
      const fallback = Utils.el('div', 'dx-shader-fallback');
      fallback.style.setProperty('--dx-shader-a', Utils.color(this.options.colorA, 'primary'));
      fallback.style.setProperty('--dx-shader-b', Utils.color(this.options.colorB, 'cyan'));
      fallback.style.setProperty('--dx-shader-c', Utils.color(this.options.colorC, 'magenta'));
      this.el.appendChild(fallback);
      this.fallback = fallback;
    }

    dispose() {
      const gl = this.gl;
      if (!gl) return;
      if (this.buffer) gl.deleteBuffer(this.buffer);
      if (this.program) gl.deleteProgram(this.program);
      const loseContext = gl.getExtension('WEBGL_lose_context');
      if (loseContext && !gl.isContextLost()) loseContext.loseContext();
      this.gl = null;
      this.program = null;
      this.buffer = null;
      this.uniforms = {};
    }
  }

  return ShaderCanvas;
});
