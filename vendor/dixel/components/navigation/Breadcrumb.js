Dixel.define('Breadcrumb', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  const separator = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

  class Breadcrumb extends Component {
    static defaults = {
      items: []
    };

    build() {
      const el = Utils.el('nav', 'dx-breadcrumb', { 'aria-label': 'Ruta de navegación' });
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      const last = this.options.items.length - 1;
      const items = this.options.items
        .map((item, index) => {
          const content = index === last || !item.href
            ? '<span class="dx-breadcrumb-current" aria-current="page">' + Utils.escape(item.label) + '</span>'
            : '<a class="dx-breadcrumb-link" href="' + Utils.escape(item.href) + '">' + Utils.escape(item.label) + '</a>';
          const divider = index < last ? '<span class="dx-breadcrumb-sep" aria-hidden="true">' + separator + '</span>' : '';
          return '<li>' + content + divider + '</li>';
        })
        .join('');
      return '<ol class="dx-breadcrumb-list">' + items + '</ol>';
    }

    ready() {
      this.el.classList.add('dx-breadcrumb');
      if (!this.el.getAttribute('aria-label')) this.el.setAttribute('aria-label', 'Ruta de navegación');
      if (!this.el.querySelector('.dx-breadcrumb-list') && this.options.items.length) {
        this.el.innerHTML = this.markup();
      }
    }
  }

  return Breadcrumb;
});
