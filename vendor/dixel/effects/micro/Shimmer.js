Dixel.define('Shimmer', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class Shimmer extends Component {
    static defaults = { interval: 3.2, duration: 1.1, angle: -18, strength: 0.35, delay: 0 };

    ready() {
      this.el.classList.add('dx-shimmer');
      this.addCleanup(() => {
        this.el.classList.remove('dx-shimmer');
        if (this.band) this.band.remove();
      });
      if (Utils.reducedMotion) return;
      this.band = Utils.el('div', 'dx-shimmer-band');
      this.band.style.opacity = '0';
      this.el.appendChild(this.band);
      this.timer = -this.options.delay;
      this.sweeping = false;
      this.whenVisible(() => {});
      this.onFrame(this.update);
    }

    update(time, delta) {
      if (!this.visible) return;
      this.timer += delta;
      if (this.timer < this.options.interval) return;
      const progress = (this.timer - this.options.interval) / this.options.duration;
      if (progress >= 1) {
        this.timer = 0;
        this.sweeping = false;
        this.band.style.opacity = '0';
        return;
      }
      if (!this.sweeping) {
        this.sweeping = true;
        this.band.style.opacity = String(this.options.strength);
      }
      const travel = -220 + progress * 540;
      this.band.style.transform = 'translate3d(' + travel + '%,0,0) skewX(' + this.options.angle + 'deg)';
    }
  }

  return Shimmer;
});
