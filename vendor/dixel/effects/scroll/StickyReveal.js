Dixel.define('StickyReveal', ['Component', 'Motion', 'ScrollWatch', 'Utils'], function (Component, Motion, ScrollWatch, Utils) {
  'use strict';

  class StickyReveal extends Component {
    static defaults = { pages: 2, shift: 48 };

    ready() {
      this.el.classList.add('dx-sticky');
      this.el.style.setProperty('--dx-sticky-pages', String(this.options.pages));
      let frame = this.el.querySelector('.dx-sticky-frame');
      if (!frame) {
        frame = Utils.el('div', 'dx-sticky-frame');
        while (this.el.firstChild) frame.appendChild(this.el.firstChild);
        this.el.appendChild(frame);
      }
      this.steps = Array.from(frame.querySelectorAll('[data-sticky-step]'));
      this.measure();
      this.listen(window, 'resize', this.measure);
      this.listen(window, 'load', this.measure);
      if (this.steps.length) {
        this.apply(0);
        this.addCleanup(
          ScrollWatch.watch(this.el, {
            progress: (progress) => this.apply(this.localProgress(progress))
          })
        );
      }
    }

    measure() {
      this.viewHeight = innerHeight;
      this.height = this.el.getBoundingClientRect().height;
    }

    localProgress(progress) {
      const total = this.viewHeight + this.height;
      const track = Math.max(this.height - this.viewHeight, 1);
      return Utils.clamp((progress * total - this.viewHeight) / track, 0, 1);
    }

    apply(local) {
      const segment = 1 / this.steps.length;
      for (let i = 0; i < this.steps.length; i++) {
        const center = (i + 0.5) * segment;
        let offset = (local - center) / segment;
        if (i === 0 && offset < 0) offset = 0;
        if (i === this.steps.length - 1 && offset > 0) offset = 0;
        const opacity = Utils.clamp(1 - Math.abs(offset) * 1.4, 0, 1);
        Motion.set(this.steps[i], { opacity, y: offset * -this.options.shift });
      }
    }
  }

  return StickyReveal;
});
