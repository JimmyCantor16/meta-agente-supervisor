Dixel.define('WarpHover', ['Component', 'Pointer', 'Utils', 'Motion'], function (Component, Pointer, Utils, Motion) {
  'use strict';

  class WarpHover extends Component {
    static defaults = {
      stretch: 0.00045,
      skew: 0.02,
      maxStretch: 0.1,
      maxSkew: 6,
      stiffness: 190,
      damping: 16
    };

    ready() {
      if (Utils.isTouch || Utils.reducedMotion) return;
      this.el.classList.add('dx-warp');
      this.sx = 1;
      this.sy = 1;
      this.sk = 0;
      this.vsx = 0;
      this.vsy = 0;
      this.vsk = 0;
      this.hovering = false;
      this.active = false;
      this.fx = Motion.channel(this.el, 'warp');
      this.addCleanup(() => this.fx.clear());
      this.addCleanup(Pointer.use());
      this.listen(this.el, 'pointerenter', this.enter);
      this.listen(this.el, 'pointerleave', this.leave);
      this.onFrame(this.update);
    }

    enter() {
      this.hovering = true;
      this.active = true;
    }

    leave() {
      this.hovering = false;
    }

    update(time, delta) {
      if (!this.active) return;
      let targetSx = 1;
      let targetSy = 1;
      let targetSk = 0;
      if (this.hovering) {
        targetSx = 1 + Utils.clamp(Math.abs(Pointer.velocityX) * this.options.stretch, 0, this.options.maxStretch);
        targetSy = 1 + Utils.clamp(Math.abs(Pointer.velocityY) * this.options.stretch, 0, this.options.maxStretch);
        targetSk = Utils.clamp(Pointer.velocityX * this.options.skew, -this.options.maxSkew, this.options.maxSkew);
      }
      const drag = Math.exp(-this.options.damping * delta);
      this.vsx = (this.vsx + (targetSx - this.sx) * this.options.stiffness * delta) * drag;
      this.vsy = (this.vsy + (targetSy - this.sy) * this.options.stiffness * delta) * drag;
      this.vsk = (this.vsk + (targetSk - this.sk) * this.options.stiffness * delta) * drag;
      this.sx += this.vsx * delta;
      this.sy += this.vsy * delta;
      this.sk += this.vsk * delta;
      if (
        !this.hovering &&
        Math.abs(this.sx - 1) < 0.001 &&
        Math.abs(this.sy - 1) < 0.001 &&
        Math.abs(this.sk) < 0.02 &&
        Math.abs(this.vsx) < 0.01 &&
        Math.abs(this.vsy) < 0.01 &&
        Math.abs(this.vsk) < 0.2
      ) {
        this.sx = 1;
        this.sy = 1;
        this.sk = 0;
        this.vsx = 0;
        this.vsy = 0;
        this.vsk = 0;
        this.fx.set({ skewX: 0, scaleX: 1, scaleY: 1 });
        this.active = false;
        return;
      }
      this.fx.set({ skewX: this.sk, scaleX: this.sx, scaleY: this.sy });
    }
  }

  return WarpHover;
});
