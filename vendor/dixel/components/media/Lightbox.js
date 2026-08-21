Dixel.define('Lightbox', ['Component', 'Utils', 'Ticker', 'Overlays'], function (Component, Utils, Ticker, Overlays) {
  'use strict';

  class Lightbox extends Component {
    static defaults = {
      duration: 0.45,
      images: []
    };

    build() {
      return Utils.el('div', 'dx-lightbox-group');
    }

    ready() {
      this.overlay = null;
      this.source = null;
      this.closing = false;
      this.pendingStops = [];
      if (this.el.tagName !== 'IMG' && !this.el.querySelector('img') && this.options.images.length) {
        this.el.classList.add('dx-lightbox-grid');
        this.options.images.forEach((image) => {
          const data = image && typeof image === 'object' ? image : { src: image, alt: '' };
          this.el.appendChild(Utils.el('img', '', { src: data.src, alt: data.alt || '' }));
        });
      }
      const images = this.el.tagName === 'IMG' ? [this.el] : Array.from(this.el.querySelectorAll('img'));
      images.forEach((img) => {
        img.classList.add('dx-lightbox-thumb');
        img.setAttribute('tabindex', '0');
        img.setAttribute('role', 'button');
        this.listen(img, 'click', (event) => {
          event.preventDefault();
          this.open(img);
        });
        this.listen(img, 'keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this.open(img);
          }
        });
      });
      this.addCleanup(() => this.teardown());
    }

    clearPending() {
      this.pendingStops.forEach((stop) => stop());
      this.pendingStops = [];
    }

    open(img) {
      if (this.overlay) return;
      this.source = img;
      this.closing = false;
      const thumbRect = img.getBoundingClientRect();
      this.overlay = Utils.el('div', 'dx-lightbox', { role: 'dialog', 'aria-modal': 'true' });
      this.backdrop = Utils.el('div', 'dx-lightbox-backdrop');
      this.clone = Utils.el('img', 'dx-lightbox-img', { src: img.currentSrc || img.src, alt: img.alt || '' });
      this.overlay.appendChild(this.backdrop);
      this.overlay.appendChild(this.clone);
      document.body.appendChild(this.overlay);
      this.unlockScroll = Overlays.lock(this);
      this.popEscape = Overlays.pushEscape(() => this.close());
      this.overlayClickStop = Utils.on(this.overlay, 'click', () => this.close());
      if (Utils.reducedMotion) {
        this.overlay.classList.add('dx-lightbox--open', 'dx-lightbox--instant');
        img.classList.add('dx-lightbox-thumb--hidden');
        return;
      }
      this.clone.style.transitionDuration = this.options.duration + 's';
      this.backdrop.style.transitionDuration = this.options.duration + 's';
      const finalRect = this.clone.getBoundingClientRect();
      this.clone.style.transform = this.flipTransform(thumbRect, finalRect);
      img.classList.add('dx-lightbox-thumb--hidden');
      const stop = Ticker.add(() => {
        stop();
        if (!this.overlay || this.closing) return;
        this.overlay.classList.add('dx-lightbox--open');
        this.clone.style.transform = 'translate3d(0,0,0) scale(1)';
      });
      this.pendingStops.push(stop);
    }

    flipTransform(fromRect, toRect) {
      const dx = fromRect.left - toRect.left;
      const dy = fromRect.top - toRect.top;
      const scale = toRect.width ? fromRect.width / toRect.width : 1;
      return 'translate3d(' + dx.toFixed(2) + 'px,' + dy.toFixed(2) + 'px,0) scale(' + scale.toFixed(4) + ')';
    }

    close() {
      if (!this.overlay || this.closing) return;
      this.closing = true;
      if (Utils.reducedMotion || this.options.duration <= 0) {
        this.teardown();
        return;
      }
      const thumbRect = this.source.getBoundingClientRect();
      const finalRect = this.clone.getBoundingClientRect();
      this.overlay.classList.remove('dx-lightbox--open');
      this.clone.style.transform = this.flipTransform(thumbRect, finalRect);
      const finish = () => {
        done();
        clearTimeout(fallback);
        this.teardown();
      };
      const done = Utils.on(this.clone, 'transitionend', finish);
      const fallback = setTimeout(finish, this.options.duration * 1000 + 120);
      this.pendingStops.push(() => {
        done();
        clearTimeout(fallback);
      });
    }

    teardown() {
      if (!this.overlay) return;
      this.clearPending();
      if (this.popEscape) {
        this.popEscape();
        this.popEscape = null;
      }
      if (this.unlockScroll) {
        this.unlockScroll();
        this.unlockScroll = null;
      }
      if (this.overlayClickStop) this.overlayClickStop();
      if (this.source) this.source.classList.remove('dx-lightbox-thumb--hidden');
      this.overlay.remove();
      this.overlay = null;
      this.source = null;
      this.closing = false;
    }
  }

  return Lightbox;
});
