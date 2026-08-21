Dixel.define('Spotlight', ['Component', 'Pointer', 'Utils'], function (Component, Pointer, Utils) {
  'use strict';

  class Spotlight extends Component {
    static defaults = { size: 240, opacity: 0.4, lag: 20 };

    ready() {
      if (Utils.isTouch || Utils.reducedMotion) return;
      this.el.classList.add('dx-spotlight-host');
      this.el.style.setProperty('--dx-spotlight-opacity', String(this.options.opacity));
      this.light = Utils.el('div', 'dx-spotlight-light');
      this.light.style.width = this.light.style.height = this.options.size + 'px';
      this.el.appendChild(this.light);
      this.addCleanup(() => {
        this.light.remove();
        this.el.classList.remove('dx-spotlight-host');
        this.el.style.removeProperty('--dx-spotlight-opacity');
      });
      this.rect = null;
      this.x = 0;
      this.y = 0;
      this.hovering = false;
      this.listen(this.el, 'pointerenter', this.enter);
      this.listen(this.el, 'pointerleave', this.leave);
      this.onFrame(this.update);
    }

    hostOffset() {
      return {
        left: this.rect.docLeft - window.scrollX,
        top: this.rect.docTop - window.scrollY
      };
    }

    enter() {
      const rect = this.el.getBoundingClientRect();
      this.rect = { docLeft: rect.left + window.scrollX, docTop: rect.top + window.scrollY };
      const offset = this.hostOffset();
      const half = this.options.size / 2;
      this.x = Pointer.x - offset.left - half;
      this.y = Pointer.y - offset.top - half;
      this.light.style.transform = 'translate3d(' + this.x + 'px,' + this.y + 'px,0)';
      this.light.classList.add('is-on');
      this.hovering = true;
    }

    leave() {
      this.hovering = false;
      this.light.classList.remove('is-on');
    }

    update(time, delta) {
      if (!this.hovering || !this.rect) return;
      const offset = this.hostOffset();
      const half = this.options.size / 2;
      const targetX = Pointer.x - offset.left - half;
      const targetY = Pointer.y - offset.top - half;
      this.x = Utils.damp(this.x, targetX, this.options.lag, delta);
      this.y = Utils.damp(this.y, targetY, this.options.lag, delta);
      this.light.style.transform = 'translate3d(' + this.x + 'px,' + this.y + 'px,0)';
    }
  }

  return Spotlight;
});
