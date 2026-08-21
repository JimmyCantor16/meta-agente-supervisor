Dixel.define('RippleClickShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  const MAX_RIPPLES = 8;

  class RippleClickShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 1,
      intensity: 1,
      scale: 1,
      resolutionScale: 0.85,
      interactive: true,
      frozenTime: 9
    });

    ready() {
      this.ripples = new Float32Array(MAX_RIPPLES * 4);
      this.rippleIndex = 0;
      super.ready();
      this.listen(this.el, 'click', this.launchRipple);
    }

    launchRipple(event) {
      if (!this.gl) return;
      const minSide = Math.min(this.cssWidth, this.cssHeight);
      const top = this.rectTopDocument - (window.scrollY || 0);
      const localX = (event.clientX - this.rectLeft) / this.cssWidth;
      const localY = (event.clientY - top) / this.cssHeight;
      const slot = this.rippleIndex * 4;
      this.ripples[slot] = (localX * 2 - 1) * (this.cssWidth / minSide);
      this.ripples[slot + 1] = (1 - localY * 2) * (this.cssHeight / minSide);
      this.ripples[slot + 2] = this.time;
      this.ripples[slot + 3] = 1;
      this.rippleIndex = (this.rippleIndex + 1) % MAX_RIPPLES;
    }

    onDraw(gl) {
      const location = this.uniforms.u_ripples;
      if (location) gl.uniform4fv(location, this.ripples);
    }

    fragmentShader() {
      return `
uniform vec4 u_ripples[8];
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 3; i++) {
    value += amplitude * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    amplitude *= 0.5;
  }
  return value;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float minSide = min(u_resolution.x, u_resolution.y);
  vec2 aspect = u_resolution / minSide;
  vec2 p = (uv * 2.0 - 1.0) * aspect;
  float t = u_time;
  float height = 0.0;
  vec2 flowOffset = vec2(0.0);
  for (int i = 0; i < 8; i++) {
    vec4 ripple = u_ripples[i];
    float age = t - ripple.z;
    float alive = ripple.w * step(0.0, age) * smoothstep(3.4, 0.5, age);
    float radius = age * 0.55;
    vec2 d = p - ripple.xy;
    float dist = length(d);
    float band = dist - radius;
    float wave = cos(band * 34.0) * exp(-band * band * 46.0) * alive;
    height += wave;
    flowOffset += normalize(d + 0.0001) * wave * 0.03;
  }
  vec2 q = (p + flowOffset * 2.5) * 2.2 * u_scale;
  float shimmer = fbm(q + vec2(t * 0.12, -t * 0.08));
  float shimmer2 = fbm(q * 1.8 - vec2(t * 0.07, t * 0.1));
  float depthMix = clamp(uv.y * 0.7 + shimmer * 0.3 + height * 0.4, 0.0, 1.0);
  vec3 col = mix(u_colorA * 0.16, u_colorB * 0.26, depthMix);
  col += u_colorB * pow(shimmer * shimmer2, 2.0) * 0.4;
  col += u_colorC * max(height, 0.0) * 0.5 * u_intensity;
  col += vec3(1.0) * pow(max(height, 0.0), 2.0) * 0.55;
  col += u_colorA * max(-height, 0.0) * 0.25;
  float vignette = smoothstep(1.9, 0.5, length(p));
  col *= 0.8 + 0.2 * vignette;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return RippleClickShader;
});
