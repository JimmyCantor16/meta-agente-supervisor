Dixel.define('SpotStage', ['Component', 'Pointer', 'Utils'], function (Component, Pointer, Utils) {
  'use strict';

  class SpotStage extends Component {
    static defaults = { size: 420, opacity: 0.5, lag: 12, dim: 0.55, orbit: 90, orbitSpeed: 0.4 };

    ready() {
      this.el.classList.add('dx-spotstage');
      this.el.style.setProperty('--dx-stage-dim', String(this.options.dim));
      this.light = Utils.el('div', 'dx-spotstage-light');
      this.light.style.width = this.light.style.height = this.options.size + 'px';
      this.light.style.opacity = String(this.options.opacity);
      this.el.appendChild(this.light);
      this.rect = { left: 0, width: 0, height: 0 };
      this.docTop = 0;
      this.x = 0;
      this.y = 0;
      this.measure();
      this.centerLight();
      this.listen(window, 'resize', this.measure);
      this.whenVisible((visible) => {
        if (visible) this.measure();
      });
      if (Utils.reducedMotion) return;
      this.onFrame(this.update);
    }

    measure() {
      const rect = this.el.getBoundingClientRect();
      this.rect = { left: rect.left, width: rect.width, height: rect.height };
      this.docTop = rect.top + window.scrollY;
    }

    centerLight() {
      const half = this.options.size / 2;
      this.x = this.rect.width / 2 - half;
      this.y = this.rect.height / 2 - half;
      this.light.style.transform = 'translate3d(' + this.x + 'px,' + this.y + 'px,0)';
    }

    update(time, delta) {
      if (!this.visible) return;
      const half = this.options.size / 2;
      let targetX;
      let targetY;
      if (Utils.isTouch) {
        targetX = this.rect.width / 2 + Math.cos(time * this.options.orbitSpeed) * this.options.orbit - half;
        targetY = this.rect.height / 2 + Math.sin(time * this.options.orbitSpeed * 0.8) * this.options.orbit * 0.6 - half;
      } else {
        targetX = Pointer.x - this.rect.left - half;
        targetY = Pointer.y - (this.docTop - window.scrollY) - half;
      }
      if (Math.abs(this.x - targetX) < 0.05 && Math.abs(this.y - targetY) < 0.05) return;
      this.x = Utils.damp(this.x, targetX, this.options.lag, delta);
      this.y = Utils.damp(this.y, targetY, this.options.lag, delta);
      this.light.style.transform = 'translate3d(' + this.x + 'px,' + this.y + 'px,0)';
    }
  }

  return SpotStage;
});
