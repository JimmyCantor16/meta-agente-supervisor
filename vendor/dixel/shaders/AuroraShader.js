Dixel.define('AuroraShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  class AuroraShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 0.6,
      intensity: 1,
      scale: 1.1,
      resolutionScale: 0.75,
      frozenTime: 26
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
float curtain(vec2 p, float t, float seed, float sharpness) {
  float ripple = fbm(vec2(p.x * 1.6 + seed, t + seed));
  float center = 0.3 + seed * 0.04 + (ripple - 0.5) * 0.9;
  float body = exp(-abs(p.y - center) * sharpness);
  float beams = 0.55 + 0.45 * noise(vec2(p.x * 6.0 + seed * 2.0, t * 0.5));
  return body * beams;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = vec2(uv.x * (u_resolution.x / u_resolution.y), uv.y) * u_scale;
  p += (u_pointer - 0.5) * 0.12;
  p.y += u_scroll * 0.06;
  float t = u_time * 0.16;
  vec3 col = mix(vec3(0.012, 0.012, 0.03), vec3(0.05, 0.03, 0.09), uv.y);
  col += u_colorB * curtain(p, t, 0.0, 5.5) * 0.85 * u_intensity;
  col += u_colorA * curtain(p * 1.2 + vec2(2.3, 0.1), t * 1.25, 4.0, 4.2) * 0.75 * u_intensity;
  col += u_colorC * curtain(p * 0.9 + vec2(5.1, -0.05), t * 0.8, 9.0, 7.0) * 0.4 * u_intensity;
  col += u_colorB * 0.05 * (1.0 - uv.y);
  float vignette = smoothstep(1.6, 0.4, length(uv - 0.5) * 1.6);
  col *= 0.75 + 0.25 * vignette;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return AuroraShader;
});
