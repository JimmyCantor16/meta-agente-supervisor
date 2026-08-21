Dixel.define('HaloShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  class HaloShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 1,
      intensity: 1,
      scale: 1,
      resolutionScale: 1,
      frozenTime: 5
    });

    fragmentShader() {
      return `
void main() {
  float minSide = min(u_resolution.x, u_resolution.y);
  vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution.xy) / minSide / u_scale;
  p -= (u_pointer - 0.5) * 0.12;
  float t = u_time;
  float r = length(p);
  float angle = atan(p.y, p.x);
  float breath = 0.42 + 0.05 * sin(t * 0.7) + 0.02 * sin(t * 1.7);
  float ring = exp(-pow((r - breath) * 10.0, 2.0));
  float innerGlow = exp(-r * 3.2) * 0.5;
  float core = exp(-r * 9.0);
  float rays = 0.5 + 0.5 * sin(angle * 9.0 + t * 0.35) * sin(angle * 5.0 - t * 0.22);
  rays = pow(rays, 3.0) * exp(-r * 1.7) * smoothstep(breath * 0.45, breath * 1.4, r);
  float travel = fract(t * 0.12);
  float pulse = exp(-pow((r - breath - travel * 1.2) * 8.0, 2.0)) * (1.0 - travel) * 0.4;
  vec3 col = vec3(0.012, 0.01, 0.028);
  col += u_colorA * innerGlow * 1.2;
  col += mix(u_colorA, u_colorB, 0.5 + 0.5 * sin(angle + t * 0.25)) * ring * 1.5 * u_intensity;
  col += u_colorB * rays * 0.5 * u_intensity;
  col += u_colorC * pulse;
  col += (u_colorB * 0.6 + 0.4) * core;
  col *= smoothstep(1.9, 0.5, r);
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return HaloShader;
});
