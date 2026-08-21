Dixel.define('BlackHoleShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  class BlackHoleShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 1,
      intensity: 1,
      scale: 1,
      pull: true,
      tilt: 0.35,
      tiltSpeed: 0.5,
      resolutionScale: 0.8,
      frozenTime: 20
    });

    onDraw(gl) {
      const tilt = this.uniforms.u_tilt;
      if (tilt) gl.uniform1f(tilt, this.options.tilt);
      const tiltSpeed = this.uniforms.u_tiltSpeed;
      if (tiltSpeed) gl.uniform1f(tiltSpeed, this.options.tiltSpeed);
    }

    fragmentShader() {
      const pullBlock = this.options.pull
        ? [
            '  vec2 threadStart = (u_pointer * 2.0 - 1.0) * aspect;',
            '  float startDist = length(threadStart);',
            '  if (startDist > R * 1.6) {',
            '    vec2 pa = p - threadStart;',
            '    vec2 ba = -threadStart;',
            '    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);',
            '    float curve = sin(h * 3.1416) * 0.12 * sin(t * 0.7);',
            '    vec2 side = normalize(vec2(-ba.y, ba.x));',
            '    float threadDist = length(pa - ba * h + side * curve) + (noise(vec2(h * 9.0 - t * 2.4, 4.3)) - 0.5) * 0.035 * h;',
            '    float streamR = length(threadStart) * (1.0 - h);',
            '    float stripes = pow(0.5 + 0.5 * sin(h * 46.0 - t * 9.0), 3.0);',
            '    float thickness = mix(1400.0, 5200.0, h);',
            '    float thread = exp(-threadDist * threadDist * thickness) * (0.35 + 0.75 * stripes);',
            '    thread *= smoothstep(0.0, 0.2, h) * smoothstep(R * 0.99, R * 1.2, max(streamR, r));',
            '    thread *= smoothstep(1.7, 0.9, startDist);',
            '    col += mix(u_colorB, vec3(1.0), 0.4) * thread * (0.8 + 1.6 * (1.0 - streamR / max(startDist, 0.001))) * u_intensity;',
            '  }'
          ].join('\n')
        : '';
      return `
uniform float u_tilt;
uniform float u_tiltSpeed;
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
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p = p * 2.03 + vec2(2.9, 6.1);
    amplitude *= 0.5;
  }
  return value;
}
float starLayer(vec2 sp, float t) {
  vec2 cell = floor(sp);
  vec2 f = fract(sp) - 0.5;
  float rnd = hash2(cell);
  vec2 jitter = (vec2(fract(rnd * 17.0), fract(rnd * 43.0)) - 0.5) * 0.8;
  vec2 d = f - jitter;
  float star = exp(-dot(d, d) * mix(240.0, 700.0, fract(rnd * 5.7)));
  float twinkle = 0.65 + 0.35 * sin(t * (0.8 + fract(rnd * 3.3) * 2.0) + rnd * 6.28);
  return star * step(0.82, rnd) * twinkle * (0.35 + 0.65 * fract(rnd * 7.1));
}
vec3 accretionDisk(vec2 dp, float R, float t) {
  float dr = max(length(dp), 0.0001);
  float da = atan(dp.y, dp.x);
  float inner = R * 1.45;
  float outer = R * 4.6;
  float ring = smoothstep(inner, inner * 1.3, dr) * (1.0 - smoothstep(outer * 0.5, outer, dr));
  if (ring < 0.001) return vec3(0.0);
  float flow = t * 1.5 / (dr * 3.0);
  float ldr = log(dr / R);
  float tex = 0.55 + 0.28 * sin(da * 9.0 + ldr * 16.0 - flow * 5.0);
  tex += 0.22 * sin(da * 17.0 + ldr * 26.0 - flow * 9.0);
  tex += (noise(vec2(dr * 24.0 - t * 0.7, ldr * 8.0)) - 0.5) * 0.5;
  float doppler = 1.0 + 0.8 * cos(da);
  float heat = 1.0 - smoothstep(inner, outer * 0.9, dr);
  vec3 warm = mix(u_colorA, mix(u_colorB, vec3(1.0), 0.75), heat * heat);
  vec3 cool = u_colorC * 0.55;
  vec3 col = mix(cool, warm, heat);
  return col * ring * max(tex, 0.0) * doppler * (0.55 + heat * 1.3);
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float minSide = min(u_resolution.x, u_resolution.y);
  vec2 aspect = u_resolution / minSide;
  vec2 p = (uv * 2.0 - 1.0) * aspect;
  float t = u_time * 0.6;
  float R = 0.15 * u_scale;
  float r = max(length(p), 0.0001);
  float a = atan(p.y, p.x);
  float lens = (R * R * 2.4) / (dot(p, p) + 0.0015);
  vec2 sp = p * (1.0 - lens);
  float dragging = (R * 0.55) / (r + 0.05);
  float cd = cos(dragging);
  float sd = sin(dragging);
  sp = vec2(sp.x * cd - sp.y * sd, sp.x * sd + sp.y * cd);
  vec3 col = vec3(0.002, 0.003, 0.008);
  float stars = starLayer(sp * 13.0, t) + starLayer(sp * 24.0 + 37.0, t * 1.2) * 0.6;
  float smear = smoothstep(R * 3.2, R * 1.5, r);
  col += vec3(0.85, 0.9, 1.0) * stars * (1.0 + smear * 1.6);
  col += u_colorA * fbm(sp * 2.2 + vec2(0.0, t * 0.02)) * 0.05;
  col += u_colorC * fbm(sp * 1.4 + 9.0) * 0.035;
  float theta = u_tilt + t * u_tiltSpeed;
  float ct = cos(theta);
  float st = sin(theta);
  vec2 pr = vec2(p.x * ct - p.y * st, p.x * st + p.y * ct);
  float cosInc = 0.32 + 0.22 * sin(t * u_tiltSpeed * 1.3 + 1.0);
  col += accretionDisk(vec2(pr.x, pr.y / cosInc), R, t) * u_intensity;
  vec2 farSide = vec2(pr.x, (abs(pr.y) + R * 0.12) / (cosInc * 0.345));
  col += accretionDisk(farSide, R, t) * smoothstep(R * 2.9, R * 1.1, r) * 0.75 * u_intensity;
  float photon = exp(-pow((r - R * 1.28) / (R * 0.055), 2.0));
  col += mix(u_colorB, vec3(1.0), 0.7) * photon * 1.5 * u_intensity;
  col += u_colorB * exp(-pow((r - R * 1.28) / (R * 0.22), 2.0)) * 0.35;
  float spiralPhase = a + 4.2 * log(r / R) + t * (0.9 / r);
  float veins = pow(0.5 + 0.5 * sin(spiralPhase * 3.0), 5.0);
  veins += pow(0.5 + 0.5 * sin(spiralPhase * 5.0 + 2.1), 7.0) * 0.6;
  float veinMod = 0.5 + 0.5 * noise(vec2(r * 26.0 - t * 2.2, veins * 3.0));
  float accel = clamp((R * 1.6) / max(r - R * 0.75, 0.02), 0.0, 2.6);
  float infall = veins * veinMod * smoothstep(R * 4.4, R * 1.6, r) * smoothstep(R * 0.99, R * 1.24, r);
  col += mix(u_colorC, u_colorA, clamp(accel * 0.5, 0.0, 1.0)) * infall * accel * 0.4 * u_intensity;
${pullBlock}
  col *= smoothstep(R * 0.99, R * 1.045, r);
  float vignette = smoothstep(1.9, 0.55, r);
  col *= 0.8 + 0.2 * vignette;
  col += (hash2(gl_FragCoord.xy) - 0.5) * 0.01;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return BlackHoleShader;
});
