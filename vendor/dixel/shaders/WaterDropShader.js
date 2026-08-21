Dixel.define('WaterDropShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  const MAX_DROPS = 3;

  class WaterDropShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 1,
      intensity: 1,
      scale: 1,
      resolutionScale: 0.85,
      interactive: false,
      frozenTime: 10.6
    });

    ready() {
      this.drops = new Float32Array(MAX_DROPS * 4);
      this.dropIndex = 0;
      super.ready();
      if (this.options.interactive) this.listen(this.el, 'click', this.launchDrop);
    }

    launchDrop(event) {
      if (!this.gl) return;
      const minSide = Math.min(this.cssWidth, this.cssHeight);
      const localX = (event.clientX - this.rectLeft) / this.cssWidth;
      const slot = this.dropIndex * 4;
      this.drops[slot] = (localX * 2 - 1) * (this.cssWidth / minSide) * this.options.scale;
      this.drops[slot + 1] = 0;
      this.drops[slot + 2] = this.time;
      this.drops[slot + 3] = 1;
      this.dropIndex = (this.dropIndex + 1) % MAX_DROPS;
    }

    onDraw(gl) {
      const location = this.uniforms.u_drops;
      if (location) gl.uniform4fv(location, this.drops);
    }

    fragmentShader() {
      return `
uniform vec4 u_drops[${MAX_DROPS}];
const float REST = -0.28;
const float PERIOD = 4.6;
const float FALL = 0.9;
float hash1(float n) {
  return fract(sin(n) * 43758.5453123);
}
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float circleField(vec2 p, vec2 c, float r) {
  return length(p - c) - r;
}
float capsuleField(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
float dropHeight(float x, float x0, float age) {
  float s = age - FALL;
  if (s < 0.0) return 0.0;
  float d = abs(x - x0);
  float amp = 0.075 * exp(-s * 1.15) * smoothstep(0.0, 0.07, s) * (1.0 - smoothstep(1.9, 2.7, s));
  float h = 0.0;
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float w = (d - (s * 0.5 - fk * 0.17)) / 0.075;
    h += amp * w * exp(-w * w) / (1.0 + fk * 0.9);
  }
  float crater = -0.13 * exp(-d * d * 150.0) * exp(-s * 7.0);
  float mound = 0.045 * exp(-d * d * 70.0) * exp(-s * 4.5) * smoothstep(0.0, 0.2, s);
  return h + crater + mound;
}
float dropBlobs(vec2 p, float x0, float age, float seed) {
  float d = 1000.0;
  float prog = age / FALL;
  if (prog < 1.0) {
    float fallY = 1.15 - (1.15 - REST) * prog * prog;
    vec2 q = p - vec2(x0, fallY);
    q.y /= 1.0 + prog * 0.3;
    q.x *= 1.0 + prog * 0.14;
    d = min(d, length(q) - 0.075);
  }
  float sc = age - FALL;
  if (sc > 0.0) {
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float side = sign(fi - 1.5);
      float inner = mod(fi, 2.0);
      float vx = side * mix(0.42, 0.2, inner) * (0.9 + hash1(seed + fi) * 0.2);
      float vy = mix(0.75, 1.0, inner) * (0.9 + hash1(seed + fi + 9.0) * 0.2);
      float bx = x0 + vx * sc;
      float by = REST + 0.02 + vy * sc - 1.9 * sc * sc;
      float br = 0.035 * smoothstep(0.0, 0.05, sc) * smoothstep(1.5, 0.9, sc) * (1.0 - inner * 0.3);
      d = min(d, circleField(p, vec2(bx, by), max(br, 0.001)));
    }
    float jn = (sc - 0.38) / 0.19;
    float jh = exp(-jn * jn) * 0.38;
    float jr = 0.05 * smoothstep(0.08, 0.3, sc) * smoothstep(1.05, 0.6, sc);
    d = min(d, capsuleField(p, vec2(x0, REST - 0.05), vec2(x0, REST + jh), max(jr, 0.001)));
    float u = sc - 0.5;
    if (u > 0.0 && u < 1.6) {
      float vy2 = 1.35 - 2.6 * u;
      float sy = REST + 0.3 + 1.35 * u - 1.3 * u * u;
      float sq = 1.0 + min(abs(vy2), 1.3) * 0.24;
      vec2 q2 = p - vec2(x0 + sin(u * 2.4) * 0.015, sy);
      q2.y /= sq;
      q2.x *= sqrt(sq);
      float sr = 0.052 * smoothstep(0.0, 0.06, u) * smoothstep(1.6, 1.35, u);
      d = min(d, length(q2) - max(sr, 0.001));
    }
  }
  return d;
}
float field(vec2 p, float t, vec2 pointer, float pointerNear) {
  float h = REST + sin(p.x * 3.1 + t * 0.9) * 0.008 + sin(p.x * 6.7 - t * 1.4) * 0.005;
  float cycle = floor(t / PERIOD);
  float age = t - cycle * PERIOD;
  float x0 = (hash1(cycle * 17.3 + 3.7) - 0.5) * 0.9;
  float settle = 1.0 - smoothstep(PERIOD * 0.52, PERIOD * 0.78, age);
  h += dropHeight(p.x, x0, age) * settle;
  for (int i = 0; i < ${MAX_DROPS}; i++) {
    vec4 drop = u_drops[i];
    float clickAge = t - drop.z;
    if (drop.w > 0.5 && clickAge > 0.0 && clickAge < PERIOD) {
      float clickSettle = 1.0 - smoothstep(PERIOD * 0.52, PERIOD * 0.78, clickAge);
      h += dropHeight(p.x, drop.x, clickAge) * clickSettle;
    }
  }
  float spread = exp(-(p.x - pointer.x) * (p.x - pointer.x) * 9.0);
  float lift = clamp(pointer.y - REST, -0.3, 0.6) * exp(-abs(pointer.y - REST) * 1.6);
  h += spread * lift * 0.55 * u_intensity;
  float d = p.y - h;
  d = smin(d, dropBlobs(p, x0, age, cycle), 0.14);
  for (int i = 0; i < ${MAX_DROPS}; i++) {
    vec4 drop = u_drops[i];
    float clickAge = t - drop.z;
    if (drop.w > 0.5 && clickAge > 0.0 && clickAge < PERIOD) d = smin(d, dropBlobs(p, drop.x, clickAge, drop.z), 0.14);
  }
  float pointerBlob = circleField(p, pointer, 0.05) + (1.0 - pointerNear) * 4.0;
  d = smin(d, pointerBlob, 0.3);
  return d;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float minSide = min(u_resolution.x, u_resolution.y);
  vec2 aspect = u_resolution / minSide;
  vec2 p = (uv * 2.0 - 1.0) * aspect * u_scale;
  vec2 pointer = (u_pointer * 2.0 - 1.0) * aspect * u_scale;
  float t = u_time;
  float pointerNear = smoothstep(0.85, 0.2, abs(pointer.y - REST));
  float d = field(p, t, pointer, pointerNear);
  vec2 lightDir = normalize(vec2(-0.55, 0.85));
  float dl = field(p + lightDir * 0.03, t, pointer, pointerNear);
  float mask = smoothstep(0.012, -0.012, d);
  vec3 col = mix(vec3(0.012, 0.014, 0.03), vec3(0.03, 0.028, 0.07), uv.y);
  vec2 glowAt = p - vec2(0.0, 1.05);
  col += u_colorC * exp(-dot(glowAt, glowAt) * 1.4) * 0.06;
  float glow = exp(-max(d, 0.0) * 26.0);
  col += mix(u_colorA, u_colorB, 0.5) * glow * 0.1;
  float depth = clamp((REST - p.y) * 1.5, 0.0, 1.0);
  vec3 water = mix(mix(u_colorA, u_colorB, 0.65) * 0.5, u_colorA * 0.16, depth);
  float slope = clamp((dl - d) * 34.0, 0.0, 1.0);
  water *= 0.8 + slope * 0.5;
  float inner = smoothstep(-0.012, -0.09, d);
  water += mix(u_colorB, vec3(1.0), 0.4) * (1.0 - inner) * 0.35;
  col = mix(col, water, mask);
  float rim = exp(-abs(d) * 90.0);
  col += mix(u_colorB, vec3(1.0), 0.6) * rim * 0.4 * u_intensity;
  col += vec3(1.0) * pow(slope, 3.0) * mask * 0.8 * u_intensity;
  float vignette = smoothstep(1.9, 0.5, length(p));
  col *= 0.82 + 0.18 * vignette;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return WaterDropShader;
});
