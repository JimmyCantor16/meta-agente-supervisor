Dixel.define('GlitchShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  class GlitchShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 1,
      intensity: 1,
      resolutionScale: 0.7,
      frozenTime: 3.2
    });

    fragmentShader() {
      return `
float hash(float n) {
  return fract(sin(n * 43758.5453) * 12345.6789);
}
float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float t = floor(u_time * 9.0);
  float burst = step(0.62, hash(t * 0.37));
  float band = floor(uv.y * (8.0 + hash(t) * 22.0));
  float shift = (hash(band + t) - 0.5) * 0.16 * u_intensity * burst;
  float micro = (hash2(vec2(band, t + 1.0)) - 0.5) * 0.012 * u_intensity;
  vec2 p = uv + vec2(shift + micro, 0.0);
  float split = (0.004 + 0.02 * burst) * u_intensity;
  float rowJitter = step(0.94, hash2(vec2(floor(uv.y * 90.0), t))) * burst;
  p.x += rowJitter * (hash(uv.y * 51.0 + t) - 0.5) * 0.3;
  float rBase = smoothstep(0.2, 0.8, fract(p.x * 3.0 + u_time * 0.21));
  float gBase = smoothstep(0.2, 0.8, fract(p.x * 3.0 + 0.33 + u_time * 0.17));
  float bBase = smoothstep(0.2, 0.8, fract(p.y * 2.0 + 0.66 + u_time * 0.13));
  vec3 colR = u_colorA * smoothstep(0.15, 0.9, fract((p.x - split) * 2.2 + p.y + u_time * 0.2));
  vec3 colG = u_colorB * smoothstep(0.15, 0.9, fract(p.x * 2.2 + p.y + u_time * 0.2));
  vec3 colB = u_colorC * smoothstep(0.15, 0.9, fract((p.x + split) * 2.2 + p.y + u_time * 0.2));
  vec3 col = vec3(colR.r + rBase * 0.18, colG.g + gBase * 0.18, colB.b + bBase * 0.18);
  col += vec3(0.9) * step(0.985, hash2(uv * (40.0 + t))) * burst * u_intensity;
  float scan = 0.92 + 0.08 * sin(uv.y * u_resolution.y * 1.6);
  col *= scan;
  col = mix(vec3(0.02, 0.02, 0.05), col, 0.9);
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return GlitchShader;
});
