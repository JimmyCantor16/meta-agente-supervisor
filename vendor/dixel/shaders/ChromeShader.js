Dixel.define('ChromeShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  class ChromeShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 1,
      intensity: 1,
      scale: 1,
      resolutionScale: 0.8,
      frozenTime: 9
    });

    fragmentShader() {
      return `
float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash2(i);
  float b = hash2(i + vec2(1.0, 0.0));
  float c = hash2(i + vec2(0.0, 1.0));
  float d = hash2(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float surfaceHeight(vec2 q, float t) {
  float h = sin(q.x * 1.6 + t * 0.8) * 0.5 + sin(q.y * 1.9 - t * 0.6) * 0.42;
  h += sin((q.x + q.y) * 1.2 + t * 0.5) * 0.3;
  h += noise(q * 1.7 + vec2(t * 0.18, -t * 0.12)) * 0.85;
  h += noise(q * 3.6 - vec2(t * 0.1, t * 0.15)) * 0.3;
  return h;
}
vec3 studioEnvironment(vec2 m, float t) {
  vec3 col = mix(u_colorA * 0.14, mix(u_colorB, vec3(1.0), 0.55), smoothstep(-0.9, 0.95, m.y));
  col += vec3(1.0) * exp(-abs(m.y + 0.1) * 15.0) * 0.85;
  col += mix(u_colorC, vec3(1.0), 0.35) * exp(-abs(m.y - 0.55) * 9.0) * 0.6;
  col += u_colorA * exp(-abs(m.y + 0.6) * 11.0) * 0.5;
  col += mix(u_colorB, vec3(1.0), 0.5) * exp(-abs(m.x - 0.4 - sin(t * 0.2) * 0.15) * 7.0) * 0.18;
  return col;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float minSide = min(u_resolution.x, u_resolution.y);
  vec2 aspect = u_resolution / minSide;
  vec2 p = (uv * 2.0 - 1.0) * aspect;
  float t = u_time * 0.55;
  vec2 pointer = (u_pointer * 2.0 - 1.0) * aspect;
  vec2 away = p - pointer;
  float ripple = exp(-dot(away, away) * 3.5);
  vec2 q = p * 1.9 * u_scale;
  float e = 0.055;
  float hC = surfaceHeight(q, t) + ripple * 0.5;
  float hR = surfaceHeight(q + vec2(e, 0.0), t) + exp(-dot(away + vec2(e / (1.9 * u_scale), 0.0), away) * 3.5) * 0.5;
  float hU = surfaceHeight(q + vec2(0.0, e), t) + exp(-dot(away + vec2(0.0, e / (1.9 * u_scale)), away) * 3.5) * 0.5;
  vec2 slope = vec2(hR - hC, hU - hC) / e;
  vec3 n = normalize(vec3(-slope * 0.55, 1.0));
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 reflected = reflect(-viewDir, n);
  vec3 col = studioEnvironment(reflected.xy, t) * (0.5 + 0.5 * u_intensity);
  float fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 2.2);
  col += mix(u_colorB, vec3(1.0), 0.45) * fresnel * 1.5 * u_intensity;
  col += u_colorC * fresnel * fresnel * 0.8;
  vec3 lightDir = normalize(vec3(-0.4, 0.75, 0.6));
  float spec = pow(max(dot(reflect(-lightDir, n), viewDir), 0.0), 60.0);
  col += vec3(1.0) * spec * 0.9;
  float spec2 = pow(max(dot(reflect(-normalize(vec3(0.6, 0.3, 0.5)), n), viewDir), 0.0), 28.0);
  col += mix(u_colorA, vec3(1.0), 0.6) * spec2 * 0.35;
  col *= 0.92 + 0.08 * hC;
  float vignette = smoothstep(1.8, 0.5, length(p));
  col *= 0.78 + 0.22 * vignette;
  col += (hash2(gl_FragCoord.xy) - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return ChromeShader;
});
