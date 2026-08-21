Dixel.define('LoaderPulse', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class LoaderPulse extends Component {
    static defaults = {
      size: 'md',
      color: 'primary',
      label: 'Cargando'
    };

    build() {
      const el = Utils.el('div', 'dx-loadpulse dx-loadpulse--' + this.options.size, { role: 'status', 'aria-label': this.options.label });
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      return '<span class="dx-loadpulse-ring" style="animation-delay:0s"></span>' +
        '<span class="dx-loadpulse-ring" style="animation-delay:0.5s"></span>' +
        '<span class="dx-loadpulse-ring" style="animation-delay:1s"></span>' +
        '<span class="dx-loadpulse-core"></span>';
    }

    ready() {
      if (!this.el.classList.contains('dx-loadpulse')) {
        this.el.classList.add('dx-loadpulse', 'dx-loadpulse--' + this.options.size);
      }
      if (!this.el.querySelector('.dx-loadpulse-ring')) this.el.innerHTML = this.markup();
      if (!this.el.getAttribute('role')) this.el.setAttribute('role', 'status');
      this.el.style.setProperty('--dx-loader-color', 'var(--dx-' + this.options.color + ')');
      this.whenVisible((visible) => {
        this.el.classList.toggle('dx-anim-paused', !visible);
      });
    }
  }

  return LoaderPulse;
});
