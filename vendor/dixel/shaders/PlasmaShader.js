Dixel.define('PlasmaShader', ['ShaderCanvas', 'Utils'], function (ShaderCanvas, Utils) {
  'use strict';

  class PlasmaShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 1,
      intensity: 1,
      scale: 1,
      bolts: 6,
      chaos: 1,
      core: true,
      resolutionScale: 0.75,
      frozenTime: 4
    });

    onDraw(gl) {
      const chaos = this.uniforms.u_chaos;
      if (chaos) gl.uniform1f(chaos, this.options.chaos);
    }

    fragmentShader() {
      const bolts = Math.round(Utils.clamp(this.options.bolts, 1, 12));
      const coreBlock = this.options.core
        ? [
            '  float pulse = 0.75 + 0.25 * sin(t * 3.2) + (noise(vec2(t * 5.0, 2.7)) - 0.5) * 0.35;',
            '  col += mix(u_colorB, vec3(1.0), 0.6) * exp(-r * r * 55.0) * pulse * 1.6 * u_intensity;',
            '  col += u_colorA * exp(-r * r * 14.0) * pulse * 0.55;',
            '  float shell = exp(-pow((r - 0.16) * 26.0, 2.0));',
            '  col += u_colorB * shell * (0.35 + 0.25 * sin(t * 4.1 + r * 8.0));'
          ].join('\n')
        : '';
      return `
uniform float u_chaos;
const int BOLTS = ${bolts};
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
float fbm3(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 3; i++) {
    value += amplitude * noise(p);
    p = p * 2.1 + vec2(3.7, 1.9);
    amplitude *= 0.5;
  }
  return value;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float minSide = min(u_resolution.x, u_resolution.y);
  vec2 aspect = u_resolution / minSide;
  vec2 p = (uv * 2.0 - 1.0) * aspect * u_scale;
  vec2 pointer = (u_pointer * 2.0 - 1.0) * aspect * u_scale;
  float t = u_time;
  float r = max(length(p), 0.0001);
  float a = atan(p.y, p.x);
  float pointerAngle = atan(pointer.y, pointer.x);
  float pointerWeight = smoothstep(1.6, 0.3, length(pointer)) * 0.3;
  vec3 col = vec3(0.008, 0.006, 0.02);
  col += u_colorA * exp(-r * 1.9) * 0.3;
  col += u_colorC * exp(-r * 1.1) * 0.12;
${coreBlock}
  float boltsGlow = 0.0;
  float boltsCore = 0.0;
  for (int i = 0; i < BOLTS; i++) {
    float fi = float(i);
    float crackle = noise(vec2(t * 5.5 + fi * 17.3, fi * 7.9));
    float alive = smoothstep(0.3, 0.72, crackle);
    float baseAngle = fi * 6.2831853 / float(BOLTS) + t * 0.2 + (noise(vec2(t * 0.9 + fi * 3.1, fi * 11.0)) - 0.5) * 1.4;
    float toPointer = atan(sin(pointerAngle - baseAngle), cos(pointerAngle - baseAngle));
    baseAngle += toPointer * pointerWeight;
    float wiggle = (fbm3(vec2(r * 5.5 - t * 3.4, fi * 9.1)) - 0.5) * 1.7 * u_chaos / (r * 2.4 + 0.35);
    float angleDelta = atan(sin(a - baseAngle - wiggle), cos(a - baseAngle - wiggle));
    float arcDist = abs(angleDelta) * r;
    float reach = smoothstep(1.25, 0.12, r) * smoothstep(0.02, 0.08, r);
    float jag = 0.75 + 0.5 * noise(vec2(r * 14.0 - t * 7.0, fi * 5.3));
    boltsCore += exp(-arcDist * arcDist * 2600.0) * alive * reach * jag;
    boltsGlow += exp(-arcDist * arcDist * 130.0) * alive * reach;
  }
  col += mix(u_colorB, vec3(1.0), 0.55) * boltsCore * 1.3 * u_intensity;
  col += u_colorA * boltsGlow * 0.4 * u_intensity;
  col += u_colorC * boltsGlow * boltsGlow * 0.12;
  float haze = fbm3(p * 2.0 + vec2(t * 0.25, -t * 0.2));
  col += u_colorA * haze * exp(-r * 1.6) * 0.14;
  float vignette = smoothstep(1.9, 0.5, r);
  col *= 0.75 + 0.25 * vignette;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return PlasmaShader;
});
