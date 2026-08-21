Dixel.define('Badge', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class Badge extends Component {
    static defaults = {
      label: 'Badge',
      tone: 'primary',
      variant: 'soft',
      dot: false
    };

    build() {
      const el = Utils.el('span', this.classNames());
      el.innerHTML = this.markup();
      return el;
    }

    classNames() {
      return 'dx-badge dx-badge--' + this.options.tone + ' dx-badge--' + this.options.variant;
    }

    markup() {
      const dot = this.options.dot ? '<span class="dx-badge-dot" aria-hidden="true"></span>' : '';
      return dot + '<span>' + Utils.escape(this.options.label) + '</span>';
    }

    ready() {
      if (!this.el.classList.contains('dx-badge')) {
        this.el.className += (this.el.className ? ' ' : '') + this.classNames();
        if (!this.el.innerHTML.trim()) this.el.innerHTML = this.markup();
      }
    }
  }

  return Badge;
});
