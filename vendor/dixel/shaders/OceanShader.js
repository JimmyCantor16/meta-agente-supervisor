Dixel.define('OceanShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  class OceanShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 1,
      intensity: 1,
      scale: 1,
      resolutionScale: 0.8,
      frozenTime: 14
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
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 3; i++) {
    value += amplitude * noise(p);
    p = p * 2.02 + vec2(3.1, 1.7);
    amplitude *= 0.5;
  }
  return value;
}
float surfaceLine(float x, float t) {
  return 0.9 + sin(x * 5.0 + t * 1.5) * 0.012 + sin(x * 9.3 - t * 2.3) * 0.007 + sin(x * 16.0 + t * 3.4) * 0.004;
}
vec3 waterBase(vec2 p, float t) {
  float surf = surfaceLine(p.x, t);
  float up = clamp(p.y / surf, 0.0, 1.0);
  vec3 abyss = u_colorA * 0.05 + vec3(0.004, 0.007, 0.018);
  vec3 mid = mix(u_colorA, u_colorB, 0.35) * 0.17;
  vec3 shallow = mix(u_colorA, u_colorB, 0.72) * 0.4;
  vec3 col = mix(abyss, mid, smoothstep(0.0, 0.6, up));
  float high = smoothstep(0.5, 1.0, up);
  col = mix(col, shallow, high * high);
  vec2 cp = p * 7.0 * u_scale;
  float ca = sin(cp.x + sin(cp.y + t * 1.5) * 1.5) * sin(cp.y * 1.3 + sin(cp.x - t * 1.2) * 1.3);
  float caustics = pow(abs(ca), 3.0) * smoothstep(surf - 0.5, surf, p.y);
  col += mix(u_colorB, vec3(1.0), 0.4) * caustics * 0.13 * u_intensity;
  return col;
}
vec3 waterBody(vec2 p, float t) {
  vec3 col = waterBase(p, t);
  float surf = surfaceLine(p.x, t);
  float up = clamp(p.y / surf, 0.0, 1.0);
  float body = fbm(p * 1.7 * u_scale + vec2(t * 0.07, -t * 0.04));
  col *= 0.86 + body * 0.28;
  float w1 = sin(p.x * 5.5 + t * 1.2 + sin(p.y * 4.0 + t * 0.7) * 1.4);
  float w2 = sin(p.x * 10.5 - t * 1.9 + sin(p.y * 6.5 - t * 1.1) * 1.2);
  col += u_colorB * (0.5 + 0.5 * w1 * w2) * 0.04 * up;
  return col;
}
vec3 bubbles(vec3 col, vec2 p, vec2 pointer, float t, float cellScale, float rise, float seed, float strength) {
  vec2 q = vec2(p.x * cellScale + seed, (p.y - t * rise) * cellScale);
  vec2 base = floor(q);
  for (int cy = -1; cy <= 1; cy++) {
    for (int cx = -1; cx <= 1; cx++) {
      vec2 cell = base + vec2(float(cx), float(cy));
      float rnd = hash2(cell + seed * 0.31);
      if (rnd < 0.5) continue;
      float r = mix(0.1, 0.24, fract(rnd * 7.31));
      vec2 jitter = (vec2(fract(rnd * 13.7), fract(rnd * 29.3)) - 0.5) * 0.3;
      float worldY = (cell.y + 0.5 + jitter.y) / cellScale + t * rise;
      float sway = sin(worldY * 10.0 + rnd * 6.2831 + t * 1.4) * 0.09;
      float cellX = cell.x + 0.5 + jitter.x + sway;
      vec2 worldCenter = vec2((cellX - seed) / cellScale, worldY);
      vec2 away = worldCenter - pointer;
      float push = exp(-dot(away, away) * 20.0);
      worldCenter += (away / max(length(away), 0.05)) * push * (r * 1.1 / cellScale) * u_intensity;
      float rw = r / cellScale;
      vec2 off = p - worldCenter;
      float dist = length(off);
      if (dist > rw * 2.4) continue;
      float surf = surfaceLine(worldCenter.x, t);
      float fadeIn = smoothstep(-0.02, 0.1, worldCenter.y);
      float atSurf = smoothstep(surf + 0.005, surf - 0.04, worldCenter.y);
      float pop = atSurf * (1.0 - atSurf) * 4.0;
      float alpha = fadeIn * atSurf * strength;
      if (alpha < 0.004) continue;
      float nd = clamp(dist / rw, 0.0, 1.0);
      float inside = 1.0 - smoothstep(rw * 0.94, rw, dist);
      float bulge = sqrt(max(1.0 - nd * nd, 0.0));
      vec2 dir = off / max(dist, 0.0001);
      vec2 shift = dir * (1.0 - bulge) * rw * 1.15;
      vec3 interior = waterBase(p + shift, t) * (0.98 + bulge * 0.1);
      col = mix(col, interior, inside * 0.9 * alpha);
      float edgeDark = smoothstep(rw * 0.6, rw * 0.88, dist) * inside;
      col = mix(col, col * 0.7, edgeDark * 0.45 * alpha);
      float rim = smoothstep(rw * 0.76, rw * 0.93, dist) * inside;
      float rimLight = rim * (0.4 + 0.6 * max(dir.y, 0.0) + 0.22 * max(-dir.y, 0.0));
      col += mix(u_colorB, vec3(1.0), 0.6) * rimLight * (0.75 + pop * 0.7) * alpha;
      vec2 g1 = off - vec2(-0.34, 0.42) * rw;
      col += vec3(1.0) * exp(-dot(g1, g1) / (rw * rw * 0.012)) * 1.1 * alpha;
      vec2 g2 = off - vec2(0.3, -0.36) * rw;
      col += mix(u_colorB, vec3(1.0), 0.5) * exp(-dot(g2, g2) / (rw * rw * 0.02)) * 0.3 * alpha;
      float wake = exp(-off.x * off.x / (rw * rw * 0.32)) * smoothstep(-rw * 2.4, -rw * 1.3, off.y) * (1.0 - smoothstep(-rw * 1.25, -rw * 1.0, off.y));
      col += u_colorB * wake * 0.05 * alpha;
    }
  }
  return col;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  vec2 pointer = vec2(u_pointer.x * aspect, u_pointer.y);
  float t = u_time * 0.5;
  vec3 col = waterBody(p, t);
  float surf = surfaceLine(p.x, t);
  float rays = fbm(vec2(p.x * 2.6 + (surf - p.y) * 0.7 - t * 0.3, (surf - p.y) * 0.5));
  rays = pow(max(rays * 1.3 - 0.3, 0.0), 2.4) * smoothstep(surf - 1.1, surf, p.y);
  col += mix(u_colorB, vec3(1.0), 0.5) * rays * 0.38 * u_intensity;
  col *= 1.0 + rays * 0.35;
  col = bubbles(col, p, pointer, t, 9.0 * u_scale, 0.055, 11.0, 0.5);
  col = bubbles(col, p, pointer, t, 5.8 * u_scale, 0.085, 37.0, 0.75);
  col = bubbles(col, p, pointer, t, 3.4 * u_scale, 0.125, 71.0, 1.0);
  float above = smoothstep(surf, surf + 0.014, uv.y);
  vec3 sky = mix(u_colorB, vec3(1.0), 0.5) * 0.42 + u_colorB * fbm(vec2(p.x * 8.0, t)) * 0.22;
  col = mix(col, sky, above);
  float glint = exp(-abs(uv.y - surf) * 95.0);
  col += mix(u_colorB, vec3(1.0), 0.6) * glint * 0.55 * u_intensity;
  float vignette = smoothstep(1.5, 0.45, length(uv - vec2(0.5, 0.42)));
  col *= 0.82 + 0.18 * vignette;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return OceanShader;
});
