Dixel.define('ZoomFlow', ['Component', 'ScrollWatch', 'Utils', 'Motion'], function (Component, ScrollWatch, Utils, Motion) {
  'use strict';

  class ZoomFlow extends Component {
    static defaults = { from: 0.96, fadeFrom: 1, range: 0.32 };

    ready() {
      if (Utils.reducedMotion) return;
      this.el.classList.add('dx-zoomflow');
      this.active = false;
      this.fx = Motion.channel(this.el, 'zoomflow');
      this.addCleanup(() => this.fx.clear());
      this.addCleanup(
        ScrollWatch.watch(this.el, {
          progress: (progress) => this.apply(progress)
        })
      );
      this.addCleanup(() => this.setActive(false));
    }

    setActive(active) {
      if (this.active === active) return;
      this.active = active;
      this.el.style.willChange = active ? 'transform' : '';
    }

    apply(progress) {
      const linear = Utils.clamp(progress / this.options.range, 0, 1);
      const eased = 1 - (1 - linear) * (1 - linear);
      const settled = eased >= 0.999;
      this.setActive(!settled && eased > 0);
      const scale = this.options.from + (1 - this.options.from) * eased;
      this.fx.set({ scale: settled ? 1 : scale });
      if (this.options.fadeFrom < 1) {
        this.el.style.opacity = settled
          ? ''
          : String(this.options.fadeFrom + (1 - this.options.fadeFrom) * eased);
      }
    }
  }

  return ZoomFlow;
});
