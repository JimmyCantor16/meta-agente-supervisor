Dixel.define('BorderSweepButton', ['Button'], function (Button) {
  'use strict';

  class BorderSweepButton extends Button {
    static defaults = Object.assign({}, Button.defaults, {
      variant: 'ghost'
    });

    ready() {
      super.ready();
      this.el.classList.add('dx-btn--sweep');
      this.whenVisible((isVisible) => {
        this.el.classList.toggle('is-running', isVisible);
      });
    }
  }

  return BorderSweepButton;
});
