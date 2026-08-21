Dixel.define('ParticleField', ['Component', 'Pointer', 'Utils', 'ShapeMask'], function (Component, Pointer, Utils, ShapeMask) {
  'use strict';

  class ParticleField extends Component {
    static defaults = {
      density: 14000,
      maxParticles: 90,
      linkDistance: 110,
      repelRadius: 130,
      repelForce: 900,
      speed: 18,
      shape: null,
      shapeTarget: null,
      shapeParticles: 260,
      shapeSpring: 26,
      shapeWander: 3
    };

    build() {
      return Utils.el('div', 'dx-bg');
    }

    ready() {
      this.el.classList.add('dx-bg');
      this.canvas = Utils.el('canvas', 'dx-bg-canvas');
      this.el.appendChild(this.canvas);
      this.context = this.canvas.getContext('2d');
      const readColors = () => {
        this.color = Utils.token('primary', '#6d5cff');
        this.linkColor = Utils.token('cyan', '#2ee6d6');
      };
      readColors();
      this.addCleanup(Utils.onTheme(readColors));
      this.particles = [];
      this.docLeft = 0;
      this.docTop = 0;
      this.fit();
      this.listen(window, 'resize', this.fit);
      this.whenVisible((visible) => {
        if (visible && Utils.reducedMotion) this.draw();
      });
      if (!Utils.reducedMotion) {
        if (!Utils.isTouch) this.addCleanup(Pointer.use());
        this.onFrame(this.update);
      }
    }

    fit() {
      const size = Utils.fitCanvas(this.canvas, this.context);
      this.width = size.width;
      this.height = size.height;
      const rect = this.canvas.getBoundingClientRect();
      this.docLeft = rect.left;
      this.docTop = rect.top + window.scrollY;
      if (this.options.shape === 'text') {
        this.seedShape();
        return;
      }
      const divisor = Utils.isTouch ? this.options.density * 2 : this.options.density;
      const count = Math.min(
        Math.max(Math.round((this.width * this.height) / divisor), 12),
        this.options.maxParticles
      );
      while (this.particles.length < count) {
        this.particles.push({
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          bx: (Math.random() - 0.5) * this.options.speed * 2,
          by: (Math.random() - 0.5) * this.options.speed * 2,
          vx: 0,
          vy: 0,
          radius: 1 + Math.random() * 1.6
        });
      }
      this.particles.length = count;
    }

    seedShape() {
      const target = this.options.shapeTarget
        ? (typeof this.options.shapeTarget === 'string'
          ? this.el.parentElement.querySelector(this.options.shapeTarget)
          : this.options.shapeTarget)
        : this.el.parentElement || this.el;
      if (!target) return;
      const mask = ShapeMask.textMask(target, 1);
      let step = 3;
      let points = ShapeMask.samplePoints(mask.canvas, step);
      while (points.length > this.options.shapeParticles && step < 24) {
        step += 1;
        points = ShapeMask.samplePoints(mask.canvas, step);
      }
      const hostRect = this.el.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const offsetX = targetRect.left - hostRect.left;
      const offsetY = targetRect.top - hostRect.top;
      this.particles = points.map((point) => {
        const hx = offsetX + point.x * targetRect.width;
        const hy = offsetY + point.y * targetRect.height;
        return {
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          hx,
          hy,
          phase: Math.random() * Math.PI * 2,
          wobble: 0.6 + Math.random() * 0.9,
          bx: 0,
          by: 0,
          vx: 0,
          vy: 0,
          radius: 1 + Math.random() * 1.4
        };
      });
    }

    update(time, delta) {
      if (!this.visible) return;
      const usePointer = !Utils.isTouch;
      const pointerX = Pointer.smoothX - this.docLeft;
      const pointerY = Pointer.smoothY - (this.docTop - window.scrollY);
      const repelRadius = this.options.repelRadius;
      const friction = Math.exp(-2.5 * delta);
      for (let i = 0; i < this.particles.length; i++) {
        const particle = this.particles[i];
        if (usePointer) {
          const dx = particle.x - pointerX;
          const dy = particle.y - pointerY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < repelRadius && dist > 0.001) {
            const push = (1 - dist / repelRadius) * this.options.repelForce * delta;
            particle.vx += (dx / dist) * push;
            particle.vy += (dy / dist) * push;
          }
        }
        if (particle.hx !== undefined) {
          const wander = this.options.shapeWander;
          const homeX = particle.hx + Math.sin(time * particle.wobble + particle.phase) * wander;
          const homeY = particle.hy + Math.cos(time * particle.wobble * 0.8 + particle.phase) * wander;
          particle.vx += (homeX - particle.x) * this.options.shapeSpring * delta;
          particle.vy += (homeY - particle.y) * this.options.shapeSpring * delta;
          particle.vx *= Math.exp(-4.5 * delta);
          particle.vy *= Math.exp(-4.5 * delta);
          particle.x += particle.vx * delta;
          particle.y += particle.vy * delta;
          continue;
        }
        particle.x += (particle.bx + particle.vx) * delta;
        particle.y += (particle.by + particle.vy) * delta;
        particle.vx *= friction;
        particle.vy *= friction;
        if (particle.x < -12) particle.x = this.width + 12;
        else if (particle.x > this.width + 12) particle.x = -12;
        if (particle.y < -12) particle.y = this.height + 12;
        else if (particle.y > this.height + 12) particle.y = -12;
      }
      this.draw();
    }

    draw() {
      const ctx = this.context;
      const list = this.particles;
      ctx.clearRect(0, 0, this.width, this.height);
      const linkDistance = this.options.linkDistance;
      const linkSq = linkDistance * linkDistance;
      ctx.lineWidth = 1;
      ctx.strokeStyle = this.linkColor;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const dx = list[i].x - list[j].x;
          const dy = list[i].y - list[j].y;
          const distSq = dx * dx + dy * dy;
          if (distSq > linkSq) continue;
          ctx.globalAlpha = (1 - Math.sqrt(distSq) / linkDistance) * 0.35;
          ctx.beginPath();
          ctx.moveTo(list[i].x, list[i].y);
          ctx.lineTo(list[j].x, list[j].y);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = this.color;
      for (let i = 0; i < list.length; i++) {
        ctx.beginPath();
        ctx.arc(list[i].x, list[i].y, list[i].radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  return ParticleField;
});
