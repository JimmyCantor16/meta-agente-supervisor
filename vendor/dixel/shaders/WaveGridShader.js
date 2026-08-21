Dixel.define('WaveGridShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  class WaveGridShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 1,
      intensity: 1,
      scale: 1,
      resolutionScale: 1,
      frozenTime: 7
    });

    fragmentShader() {
      return `
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= u_resolution.x / u_resolution.y;
  float t = u_time;
  float horizon = 0.16 + (u_pointer.y - 0.5) * 0.06;
  float sunGlow = exp(-pow(length(vec2(p.x * 0.7, p.y - horizon)) * 2.2, 2.0));
  vec3 col;
  if (p.y > horizon) {
    float sky = smoothstep(horizon, 1.2, p.y);
    col = mix(u_colorA * 0.16, vec3(0.008, 0.008, 0.03), sky);
    col += u_colorC * sunGlow * 0.55;
    col += u_colorB * exp(-abs(p.y - horizon) * 22.0) * 0.5;
  } else {
    float dist = horizon - p.y;
    float depth = 1.0 / (dist + 0.045);
    vec2 world = vec2(p.x * depth * 1.4 + (u_pointer.x - 0.5) * 0.8, depth * 1.4 + t * 2.0) * u_scale;
    float px = 2.0 / u_resolution.y;
    float dd = depth * depth * px;
    float aaX = 1.4 * u_scale * (depth * px + abs(p.x) * dd) + 0.0001;
    float aaY = 1.4 * u_scale * dd + 0.0001;
    float lw = 0.04;
    float gx = 1.0 - smoothstep(lw, lw + aaX, abs(fract(world.x + 0.5) - 0.5));
    float gy = 1.0 - smoothstep(lw, lw + aaY, abs(fract(world.y + 0.5) - 0.5));
    gx *= clamp(lw * 2.4 / aaX, 0.0, 1.0);
    gy *= clamp(lw * 2.4 / aaY, 0.0, 1.0);
    float grid = max(gx, gy);
    float fog = exp(-depth * 0.17) * smoothstep(0.0, 0.055, dist);
    float wave = sin(world.y * 0.6 - t * 1.3 + sin(world.x * 0.5 + t * 0.4) * 1.4) * fog;
    vec3 lineColor = mix(u_colorB, u_colorA, smoothstep(-1.0, 1.0, wave));
    col = mix(vec3(0.01, 0.01, 0.025), vec3(0.02, 0.015, 0.05), fog);
    col += lineColor * grid * fog * (0.62 + 0.5 * wave) * u_intensity;
    col += u_colorC * exp(-abs(p.y - horizon) * 14.0) * 0.4;
    col += u_colorA * fog * 0.05;
  }
  float vignette = smoothstep(1.9, 0.6, length(p * vec2(0.7, 1.0)));
  col *= 0.8 + 0.2 * vignette;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return WaveGridShader;
});
