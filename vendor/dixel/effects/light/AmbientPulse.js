Dixel.define('AmbientPulse', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class AmbientPulse extends Component {
    static defaults = { period: 6, min: 0.15, max: 0.45, tint: 'primary' };

    build() {
      return Utils.el('div', 'dx-ambient');
    }

    ready() {
      if (this.owned) {
        this.el.classList.add('dx-ambient');
        this.host = this.el;
      } else {
        if (getComputedStyle(this.el).position === 'static') {
          this.el.style.position = 'relative';
          this.addCleanup(() => {
            this.el.style.position = '';
          });
        }
        this.host = Utils.el('div', 'dx-ambient');
        this.el.appendChild(this.host);
        this.addCleanup(() => this.host.remove());
      }
      this.layer = Utils.el('div', 'dx-ambient-layer dx-ambient-layer--' + this.options.tint);
      this.host.appendChild(this.layer);
      if (Utils.reducedMotion) {
        this.layer.style.opacity = String((this.options.min + this.options.max) / 2);
        return;
      }
      this.phase = Math.random() * Math.PI * 2;
      this.last = -1;
      this.whenVisible(() => {});
      this.onFrame(this.update);
    }

    update(time) {
      if (!this.visible) return;
      const wave = Math.sin((time * Math.PI * 2) / this.options.period + this.phase) * 0.5 + 0.5;
      const opacity = this.options.min + wave * (this.options.max - this.options.min);
      if (Math.abs(opacity - this.last) < 0.002) return;
      this.last = opacity;
      this.layer.style.opacity = opacity.toFixed(3);
    }
  }

  return AmbientPulse;
});
