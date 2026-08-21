Dixel.define('Magnetic', ['Component', 'Pointer', 'Utils', 'Motion'], function (Component, Pointer, Utils, Motion) {
  'use strict';

  class Magnetic extends Component {
    static defaults = { strength: 0.35, scale: 1.04, stiffness: 170, damping: 14 };

    ready() {
      if (Utils.isTouch || Utils.reducedMotion) return;
      this.el.classList.add('dx-magnetic');
      this.x = 0;
      this.y = 0;
      this.vx = 0;
      this.vy = 0;
      this.zoom = 1;
      this.centerX = 0;
      this.centerY = 0;
      this.hovering = false;
      this.active = false;
      this.fx = Motion.channel(this.el, 'magnetic');
      this.addCleanup(() => this.fx.clear());
      this.listen(this.el, 'pointerenter', this.enter);
      this.listen(this.el, 'pointerleave', this.leave);
      this.onFrame(this.update);
    }

    enter() {
      const rect = this.el.getBoundingClientRect();
      this.centerX = rect.left + rect.width / 2;
      this.centerY = rect.top + rect.height / 2;
      this.hovering = true;
      this.active = true;
    }

    leave() {
      this.hovering = false;
    }

    update(time, delta) {
      if (!this.active) return;
      const targetX = this.hovering ? (Pointer.x - this.centerX) * this.options.strength : 0;
      const targetY = this.hovering ? (Pointer.y - this.centerY) * this.options.strength : 0;
      const drag = Math.exp(-this.options.damping * delta);
      this.vx = (this.vx + (targetX - this.x) * this.options.stiffness * delta) * drag;
      this.vy = (this.vy + (targetY - this.y) * this.options.stiffness * delta) * drag;
      this.x += this.vx * delta;
      this.y += this.vy * delta;
      this.zoom = Utils.damp(this.zoom, this.hovering ? this.options.scale : 1, 10, delta);
      if (
        !this.hovering &&
        Math.abs(this.x) < 0.05 &&
        Math.abs(this.y) < 0.05 &&
        Math.abs(this.vx) < 0.5 &&
        Math.abs(this.vy) < 0.5 &&
        Math.abs(this.zoom - 1) < 0.002
      ) {
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.zoom = 1;
        this.fx.set({ x: 0, y: 0, scale: 1 });
        this.active = false;
        return;
      }
      this.fx.set({ x: this.x, y: this.y, scale: this.zoom });
    }
  }

  return Magnetic;
});
