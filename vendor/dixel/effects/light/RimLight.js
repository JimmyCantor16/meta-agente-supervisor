Dixel.define('RimLight', ['Component', 'Pointer', 'Utils'], function (Component, Pointer, Utils) {
  'use strict';

  class RimLight extends Component {
    static defaults = { shift: 0.3, lag: 12 };

    ready() {
      this.el.classList.add('dx-rimlight');
      this.addCleanup(() => this.el && this.el.classList.remove('dx-rimlight'));
      if (Utils.isTouch || Utils.reducedMotion) return;
      this.rect = null;
      this.offsetX = 0;
      this.offsetY = 0;
      this.hovering = false;
      this.active = false;
      this.listen(this.el, 'pointerenter', this.enter);
      this.listen(this.el, 'pointerleave', this.leave);
      this.onFrame(this.update);
    }

    enter() {
      const rect = this.el.getBoundingClientRect();
      this.rect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
      this.hovering = true;
      this.active = true;
    }

    leave() {
      this.hovering = false;
    }

    update(time, delta) {
      if (!this.active) return;
      let targetX = 0;
      let targetY = 0;
      if (this.hovering && this.rect) {
        const relX = Utils.clamp((Pointer.x - this.rect.left) / this.rect.width, 0, 1) - 0.5;
        const relY = Utils.clamp((Pointer.y - this.rect.top) / this.rect.height, 0, 1) - 0.5;
        targetX = relX * this.rect.width * this.options.shift;
        targetY = relY * this.rect.height * this.options.shift * 0.6;
      }
      this.offsetX = Utils.damp(this.offsetX, targetX, this.options.lag, delta);
      this.offsetY = Utils.damp(this.offsetY, targetY, this.options.lag, delta);
      if (!this.hovering && Math.abs(this.offsetX) < 0.05 && Math.abs(this.offsetY) < 0.05) {
        this.offsetX = 0;
        this.offsetY = 0;
        this.el.style.removeProperty('--dx-rim-x');
        this.el.style.removeProperty('--dx-rim-y');
        this.active = false;
        return;
      }
      this.el.style.setProperty('--dx-rim-x', this.offsetX.toFixed(2) + 'px');
      this.el.style.setProperty('--dx-rim-y', this.offsetY.toFixed(2) + 'px');
    }
  }

  return RimLight;
});
