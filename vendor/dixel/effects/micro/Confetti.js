Dixel.define('Confetti', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class Confetti extends Component {
    static defaults = {
      count: 40,
      power: 520,
      gravity: 1150,
      friction: 1.6,
      duration: 1.6,
      spreadAngle: 75
    };

    build() {
      return Utils.el('span', 'dx-confetti-anchor');
    }

    ready() {
      this.layer = Utils.el('div', 'dx-confetti-layer');
      document.body.appendChild(this.layer);
      this.addCleanup(() => this.layer.remove());
      this.pieces = [];
      for (let i = 0; i < this.options.count; i++) {
        const node = Utils.el('div', 'dx-confetti-piece dx-confetti-piece--' + ((i % 5) + 1));
        node.style.width = (6 + Math.random() * 5).toFixed(1) + 'px';
        node.style.height = (4 + Math.random() * 4).toFixed(1) + 'px';
        this.layer.appendChild(node);
        this.pieces.push({
          node, life: 0, total: 1, x: 0, y: 0, vx: 0, vy: 0,
          rotation: 0, spin: 0, tumbleAngle: 0, tumble: 0
        });
      }
      this.running = false;
      this.onFrame(this.update);
    }

    origin() {
      if (this.el && this.el.getBoundingClientRect) {
        const rect = this.el.getBoundingClientRect();
        if (rect.width || rect.height) {
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        }
      }
      return { x: innerWidth / 2, y: innerHeight * 0.4 };
    }

    burst(x, y) {
      if (Utils.reducedMotion) return this;
      const from = x === undefined ? this.origin() : { x, y };
      const spread = (this.options.spreadAngle * Math.PI) / 180;
      for (let i = 0; i < this.pieces.length; i++) {
        const piece = this.pieces[i];
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2 * spread;
        const speed = this.options.power * (0.5 + Math.random() * 0.7);
        piece.x = from.x;
        piece.y = from.y;
        piece.vx = Math.cos(angle) * speed;
        piece.vy = Math.sin(angle) * speed;
        piece.rotation = Math.random() * 360;
        piece.spin = (Math.random() - 0.5) * 900;
        piece.tumbleAngle = Math.random() * 360;
        piece.tumble = (Math.random() - 0.5) * 720;
        piece.life = piece.total = this.options.duration * (0.7 + Math.random() * 0.5);
      }
      this.running = true;
      return this;
    }

    update(time, delta) {
      if (!this.running) return;
      const drag = Math.exp(-this.options.friction * delta);
      let alive = 0;
      for (let i = 0; i < this.pieces.length; i++) {
        const piece = this.pieces[i];
        if (piece.life <= 0) continue;
        piece.life -= delta;
        if (piece.life <= 0) {
          piece.node.style.opacity = '0';
          continue;
        }
        alive++;
        piece.vx *= drag;
        piece.vy = piece.vy * drag + this.options.gravity * delta;
        piece.x += piece.vx * delta;
        piece.y += piece.vy * delta;
        piece.rotation += piece.spin * delta;
        piece.tumbleAngle += piece.tumble * delta;
        const progress = 1 - piece.life / piece.total;
        piece.node.style.transform =
          'translate3d(' + piece.x + 'px,' + piece.y + 'px,0) rotate(' + piece.rotation +
          'deg) rotateX(' + piece.tumbleAngle + 'deg)';
        piece.node.style.opacity = String(Utils.clamp((1 - progress) * 3, 0, 1));
      }
      if (!alive) this.running = false;
    }
  }

  return Confetti;
});
