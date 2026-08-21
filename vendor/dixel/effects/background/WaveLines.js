Dixel.define('WaveLines', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class WaveLines extends Component {
    static defaults = { lines: 5, amplitude: 16, wavelength: 320, speed: 0.9 };

    build() {
      return Utils.el('div', 'dx-bg');
    }

    ready() {
      this.el.classList.add('dx-bg');
      this.canvas = Utils.el('canvas', 'dx-bg-canvas');
      this.el.appendChild(this.canvas);
      this.context = this.canvas.getContext('2d');
      const readColors = () => {
        this.colorA = Utils.token('primary', '#6d5cff');
        this.colorB = Utils.token('cyan', '#2ee6d6');
      };
      readColors();
      this.addCleanup(Utils.onTheme(readColors));
      this.fit();
      this.listen(window, 'resize', this.fit);
      this.whenVisible((visible) => {
        if (visible && Utils.reducedMotion) this.draw(0);
      });
      if (!Utils.reducedMotion) this.onFrame(this.update);
    }

    fit() {
      const size = Utils.fitCanvas(this.canvas, this.context);
      this.width = size.width;
      this.height = size.height;
      this.segments = Math.max(24, Math.round(this.width / (Utils.isTouch ? 40 : 26)));
      const gradient = this.context.createLinearGradient(0, 0, size.width, 0);
      gradient.addColorStop(0, this.colorA);
      gradient.addColorStop(1, this.colorB);
      this.context.strokeStyle = gradient;
      this.context.lineWidth = 1.2;
    }

    update(time) {
      if (!this.visible) return;
      this.draw(time);
    }

    draw(time) {
      const ctx = this.context;
      ctx.clearRect(0, 0, this.width, this.height);
      const lines = this.options.lines;
      const step = this.width / this.segments;
      const wave = (Math.PI * 2) / this.options.wavelength;
      for (let line = 0; line < lines; line++) {
        const baseY = (this.height * (line + 1)) / (lines + 1);
        const phase = line * 0.85;
        const amplitude = this.options.amplitude * (1 - line * 0.06);
        ctx.globalAlpha = 0.55 - (line / lines) * 0.35;
        ctx.beginPath();
        for (let segment = 0; segment <= this.segments; segment++) {
          const x = segment * step;
          const y = baseY + Math.sin(x * wave + time * this.options.speed + phase) * amplitude;
          if (segment === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  return WaveLines;
});
