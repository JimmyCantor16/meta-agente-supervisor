Dixel.define('IsoField', ['Component', 'Utils', 'Pointer'], function (Component, Utils, Pointer) {
  'use strict';

  function hexToRgb(hex) {
    return Utils.channels(Utils.color(hex, 'primary')) || [109, 92, 255];
  }

  function shade(rgb, factor, mixWhite) {
    const white = mixWhite || 0;
    const r = Math.round(Utils.clamp((rgb[0] * factor) * (1 - white) + 255 * white, 0, 255));
    const g = Math.round(Utils.clamp((rgb[1] * factor) * (1 - white) + 255 * white, 0, 255));
    const b = Math.round(Utils.clamp((rgb[2] * factor) * (1 - white) + 255 * white, 0, 255));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  const TONE_STEPS = 20;

  class IsoField extends Component {
    static defaults = {
      colorA: 'primary',
      colorB: 'cyan',
      colorC: 'magenta',
      background: 'bg',
      columns: 15,
      rows: 15,
      speed: 1,
      amplitude: 1,
      lift: 1.5,
      liftRadius: 3,
      frozenTime: 5
    };

    ready() {
      this.el.classList.add('dx-mesh', 'dx-mesh--flat');
      this.time = 0;
      this.staticDrawn = false;
      this.canvas = Utils.el('canvas', 'dx-mesh-canvas');
      this.el.appendChild(this.canvas);
      this.context = this.canvas.getContext('2d');
      this.buildPalette();
      this.measure();
      this.addCleanup(Pointer.use());
      this.listen(window, 'resize', this.measure);
      this.whenVisible(() => {});
      this.onFrame(this.frame);
    }

    buildPalette() {
      const top = hexToRgb(this.options.colorB);
      const left = hexToRgb(this.options.colorA);
      const right = hexToRgb(this.options.colorC);
      this.topTones = [];
      this.leftTones = [];
      this.rightTones = [];
      for (let step = 0; step < TONE_STEPS; step++) {
        const level = step / (TONE_STEPS - 1);
        this.topTones.push(shade(top, 0.55 + level * 0.55, level * 0.25));
        this.leftTones.push(shade(left, 0.4 + level * 0.5, 0));
        this.rightTones.push(shade(right, 0.22 + level * 0.3, 0));
      }
    }

    measure() {
      const rect = this.el.getBoundingClientRect();
      this.cssWidth = Math.max(1, rect.width);
      this.cssHeight = Math.max(1, rect.height);
      this.rectLeft = rect.left;
      this.rectTopDocument = rect.top + (window.scrollY || 0);
      const dpr = Utils.dpr;
      this.canvas.width = Math.round(this.cssWidth * dpr);
      this.canvas.height = Math.round(this.cssHeight * dpr);
      this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const columns = this.options.columns;
      const rows = this.options.rows;
      this.tileWidth = (this.cssWidth * 0.92) / ((columns + rows) / 2);
      this.tileHeight = this.tileWidth * 0.5;
      this.waveHeight = this.tileWidth * 0.55 * this.options.amplitude;
      this.originX = this.cssWidth / 2;
      this.originY = this.cssHeight / 2 - ((columns + rows) / 4) * this.tileHeight + this.tileHeight;
      this.staticDrawn = false;
    }

    frame(time, delta) {
      if (!this.visible || document.hidden) return;
      if (Utils.reducedMotion) {
        if (this.staticDrawn) return;
        this.time = this.options.frozenTime;
        this.draw(false);
        this.staticDrawn = true;
        return;
      }
      this.time += delta * this.options.speed;
      this.draw(true);
    }

    pointerCell() {
      const top = this.rectTopDocument - (window.scrollY || 0);
      const localX = Pointer.smoothX - this.rectLeft - this.originX;
      const localY = Pointer.smoothY - top - this.originY;
      const halfW = this.tileWidth / 2;
      const halfH = this.tileHeight / 2;
      return {
        i: (localX / halfW + localY / halfH) / 2,
        j: (localY / halfH - localX / halfW) / 2
      };
    }

    draw(interactive) {
      const ctx = this.context;
      const options = this.options;
      const t = this.time;
      ctx.fillStyle = Utils.color(options.background, 'bg');
      ctx.fillRect(0, 0, this.cssWidth, this.cssHeight);
      const halfW = this.tileWidth / 2;
      const halfH = this.tileHeight / 2;
      const pointer = interactive ? this.pointerCell() : null;
      const liftRadius = options.liftRadius;
      const maxTone = TONE_STEPS - 1;
      for (let j = 0; j < options.rows; j++) {
        for (let i = 0; i < options.columns; i++) {
          let wave = Math.sin(i * 0.55 + t * 1.7) * 0.5 + Math.cos(j * 0.5 + t * 1.35) * 0.4;
          wave += Math.sin((i + j) * 0.38 - t * 1.1) * 0.6;
          let height = (wave * 0.5 + 0.75) * this.waveHeight;
          if (pointer) {
            const di = i - pointer.i;
            const dj = j - pointer.j;
            const falloff = Math.exp(-(di * di + dj * dj) / (liftRadius * liftRadius));
            height += falloff * this.waveHeight * options.lift;
          }
          const x = this.originX + (i - j) * halfW;
          const baseY = this.originY + (i + j) * halfH;
          const topY = baseY - height;
          const tone = Math.round(Utils.clamp(height / (this.waveHeight * (1.5 + options.lift)), 0, 1) * maxTone);
          ctx.fillStyle = this.leftTones[tone];
          ctx.beginPath();
          ctx.moveTo(x - halfW, topY + halfH);
          ctx.lineTo(x, topY + this.tileHeight);
          ctx.lineTo(x, baseY + this.tileHeight);
          ctx.lineTo(x - halfW, baseY + halfH);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = this.rightTones[tone];
          ctx.beginPath();
          ctx.moveTo(x + halfW, topY + halfH);
          ctx.lineTo(x, topY + this.tileHeight);
          ctx.lineTo(x, baseY + this.tileHeight);
          ctx.lineTo(x + halfW, baseY + halfH);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = this.topTones[tone];
          ctx.beginPath();
          ctx.moveTo(x, topY);
          ctx.lineTo(x + halfW, topY + halfH);
          ctx.lineTo(x, topY + this.tileHeight);
          ctx.lineTo(x - halfW, topY + halfH);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  return IsoField;
});
