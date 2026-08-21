Dixel.define('CursorGlow', ['Component', 'Pointer', 'Utils'], function (Component, Pointer, Utils) {
  'use strict';

  class CursorGlow extends Component {
    static defaults = { size: 520, lag: 10, opacity: 0.6, tint: 'primary' };

    build() {
      return Utils.el('div', 'dx-cursor-layer');
    }

    ready() {
      if (Utils.isTouch || Utils.reducedMotion) {
        this.el.classList.add('dx-cursor-layer--off');
        return;
      }
      this.el.classList.add('dx-cursor-layer');
      this.glow = Utils.el('div', 'dx-cursor-glow dx-cursor-glow--' + this.options.tint);
      this.glow.style.width = this.glow.style.height = this.options.size + 'px';
      this.glow.style.opacity = String(this.options.opacity);
      this.el.appendChild(this.glow);
      this.x = Pointer.x;
      this.y = Pointer.y;
      this.settled = false;
      this.addCleanup(Pointer.use());
      this.onFrame(this.update, true);
    }

    update(time, delta) {
      const targetX = Pointer.x;
      const targetY = Pointer.y;
      this.x = Utils.damp(this.x, targetX, this.options.lag, delta);
      this.y = Utils.damp(this.y, targetY, this.options.lag, delta);
      const idle = Math.abs(this.x - targetX) < 0.05 && Math.abs(this.y - targetY) < 0.05;
      if (idle && this.settled) return;
      this.settled = idle;
      const half = this.options.size / 2;
      this.glow.style.transform = 'translate3d(' + (this.x - half) + 'px,' + (this.y - half) + 'px,0)';
    }
  }

  return CursorGlow;
});
