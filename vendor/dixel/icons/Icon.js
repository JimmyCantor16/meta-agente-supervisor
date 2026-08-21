Dixel.define('Icon', ['Component', 'IconSet', 'Utils'], function (Component, IconSet, Utils) {
  'use strict';

  class Icon extends Component {
    static defaults = {
      name: 'sparkles',
      size: 24,
      strokeWidth: 2,
      spin: false,
      label: null
    };

    static names() {
      return Object.keys(IconSet);
    }

    static svg(name, size, strokeWidth) {
      const paths = IconSet[name];
      if (!paths) throw new Error('Dixel: unknown icon -> ' + name);
      const dimension = size || 24;
      const stroke = strokeWidth || 2;
      return '<svg class="dx-icon-svg" viewBox="0 0 24 24" width="' + dimension + '" height="' + dimension + '" fill="none" stroke="currentColor" stroke-width="' + stroke + '" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
    }

    build() {
      const el = Utils.el('span', 'dx-icon' + (this.options.spin ? ' dx-icon--spin' : ''));
      if (this.options.label) {
        el.setAttribute('role', 'img');
        el.setAttribute('aria-label', this.options.label);
      } else {
        el.setAttribute('aria-hidden', 'true');
      }
      el.innerHTML = Icon.svg(this.options.name, this.options.size, this.options.strokeWidth);
      return el;
    }

    ready() {
      if (!this.el.querySelector('svg')) {
        this.el.classList.add('dx-icon');
        this.el.innerHTML = Icon.svg(this.options.name, this.options.size, this.options.strokeWidth);
      }
    }

    swap(name) {
      this.options.name = name;
      this.el.innerHTML = Icon.svg(name, this.options.size, this.options.strokeWidth);
    }
  }

  return Icon;
});
