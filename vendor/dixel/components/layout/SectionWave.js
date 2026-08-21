Dixel.define('SectionWave', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  const SHAPES = {
    wave: 'M0,64 C240,96 480,16 720,40 C960,64 1200,88 1440,48 L1440,100 L0,100 Z',
    curve: 'M0,84 Q720,-16 1440,84 L1440,100 L0,100 Z',
    tilt: 'M0,92 L1440,16 L1440,100 L0,100 Z'
  };
  class SectionWave extends Component {
    static defaults = {
      shape: 'wave',
      color: 'surface',
      flip: false,
      height: null
    };

    build() {
      const el = Utils.el('div', 'dx-wave');
      el.innerHTML = this.svgMarkup();
      return el;
    }

    svgMarkup() {
      const path = SHAPES[this.options.shape] || SHAPES.wave;
      return '<svg class="dx-wave-svg" viewBox="0 0 1440 100" preserveAspectRatio="none" aria-hidden="true">' +
        '<path d="' + path + '" fill="var(--dx-' + this.options.color + ')"></path></svg>';
    }

    ready() {
      this.el.classList.add('dx-wave');
      this.el.classList.toggle('dx-wave--flip', !!this.options.flip);
      if (this.options.height) this.el.style.setProperty('--dx-wave-h', this.options.height);
      this.el.setAttribute('aria-hidden', 'true');
      if (!this.el.querySelector('.dx-wave-svg')) this.el.innerHTML = this.svgMarkup();
    }
  }

  return SectionWave;
});
