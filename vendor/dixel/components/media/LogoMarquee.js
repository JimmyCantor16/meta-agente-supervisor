Dixel.define('LogoMarquee', ['Component', 'Utils', 'Ticker'], function (Component, Utils, Ticker) {
  'use strict';

  class LogoMarquee extends Component {
    static defaults = {
      speed: 55,
      direction: 'left',
      pauseOnHover: true,
      logos: []
    };

    build() {
      return Utils.el('div', 'dx-logos');
    }

    ready() {
      this.el.classList.add('dx-logos');
      if (!this.el.children.length && this.options.logos.length) {
        this.options.logos.forEach((logo) => {
          if (logo && typeof logo === 'object' && logo.src) {
            const item = Utils.el('div');
            item.appendChild(Utils.el('img', '', { src: logo.src, alt: logo.alt || '' }));
            this.el.appendChild(item);
          } else {
            this.el.appendChild(Utils.el('span', 'dx-logos-text', { text: String(logo) }));
          }
        });
      }
      this.track = Utils.el('div', 'dx-logos-track');
      this.group = Utils.el('div', 'dx-logos-group');
      Array.from(this.el.children).forEach((item) => {
        item.classList.add('dx-logos-item');
        this.group.appendChild(item);
      });
      this.track.appendChild(this.group);
      this.el.appendChild(this.track);
      this.offset = 0;
      this.groupWidth = 0;
      this.paused = false;
      this.stopFrames = null;
      this.measureQueued = false;
      this.rebuild();
      if (Utils.reducedMotion) return;
      this.listen(window, 'resize', () => this.queueRebuild());
      this.listen(window, 'load', () => this.queueRebuild());
      if (this.options.pauseOnHover && !Utils.isTouch) {
        this.listen(this.el, 'pointerenter', () => {
          this.paused = true;
        });
        this.listen(this.el, 'pointerleave', () => {
          this.paused = false;
        });
      }
      this.addCleanup(() => this.halt());
      this.whenVisible((visible) => {
        if (visible) this.run();
        else this.halt();
      });
    }

    queueRebuild() {
      if (this.measureQueued) return;
      this.measureQueued = true;
      if (!this.stopRebuildRegistered) {
        this.stopRebuildRegistered = true;
        this.addCleanup(() => {
          if (this.stopRebuild) this.stopRebuild();
        });
      }
      this.stopRebuild = Ticker.add(() => {
        this.stopRebuild();
        this.stopRebuild = null;
        this.measureQueued = false;
        this.rebuild();
      });
    }

    rebuild() {
      Array.from(this.track.children).forEach((child) => {
        if (child !== this.group) child.remove();
      });
      const containerWidth = this.el.clientWidth;
      this.groupWidth = this.group.getBoundingClientRect().width;
      if (!this.groupWidth) return;
      const copies = Math.max(Math.ceil(containerWidth / this.groupWidth) + 1, 2);
      for (let i = 1; i < copies; i++) {
        const clone = this.group.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        this.track.appendChild(clone);
      }
      this.paint();
    }

    run() {
      if (this.stopFrames) return;
      this.stopFrames = Ticker.add((time, delta) => {
        if (this.paused || !this.groupWidth) return;
        const step = this.options.speed * delta;
        this.offset += this.options.direction === 'right' ? step : -step;
        this.offset %= this.groupWidth;
        this.paint();
      });
    }

    paint() {
      const x = this.offset > 0 ? this.offset - this.groupWidth : this.offset;
      this.track.style.transform = 'translate3d(' + x.toFixed(2) + 'px,0,0)';
    }

    halt() {
      if (!this.stopFrames) return;
      this.stopFrames();
      this.stopFrames = null;
    }
  }

  return LogoMarquee;
});
