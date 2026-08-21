Dixel.define('PricingCard', ['Card', 'Utils'], function (Card, Utils) {
  'use strict';

  const checkIcon = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5"/></svg>';

  class PricingCard extends Card {
    static defaults = Object.assign({}, Card.defaults, {
      plan: 'Pro',
      price: '$29',
      period: '/mes',
      description: '',
      features: [],
      cta: 'Empezar',
      href: null,
      featured: false,
      badge: 'Popular',
      onSelect: null
    });

    build() {
      const el = Utils.el('article', this.classNames());
      el.innerHTML = this.markup();
      return el;
    }

    classNames() {
      return 'dx-card dx-card--pad-lg dx-pricing' + (this.options.featured ? ' dx-pricing--featured' : '');
    }

    markup() {
      const badge = this.options.featured && this.options.badge
        ? '<span class="dx-pricing-badge">' + Utils.escape(this.options.badge) + '</span>'
        : '';
      const description = this.options.description
        ? '<p class="dx-pricing-desc">' + Utils.escape(this.options.description) + '</p>'
        : '';
      const features = this.options.features
        .map((feature) => '<li>' + checkIcon + '<span>' + Utils.escape(feature) + '</span></li>')
        .join('');
      const tag = this.options.href ? 'a' : 'button';
      const attrs = this.options.href ? ' href="' + Utils.escape(this.options.href) + '"' : ' type="button"';
      return badge +
        '<span class="dx-pricing-plan">' + Utils.escape(this.options.plan) + '</span>' +
        '<div class="dx-pricing-price"><strong>' + Utils.escape(this.options.price) + '</strong><span>' + Utils.escape(this.options.period) + '</span></div>' +
        description +
        '<ul class="dx-pricing-features">' + features + '</ul>' +
        '<' + tag + attrs + ' class="dx-pricing-cta dx-focusable">' + Utils.escape(this.options.cta) + '</' + tag + '>';
    }

    ready() {
      if (!this.el.classList.contains('dx-pricing')) {
        this.el.className += (this.el.className ? ' ' : '') + this.classNames();
        if (!this.el.innerHTML.trim()) this.el.innerHTML = this.markup();
      }
      const cta = this.el.querySelector('.dx-pricing-cta');
      if (cta && this.options.onSelect) this.listen(cta, 'click', this.options.onSelect);
    }
  }

  return PricingCard;
});
