Dixel.define('TypingDots', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class TypingDots extends Component {
    static defaults = {
      author: ''
    };

    build() {
      const el = Utils.el('div', 'dx-typing', {
        role: 'status',
        'aria-label': this.label()
      });
      el.innerHTML = this.markup();
      return el;
    }

    label() {
      return this.options.author ? this.options.author + ' está escribiendo…' : 'Escribiendo…';
    }

    markup() {
      return '<span class="dx-typing-dot" aria-hidden="true"></span>' +
        '<span class="dx-typing-dot" aria-hidden="true"></span>' +
        '<span class="dx-typing-dot" aria-hidden="true"></span>';
    }

    ready() {
      this.el.classList.add('dx-typing');
      if (!this.el.querySelector('.dx-typing-dot')) this.el.innerHTML = this.markup();
      if (!this.el.getAttribute('role')) this.el.setAttribute('role', 'status');
      if (!this.el.getAttribute('aria-label')) this.el.setAttribute('aria-label', this.label());
      this.whenVisible((visible) => this.el.classList.toggle('is-paused', !visible));
    }
  }

  return TypingDots;
});
