Dixel.define('NebulaShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  class NebulaShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 0.8,
      intensity: 1,
      scale: 1.2,
      resolutionScale: 0.75,
      frozenTime: 30
    });

    fragmentShader() {
      return `
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
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    amplitude *= 0.5;
  }
  return value;
}
float starLayer(vec2 p, float density, float t) {
  vec2 cell = floor(p);
  vec2 f = fract(p) - 0.5;
  float h = hash(cell);
  vec2 offset = vec2(hash(cell + 17.0), hash(cell + 43.0)) - 0.5;
  float d = length(f - offset * 0.7);
  float twinkle = 0.6 + 0.4 * sin(t * 2.0 + h * 40.0);
  return smoothstep(0.08, 0.0, d) * step(1.0 - density, h) * twinkle;
}
void main() {
  float minSide = min(u_resolution.x, u_resolution.y);
  vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / minSide * u_scale;
  float t = u_time * 0.1;
  vec2 parallax = (u_pointer - 0.5) * 0.12;
  parallax.y += u_scroll * 0.05;
  vec2 q1 = p * 0.9 + parallax * 0.4 + vec2(t * 0.3, -t * 0.15);
  vec2 q2 = p * 1.6 + parallax * 0.8 + vec2(-t * 0.2, t * 0.25);
  float n1 = fbm(q1);
  float n2 = fbm(q2 + n1 * 0.9);
  float n3 = fbm(q1 * 2.2 - n2 * 0.7);
  vec3 col = vec3(0.008, 0.008, 0.024);
  col += u_colorA * pow(n1, 2.1) * 1.1;
  col += u_colorB * pow(n2, 2.6) * 0.9;
  col += u_colorC * pow(n3, 3.2) * 0.8;
  col += (u_colorA + u_colorB) * 0.5 * pow(n1 * n2, 2.0) * 1.4;
  col *= u_intensity;
  col += vec3(0.9, 0.95, 1.0) * starLayer(p * 22.0 + parallax * 3.0, 0.06, u_time);
  col += vec3(0.8, 0.85, 1.0) * 0.7 * starLayer(p * 45.0 + parallax * 6.0 + 31.0, 0.05, u_time * 1.3);
  float vignette = smoothstep(1.9, 0.45, length(p / u_scale));
  col *= 0.55 + 0.45 * vignette;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return NebulaShader;
});
