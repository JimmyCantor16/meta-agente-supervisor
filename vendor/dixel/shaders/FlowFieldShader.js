Dixel.define('FlowFieldShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  class FlowFieldShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 0.9,
      intensity: 1,
      scale: 1.3,
      resolutionScale: 0.75,
      frozenTime: 18
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
  for (int i = 0; i < 3; i++) {
    value += amplitude * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    amplitude *= 0.5;
  }
  return value;
}
float flowStrand(vec2 p, float t, float seed) {
  vec2 warp = vec2(fbm(p * 1.1 + vec2(seed, t * 0.35)), noise(p * 1.3 + vec2(seed + 4.7, -t * 0.3)));
  vec2 q = p + (warp - 0.5) * 1.6;
  float lanes = fbm(vec2(q.x * 1.3 - t * 1.4 + seed * 3.0, q.y * 7.0));
  return smoothstep(0.5, 0.74, lanes) * smoothstep(0.95, 0.74, lanes);
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float minSide = min(u_resolution.x, u_resolution.y);
  vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / minSide * u_scale;
  float t = u_time;
  p += (u_pointer - 0.5) * 0.15;
  p.y += u_scroll * 0.08;
  vec3 col = mix(vec3(0.01, 0.01, 0.028), vec3(0.02, 0.014, 0.05), uv.y);
  col += u_colorA * flowStrand(p, t, 0.0) * 0.9 * u_intensity;
  col += u_colorB * flowStrand(p * 1.3 + vec2(3.1, 1.7), t * 1.2, 8.0) * 0.75 * u_intensity;
  col += u_colorC * flowStrand(p * 0.8 + vec2(-2.0, 4.0), t * 0.8, 15.0) * 0.5 * u_intensity;
  col += u_colorB * noise(p * 0.8 + t * 0.05) * 0.05;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return FlowFieldShader;
});
