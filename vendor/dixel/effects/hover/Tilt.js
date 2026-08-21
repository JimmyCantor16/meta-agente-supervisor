Dixel.define('Tilt', ['Component', 'Pointer', 'Utils', 'Motion'], function (Component, Pointer, Utils, Motion) {
  'use strict';

  class Tilt extends Component {
    static defaults = { max: 10, perspective: 900, scale: 1.02, shine: true, lag: 12 };

    ready() {
      if (Utils.isTouch || Utils.reducedMotion) return;
      this.el.classList.add('dx-tilt');
      if (this.options.shine) this.el.classList.add('dx-tilt--shine');
      this.rect = null;
      this.relX = 0.5;
      this.relY = 0.5;
      this.zoom = 1;
      this.hovering = false;
      this.active = false;
      this.fx = Motion.channel(this.el, 'tilt');
      this.addCleanup(() => this.fx.clear());
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
      let targetRelX = 0.5;
      let targetRelY = 0.5;
      if (this.hovering && this.rect) {
        targetRelX = Utils.clamp((Pointer.x - this.rect.left) / this.rect.width, 0, 1);
        targetRelY = Utils.clamp((Pointer.y - this.rect.top) / this.rect.height, 0, 1);
      }
      this.relX = Utils.damp(this.relX, targetRelX, this.options.lag, delta);
      this.relY = Utils.damp(this.relY, targetRelY, this.options.lag, delta);
      this.zoom = Utils.damp(this.zoom, this.hovering ? this.options.scale : 1, 10, delta);
      const rotateX = (0.5 - this.relY) * 2 * this.options.max;
      const rotateY = (this.relX - 0.5) * 2 * this.options.max;
      if (!this.hovering && Math.abs(rotateX) < 0.02 && Math.abs(rotateY) < 0.02 && Math.abs(this.zoom - 1) < 0.002) {
        this.relX = 0.5;
        this.relY = 0.5;
        this.zoom = 1;
        this.fx.set({ perspective: 0, rotateX: 0, rotateY: 0, scale: 1 });
        this.el.style.removeProperty('--dx-shine-x');
        this.el.style.removeProperty('--dx-shine-y');
        this.active = false;
        return;
      }
      this.fx.set({ perspective: this.options.perspective, rotateX, rotateY, scale: this.zoom });
      if (this.options.shine && this.rect) {
        this.el.style.setProperty('--dx-shine-x', (this.relX - 0.5) * this.rect.width * 0.7 + 'px');
        this.el.style.setProperty('--dx-shine-y', (this.relY - 0.5) * this.rect.height * 0.7 + 'px');
      }
    }
  }

  return Tilt;
});
