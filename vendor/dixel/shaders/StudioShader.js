Dixel.define('StudioShader', ['ShaderCanvas'], function (ShaderCanvas) {
  'use strict';

  class StudioShader extends ShaderCanvas {
    static defaults = Object.assign({}, ShaderCanvas.defaults, {
      speed: 1,
      intensity: 1,
      scale: 1,
      warmth: 1,
      resolutionScale: 0.7,
      frozenTime: 6
    });

    onDraw(gl) {
      const location = this.uniforms.u_warmth;
      if (location) gl.uniform1f(location, this.options.warmth);
    }

    fragmentShader() {
      return `
uniform float u_warmth;
float hash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float aspect = u_resolution.x / u_resolution.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  float t = u_time * 0.35;
  vec2 lightPos = vec2((u_pointer.x - 0.5) * aspect, u_pointer.y - 0.5) * 0.55;
  lightPos += vec2(sin(t) * 0.05, cos(t * 0.8) * 0.04);
  float floorLine = -0.18;
  float aboveFloor = smoothstep(floorLine - 0.22, floorLine + 0.3, p.y);
  vec3 wall = mix(u_colorA * 0.10, u_colorA * 0.22, smoothstep(-0.5, 0.6, p.y));
  vec3 ground = mix(u_colorA * 0.16, u_colorA * 0.05, smoothstep(floorLine, floorLine - 0.45, p.y));
  vec3 col = mix(ground, wall, aboveFloor);
  vec2 toLight = p - lightPos;
  toLight.y *= 1.15;
  float key = exp(-dot(toLight, toLight) * (3.2 / u_scale));
  vec3 warm = mix(vec3(1.0), vec3(1.0, 0.86, 0.7), 0.45 * u_warmth);
  col += warm * key * 0.34 * u_intensity;
  col += mix(u_colorA, warm, 0.5) * key * key * 0.22;
  float bounce = exp(-abs(p.y - floorLine) * 6.0) * exp(-dot(toLight, toLight) * 1.2);
  col += mix(u_colorB, vec3(1.0), 0.4) * bounce * 0.12 * u_intensity;
  float rimLeft = exp(-pow((p.x + aspect * 0.52), 2.0) * 9.0) * smoothstep(-0.45, 0.35, p.y);
  col += u_colorB * rimLeft * 0.16 * u_intensity;
  float rimRight = exp(-pow((p.x - aspect * 0.52), 2.0) * 9.0) * smoothstep(-0.45, 0.35, p.y);
  col += u_colorC * rimRight * 0.14 * u_intensity;
  float glow = exp(-abs(p.y - floorLine) * 26.0);
  col += mix(u_colorA, u_colorB, 0.5) * glow * 0.08;
  float vignette = smoothstep(1.25, 0.35, length(p * vec2(0.85, 1.15)));
  col *= 0.55 + 0.45 * vignette;
  col += (hash2(gl_FragCoord.xy) - 0.5) * 0.012;
  gl_FragColor = vec4(col, 1.0);
}`;
    }
  }

  return StudioShader;
});
