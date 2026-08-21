Dixel.define('GlowOrbs', ['Component', 'Pointer', 'Utils'], function (Component, Pointer, Utils) {
  'use strict';

  class GlowOrbs extends Component {
    static defaults = { orbs: 3, drift: 34, speed: 0.2, parallax: 22 };

    build() {
      return Utils.el('div', 'dx-orbs');
    }

    ready() {
      this.el.classList.add('dx-orbs');
      this.items = [];
      const count = Utils.clamp(this.options.orbs, 2, 4);
      for (let i = 0; i < count; i++) {
        const node = Utils.el('div', 'dx-orb dx-orb--' + (i + 1));
        this.el.appendChild(node);
        this.items.push({
          node,
          phase: Math.random() * Math.PI * 2,
          speed: this.options.speed * (0.6 + i * 0.3),
          depth: 0.35 + (i / count) * 0.65
        });
      }
      this.whenVisible(() => {});
      if (Utils.reducedMotion) return;
      this.pointerActive = !Utils.isTouch;
      if (this.pointerActive) this.addCleanup(Pointer.use());
      this.onFrame(this.update);
    }

    update(time) {
      if (!this.visible) return;
      const drift = this.options.drift;
      const parallax = this.pointerActive ? this.options.parallax : 0;
      const normalX = this.pointerActive ? (Pointer.smoothX / innerWidth) * 2 - 1 : 0;
      const normalY = this.pointerActive ? (Pointer.smoothY / innerHeight) * 2 - 1 : 0;
      for (let i = 0; i < this.items.length; i++) {
        const orb = this.items[i];
        const x = Math.sin(time * orb.speed + orb.phase) * drift + normalX * parallax * orb.depth;
        const y = Math.cos(time * orb.speed * 0.8 + orb.phase) * drift * 0.7 + normalY * parallax * orb.depth;
        orb.node.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
      }
    }
  }

  return GlowOrbs;
});
