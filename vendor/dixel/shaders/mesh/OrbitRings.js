Dixel.define('OrbitRings', ['Component', 'Utils', 'Pointer'], function (Component, Utils, Pointer) {
  'use strict';

  function hexToRgb(hex) {
    return Utils.channels(Utils.color(hex, 'primary')) || [109, 92, 255];
  }

  function rgba(rgb, alpha) {
    return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + alpha + ')';
  }

  const SPRITE_SIZE = 64;

  class OrbitRings extends Component {
    static defaults = {
      colorA: 'primary',
      colorB: 'cyan',
      colorC: 'magenta',
      rings: 5,
      dotsPerRing: 3,
      tilt: 0.38,
      speed: 1,
      parallax: 14,
      frozenTime: 3
    };

    ready() {
      this.el.classList.add('dx-mesh', 'dx-mesh--flat');
      this.time = 0;
      this.staticDrawn = false;
      this.parallaxX = 0;
      this.parallaxY = 0;
      this.canvas = Utils.el('canvas', 'dx-mesh-canvas');
      this.el.appendChild(this.canvas);
      this.context = this.canvas.getContext('2d');
      this.colors = [
        hexToRgb(this.options.colorA),
        hexToRgb(this.options.colorB),
        hexToRgb(this.options.colorC)
      ];
      this.buildRings();
      this.buildSprites();
      this.measure();
      this.addCleanup(Pointer.use());
      this.listen(window, 'resize', this.measure);
      this.whenVisible(() => {});
      this.onFrame(this.frame);
    }

    buildRings() {
      const count = Math.max(2, this.options.rings);
      this.ringData = [];
      for (let index = 0; index < count; index++) {
        const level = index / (count - 1);
        const dots = [];
        const dotCount = Math.max(1, Math.round(this.options.dotsPerRing * (0.6 + level)));
        for (let dot = 0; dot < dotCount; dot++) {
          dots.push({
            offset: (dot / dotCount) * Math.PI * 2 + index * 1.3,
            color: (index + dot) % 3
          });
        }
        this.ringData.push({
          radiusFactor: 0.3 + 0.7 * level,
          rotation: (level - 0.5) * 0.9,
          squash: this.options.tilt * (0.75 + level * 0.5),
          angularSpeed: (1.6 - level) * 0.55,
          color: index % 3,
          dots
        });
      }
    }

    buildSprites() {
      this.sprites = this.colors.map((rgb) => {
        const sprite = document.createElement('canvas');
        sprite.width = SPRITE_SIZE;
        sprite.height = SPRITE_SIZE;
        const ctx = sprite.getContext('2d');
        const half = SPRITE_SIZE / 2;
        const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
        gradient.addColorStop(0, 'rgba(255,255,255,0.95)');
        gradient.addColorStop(0.22, rgba(rgb, 0.9));
        gradient.addColorStop(0.55, rgba(rgb, 0.28));
        gradient.addColorStop(1, rgba(rgb, 0));
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, SPRITE_SIZE, SPRITE_SIZE);
        return sprite;
      });
    }

    measure() {
      const rect = this.el.getBoundingClientRect();
      this.cssWidth = Math.max(1, rect.width);
      this.cssHeight = Math.max(1, rect.height);
      const dpr = Utils.dpr;
      this.canvas.width = Math.round(this.cssWidth * dpr);
      this.canvas.height = Math.round(this.cssHeight * dpr);
      this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.maxRadius = Math.min(this.cssWidth, this.cssHeight) * 0.42;
      this.staticDrawn = false;
    }

    frame(time, delta) {
      if (!this.visible || document.hidden) return;
      if (Utils.reducedMotion) {
        if (this.staticDrawn) return;
        this.time = this.options.frozenTime;
        this.parallaxX = 0;
        this.parallaxY = 0;
        this.draw();
        this.staticDrawn = true;
        return;
      }
      this.time += delta * this.options.speed;
      this.parallaxX = Utils.damp(this.parallaxX, Pointer.normalX * this.options.parallax, 3, delta);
      this.parallaxY = Utils.damp(this.parallaxY, Pointer.normalY * this.options.parallax, 3, delta);
      this.draw();
    }

    draw() {
      const ctx = this.context;
      const t = this.time;
      ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
      const centerX = this.cssWidth / 2 + this.parallaxX;
      const centerY = this.cssHeight / 2 + this.parallaxY;
      const coreSize = this.maxRadius * 0.34;
      ctx.globalAlpha = 0.85;
      ctx.drawImage(this.sprites[0], centerX - coreSize / 2, centerY - coreSize / 2, coreSize, coreSize);
      ctx.globalAlpha = 1;
      this.ringData.forEach((ring) => {
        const radiusX = this.maxRadius * ring.radiusFactor;
        const radiusY = radiusX * ring.squash;
        const wobble = ring.rotation + Math.sin(t * 0.3 + ring.radiusFactor * 5) * 0.06;
        const rgb = this.colors[ring.color];
        ctx.lineWidth = 1;
        ctx.strokeStyle = rgba(rgb, 0.16);
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, radiusX, radiusY, wobble, Math.PI, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = rgba(rgb, 0.42);
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, radiusX, radiusY, wobble, 0, Math.PI);
        ctx.stroke();
        const cosR = Math.cos(wobble);
        const sinR = Math.sin(wobble);
        ring.dots.forEach((dot) => {
          const angle = dot.offset + t * ring.angularSpeed;
          const ex = Math.cos(angle) * radiusX;
          const ey = Math.sin(angle) * radiusY;
          const x = centerX + ex * cosR - ey * sinR;
          const y = centerY + ex * sinR + ey * cosR;
          const depth = 0.5 + 0.5 * Math.sin(angle);
          const size = this.maxRadius * (0.045 + 0.075 * depth);
          ctx.globalAlpha = 0.25 + 0.75 * depth;
          ctx.drawImage(this.sprites[dot.color], x - size / 2, y - size / 2, size, size);
        });
        ctx.globalAlpha = 1;
      });
    }
  }

  return OrbitRings;
});
