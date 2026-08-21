Dixel.define('LoaderDots', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class LoaderDots extends Component {
    static defaults = {
      count: 5,
      color: 'primary',
      label: 'Cargando'
    };

    build() {
      const el = Utils.el('div', 'dx-loaddots', { role: 'status', 'aria-label': this.options.label });
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      let dots = '';
      for (let i = 0; i < this.options.count; i++) {
        dots += '<span class="dx-loaddots-dot" style="animation-delay:' + (i * 0.12).toFixed(2) + 's"></span>';
      }
      return dots;
    }

    ready() {
      this.el.classList.add('dx-loaddots');
      if (!this.el.querySelector('.dx-loaddots-dot')) this.el.innerHTML = this.markup();
      if (!this.el.getAttribute('role')) this.el.setAttribute('role', 'status');
      this.el.style.setProperty('--dx-loader-color', 'var(--dx-' + this.options.color + ')');
      this.whenVisible((visible) => {
        this.el.classList.toggle('dx-anim-paused', !visible);
      });
    }
  }

  return LoaderDots;
});
