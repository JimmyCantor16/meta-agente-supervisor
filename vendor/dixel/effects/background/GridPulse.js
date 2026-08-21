Dixel.define('GridPulse', ['Component', 'Pointer', 'Utils'], function (Component, Pointer, Utils) {
  'use strict';

  class GridPulse extends Component {
    static defaults = { gap: 46, dotSize: 2.2, speed: 2.4, wavelength: 150, mode: 'pointer' };

    build() {
      return Utils.el('div', 'dx-bg');
    }

    ready() {
      this.el.classList.add('dx-bg');
      this.canvas = Utils.el('canvas', 'dx-bg-canvas');
      this.el.appendChild(this.canvas);
      this.context = this.canvas.getContext('2d');
      const readColors = () => {
        this.color = Utils.token('primary', '#6d5cff');
      };
      readColors();
      this.addCleanup(Utils.onTheme(readColors));
      this.docLeft = 0;
      this.docTop = 0;
      this.usePointer = this.options.mode === 'pointer' && !Utils.isTouch;
      this.fit();
      this.listen(window, 'resize', this.fit);
      this.whenVisible((visible) => {
        if (visible && Utils.reducedMotion) this.draw(0, this.width / 2, this.height / 2);
      });
      if (!Utils.reducedMotion) {
        if (this.usePointer) this.addCleanup(Pointer.use());
        this.onFrame(this.update);
      }
    }

    fit() {
      const size = Utils.fitCanvas(this.canvas, this.context);
      this.width = size.width;
      this.height = size.height;
      const rect = this.canvas.getBoundingClientRect();
      this.docLeft = rect.left;
      this.docTop = rect.top + window.scrollY;
      const areaScale = Math.max(1, Math.sqrt((this.width * this.height) / (1440 * 810)));
      this.gap = this.options.gap * areaScale * (Utils.isTouch ? 1.3 : 1);
      this.cols = Math.ceil(this.width / this.gap) + 1;
      this.rows = Math.ceil(this.height / this.gap) + 1;
      this.context.fillStyle = this.color;
    }

    update(time) {
      if (!this.visible) return;
      let originX = this.width / 2;
      let originY = this.height / 2;
      if (this.usePointer) {
        originX = Utils.clamp(Pointer.smoothX - this.docLeft, 0, this.width);
        originY = Utils.clamp(Pointer.smoothY - (this.docTop - window.scrollY), 0, this.height);
      }
      this.draw(time, originX, originY);
    }

    draw(time, originX, originY) {
      const ctx = this.context;
      ctx.clearRect(0, 0, this.width, this.height);
      const wave = (Math.PI * 2) / this.options.wavelength;
      for (let row = 0; row < this.rows; row++) {
        for (let col = 0; col < this.cols; col++) {
          const x = col * this.gap;
          const y = row * this.gap;
          const dx = x - originX;
          const dy = y - originY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const lit = Math.max(Math.sin(dist * wave - time * this.options.speed), 0);
          ctx.globalAlpha = 0.12 + 0.5 * lit;
          const radius = this.options.dotSize * (0.6 + 0.7 * lit);
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  return GridPulse;
});
