Dixel.define('Pagination', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const arrow = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

  class Pagination extends Component {
    static defaults = {
      total: 10,
      page: 1,
      siblings: 1,
      onChange: null
    };

    build() {
      return Utils.el('nav', 'dx-pagination', { 'aria-label': 'Paginación' });
    }

    ready() {
      this.el.classList.add('dx-pagination');
      if (!this.el.getAttribute('aria-label')) this.el.setAttribute('aria-label', 'Paginación');
      this.page = Utils.clamp(this.options.page, 1, this.options.total);
      this.listen(this.el, 'click', (event) => {
        const button = event.target.closest('[data-page]');
        if (!button || button.disabled) return;
        this.setPage(Number(button.getAttribute('data-page')));
      });
      this.render();
    }

    visiblePages() {
      const total = this.options.total;
      const start = Math.max(2, this.page - this.options.siblings);
      const end = Math.min(total - 1, this.page + this.options.siblings);
      const pages = [1];
      if (start > 2) pages.push(null);
      for (let page = start; page <= end; page++) pages.push(page);
      if (end < total - 1) pages.push(null);
      if (total > 1) pages.push(total);
      return pages;
    }

    render() {
      const total = this.options.total;
      const numbers = this.visiblePages()
        .map((page) => {
          if (page === null) return '<span class="dx-pagination-gap" aria-hidden="true">…</span>';
          const active = page === this.page;
          return '<button class="dx-pagination-page dx-focusable' + (active ? ' is-active' : '') +
            '" type="button" data-page="' + page + '"' + (active ? ' aria-current="page"' : '') +
            ' aria-label="Página ' + page + '">' + page + '</button>';
        })
        .join('');
      this.el.innerHTML =
        '<button class="dx-pagination-nav dx-pagination-prev dx-focusable" type="button" data-page="' + (this.page - 1) +
        '" aria-label="Página anterior"' + (this.page === 1 ? ' disabled' : '') + '>' + arrow + '</button>' +
        numbers +
        '<button class="dx-pagination-nav dx-pagination-next dx-focusable" type="button" data-page="' + (this.page + 1) +
        '" aria-label="Página siguiente"' + (this.page === total ? ' disabled' : '') + '>' + arrow + '</button>';
    }

    setPage(page) {
      const next = Utils.clamp(page, 1, this.options.total);
      if (next === this.page) return;
      this.page = next;
      this.render();
      const active = this.el.querySelector('.is-active');
      if (active) Motion.fromTo(active, { scale: 0.6 }, { scale: 1, duration: 0.4, ease: 'outBack' });
      if (this.options.onChange) this.options.onChange(next);
    }
  }

  return Pagination;
});
