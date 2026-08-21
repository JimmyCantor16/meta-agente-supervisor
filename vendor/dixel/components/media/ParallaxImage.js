Dixel.define('ParallaxImage', ['Component', 'Utils', 'ScrollWatch'], function (Component, Utils, ScrollWatch) {
  'use strict';

  class ParallaxImage extends Component {
    static defaults = {
      range: 40,
      src: null,
      alt: ''
    };

    build() {
      return Utils.el('div', 'dx-parallax');
    }

    ready() {
      this.el.classList.add('dx-parallax');
      this.media = this.el.querySelector('img, video');
      if (!this.media && this.options.src) {
        this.media = Utils.el('img', '', { src: this.options.src, alt: this.options.alt });
        this.el.appendChild(this.media);
      }
      if (!this.media) return;
      this.media.classList.add('dx-parallax-media');
      if (Utils.reducedMotion) {
        this.media.style.height = '100%';
        this.media.style.top = '0';
        return;
      }
      const range = this.options.range;
      this.media.style.height = 'calc(100% + ' + range * 2 + 'px)';
      this.media.style.top = -range + 'px';
      this.addCleanup(ScrollWatch.watch(this.el, {
        progress: (progress) => {
          const y = (0.5 - progress) * 2 * range;
          this.media.style.transform = 'translate3d(0,' + y.toFixed(2) + 'px,0)';
        }
      }));
    }
  }

  return ParallaxImage;
});
