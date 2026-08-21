Dixel.define('IconButton', ['Button', 'Utils'], function (Button, Utils) {
  'use strict';

  const defaultIcon =
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';

  class IconButton extends Button {
    static defaults = Object.assign({}, Button.defaults, {
      label: 'Action',
      icon: defaultIcon,
      shape: 'circle'
    });

    markup() {
      return '<span class="dx-btn-icon">' + this.options.icon + '</span>';
    }

    ready() {
      super.ready();
      this.el.classList.add('dx-btn--iconic', 'dx-btn--iconic-' + this.options.shape);
      if (!this.el.getAttribute('aria-label')) this.el.setAttribute('aria-label', this.options.label);
      if (!this.el.querySelector('.dx-btn-icon')) {
        this.el.appendChild(Utils.el('span', 'dx-btn-icon', { html: this.options.icon }));
      }
    }
  }

  return IconButton;
});
