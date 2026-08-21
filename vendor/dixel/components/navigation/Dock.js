Dixel.define('Dock', ['Component', 'Pointer', 'Ticker', 'Motion', 'Utils', 'IconSet'], function (Component, Pointer, Ticker, Motion, Utils, IconSet) {
  'use strict';

  const ANIMATIONS = ['wave', 'scale', 'lift', 'bounce'];

  function iconMarkup(icon) {
    if (icon && IconSet[icon]) {
      return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + IconSet[icon] + '</svg>';
    }
    return icon || '';
  }

  class Dock extends Component {
    static defaults = {
      items: [],
      magnify: 1.6,
      range: 120,
      lift: 12,
      animation: 'wave'
    };

    build() {
      const el = Utils.el('nav', 'dx-dock', { 'aria-label': 'Dock' });
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      return '<span class="dx-dock-rail" aria-hidden="true"></span>' + this.options.items
        .map((item) => {
          const tag = item.href ? 'a' : 'button';
          const attrs = item.href ? ' href="' + Utils.escape(item.href) + '"' : ' type="button"';
          const label = Utils.escape(item.label || '');
          return '<' + tag + attrs + ' class="dx-dock-item dx-focusable" aria-label="' + label + '">' +
            '<span class="dx-dock-icon" aria-hidden="true">' + iconMarkup(item.icon) + '</span>' +
            '<span class="dx-dock-tip" aria-hidden="true">' + label + '</span>' +
            '</' + tag + '>';
        })
        .join('');
    }

    ready() {
      this.el.classList.add('dx-dock');
      if (!this.el.querySelector('.dx-dock-item') && this.options.items.length) this.el.innerHTML = this.markup();
      if (!this.el.querySelector('.dx-dock-rail')) {
        this.el.insertBefore(Utils.el('span', 'dx-dock-rail', { 'aria-hidden': 'true' }), this.el.firstChild);
      }
      this.animation = ANIMATIONS.indexOf(this.options.animation) === -1 ? 'wave' : this.options.animation;
      this.items = Array.from(this.el.querySelectorAll('.dx-dock-item'));
      this.scales = this.items.map(() => 1);
      this.lifts = this.items.map(() => 0);
      this.centers = null;
      this.hovering = false;
      this.hoveredIndex = -1;
      this.stopFrame = null;
      this.releasePointer = null;
      this.listen(this.el, 'click', (event) => {
        const item = event.target.closest('.dx-dock-item');
        if (!item) return;
        const config = this.options.items[this.items.indexOf(item)];
        if (config && config.onClick) config.onClick(event, config);
      });
      if (Utils.isTouch || Utils.reducedMotion) return;
      if (this.animation === 'bounce') {
        this.bindBounce();
        return;
      }
      this.listen(this.el, 'pointerenter', this.enter);
      this.listen(this.el, 'pointerleave', this.leave);
      if (this.animation === 'scale') {
        this.listen(this.el, 'pointerover', (event) => {
          const item = event.target.closest('.dx-dock-item');
          this.hoveredIndex = item ? this.items.indexOf(item) : -1;
        });
        this.listen(this.el, 'pointerout', (event) => {
          if (event.target.closest('.dx-dock-item')) this.hoveredIndex = -1;
        });
      }
      this.addCleanup(() => this.stopLoop());
    }

    bindBounce() {
      this.items.forEach((item) => {
        this.listen(item, 'pointerenter', () => {
          Motion.to(item, { scale: this.options.magnify, y: -this.options.lift * 0.4, duration: 0.6, ease: 'outElastic' });
        });
        this.listen(item, 'pointerleave', () => {
          Motion.to(item, { scale: 1, y: 0, duration: 0.28, ease: 'out' });
        });
      });
      this.addCleanup(() => Motion.kill(this.items));
    }

    enter() {
      this.centers = this.items.map((item) => {
        const rect = item.getBoundingClientRect();
        return rect.left + rect.width / 2;
      });
      this.hovering = true;
      this.startLoop();
    }

    leave() {
      this.hovering = false;
      this.hoveredIndex = -1;
    }

    startLoop() {
      if (this.stopFrame) return;
      this.releasePointer = Pointer.use();
      this.stopFrame = Ticker.add((time, delta) => this.step(delta));
    }

    stopLoop() {
      if (this.stopFrame) {
        this.stopFrame();
        this.stopFrame = null;
      }
      if (this.releasePointer) {
        this.releasePointer();
        this.releasePointer = null;
      }
    }

    targets(index, spread) {
      if (!this.hovering || !this.centers) return { scale: 1, y: 0 };
      if (this.animation === 'scale') {
        return index === this.hoveredIndex ? { scale: this.options.magnify, y: 0 } : { scale: 1, y: 0 };
      }
      const distance = Math.abs(Pointer.smoothX - this.centers[index]);
      const influence = Math.max(0, 1 - distance / this.options.range);
      const eased = influence * influence;
      if (this.animation === 'lift') return { scale: 1, y: -this.options.lift * eased };
      const scale = 1 + spread * eased;
      return { scale, y: -((scale - 1) / spread) * this.options.lift };
    }

    step(delta) {
      const spread = Math.max(this.options.magnify - 1, 0.001);
      let active = false;
      for (let i = 0; i < this.items.length; i++) {
        const target = this.targets(i, spread);
        this.scales[i] = Utils.damp(this.scales[i], target.scale, 16, delta);
        this.lifts[i] = Utils.damp(this.lifts[i], target.y, 16, delta);
        this.items[i].style.transform = 'translateY(' + this.lifts[i].toFixed(2) + 'px) scale(' + this.scales[i].toFixed(4) + ')';
        if (Math.abs(this.scales[i] - 1) > 0.002 || Math.abs(this.lifts[i]) > 0.1) active = true;
      }
      if (!this.hovering && !active) {
        this.items.forEach((item) => {
          item.style.transform = '';
        });
        this.stopLoop();
      }
    }
  }

  return Dock;
});
