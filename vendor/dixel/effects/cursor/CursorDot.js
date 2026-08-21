Dixel.define('CursorDot', ['Component', 'Pointer', 'Utils'], function (Component, Pointer, Utils) {
  'use strict';

  class CursorDot extends Component {
    static defaults = {
      size: 8,
      ringSize: 38,
      lag: 15,
      hoverScale: 1.8,
      blend: true,
      hideNative: false
    };

    build() {
      return Utils.el('div', 'dx-cursor-layer');
    }

    ready() {
      if (Utils.isTouch || Utils.reducedMotion) {
        this.el.classList.add('dx-cursor-layer--off');
        return;
      }
      this.el.classList.add('dx-cursor-layer');
      const blend = this.options.blend ? ' dx-cursor-blend' : '';
      this.ring = Utils.el('div', 'dx-cursor-ring' + blend);
      this.dot = Utils.el('div', 'dx-cursor-dot' + blend);
      this.ring.style.width = this.ring.style.height = this.options.ringSize + 'px';
      this.dot.style.width = this.dot.style.height = this.options.size + 'px';
      this.el.appendChild(this.ring);
      this.el.appendChild(this.dot);
      this.ringX = Pointer.x;
      this.ringY = Pointer.y;
      this.scale = 1;
      this.targetScale = 1;
      this.settled = false;
      if (this.options.hideNative) {
        document.documentElement.classList.add('dx-cursor-hide');
        this.addCleanup(() => document.documentElement.classList.remove('dx-cursor-hide'));
      }
      this.addCleanup(Pointer.use());
      this.listen(document, 'pointerover', (event) => {
        const target = event.target.closest ? event.target.closest('[data-cursor="hover"]') : null;
        this.targetScale = target ? this.options.hoverScale : 1;
      });
      this.listen(document.documentElement, 'pointerleave', () => this.el.classList.add('is-out'));
      this.listen(document.documentElement, 'pointerenter', () => this.el.classList.remove('is-out'));
      this.onFrame(this.update, true);
    }

    update(time, delta) {
      const targetX = Pointer.x;
      const targetY = Pointer.y;
      this.ringX = Utils.damp(this.ringX, targetX, this.options.lag, delta);
      this.ringY = Utils.damp(this.ringY, targetY, this.options.lag, delta);
      this.scale = Utils.damp(this.scale, this.targetScale, 10, delta);
      const idle =
        Math.abs(this.ringX - targetX) < 0.05 &&
        Math.abs(this.ringY - targetY) < 0.05 &&
        Math.abs(this.scale - this.targetScale) < 0.002;
      if (idle && this.settled) return;
      this.settled = idle;
      const dotHalf = this.options.size / 2;
      const ringHalf = this.options.ringSize / 2;
      this.dot.style.transform = 'translate3d(' + (targetX - dotHalf) + 'px,' + (targetY - dotHalf) + 'px,0)';
      this.ring.style.transform =
        'translate3d(' + (this.ringX - ringHalf) + 'px,' + (this.ringY - ringHalf) + 'px,0) scale(' + this.scale + ')';
    }
  }

  return CursorDot;
});
