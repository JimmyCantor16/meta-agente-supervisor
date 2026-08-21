Dixel.define('MagneticButton', ['Button', 'Pointer', 'Motion', 'Ticker', 'Utils'], function (Button, Pointer, Motion, Ticker, Utils) {
  'use strict';

  class MagneticButton extends Button {
    static defaults = Object.assign({}, Button.defaults, {
      strength: 0.32,
      liftScale: 1.04
    });

    ready() {
      super.ready();
      this.el.classList.add('dx-btn--magnetic');
      if (Utils.isTouch) return;
      this.offsetX = 0;
      this.offsetY = 0;
      this.centerX = 0;
      this.centerY = 0;
      this.stopFrame = null;
      this.releasePointer = null;
      this.follow = this.follow.bind(this);
      this.listen(this.el, 'pointerenter', this.engage);
      this.listen(this.el, 'pointerleave', this.release);
      this.addCleanup(() => this.disengage());
    }

    engage() {
      if (Utils.reducedMotion) return;
      const rect = this.el.getBoundingClientRect();
      this.centerX = rect.left + rect.width / 2 - this.offsetX;
      this.centerY = rect.top + rect.height / 2 - this.offsetY;
      if (!this.releasePointer) this.releasePointer = Pointer.use();
      if (!this.stopFrame) this.stopFrame = Ticker.add(this.follow);
      Motion.to(this.el, { scale: this.options.liftScale, duration: 0.4, ease: 'outBack' });
    }

    release() {
      if (!this.stopFrame) return;
      this.disengage();
      this.offsetX = 0;
      this.offsetY = 0;
      Motion.to(this.el, { x: 0, y: 0, scale: 1, duration: 0.7, ease: 'outElastic' });
    }

    disengage() {
      if (this.stopFrame) {
        this.stopFrame();
        this.stopFrame = null;
      }
      if (this.releasePointer) {
        this.releasePointer();
        this.releasePointer = null;
      }
    }

    follow(time, delta) {
      const targetX = (Pointer.smoothX - this.centerX) * this.options.strength;
      const targetY = (Pointer.smoothY - this.centerY) * this.options.strength;
      this.offsetX = Utils.damp(this.offsetX, targetX, 11, delta);
      this.offsetY = Utils.damp(this.offsetY, targetY, 11, delta);
      Motion.set(this.el, { x: this.offsetX, y: this.offsetY });
    }
  }

  return MagneticButton;
});
