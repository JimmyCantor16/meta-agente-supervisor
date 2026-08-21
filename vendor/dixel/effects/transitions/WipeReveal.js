Dixel.define('WipeReveal', ['Component', 'ScrollWatch', 'Utils'], function (Component, ScrollWatch, Utils) {
  'use strict';

  const directions = ['up', 'down', 'left', 'right'];

  class WipeReveal extends Component {
    static defaults = { direction: 'up', duration: 0.9, enterAt: 0.82, once: false };

    ready() {
      this.el.classList.add('dx-wipe');
      if (Utils.reducedMotion) return;
      const direction = directions.indexOf(this.options.direction) === -1 ? 'up' : this.options.direction;
      this.panel = Utils.el('div', 'dx-wipe-panel dx-wipe-panel--' + direction);
      this.panel.style.setProperty('--dx-wipe-duration', this.options.duration + 's');
      this.el.appendChild(this.panel);
      this.addCleanup(
        ScrollWatch.watch(this.el, {
          enterAt: this.options.enterAt,
          once: this.options.once,
          enter: () => this.panel.classList.add('is-open'),
          leave: () => this.panel.classList.remove('is-open')
        })
      );
    }
  }

  return WipeReveal;
});
