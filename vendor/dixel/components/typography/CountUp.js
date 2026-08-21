Dixel.define('CountUp', ['Component', 'Utils', 'Ticker', 'Motion'], function (Component, Utils, Ticker, Motion) {
  'use strict';

  class CountUp extends Component {
    static defaults = {
      value: null,
      from: 0,
      duration: 1.8,
      decimals: 0,
      locale: 'es-CO',
      ease: 'outExpo'
    };

    build() {
      return Utils.el('span', 'dx-countup', this.options.value !== null ? { text: String(this.options.value) } : null);
    }

    ready() {
      this.el.classList.add('dx-countup');
      this.formatter = new Intl.NumberFormat(this.options.locale, {
        minimumFractionDigits: this.options.decimals,
        maximumFractionDigits: this.options.decimals
      });
      const parsed = parseFloat(this.el.textContent.replace(/[^\d.-]/g, ''));
      this.target = this.options.value !== null ? this.options.value : isNaN(parsed) ? 0 : parsed;
      if (Utils.reducedMotion) {
        this.el.textContent = this.formatter.format(this.target);
        return;
      }
      this.el.textContent = this.formatter.format(this.options.from);
      this.stopFrames = null;
      this.addCleanup(() => this.halt());
      this.whenVisible((visible, entry) => {
        if (visible) this.play();
        else if (entry.boundingClientRect.top < 0) this.revert();
      });
    }

    play() {
      if (this.stopFrames) return;
      const ease = Motion.eases[this.options.ease] || Motion.eases.outExpo;
      const from = this.options.from;
      const to = this.target;
      const duration = Math.max(this.options.duration, 0.001);
      let elapsed = 0;
      this.stopFrames = Ticker.add((time, delta) => {
        elapsed += delta;
        const progress = Utils.clamp(elapsed / duration, 0, 1);
        this.el.textContent = this.formatter.format(from + (to - from) * ease(progress));
        if (progress >= 1) this.halt();
      });
    }

    revert() {
      this.halt();
      this.el.textContent = this.formatter.format(this.options.from);
    }

    halt() {
      if (!this.stopFrames) return;
      this.stopFrames();
      this.stopFrames = null;
    }
  }

  return CountUp;
});
