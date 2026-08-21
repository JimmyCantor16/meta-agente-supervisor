Dixel.define('LoaderOverlay', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class LoaderOverlay extends Component {
    static defaults = {
      label: 'Cargando',
      fullscreen: false,
      open: false
    };

    build() {
      const el = Utils.el('div', 'dx-loadover', { role: 'status', 'aria-live': 'polite', 'aria-hidden': 'true' });
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      return '<span class="dx-loadover-spinner" aria-hidden="true"></span>' +
        (this.options.label ? '<span class="dx-loadover-label">' + this.options.label + '</span>' : '');
    }

    ready() {
      this.el.classList.add('dx-loadover');
      if (!this.el.querySelector('.dx-loadover-spinner')) this.el.innerHTML = this.markup();
      this.el.classList.toggle('dx-loadover--fullscreen', !!this.options.fullscreen);
      if (!this.options.fullscreen) this.anchorHost();
      this.whenVisible((visible) => {
        this.el.classList.toggle('dx-anim-paused', !visible);
      });
      if (this.options.open) this.show();
    }

    anchorHost() {
      const host = this.el.parentElement;
      if (host && getComputedStyle(host).position === 'static') host.style.position = 'relative';
    }

    show() {
      this.el.classList.add('is-open');
      this.el.setAttribute('aria-hidden', 'false');
      if (this.el.parentElement) this.el.parentElement.setAttribute('aria-busy', 'true');
    }

    hide() {
      this.el.classList.remove('is-open');
      this.el.setAttribute('aria-hidden', 'true');
      if (this.el.parentElement) this.el.parentElement.removeAttribute('aria-busy');
    }

    setLabel(label) {
      const labelEl = this.el.querySelector('.dx-loadover-label');
      if (labelEl) labelEl.textContent = label;
    }
  }

  return LoaderOverlay;
});
