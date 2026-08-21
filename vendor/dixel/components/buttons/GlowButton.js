Dixel.define('GlowButton', ['Button', 'Utils'], function (Button, Utils) {
  'use strict';

  class GlowButton extends Button {
    static defaults = Object.assign({}, Button.defaults, {
      tone: 'primary'
    });

    ready() {
      super.ready();
      this.el.classList.add('dx-btn--glow', 'dx-btn--glow-' + this.options.tone);
      if (!this.el.querySelector('.dx-btn-shine')) {
        this.el.appendChild(Utils.el('span', 'dx-btn-shine', { 'aria-hidden': 'true' }));
      }
    }
  }

  return GlowButton;
});
