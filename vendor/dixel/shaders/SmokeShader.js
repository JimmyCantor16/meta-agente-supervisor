Dixel.define('SmokeShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  class SmokeShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 1,
      intensity: 1,
      scale: 1,
      density: 1,
      drift: 0.15,
      resolutionScale: 0.7,
      frozenTime: 16
    });

    onDraw(gl) {
      const density = this.uniforms.u_density;
      if (density) gl.uniform1f(density, this.options.density);
      const drift = this.uniforms.u_drift;
      if (drift) gl.uniform1f(drift, this.options.drift);
    }

    fragmentShader() {
      return `
uniform float u_density;
uniform float u_drift;
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
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = p * 2.04 + vec2(1.6, 8.2);
    amplitude *= 0.5;
  }
  return value;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y);
  float t = u_time * 0.3;
  vec2 q = p * 2.1 * u_scale + vec2(-u_drift * t, -t * 0.55);
  float warpA = fbm(q);
  vec2 warped = q + vec2(warpA * 1.7 - 0.85, warpA * 0.9) + vec2(sin(t * 0.5) * 0.2, 0.0);
  float warpB = fbm(warped * 1.25 + 5.0);
  vec2 sq = warped + vec2(warpB * 2.1 - 1.05, warpB * 1.3 - t * 0.3);
  float smoke = fbm(sq);
  float curl = 1.0 - abs(smoke * 2.0 - 1.0);
  float ridged = 1.0 - abs(fbm(sq * 2.3 + 11.0) * 2.0 - 1.0);
  float wisps = pow(curl, 2.0) * (0.35 + 0.65 * pow(ridged, 3.0));
  float dissipate = 1.0 - smoothstep(0.35, 1.05, uv.y + (warpA - 0.5) * 0.35);
  float feed = smoothstep(-0.15, 0.25, uv.y);
  float body = pow(smoothstep(0.28, 0.85, smoke), 1.35) * dissipate * feed * u_density;
  vec2 lightDir = vec2(-0.075, 0.11);
  float smokeLit = fbm(sq + lightDir);
  float shade = clamp(0.62 + (smoke - smokeLit) * 3.4, 0.25, 1.35);
  vec3 col = mix(vec3(0.008, 0.008, 0.02), vec3(0.02, 0.018, 0.045), uv.y);
  vec3 ink = mix(u_colorA, u_colorB, clamp(warpB * 1.4 - 0.2, 0.0, 1.0));
  col += ink * body * shade * (0.5 + 0.5 * u_intensity);
  col += u_colorC * wisps * body * 0.5;
  col += mix(ink, vec3(1.0), 0.6) * pow(curl, 6.0) * ridged * body * shade * 0.5 * u_intensity;
  col += ink * smoothstep(0.15, 0.55, smoke) * dissipate * feed * 0.08;
  float vignette = smoothstep(1.6, 0.45, length(vec2(p.x, uv.y - 0.5)));
  col *= 0.78 + 0.22 * vignette;
  col += (hash2(gl_FragCoord.xy) - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return SmokeShader;
});
