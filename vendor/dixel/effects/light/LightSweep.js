Dixel.define('LightSweep', ['Component', 'ScrollWatch', 'Utils'], function (Component, ScrollWatch, Utils) {
  'use strict';

  class LightSweep extends Component {
    static defaults = { duration: 1.1, angle: -18, strength: 0.22, enterAt: 0.85, once: false };

    ready() {
      this.el.classList.add('dx-sweep');
      this.addCleanup(() => {
        this.el.classList.remove('dx-sweep');
        if (this.band) this.band.remove();
      });
      if (Utils.reducedMotion) return;
      this.band = Utils.el('div', 'dx-sweep-band');
      this.band.style.setProperty('--dx-sweep-duration', this.options.duration + 's');
      this.band.style.setProperty('--dx-sweep-skew', this.options.angle + 'deg');
      this.band.style.opacity = String(this.options.strength);
      this.el.appendChild(this.band);
      this.addCleanup(
        ScrollWatch.watch(this.el, {
          enterAt: this.options.enterAt,
          once: this.options.once,
          enter: () => this.band.classList.add('is-run'),
          leave: () => this.band.classList.remove('is-run')
        })
      );
    }
  }

  return LightSweep;
});
