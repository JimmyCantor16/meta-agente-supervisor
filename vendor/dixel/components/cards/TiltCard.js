Dixel.define('TiltCard', ['Card', 'Pointer', 'Ticker', 'Utils'], function (Card, Pointer, Ticker, Utils) {
  'use strict';

  class TiltCard extends Card {
    static defaults = Object.assign({}, Card.defaults, {
      hover: false,
      maxTilt: 9,
      lift: 1.02,
      perspective: 1000
    });

    ready() {
      super.ready();
      this.el.classList.add('dx-card--tilt');
      this.wrapInPerspective();
      this.rect = null;
      this.hovering = false;
      this.stopFrame = null;
      this.rotationX = 0;
      this.rotationY = 0;
      this.currentLift = 1;
      if (Utils.isTouch) return;
      this.listen(this.el, 'pointerenter', this.enter);
      this.listen(this.el, 'pointerleave', this.leave);
      this.addCleanup(() => this.stopLoop());
    }

    wrapInPerspective() {
      if (!this.el.parentNode) return;
      const wrapper = Utils.el('div', 'dx-tilt-wrap');
      wrapper.style.perspective = this.options.perspective + 'px';
      this.el.parentNode.insertBefore(wrapper, this.el);
      wrapper.appendChild(this.el);
      this.addCleanup(() => {
        if (!wrapper.parentNode) return;
        if (this.el) wrapper.parentNode.insertBefore(this.el, wrapper);
        wrapper.remove();
      });
    }

    enter() {
      if (Utils.reducedMotion) return;
      this.rect = this.el.getBoundingClientRect();
      this.hovering = true;
      this.startLoop();
    }

    leave() {
      this.hovering = false;
    }

    startLoop() {
      if (this.stopFrame) return;
      this.stopFrame = Ticker.add((time, delta) => this.step(delta));
    }

    stopLoop() {
      if (!this.stopFrame) return;
      this.stopFrame();
      this.stopFrame = null;
    }

    step(delta) {
      let targetX = 0;
      let targetY = 0;
      let targetLift = 1;
      if (this.hovering && this.rect) {
        const relX = Utils.clamp((Pointer.x - this.rect.left) / this.rect.width, 0, 1);
        const relY = Utils.clamp((Pointer.y - this.rect.top) / this.rect.height, 0, 1);
        targetY = (relX * 2 - 1) * this.options.maxTilt;
        targetX = (0.5 - relY) * 2 * this.options.maxTilt;
        targetLift = this.options.lift;
      }
      this.rotationX = Utils.damp(this.rotationX, targetX, 14, delta);
      this.rotationY = Utils.damp(this.rotationY, targetY, 14, delta);
      this.currentLift = Utils.damp(this.currentLift, targetLift, 14, delta);
      this.el.style.transform =
        'rotateX(' + this.rotationX.toFixed(3) + 'deg)' +
        ' rotateY(' + this.rotationY.toFixed(3) + 'deg)' +
        ' scale(' + this.currentLift.toFixed(4) + ')';
      const settled =
        !this.hovering &&
        Math.abs(this.rotationX) < 0.01 &&
        Math.abs(this.rotationY) < 0.01 &&
        Math.abs(this.currentLift - 1) < 0.001;
      if (settled) {
        this.el.style.transform = '';
        this.stopLoop();
      }
    }
  }

  return TiltCard;
});
