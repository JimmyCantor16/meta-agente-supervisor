Dixel.define('GlassShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  class GlassShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 1,
      intensity: 1,
      scale: 1,
      refraction: 1,
      frost: 1,
      resolutionScale: 0.75,
      frozenTime: 7
    });

    onDraw(gl) {
      const refraction = this.uniforms.u_refraction;
      if (refraction) gl.uniform1f(refraction, this.options.refraction);
      const frost = this.uniforms.u_frost;
      if (frost) gl.uniform1f(frost, this.options.frost);
    }

    fragmentShader() {
      return `
uniform float u_refraction;
uniform float u_frost;
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
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 3; i++) {
    value += amplitude * noise(p);
    p = p * 2.05 + vec2(5.2, 1.3);
    amplitude *= 0.5;
  }
  return value;
}
vec3 backdrop(vec2 p, float t) {
  vec3 col = mix(vec3(0.012, 0.012, 0.03), vec3(0.03, 0.025, 0.06), p.y * 0.5 + 0.5);
  vec2 d;
  d = p - vec2(sin(t * 0.5) * 0.55, cos(t * 0.4) * 0.35);
  col += u_colorA * exp(-dot(d, d) * 4.2) * 0.85;
  d = p - vec2(cos(t * 0.35 + 2.0) * 0.5, sin(t * 0.55 + 1.0) * 0.4);
  col += u_colorB * exp(-dot(d, d) * 5.0) * 0.7;
  d = p - vec2(sin(t * 0.45 + 4.0) * 0.6, cos(t * 0.3 + 3.0) * 0.45);
  col += u_colorC * exp(-dot(d, d) * 4.6) * 0.6;
  d = p - vec2(cos(t * 0.6 + 5.0) * 0.35, sin(t * 0.4 + 5.5) * 0.5);
  col += mix(u_colorA, u_colorB, 0.5) * exp(-dot(d, d) * 6.5) * 0.55;
  return col;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float minSide = min(u_resolution.x, u_resolution.y);
  vec2 aspect = u_resolution / minSide;
  vec2 p = (uv * 2.0 - 1.0) * aspect;
  float t = u_time * 0.6;
  vec2 q = p * 2.6 * u_scale;
  float e = 0.09;
  float hCenter = fbm(q + vec2(t * 0.12, -t * 0.08));
  float hRight = fbm(q + vec2(e, 0.0) + vec2(t * 0.12, -t * 0.08));
  float hUp = fbm(q + vec2(0.0, e) + vec2(t * 0.12, -t * 0.08));
  vec2 normal = vec2(hRight - hCenter, hUp - hCenter) / e;
  vec2 pointerShift = (u_pointer - 0.5) * 0.22 * u_refraction;
  vec2 refracted = p + normal * 0.14 * u_refraction + pointerShift;
  vec3 seen = backdrop(refracted, t);
  seen += backdrop(refracted + normal * 0.05, t) * 0.35;
  seen /= 1.35;
  float grain = hash2(gl_FragCoord.xy + fract(t) * 100.0) - 0.5;
  seen += grain * 0.055 * u_frost;
  float film = fbm(q * 0.6 + 8.0);
  seen = mix(seen, seen * 0.85 + vec3(0.045) * u_frost, film * 0.5);
  float slope = length(normal);
  float spec = pow(clamp(slope * 0.9 - 0.15, 0.0, 1.0), 2.4);
  seen += vec3(1.0) * spec * 0.28 * u_intensity;
  float streakCoord = p.x * 0.8 - p.y * 1.1;
  float streak = pow(max(sin(streakCoord * 2.2 + t * 0.5), 0.0), 14.0);
  streak += pow(max(sin(streakCoord * 1.4 - 1.8 + t * 0.35), 0.0), 22.0) * 0.7;
  seen += mix(u_colorB, vec3(1.0), 0.75) * streak * 0.13 * u_intensity;
  vec2 edge = abs(uv - 0.5) * 2.0;
  float border = max(edge.x, edge.y);
  float edgeGlow = smoothstep(0.86, 1.0, border);
  seen += mix(u_colorA, u_colorB, uv.y) * edgeGlow * 0.3 * u_intensity;
  seen += vec3(1.0) * smoothstep(0.965, 1.0, border) * 0.16;
  gl_FragColor = vec4(seen, 1.0);
}`;
    }
  }

  return GlassShader;
});
