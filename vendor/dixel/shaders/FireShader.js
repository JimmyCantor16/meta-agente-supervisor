Dixel.define('FireShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  class FireShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      colorA: '#ffc46b',
      colorB: '#ff6a1f',
      colorC: '#8a1200',
      speed: 1,
      intensity: 1,
      scale: 1,
      height: 1,
      wind: 0,
      sparks: true,
      resolutionScale: 0.75,
      frozenTime: 6
    });

    onDraw(gl) {
      const wind = this.uniforms.u_wind;
      if (wind) gl.uniform1f(wind, this.options.wind);
      const height = this.uniforms.u_height;
      if (height) gl.uniform1f(height, this.options.height);
    }

    fragmentShader() {
      const sparksBlock = this.options.sparks
        ? [
            '  float emberGlow = sparkLayer(vec2(p.x, uv.y), t, 9.0, 3.0) + sparkLayer(vec2(p.x, uv.y), t * 1.25, 14.0, 29.0) * 0.7;',
            '  col += mix(u_colorA, vec3(1.0, 0.9, 0.7), 0.5) * emberGlow * u_intensity;'
          ].join('\n')
        : '';
      return `
uniform float u_wind;
uniform float u_height;
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
    p = p * 2.02 + vec2(2.3, 7.7);
    amplitude *= 0.5;
  }
  return value;
}
float sparkLayer(vec2 p, float t, float cellScale, float seed) {
  vec2 q = vec2(p.x * cellScale + seed + u_wind * p.y * 2.0, (p.y - t * 0.34) * cellScale);
  vec2 cell = floor(q);
  vec2 f = fract(q) - 0.5;
  float rnd = hash2(cell + seed);
  vec2 jitter = (vec2(fract(rnd * 13.7), fract(rnd * 29.3)) - 0.5) * 0.6;
  jitter.x += sin(t * (3.0 + fract(rnd * 5.0) * 3.0) + rnd * 6.28) * 0.14;
  vec2 d = f - jitter;
  float worldY = (cell.y + 0.5) / cellScale + t * 0.34;
  float life = smoothstep(0.15, 0.3, worldY) * (1.0 - smoothstep(0.55, 0.95, worldY));
  float spark = exp(-dot(d, d) * mix(240.0, 620.0, fract(rnd * 5.3)));
  float flicker = 0.5 + 0.5 * sin(t * (6.0 + fract(rnd * 3.1) * 8.0) + rnd * 6.28);
  return spark * step(0.55, rnd) * life * flicker;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y);
  float t = u_time * 1.15;
  float shimmerBand = smoothstep(0.35, 0.85, uv.y);
  vec2 q = p;
  q.x += (noise(vec2(p.y * 7.0 - t * 3.2, p.x * 5.0)) - 0.5) * 0.06 * shimmerBand;
  q.x -= u_wind * uv.y * uv.y * 0.35;
  q.x += sin(t * 0.8) * 0.02 * uv.y;
  float body = fbm(vec2(q.x * 3.2 * u_scale, q.y * 2.1 * u_scale - t * 1.05));
  float tongues = noise(vec2(q.x * 6.5 * u_scale, q.y * 3.6 * u_scale - t * 1.9));
  float shape = body * 1.15 + tongues * 0.55;
  float flameWidth = abs(q.x) * (1.5 + uv.y * 2.2);
  float density = shape - (uv.y / max(u_height, 0.15)) * (1.05 + flameWidth * 2.2) - flameWidth * 0.85 + 0.46;
  float d = clamp(density * 1.6, 0.0, 1.0);
  vec3 col = mix(vec3(0.012, 0.005, 0.01), vec3(0.03, 0.012, 0.02), uv.y * 0.5);
  col += u_colorC * smoothstep(0.02, 0.3, d) * 0.85;
  col = mix(col, u_colorB, smoothstep(0.22, 0.58, d));
  col = mix(col, u_colorA, smoothstep(0.5, 0.82, d));
  col += vec3(1.0, 0.94, 0.8) * smoothstep(0.76, 0.98, d) * 0.9 * u_intensity;
  col += u_colorB * exp(-uv.y * 3.4) * exp(-abs(p.x) * 4.2) * 0.4 * u_intensity;
  col += u_colorC * exp(-uv.y * 1.6) * exp(-abs(p.x) * 1.8) * 0.22;
${sparksBlock}
  float vignette = smoothstep(1.5, 0.4, length(vec2(p.x, uv.y - 0.42)));
  col *= 0.8 + 0.2 * vignette;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return FireShader;
});
