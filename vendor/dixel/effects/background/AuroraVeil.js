Dixel.define('AuroraVeil', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class AuroraVeil extends Component {
    static defaults = { veils: 3, drift: 40, speed: 0.1 };

    build() {
      return Utils.el('div', 'dx-bg');
    }

    ready() {
      this.el.classList.add('dx-bg');
      this.el.classList.add('dx-aurora');
      this.veils = [];
      for (let i = 0; i < this.options.veils; i++) {
        const node = Utils.el('div', 'dx-aurora-veil dx-aurora-veil--' + ((i % 3) + 1));
        this.el.appendChild(node);
        this.veils.push({
          node,
          angle: -24 + i * 12,
          phase: Math.random() * Math.PI * 2,
          speed: this.options.speed * (0.7 + i * 0.25)
        });
      }
      this.measure();
      this.listen(window, 'resize', this.measure);
      this.whenVisible(() => {});
      if (Utils.reducedMotion) {
        for (let i = 0; i < this.veils.length; i++) {
          this.veils[i].node.style.transform = 'rotate(' + this.veils[i].angle + 'deg)';
        }
        return;
      }
      this.onFrame(this.update);
    }

    measure() {
      const rect = this.el.getBoundingClientRect();
      this.range = rect.width * 0.08 + this.options.drift;
    }

    update(time) {
      if (!this.visible) return;
      for (let i = 0; i < this.veils.length; i++) {
        const veil = this.veils[i];
        const x = Math.sin(time * veil.speed + veil.phase) * this.range;
        const stretch = 1 + 0.18 * Math.sin(time * veil.speed * 0.8 + veil.phase * 2);
        veil.node.style.transform =
          'translate3d(' + x + 'px,0,0) rotate(' + veil.angle + 'deg) scaleY(' + stretch + ')';
      }
    }
  }

  return AuroraVeil;
});
