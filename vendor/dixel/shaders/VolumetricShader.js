Dixel.define('VolumetricShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  const CORNERS = {
    'top-left': [-0.12, 1.12],
    'top-right': [1.12, 1.12],
    'bottom-left': [-0.12, -0.12],
    'bottom-right': [1.12, -0.12]
  };

  class VolumetricShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 1,
      intensity: 1,
      scale: 1,
      corner: 'top-left',
      angle: 0,
      resolutionScale: 0.7,
      frozenTime: 11
    });

    ready() {
      this.rayOrigin = CORNERS[this.options.corner] || CORNERS['top-left'];
      this.rayAngle = (this.options.angle * Math.PI) / 180;
      super.ready();
    }

    onDraw(gl) {
      const origin = this.uniforms.u_rayOrigin;
      if (origin) gl.uniform2f(origin, this.rayOrigin[0], this.rayOrigin[1]);
      const angle = this.uniforms.u_rayAngle;
      if (angle) gl.uniform1f(angle, this.rayAngle);
    }

    fragmentShader() {
      return `
uniform vec2 u_rayOrigin;
uniform float u_rayAngle;
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
    p = p * 2.03 + vec2(1.9, 4.7);
    amplitude *= 0.5;
  }
  return value;
}
float dust(vec2 p, float t, float scale, float seed) {
  vec2 q = p * scale + vec2(t * 0.35 * (0.5 + fract(seed * 0.37)), t * (0.4 + fract(seed * 0.71)) * 0.5) + seed;
  vec2 cell = floor(q);
  vec2 f = fract(q) - 0.5;
  float rnd = hash2(cell + seed);
  vec2 jitter = (vec2(fract(rnd * 13.7), fract(rnd * 29.3)) - 0.5) * 0.7;
  jitter += vec2(sin(t * 0.8 + rnd * 6.28), cos(t * 0.6 + rnd * 4.2)) * 0.12;
  vec2 d = f - jitter;
  float size = mix(90.0, 380.0, fract(rnd * 5.3));
  float particle = exp(-dot(d, d) * size);
  float twinkle = 0.6 + 0.4 * sin(t * (1.0 + fract(rnd * 3.1) * 2.0) + rnd * 6.28);
  return particle * step(0.45, rnd) * twinkle;
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  vec2 origin = vec2(u_rayOrigin.x * aspect, u_rayOrigin.y);
  float t = u_time * 0.4;
  vec2 toPixel = p - origin;
  float dist = length(toPixel);
  float ang = atan(toPixel.y, toPixel.x) + u_rayAngle;
  float breath = 0.82 + 0.18 * sin(t * 0.9);
  float shafts = fbm(vec2(ang * 7.0 * u_scale, dist * 0.4 - t * 0.28));
  shafts = pow(shafts, 3.4);
  float shafts2 = fbm(vec2(ang * 13.0 * u_scale + 40.0, dist * 0.6 - t * 0.2));
  shafts += pow(shafts2, 4.2) * 0.6;
  float reach = exp(-dist * 0.85) * smoothstep(0.02, 0.35, dist);
  float beam = shafts * reach * breath;
  vec3 col = mix(u_colorA * 0.045, u_colorA * 0.11, uv.y) + vec3(0.003, 0.004, 0.01);
  vec3 lightColor = mix(u_colorB, vec3(1.0), 0.35);
  col += lightColor * beam * 1.35 * u_intensity;
  col += u_colorA * beam * 0.45;
  float sourceGlow = exp(-dist * 2.6);
  col += mix(lightColor, vec3(1.0), 0.5) * sourceGlow * 0.5 * u_intensity;
  float inBeam = 0.25 + shafts * reach * 3.0;
  float motes = dust(p, t, 9.0, 3.0) * 0.5 + dust(p, t, 16.0, 17.0) * 0.3 + dust(p, t * 1.3, 26.0, 51.0) * 0.2;
  col += mix(u_colorB, vec3(1.0), 0.55) * motes * inBeam * 0.65 * u_intensity;
  col += u_colorC * motes * beam * 0.4;
  float vignette = smoothstep(1.7, 0.5, length(vec2(p.x - aspect * 0.5, uv.y - 0.5)));
  col *= 0.72 + 0.28 * vignette;
  col += (hash2(gl_FragCoord.xy) - 0.5) * 0.01;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return VolumetricShader;
});
