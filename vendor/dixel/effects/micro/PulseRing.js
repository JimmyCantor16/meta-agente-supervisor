Dixel.define('PulseRing', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class PulseRing extends Component {
    static defaults = { interval: 2.2, duration: 1.4, spread: 1.9, strength: 0.7, tint: 'primary' };

    ready() {
      this.el.classList.add('dx-pulsehost');
      if (Utils.reducedMotion) return;
      this.rings = [];
      for (let i = 0; i < 2; i++) {
        const node = Utils.el('div', 'dx-pulse-ring dx-pulse-ring--' + this.options.tint);
        this.el.appendChild(node);
        this.rings.push({ node, offset: (this.options.interval / 2) * i, hidden: true });
      }
      this.timer = 0;
      this.measure();
      this.listen(window, 'resize', this.measure);
      this.whenVisible((visible) => {
        if (visible) this.measure();
      });
      this.onFrame(this.update);
    }

    measure() {
      const rect = this.el.getBoundingClientRect();
      const diameter = Math.max(rect.width, rect.height);
      if (diameter === this.diameter) return;
      this.diameter = diameter;
      for (let i = 0; i < this.rings.length; i++) {
        const node = this.rings[i].node;
        node.style.width = node.style.height = diameter + 'px';
      }
    }

    update(time, delta) {
      if (!this.visible) return;
      this.timer += delta;
      for (let i = 0; i < this.rings.length; i++) {
        const ring = this.rings[i];
        const local = (this.timer + ring.offset) % this.options.interval;
        const progress = local / this.options.duration;
        if (progress >= 1) {
          if (!ring.hidden) {
            ring.hidden = true;
            ring.node.style.opacity = '0';
          }
          continue;
        }
        ring.hidden = false;
        const scale = 1 + progress * (this.options.spread - 1);
        ring.node.style.transform = 'translate(-50%,-50%) scale(' + scale + ')';
        ring.node.style.opacity = String((1 - progress) * this.options.strength);
      }
    }
  }

  return PulseRing;
});
