Dixel.define('VortexShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  class VortexShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 1,
      intensity: 1,
      scale: 1,
      direction: 1,
      tilt: 0.4,
      tiltSpeed: 0.42,
      resolutionScale: 0.75,
      frozenTime: 12
    });

    onDraw(gl) {
      const direction = this.uniforms.u_direction;
      if (direction) gl.uniform1f(direction, this.options.direction >= 0 ? 1 : -1);
      const tilt = this.uniforms.u_tilt;
      if (tilt) gl.uniform1f(tilt, this.options.tilt);
      const tiltSpeed = this.uniforms.u_tiltSpeed;
      if (tiltSpeed) gl.uniform1f(tiltSpeed, this.options.tiltSpeed);
    }

    fragmentShader() {
      return `
uniform float u_direction;
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
    p = p * 2.05 + vec2(4.2, 2.6);
    amplitude *= 0.5;
  }
  return value;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float minSide = min(u_resolution.x, u_resolution.y);
  vec2 aspect = u_resolution / minSide;
  vec2 p = (uv * 2.0 - 1.0) * aspect * u_scale;
  float t = u_time;
  float theta = u_tilt + t * u_tiltSpeed;
  float ct = cos(theta);
  float st = sin(theta);
  vec2 pr = vec2(p.x * ct - p.y * st, p.x * st + p.y * ct);
  float squash = 0.74 + 0.12 * sin(t * u_tiltSpeed * 1.3 + 0.7);
  pr.y /= squash;
  float r0 = length(pr);
  pr.y += (1.0 - squash) * 0.5 / (r0 + 0.4);
  p = pr;
  float r = max(length(p), 0.0001);
  float a = atan(p.y, p.x) * u_direction;
  float accel = 1.0 / (r + 0.14);
  float phase = a + log(r) * 3.4 - t * 1.15 * accel;
  float armsWide = pow(0.5 + 0.5 * sin(phase * 3.0), 2.0);
  float armsFine = pow(0.5 + 0.5 * sin(phase * 8.0 + 1.3), 3.5);
  float spin = t * 0.9 * accel * u_direction;
  float cs = cos(spin);
  float sn = sin(spin);
  vec2 sheared = vec2(p.x * cs - p.y * sn, p.x * sn + p.y * cs);
  float turbulence = fbm(sheared * 2.6 + vec2(3.0, 7.0));
  float striae = (armsWide * 0.65 + armsFine * 0.55) * (0.45 + turbulence * 0.9);
  float inward = smoothstep(1.7, 0.05, r);
  float suction = clamp(accel * 0.42, 0.0, 1.8);
  vec3 outerTone = mix(u_colorC, u_colorA, smoothstep(1.4, 0.5, r));
  vec3 innerTone = mix(u_colorA, u_colorB, smoothstep(0.7, 0.12, r));
  vec3 tone = mix(outerTone, innerTone, smoothstep(1.0, 0.25, r));
  vec3 col = vec3(0.006, 0.006, 0.016);
  col += tone * striae * inward * (0.35 + suction * 0.75) * u_intensity;
  col += u_colorB * pow(armsFine, 2.0) * smoothstep(0.85, 0.2, r) * suction * 0.4;
  float funnel = smoothstep(0.6, 0.06, r);
  col *= mix(1.0, 0.28, funnel);
  float eye = exp(-r * r * 42.0);
  col += mix(u_colorB, vec3(1.0), 0.55) * eye * (0.45 + 0.12 * sin(t * 2.4)) * u_intensity;
  col += u_colorA * exp(-r * r * 7.0) * 0.18;
  float rim = exp(-pow((r - 0.24) * 12.0, 2.0));
  col += u_colorB * rim * striae * 0.55;
  float dimming = smoothstep(0.2, 1.55, r);
  col *= 1.0 - dimming * 0.55;
  col += (hash2(gl_FragCoord.xy) - 0.5) * 0.01;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return VortexShader;
});
