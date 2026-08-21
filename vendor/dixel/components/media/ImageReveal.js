Dixel.define('ImageReveal', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class ImageReveal extends Component {
    static defaults = {
      direction: 'left',
      duration: 1,
      delay: 0,
      zoom: true,
      src: null,
      alt: ''
    };

    build() {
      return Utils.el('div', 'dx-imgreveal');
    }

    ready() {
      this.el.classList.add('dx-imgreveal', 'dx-imgreveal--' + this.options.direction);
      let media = this.el.querySelector('img, video');
      if (!media && this.options.src) {
        media = Utils.el('img', '', { src: this.options.src, alt: this.options.alt });
        this.el.insertBefore(media, this.el.firstChild);
      }
      if (media) {
        media.classList.add('dx-imgreveal-media');
        if (this.options.zoom) media.classList.add('dx-imgreveal-media--zoom');
        media.style.transitionDuration = this.options.duration * 1.4 + 's';
        media.style.transitionDelay = this.options.delay + 's';
      }
      this.panel = Utils.el('span', 'dx-imgreveal-panel', { 'aria-hidden': 'true' });
      this.panel.style.transitionDuration = this.options.duration + 's';
      this.panel.style.transitionDelay = this.options.delay + 's';
      this.el.appendChild(this.panel);
      if (Utils.reducedMotion) {
        this.el.classList.add('dx-imgreveal--in');
        return;
      }
      this.whenVisible((visible) => {
        if (visible) this.el.classList.add('dx-imgreveal--in');
      });
    }
  }

  return ImageReveal;
});
