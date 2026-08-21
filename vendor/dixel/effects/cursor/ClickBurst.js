Dixel.define('ClickBurst', ['Component', 'Pointer', 'Utils'], function (Component, Pointer, Utils) {
  'use strict';

  function outExpo(progress) {
    return progress >= 1 ? 1 : 1 - Math.pow(2, -10 * progress);
  }

  class ClickBurst extends Component {
    static defaults = {
      bursts: 3,
      sparks: 5,
      ringSize: 90,
      spread: 130,
      friction: 3.4,
      duration: 0.6,
      sparkLength: 34
    };

    build() {
      return Utils.el('div', 'dx-cursor-layer');
    }

    ready() {
      if (Utils.isTouch || Utils.reducedMotion) {
        this.el.classList.add('dx-cursor-layer--off');
        return;
      }
      this.el.classList.add('dx-cursor-layer');
      this.slots = [];
      for (let i = 0; i < this.options.bursts; i++) {
        this.slots.push(this.createSlot());
      }
      this.nextSlot = 0;
      this.running = false;
      this.addCleanup(Pointer.use());
      this.listen(window, 'pointerdown', (event) => this.spawn(event.clientX, event.clientY));
      this.onFrame(this.update, true);
    }

    createSlot() {
      const ringNode = Utils.el('div', 'dx-burst-ring');
      ringNode.style.width = ringNode.style.height = this.options.ringSize + 'px';
      this.el.appendChild(ringNode);
      const sparks = [];
      for (let i = 0; i < this.options.sparks; i++) {
        const node = Utils.el('div', 'dx-burst-spark');
        node.style.width = this.options.sparkLength + 'px';
        this.el.appendChild(node);
        sparks.push({ node, life: 0, total: 1, x: 0, y: 0, vx: 0, vy: 0, angle: 0 });
      }
      return { ring: { node: ringNode, life: 0, total: 1, x: 0, y: 0 }, sparks };
    }

    spawn(x, y) {
      const slot = this.slots[this.nextSlot];
      this.nextSlot = (this.nextSlot + 1) % this.slots.length;
      const duration = this.options.duration;
      const spread = this.options.spread;
      slot.ring.life = slot.ring.total = duration;
      slot.ring.x = x;
      slot.ring.y = y;
      const base = Math.random() * Math.PI * 2;
      for (let i = 0; i < slot.sparks.length; i++) {
        const spark = slot.sparks[i];
        const angle = base + (i / slot.sparks.length) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
        const speed = spread * (2.6 + Math.random() * 1.4);
        spark.x = x;
        spark.y = y;
        spark.vx = Math.cos(angle) * speed;
        spark.vy = Math.sin(angle) * speed;
        spark.angle = (angle * 180) / Math.PI;
        spark.life = spark.total = duration * (0.55 + Math.random() * 0.25);
      }
      this.running = true;
    }

    update(time, delta) {
      if (!this.running) return;
      const drag = Math.exp(-this.options.friction * delta);
      const ringHalf = this.options.ringSize / 2;
      let alive = 0;
      for (let s = 0; s < this.slots.length; s++) {
        const slot = this.slots[s];
        const ring = slot.ring;
        if (ring.life > 0) {
          ring.life -= delta;
          if (ring.life <= 0) {
            ring.node.style.opacity = '0';
          } else {
            alive++;
            const progress = 1 - ring.life / ring.total;
            const eased = outExpo(progress);
            ring.node.style.transform =
              'translate3d(' + (ring.x - ringHalf) + 'px,' + (ring.y - ringHalf) + 'px,0) scale(' + (0.15 + eased * 1.05) + ')';
            ring.node.style.opacity = String(0.9 * (1 - progress));
          }
        }
        for (let i = 0; i < slot.sparks.length; i++) {
          const spark = slot.sparks[i];
          if (spark.life <= 0) continue;
          spark.life -= delta;
          if (spark.life <= 0) {
            spark.node.style.opacity = '0';
            continue;
          }
          alive++;
          spark.vx *= drag;
          spark.vy *= drag;
          spark.x += spark.vx * delta;
          spark.y += spark.vy * delta;
          const progress = 1 - spark.life / spark.total;
          const shrink = Math.max(1 - outExpo(progress), 0.02);
          spark.node.style.transform =
            'translate3d(' + spark.x + 'px,' + (spark.y - 1) + 'px,0) rotate(' + spark.angle + 'deg) scaleX(' + shrink + ')';
          spark.node.style.opacity = String(1 - progress);
        }
      }
      if (!alive) this.running = false;
    }
  }

  return ClickBurst;
});
