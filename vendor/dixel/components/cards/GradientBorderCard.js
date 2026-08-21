Dixel.define('GradientBorderCard', ['Card', 'Utils'], function (Card, Utils) {
  'use strict';

  class GradientBorderCard extends Card {
    static defaults = Object.assign({}, Card.defaults, {
      hover: false,
      speed: 6
    });

    ready() {
      super.ready();
      this.el.classList.add('dx-card--gborder');
      if (!this.el.querySelector('.dx-gborder-inner')) {
        const inner = Utils.el('div', 'dx-gborder-inner');
        while (this.el.firstChild) inner.appendChild(this.el.firstChild);
        this.el.appendChild(Utils.el('div', 'dx-gborder-spin'));
        this.el.appendChild(inner);
      }
      const spin = this.el.querySelector('.dx-gborder-spin');
      spin.style.animationDuration = this.options.speed + 's';
      this.whenVisible((visible) => {
        spin.classList.toggle('dx-anim-paused', !visible);
      });
    }
  }

  return GradientBorderCard;
});
