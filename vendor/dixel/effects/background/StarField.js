Dixel.define('StarField', ['Component', 'Pointer', 'Utils'], function (Component, Pointer, Utils) {
  'use strict';

  class StarField extends Component {
    static defaults = { density: 9000, maxStars: 220, parallax: 26, twinkle: 1.6 };

    build() {
      return Utils.el('div', 'dx-bg');
    }

    ready() {
      this.el.classList.add('dx-bg');
      this.canvas = Utils.el('canvas', 'dx-bg-canvas');
      this.el.appendChild(this.canvas);
      this.context = this.canvas.getContext('2d');
      const readColors = () => {
        this.color = Utils.token('ink', '#f2f2fa');
      };
      readColors();
      this.addCleanup(Utils.onTheme(readColors));
      this.stars = [];
      this.fit();
      this.listen(window, 'resize', this.fit);
      this.whenVisible((visible) => {
        if (visible && Utils.reducedMotion) this.draw(0, 0, 0);
      });
      if (!Utils.reducedMotion) {
        if (!Utils.isTouch) this.addCleanup(Pointer.use());
        this.onFrame(this.update);
      }
    }

    fit() {
      const size = Utils.fitCanvas(this.canvas, this.context);
      this.width = size.width;
      this.height = size.height;
      const divisor = Utils.isTouch ? this.options.density * 1.8 : this.options.density;
      const count = Math.min(
        Math.max(Math.round((this.width * this.height) / divisor), 24),
        this.options.maxStars
      );
      while (this.stars.length < count) {
        this.stars.push({
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          depth: 0.25 + Math.random() * 0.75,
          phase: Math.random() * Math.PI * 2,
          radius: 0.4 + Math.random() * 1.3
        });
      }
      this.stars.length = count;
    }

    update(time) {
      if (!this.visible) return;
      let normalX = 0;
      let normalY = 0;
      if (!Utils.isTouch) {
        normalX = (Pointer.smoothX / Math.max(innerWidth, 1)) * 2 - 1;
        normalY = (Pointer.smoothY / Math.max(innerHeight, 1)) * 2 - 1;
      }
      this.draw(time, normalX, normalY);
    }

    draw(time, normalX, normalY) {
      const ctx = this.context;
      ctx.clearRect(0, 0, this.width, this.height);
      ctx.fillStyle = this.color;
      const parallax = this.options.parallax;
      const twinkle = this.options.twinkle;
      for (let i = 0; i < this.stars.length; i++) {
        const star = this.stars[i];
        const x = (star.x - normalX * parallax * star.depth + this.width) % this.width;
        const y = (star.y - normalY * parallax * star.depth + this.height) % this.height;
        const pulse = 0.5 + 0.5 * Math.sin(time * twinkle * (0.6 + star.depth) + star.phase);
        ctx.globalAlpha = 0.25 + 0.75 * pulse * star.depth;
        ctx.beginPath();
        ctx.arc(x, y, star.radius * star.depth, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  return StarField;
});
