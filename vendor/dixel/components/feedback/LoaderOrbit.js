Dixel.define('LoaderOrbit', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class LoaderOrbit extends Component {
    static defaults = {
      size: 'md',
      color: 'primary',
      label: 'Cargando'
    };

    build() {
      const el = Utils.el('div', 'dx-loadorbit dx-loadorbit--' + this.options.size, { role: 'status', 'aria-label': this.options.label });
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      return '<span class="dx-loadorbit-core"></span>' +
        '<span class="dx-loadorbit-ring dx-loadorbit-ring--a"><span class="dx-loadorbit-sat"></span></span>' +
        '<span class="dx-loadorbit-ring dx-loadorbit-ring--b"><span class="dx-loadorbit-sat"></span></span>' +
        '<span class="dx-loadorbit-ring dx-loadorbit-ring--c"><span class="dx-loadorbit-sat"></span></span>';
    }

    ready() {
      if (!this.el.classList.contains('dx-loadorbit')) {
        this.el.classList.add('dx-loadorbit', 'dx-loadorbit--' + this.options.size);
      }
      if (!this.el.querySelector('.dx-loadorbit-ring')) this.el.innerHTML = this.markup();
      if (!this.el.getAttribute('role')) this.el.setAttribute('role', 'status');
      this.el.style.setProperty('--dx-loader-color', 'var(--dx-' + this.options.color + ')');
      this.whenVisible((visible) => {
        this.el.classList.toggle('dx-anim-paused', !visible);
      });
    }
  }

  return LoaderOrbit;
});
