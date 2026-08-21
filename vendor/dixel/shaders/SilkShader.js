Dixel.define('SilkShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  class SilkShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 0.7,
      intensity: 1,
      scale: 1.1,
      resolutionScale: 0.75,
      frozenTime: 14
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
vec2 silkWarp(vec2 p, float t) {
  return vec2(fbm(p * 1.4 + vec2(0.0, t * 0.22)), fbm(p * 1.4 + vec2(5.2, -t * 0.18)));
}
float silkHeight(vec2 q, float t) {
  return sin(q.x * 2.4 + q.y * 3.4 + fbm(q * 2.2) * 5.0 + t * 0.6) * 0.5 + 0.5;
}
void main() {
  float minSide = min(u_resolution.x, u_resolution.y);
  vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / minSide * u_scale;
  float t = u_time;
  p += (u_pointer - 0.5) * 0.22;
  vec2 q = p + (silkWarp(p, t) - 0.5) * 1.3;
  float eps = 0.035;
  float h = silkHeight(q, t);
  float hx = silkHeight(q + vec2(eps, 0.0), t);
  float hy = silkHeight(q + vec2(0.0, eps), t);
  vec3 normal = normalize(vec3(h - hx, h - hy, eps * 2.2));
  vec3 lightDir = normalize(vec3(0.45 + (u_pointer.x - 0.5) * 0.6, 0.55 + (u_pointer.y - 0.5) * 0.6, 0.55));
  float diffuse = max(dot(normal, lightDir), 0.0);
  vec3 halfDir = normalize(lightDir + vec3(0.0, 0.0, 1.0));
  float specular = pow(max(dot(normal, halfDir), 0.0), 42.0);
  vec3 base = mix(u_colorA * 0.5, u_colorB * 0.55, h);
  base = mix(base, u_colorC * 0.45, smoothstep(0.75, 1.0, h) * 0.35);
  vec3 col = base * (0.2 + diffuse * 0.95);
  col += specular * 0.85 * u_intensity * mix(vec3(1.0), u_colorB, 0.35);
  col += u_colorA * 0.035;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return SilkShader;
});
