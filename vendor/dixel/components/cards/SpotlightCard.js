Dixel.define('SpotlightCard', ['Card', 'Pointer', 'Ticker', 'Utils'], function (Card, Pointer, Ticker, Utils) {
  'use strict';

  class SpotlightCard extends Card {
    static defaults = Object.assign({}, Card.defaults, {
      radius: 280,
      tone: 'primary'
    });

    ready() {
      super.ready();
      this.el.classList.add('dx-card--spotlight', 'dx-card--spotlight-' + this.options.tone);
      this.el.style.setProperty('--dx-spot-size', this.options.radius + 'px');
      this.rect = null;
      this.hovering = false;
      this.stopFrame = null;
      this.releasePointer = null;
      if (Utils.isTouch) return;
      this.listen(this.el, 'pointerenter', this.enter);
      this.listen(this.el, 'pointerleave', this.leave);
      this.addCleanup(() => this.stopLoop());
    }

    enter(event) {
      this.rect = this.el.getBoundingClientRect();
      if (Utils.reducedMotion) {
        this.applySpot(event.clientX, event.clientY);
        return;
      }
      this.hovering = true;
      this.startLoop();
    }

    leave() {
      this.hovering = false;
    }

    startLoop() {
      if (this.stopFrame) return;
      this.releasePointer = Pointer.use();
      this.stopFrame = Ticker.add(() => this.step());
    }

    stopLoop() {
      if (this.stopFrame) {
        this.stopFrame();
        this.stopFrame = null;
      }
      if (this.releasePointer) {
        this.releasePointer();
        this.releasePointer = null;
      }
    }

    step() {
      this.applySpot(Pointer.smoothX, Pointer.smoothY);
      if (!this.hovering) this.stopLoop();
    }

    applySpot(x, y) {
      if (!this.rect) return;
      this.el.style.setProperty('--dx-spot-x', (x - this.rect.left).toFixed(1) + 'px');
      this.el.style.setProperty('--dx-spot-y', (y - this.rect.top).toFixed(1) + 'px');
    }
  }

  return SpotlightCard;
});
