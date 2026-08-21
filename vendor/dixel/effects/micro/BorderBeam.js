Dixel.define('BorderBeam', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class BorderBeam extends Component {
    static defaults = { color: 'cyan', size: 56, speed: 4, thickness: 2, glow: true };

    ready() {
      if (Utils.reducedMotion) return;
      const color = this.options.tint || this.options.color;
      this.speed = this.options.lap || this.options.speed;
      this.thickness = this.options.thickness;
      this.host = this.resolveHost();
      this.host.classList.add('dx-beamhost');
      this.layer = Utils.el('div', 'dx-beamlayer');
      this.trail = Utils.el('div', 'dx-beam-trail dx-beam-trail--' + color);
      this.trail.style.width = this.options.size + 'px';
      this.trail.style.height = this.thickness + 'px';
      this.layer.appendChild(this.trail);
      this.head = null;
      if (this.options.glow) {
        const headSize = Math.max(this.thickness * 2.5, 5);
        this.headHalf = headSize / 2;
        this.head = Utils.el('div', 'dx-beam-head dx-beam-head--' + color);
        this.head.style.width = this.head.style.height = headSize.toFixed(1) + 'px';
        this.layer.appendChild(this.head);
      }
      this.host.appendChild(this.layer);
      this.addCleanup(() => this.layer.remove());
      this.width = 0;
      this.height = 0;
      this.timer = Math.random() * this.speed;
      this.measure();
      this.listen(window, 'resize', this.measure);
      this.whenVisible((visible) => {
        if (visible) this.measure();
      });
      this.onFrame(this.update);
    }

    resolveHost() {
      if (getComputedStyle(this.el).display !== 'inline') return this.el;
      const wrap = Utils.el('span', 'dx-beamwrap');
      this.el.parentNode.insertBefore(wrap, this.el);
      wrap.appendChild(this.el);
      this.addCleanup(() => {
        if (wrap.parentNode) wrap.parentNode.insertBefore(this.el, wrap);
        wrap.remove();
      });
      return wrap;
    }

    measure() {
      const rect = this.host.getBoundingClientRect();
      this.width = Math.max(rect.width - this.thickness, 1);
      this.height = Math.max(rect.height - this.thickness, 1);
    }

    update(time, delta) {
      if (!this.visible || !this.width) return;
      this.timer = (this.timer + delta) % this.speed;
      const perimeter = 2 * (this.width + this.height);
      const distance = (this.timer / this.speed) * perimeter;
      const inset = this.thickness / 2;
      let x;
      let y;
      let angle;
      if (distance < this.width) {
        x = inset + distance;
        y = inset;
        angle = 0;
      } else if (distance < this.width + this.height) {
        x = inset + this.width;
        y = inset + distance - this.width;
        angle = 90;
      } else if (distance < this.width * 2 + this.height) {
        x = inset + this.width - (distance - this.width - this.height);
        y = inset + this.height;
        angle = 180;
      } else {
        x = inset;
        y = inset + perimeter - distance;
        angle = 270;
      }
      this.trail.style.transform =
        'translate3d(' + (x - this.options.size) + 'px,' + (y - inset) + 'px,0) rotate(' + angle + 'deg)';
      if (this.head) {
        this.head.style.transform = 'translate3d(' + (x - this.headHalf) + 'px,' + (y - this.headHalf) + 'px,0)';
      }
    }
  }

  return BorderBeam;
});
