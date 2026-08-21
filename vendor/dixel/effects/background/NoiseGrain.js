Dixel.define('NoiseGrain', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class NoiseGrain extends Component {
    static defaults = { opacity: 0.08 };

    build() {
      return Utils.el('div', 'dx-bg');
    }

    ready() {
      this.el.classList.add('dx-bg');
      this.el.classList.add('dx-noise');
      this.layer = Utils.el('div', 'dx-noise-layer');
      this.layer.style.opacity = String(this.options.opacity);
      this.el.appendChild(this.layer);
      this.whenVisible((visible) => {
        this.layer.classList.toggle('is-paused', !visible);
      });
    }
  }

  return NoiseGrain;
});
