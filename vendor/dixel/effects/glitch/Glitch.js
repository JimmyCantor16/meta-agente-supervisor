Dixel.define('Glitch', ['Component', 'Ticker', 'Utils'], function (Component, Ticker, Utils) {
  'use strict';

  class Glitch extends Component {
    static defaults = {
      intensity: 1,
      interval: 2.6,
      burstDuration: 0.32,
      slices: 4,
      rgbSplit: true,
      colorA: 'cyan',
      colorB: 'magenta',
      angle: 0,
      lift: 0,
      trigger: 'always'
    };

    ready() {
      this.el.classList.add('dx-glitch');
      if (getComputedStyle(this.el).position === 'static') {
        this.el.style.position = 'relative';
        this.addCleanup(() => {
          this.el.style.position = '';
        });
      }
      this.layers = [];
      this.buildLayers();
      this.addCleanup(() => {
        this.el.classList.remove('dx-glitch', 'is-glitching');
        this.layers.forEach((layer) => layer.remove());
      });
      if (Utils.reducedMotion) return;
      this.timer = Math.random() * this.options.interval;
      this.bursting = false;
      this.stopFrame = null;
      if (this.options.trigger === 'hover') {
        this.listen(this.el, 'pointerenter', () => this.glitch());
      } else if (this.options.trigger === 'always') {
        this.whenVisible((visible) => {
          if (visible && !this.stopFrame) this.stopFrame = Ticker.add(this.update.bind(this));
          else if (!visible && this.stopFrame) {
            this.stopFrame();
            this.stopFrame = null;
          }
        });
      }
      this.addCleanup(() => {
        if (this.stopFrame) this.stopFrame();
      });
    }

    buildLayers() {
      const source = this.el.innerHTML;
      const hostStyle = getComputedStyle(this.el);
      const count = this.options.rgbSplit ? 2 : 0;
      for (let i = 0; i < count + this.options.slices; i++) {
        const layer = Utils.el('div', 'dx-glitch-layer', { 'aria-hidden': 'true' });
        layer.innerHTML = source;
        layer.style.padding = hostStyle.padding;
        layer.style.textAlign = hostStyle.textAlign;
        layer.style.lineHeight = hostStyle.lineHeight;
        if (i < count) {
          layer.classList.add('dx-glitch-layer--tint');
          layer.style.color = 'var(--dx-' + (i === 0 ? this.options.colorA : this.options.colorB) + ')';
        } else {
          const from = ((i - count) / this.options.slices) * 100;
          const to = 100 - ((i - count + 1) / this.options.slices) * 100;
          layer.style.clipPath = 'inset(' + from.toFixed(1) + '% 0 ' + to.toFixed(1) + '% 0)';
          layer.classList.add('dx-glitch-layer--slice');
        }
        this.el.appendChild(layer);
        this.layers.push(layer);
      }
    }

    glitch() {
      if (Utils.reducedMotion) return;
      this.bursting = true;
      this.burstLeft = this.options.burstDuration;
      this.el.classList.add('is-glitching');
      if (!this.stopFrame) {
        this.stopFrame = Ticker.add(this.update.bind(this));
      }
    }

    calm() {
      this.bursting = false;
      this.el.classList.remove('is-glitching');
      this.layers.forEach((layer) => {
        layer.style.transform = '';
        layer.style.opacity = '';
      });
      if (this.options.trigger !== 'always' && this.stopFrame) {
        this.stopFrame();
        this.stopFrame = null;
      }
    }

    update(time, delta) {
      if (this.options.trigger === 'always' && !this.bursting) {
        this.timer += delta;
        if (this.timer >= this.options.interval) {
          this.timer = 0;
          this.glitch();
        }
        return;
      }
      if (!this.bursting) return;
      this.burstLeft -= delta;
      if (this.burstLeft <= 0) {
        this.calm();
        return;
      }
      const power = this.options.intensity;
      const spin = this.options.angle ? ' rotate(' + this.options.angle + 'deg)' : '';
      this.layers.forEach((layer, index) => {
        const wave = (Math.random() - 0.5) * 2;
        const rise = (Math.random() - 0.5) * 2 * this.options.lift * power;
        if (layer.classList.contains('dx-glitch-layer--tint')) {
          const direction = index === 0 ? -1 : 1;
          layer.style.transform = 'translate3d(' + (direction * (2 + Math.random() * 3) * power) + 'px,' + rise.toFixed(1) + 'px,0)' + spin;
          layer.style.opacity = String(0.55 + Math.random() * 0.35);
        } else {
          layer.style.transform = 'translate3d(' + (wave * 9 * power).toFixed(1) + 'px,' + rise.toFixed(1) + 'px,0)' + spin;
          layer.style.opacity = Math.random() > 0.12 ? '1' : '0';
        }
      });
    }
  }

  return Glitch;
});
