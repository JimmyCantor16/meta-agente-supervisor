Dixel.define('Spinner', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class Spinner extends Component {
    static defaults = {
      variant: 'ring',
      size: 'md',
      label: 'Cargando'
    };

    build() {
      const el = Utils.el('div', this.classNames(), { role: 'status', 'aria-label': this.options.label });
      el.innerHTML = this.markup();
      return el;
    }

    classNames() {
      return 'dx-spinner dx-spinner--' + this.options.variant + ' dx-spinner--' + this.options.size;
    }

    markup() {
      if (this.options.variant === 'dots') {
        return '<span class="dx-spinner-dot"></span><span class="dx-spinner-dot"></span><span class="dx-spinner-dot"></span>';
      }
      if (this.options.variant === 'pulse') {
        return '<span class="dx-spinner-pulse"></span><span class="dx-spinner-core"></span>';
      }
      return '<span class="dx-spinner-ring"></span>';
    }

    ready() {
      if (!this.el.classList.contains('dx-spinner')) {
        this.el.className += (this.el.className ? ' ' : '') + this.classNames();
        if (!this.el.innerHTML.trim()) this.el.innerHTML = this.markup();
      }
      if (!this.el.getAttribute('role')) this.el.setAttribute('role', 'status');
      if (!this.el.getAttribute('aria-label')) this.el.setAttribute('aria-label', this.options.label);
      this.whenVisible((visible) => {
        this.el.classList.toggle('dx-anim-paused', !visible);
      });
    }
  }

  return Spinner;
});
