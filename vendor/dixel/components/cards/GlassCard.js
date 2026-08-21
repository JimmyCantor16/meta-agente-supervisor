Dixel.define('GlassCard', ['Card'], function (Card) {
  'use strict';

  class GlassCard extends Card {
    static defaults = Object.assign({}, Card.defaults, { variant: 'glass' });

    ready() {
      super.ready();
      this.el.classList.add('dx-card--glass');
    }
  }

  return GlassCard;
});
