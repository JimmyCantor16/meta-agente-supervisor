Dixel.define('ScrollProgressBar', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class ScrollProgressBar extends Component {
    static defaults = { tint: 'gradient' };

    build() {
      return Utils.el('div', 'dx-scrollprogress');
    }

    ready() {
      this.el.classList.add('dx-scrollprogress');
      this.el.classList.add('dx-scrollprogress--' + this.options.tint);
      this.max = 1;
      this.lastY = -1;
      this.listen(window, 'resize', this.measure);
      this.listen(window, 'load', this.measure);
      this.measure();
      this.onFrame(this.update);
    }

    measure() {
      this.max = Math.max(document.documentElement.scrollHeight - innerHeight, 1);
      this.lastY = -1;
    }

    update() {
      const y = window.scrollY;
      if (y === this.lastY) return;
      this.lastY = y;
      this.el.style.transform = 'scaleX(' + Utils.clamp(y / this.max, 0, 1) + ')';
    }
  }

  return ScrollProgressBar;
});
