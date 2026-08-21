Dixel.define('InlineBanner', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const icons = {
    info: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M12 11.5V16"/></svg>',
    upgrade: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.4 5.6L20 9.5l-4.2 4 1 6L12 16.6 7.2 19.5l1-6L4 9.5l5.6-.9L12 3z"/></svg>',
    warning: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5L2.8 19.5h18.4L12 3.5z"/><path d="M12 10v4M12 16.8h.01"/></svg>'
  };
  const closeIcon = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  class InlineBanner extends Component {
    static defaults = {
      type: 'info',
      title: '',
      text: '',
      ctaLabel: null,
      dismissible: true,
      onCta: null,
      onClose: null
    };

    build() {
      const el = Utils.el('div', 'dx-banner dx-banner--' + this.options.type + ' dx-reset', { role: 'status' });
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      const icon = icons[this.options.type] || icons.info;
      const safeTitle = this.options.html ? this.options.title : Utils.escape(this.options.title || '');
      const safeText = this.options.html ? this.options.text : Utils.escape(this.options.text || '');
      const title = this.options.title ? '<strong class="dx-banner-title">' + safeTitle + '</strong>' : '';
      const text = this.options.text ? '<span class="dx-banner-text">' + safeText + '</span>' : '';
      const cta = this.options.ctaLabel
        ? '<button class="dx-banner-cta dx-focusable" type="button">' + Utils.escape(this.options.ctaLabel) + '</button>'
        : '';
      const close = this.options.dismissible
        ? '<button class="dx-banner-close dx-focusable" type="button" aria-label="Cerrar anuncio">' + closeIcon + '</button>'
        : '';
      return '<span class="dx-banner-icon" aria-hidden="true">' + icon + '</span>' +
        '<div class="dx-banner-content">' + title + text + '</div>' + cta + close;
    }

    ready() {
      this.el.classList.add('dx-banner', 'dx-banner--' + this.options.type, 'dx-reset');
      if (!this.el.querySelector('.dx-banner-content')) this.el.innerHTML = this.markup();
      if (!this.el.getAttribute('role')) this.el.setAttribute('role', 'status');
      this.closed = false;
      const cta = this.el.querySelector('.dx-banner-cta');
      const close = this.el.querySelector('.dx-banner-close');
      if (cta) {
        this.listen(cta, 'click', () => {
          if (this.options.onCta) this.options.onCta();
        });
      }
      if (close) this.listen(close, 'click', () => this.dismiss());
      Motion.fromTo(this.el, { y: -12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'out' });
    }

    dismiss() {
      if (this.closed) return;
      this.closed = true;
      const el = this.el;
      Motion.to(el, {
        y: -10,
        opacity: 0,
        duration: 0.22,
        ease: 'in',
        onComplete: () => {
          el.style.display = 'none';
          if (this.options.onClose) this.options.onClose();
        }
      });
    }
  }

  return InlineBanner;
});
