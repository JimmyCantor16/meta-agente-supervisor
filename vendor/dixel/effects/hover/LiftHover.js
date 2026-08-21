Dixel.define('LiftHover', ['Component'], function (Component) {
  'use strict';

  class LiftHover extends Component {
    static defaults = { lift: 8, scale: 1.02 };

    ready() {
      this.el.classList.add('dx-lift');
      this.el.style.setProperty('--dx-lift-y', -this.options.lift + 'px');
      this.el.style.setProperty('--dx-lift-scale', String(this.options.scale));
    }
  }

  return LiftHover;
});
