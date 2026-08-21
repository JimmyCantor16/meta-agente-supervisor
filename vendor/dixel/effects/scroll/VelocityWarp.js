Dixel.define('VelocityWarp', ['Component', 'Ticker', 'Utils', 'Motion'], function (Component, Ticker, Utils, Motion) {
  'use strict';

  const scroll = { velocity: 0, lastY: 0, users: 0, stop: null, idle: 0, bound: false };

  function wakeVelocity() {
    if (scroll.stop || !scroll.users) return;
    scroll.lastY = window.scrollY;
    scroll.idle = 0;
    scroll.stop = Ticker.add((time, delta) => {
      const y = window.scrollY;
      const raw = (y - scroll.lastY) / Math.max(delta, 0.001);
      scroll.lastY = y;
      scroll.velocity = Utils.damp(scroll.velocity, raw, 8, delta);
      if (Math.abs(raw) < 1 && Math.abs(scroll.velocity) < 1) {
        scroll.idle += 1;
        if (scroll.idle > 20) {
          scroll.velocity = 0;
          scroll.stop();
          scroll.stop = null;
        }
      } else {
        scroll.idle = 0;
      }
    });
  }

  function useScrollVelocity() {
    scroll.users++;
    if (!scroll.bound) {
      scroll.bound = true;
      addEventListener('scroll', wakeVelocity, { passive: true });
    }
    wakeVelocity();
    return () => {
      scroll.users--;
      if (scroll.users <= 0 && scroll.stop) {
        scroll.stop();
        scroll.stop = null;
        scroll.users = 0;
        scroll.velocity = 0;
      }
    };
  }

  class VelocityWarp extends Component {
    static defaults = { skew: 0.0035, stretch: 0.00025, maxSkew: 4, maxStretch: 0.05 };

    ready() {
      if (Utils.reducedMotion) return;
      this.el.classList.add('dx-velocity-warp');
      this.settled = true;
      this.fx = Motion.channel(this.el, 'velocity');
      this.addCleanup(() => this.fx.clear());
      this.addCleanup(useScrollVelocity());
      this.whenVisible(() => {});
      this.onFrame(this.update);
    }

    update() {
      if (!this.visible) return;
      const velocity = scroll.velocity;
      const skew = Utils.clamp(velocity * this.options.skew, -this.options.maxSkew, this.options.maxSkew);
      const stretch = 1 + Utils.clamp(Math.abs(velocity) * this.options.stretch, 0, this.options.maxStretch);
      if (Math.abs(skew) < 0.01 && stretch - 1 < 0.001) {
        if (this.settled) return;
        this.settled = true;
        this.fx.set({ skewY: 0, scaleY: 1 });
        return;
      }
      this.settled = false;
      this.fx.set({ skewY: skew, scaleY: stretch });
    }
  }

  return VelocityWarp;
});
