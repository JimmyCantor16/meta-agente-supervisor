Dixel.define('Button', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class Button extends Component {
    static defaults = {
      label: 'Button',
      variant: 'solid',
      size: 'md',
      href: null,
      icon: null,
      onClick: null
    };

    build() {
      const tag = this.options.href ? 'a' : 'button';
      const el = Utils.el(tag, this.classNames());
      if (this.options.href) el.href = this.options.href;
      else el.type = 'button';
      el.innerHTML = this.markup();
      return el;
    }

    classNames() {
      return 'dx-btn dx-focusable dx-btn--' + this.options.variant + ' dx-btn--' + this.options.size;
    }

    markup() {
      const icon = this.options.icon ? '<span class="dx-btn-icon">' + this.options.icon + '</span>' : '';
      return icon + '<span class="dx-btn-label">' + Utils.escape(this.options.label) + '</span>';
    }

    ready() {
      if (!this.el.classList.contains('dx-btn')) this.el.className += ' ' + this.classNames();
      if (this.options.onClick) this.listen(this.el, 'click', this.options.onClick);
    }
  }

  return Button;
});
