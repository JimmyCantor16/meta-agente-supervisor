Dixel.define('LiquidShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  class LiquidShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 1,
      intensity: 1,
      scale: 1,
      hero: false,
      resolutionScale: 0.75,
      frozenTime: 8
    });

    ready() {
      if (this.options.hero) {
        this.options.intensity *= 1.3;
        this.options.scale *= 0.78;
      }
      super.ready();
    }

    fragmentShader() {
      return `
float field(vec2 p, float t, out vec3 tint) {
  float f = 0.0;
  tint = vec3(0.0);
  vec2 d;
  float g;
  d = p - vec2(sin(t * 0.6) * 0.55, cos(t * 0.45) * 0.4);
  g = 0.10 / (dot(d, d) + 0.003); f += g; tint += u_colorA * g;
  d = p - vec2(cos(t * 0.5 + 2.0) * 0.6, sin(t * 0.7 + 1.0) * 0.45);
  g = 0.13 / (dot(d, d) + 0.003); f += g; tint += u_colorB * g;
  d = p - vec2(sin(t * 0.8 + 4.0) * 0.45, cos(t * 0.6 + 3.0) * 0.5);
  g = 0.07 / (dot(d, d) + 0.003); f += g; tint += u_colorC * g;
  d = p - vec2(cos(t * 0.35 + 1.0) * 0.3, sin(t * 0.5 + 5.0) * 0.32);
  g = 0.15 / (dot(d, d) + 0.003); f += g; tint += u_colorA * g;
  d = p - vec2(sin(t * 0.4 + 2.5) * 0.7, cos(t * 0.3 + 0.5) * 0.25);
  g = 0.06 / (dot(d, d) + 0.003); f += g; tint += u_colorB * g;
  d = p - vec2(cos(t * 0.7 + 5.2) * 0.5, sin(t * 0.55 + 2.2) * 0.55);
  g = 0.09 / (dot(d, d) + 0.003); f += g; tint += u_colorC * g;
  d = p - vec2(sin(t * 0.3 + 1.4) * 0.75, cos(t * 0.65 + 4.4) * 0.35);
  g = 0.05 / (dot(d, d) + 0.003); f += g; tint += u_colorB * g;
  d = p - vec2(cos(t * 0.45 + 3.6) * 0.4, sin(t * 0.35 + 0.8) * 0.6);
  g = 0.11 / (dot(d, d) + 0.003); f += g; tint += u_colorC * g;
  d = p - vec2(sin(t * 0.9 + 6.0) * 0.3, cos(t * 0.8 + 1.8) * 0.22);
  g = 0.045 / (dot(d, d) + 0.003); f += g; tint += u_colorA * g;
  d = p - vec2(0.0, sin(t * 0.25) * 0.1);
  g = 0.12 / (dot(d, d) + 0.003); f += g; tint += u_colorA * g;
  return f;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float minSide = min(u_resolution.x, u_resolution.y);
  vec2 aspect = u_resolution / minSide;
  vec2 p = (uv * 2.0 - 1.0) * aspect * u_scale;
  vec2 pointer = (u_pointer * 2.0 - 1.0) * aspect * u_scale;
  float t = u_time * 0.55;
  vec2 away = p - pointer;
  float pull = exp(-dot(away, away) * 4.0);
  p -= normalize(away + 0.0001) * pull * 0.16 * u_intensity;
  vec3 tint;
  vec3 tintLit;
  float f = field(p, t, tint);
  vec2 cursorDelta = p - pointer;
  float cursorBlob = 0.03 / (dot(cursorDelta, cursorDelta) + 0.005);
  f += cursorBlob;
  tint += mix(u_colorB, u_colorA, 0.5) * cursorBlob;
  vec2 lightDir = normalize(vec2(-0.6, 0.8));
  float fLit = field(p + lightDir * 0.045, t, tintLit);
  vec3 liquid = tint / max(f, 0.001);
  float body = smoothstep(0.9, 1.12, f);
  float core = smoothstep(1.7, 3.4, f);
  float rim = smoothstep(0.9, 1.03, f) * (1.0 - smoothstep(1.03, 1.6, f));
  float slope = clamp((fLit - f) * 2.4, 0.0, 1.0);
  float spec = pow(slope, 2.2) * smoothstep(0.85, 1.05, f) * (1.0 - smoothstep(1.4, 2.6, f));
  vec3 col = mix(vec3(0.01, 0.01, 0.03), vec3(0.03, 0.02, 0.06), uv.y);
  col += liquid * smoothstep(0.32, 0.9, f) * 0.14;
  col += liquid * body * (0.65 + 0.4 * u_intensity);
  col += liquid * core * 0.4;
  col += (u_colorB * 0.6 + 0.4) * rim * 0.4;
  col += vec3(1.0) * spec * 0.75 * u_intensity;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return LiquidShader;
});
