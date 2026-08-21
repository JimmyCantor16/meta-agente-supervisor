Dixel.define('Alert', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const icons = {
    info: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M12 11.5V16"/></svg>',
    success: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>',
    warning: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5L2.8 19.5h18.4L12 3.5z"/><path d="M12 10v4M12 16.8h.01"/></svg>',
    danger: '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6"/></svg>'
  };

  const closeIcon = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  class Alert extends Component {
    static defaults = {
      type: 'info',
      title: '',
      message: '',
      dismissible: true,
      animateIn: true
    };

    build() {
      const role = this.options.type === 'danger' || this.options.type === 'warning' ? 'alert' : 'status';
      const el = Utils.el('div', 'dx-alert dx-alert--' + this.options.type, { role });
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      const safeTitle = this.options.html ? this.options.title : Utils.escape(this.options.title);
      const safeMessage = this.options.html ? this.options.message : Utils.escape(this.options.message);
      const title = this.options.title ? '<strong class="dx-alert-title">' + safeTitle + '</strong>' : '';
      const message = this.options.message ? '<span class="dx-alert-message">' + safeMessage + '</span>' : '';
      const close = this.options.dismissible
        ? '<button class="dx-alert-close dx-focusable" type="button" aria-label="Cerrar aviso">' + closeIcon + '</button>'
        : '';
      return '<span class="dx-alert-icon" aria-hidden="true">' + (icons[this.options.type] || icons.info) + '</span>' +
        '<div class="dx-alert-content">' + title + message + '</div>' + close;
    }

    ready() {
      this.el.classList.add('dx-alert', 'dx-alert--' + this.options.type);
      if (!this.el.innerHTML.trim()) this.el.innerHTML = this.markup();
      this.dismissing = false;
      const close = this.el.querySelector('.dx-alert-close');
      if (close) this.listen(close, 'click', this.dismiss);
      if (this.options.animateIn) {
        Motion.fromTo(this.el, { y: -12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'outQuart' });
      }
    }

    dismiss() {
      if (this.dismissing) return;
      this.dismissing = true;
      Motion.to(this.el, {
        y: -8,
        opacity: 0,
        duration: 0.2,
        ease: 'in',
        onComplete: () => this.destroy()
      });
    }
  }

  return Alert;
});
