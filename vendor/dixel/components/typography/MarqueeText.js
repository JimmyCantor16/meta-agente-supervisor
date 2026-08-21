Dixel.define('MarqueeText', ['Component', 'Utils', 'Ticker'], function (Component, Utils, Ticker) {
  'use strict';

  class MarqueeText extends Component {
    static defaults = {
      text: null,
      speed: 70,
      direction: 'left',
      separator: '—',
      pauseOnHover: true
    };

    build() {
      return Utils.el('div', 'dx-marquee');
    }

    ready() {
      this.el.classList.add('dx-marquee');
      this.sourceText = this.options.text || this.el.textContent.trim();
      this.el.textContent = '';
      this.el.setAttribute('aria-label', this.sourceText);
      this.track = Utils.el('div', 'dx-marquee-track', { 'aria-hidden': 'true' });
      this.el.appendChild(this.track);
      this.offset = 0;
      this.groupWidth = 0;
      this.paused = false;
      this.stopFrames = null;
      this.measureQueued = false;
      this.rebuild();
      if (Utils.reducedMotion) return;
      this.listen(window, 'resize', () => this.queueRebuild());
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

    buildGroup() {
      const group = Utils.el('span', 'dx-marquee-group');
      group.appendChild(Utils.el('span', 'dx-marquee-item', { text: this.sourceText }));
      if (this.options.separator) {
        group.appendChild(Utils.el('span', 'dx-marquee-sep', { text: this.options.separator }));
      }
      return group;
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
      this.track.textContent = '';
      const probe = this.buildGroup();
      this.track.appendChild(probe);
      const containerWidth = this.el.clientWidth;
      this.groupWidth = probe.getBoundingClientRect().width;
      if (!this.groupWidth) return;
      const copies = Math.max(Math.ceil(containerWidth / this.groupWidth) + 1, 2);
      for (let i = 1; i < copies; i++) this.track.appendChild(this.buildGroup());
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

  return MarqueeText;
});
