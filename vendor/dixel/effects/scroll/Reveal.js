Dixel.define('Reveal', ['Component', 'Motion', 'ScrollWatch', 'Utils'], function (Component, Motion, ScrollWatch, Utils) {
  'use strict';

  const origins = {
    up: (distance) => ({ y: distance }),
    down: (distance) => ({ y: -distance }),
    left: (distance) => ({ x: distance }),
    right: (distance) => ({ x: -distance }),
    scale: () => ({ scale: 0.9 }),
    fade: () => ({})
  };

  class Reveal extends Component {
    static defaults = {
      direction: 'up',
      distance: 44,
      duration: 0.9,
      ease: 'outQuart',
      stagger: 0.09,
      enterAt: 0.86,
      once: false
    };

    ready() {
      if (Utils.reducedMotion) return;
      const children = this.el.querySelectorAll('[data-reveal-child]');
      this.targets = children.length ? Array.from(children) : [this.el];
      const origin = origins[this.options.direction] || origins.up;
      this.hiddenState = Object.assign({ opacity: 0 }, origin(this.options.distance));
      this.hide();
      this.addCleanup(
        ScrollWatch.watch(this.el, {
          enterAt: this.options.enterAt,
          once: this.options.once,
          enter: () => this.show(),
          leave: () => this.hide()
        })
      );
    }

    hide() {
      Motion.set(this.targets, this.hiddenState);
    }

    show() {
      Motion.to(this.targets, {
        x: 0,
        y: 0,
        scale: 1,
        opacity: 1,
        duration: this.options.duration,
        ease: this.options.ease,
        stagger: this.targets.length > 1 ? this.options.stagger : 0
      });
    }
  }

  return Reveal;
});
