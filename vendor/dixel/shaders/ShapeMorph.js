Dixel.define('ShapeMorph', ['Component', 'Utils', 'Pointer'], function (Component, Utils, Pointer) {
  'use strict';

  const TAU = Math.PI * 2;

  function segmentedOutline(points) {
    return function (t) {
      const segment = t * points.length;
      const index = Math.floor(segment) % points.length;
      const local = segment - Math.floor(segment);
      const a = points[index];
      const b = points[(index + 1) % points.length];
      return [a[0] + (b[0] - a[0]) * local, a[1] + (b[1] - a[1]) * local];
    };
  }

  function regularPolygon(sides) {
    const points = [];
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * TAU - Math.PI / 2;
      points.push([Math.cos(angle), Math.sin(angle)]);
    }
    return segmentedOutline(points);
  }

  function starOutline() {
    const points = [];
    for (let i = 0; i < 10; i++) {
      const radius = i % 2 === 0 ? 1 : 0.42;
      const angle = (i / 10) * TAU - Math.PI / 2;
      points.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
    }
    return segmentedOutline(points);
  }

  const OUTLINES = {
    circle: (t) => [Math.cos(t * TAU), Math.sin(t * TAU)],
    star: starOutline(),
    triangle: regularPolygon(3),
    hexagon: regularPolygon(6),
    diamond: segmentedOutline([[0, -1], [0.72, 0], [0, 1], [-0.72, 0]]),
    bolt: segmentedOutline([[-0.24, -1], [0.3, -1], [0.02, -0.18], [0.44, -0.18], [-0.22, 1], [0.02, 0.16], [-0.4, 0.16]]),
    heart(t) {
      const a = t * TAU;
      return [
        (16 * Math.pow(Math.sin(a), 3)) / 17,
        -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) / 17
      ];
    },
    moon(t) {
      if (t < 0.5) {
        const a = -Math.PI / 2 + (t / 0.5) * Math.PI;
        return [Math.cos(a), Math.sin(a)];
      }
      const a = Math.PI / 2 - ((t - 0.5) / 0.5) * Math.PI;
      return [Math.cos(a) * 0.55 + 0.35, Math.sin(a)];
    },
    infinity(t) {
      const a = t * TAU;
      const d = 1 + Math.sin(a) * Math.sin(a);
      return [Math.cos(a) / d, (Math.sin(a) * Math.cos(a)) / d];
    }
  };

  class ShapeMorph extends Component {
    static shapeNames() {
      return ['constellation'].concat(Object.keys(OUTLINES));
    }

    static defaults = {
      shapes: ['constellation', 'star', 'heart', 'bolt', 'hexagon', 'moon'],
      hold: 2.6,
      morph: 1.8,
      density: 1,
      fillRatio: 0.62,
      depth: 0.5,
      autoRotate: 0.4,
      autoCycle: true,
      colors: ['primary', 'cyan', 'magenta'],
      trail: 0.25,
      swirl: 1.1,
      repelRadius: 90,
      lines: true,
      scale: 0.38
    };

    build() {
      return Utils.el('div', 'dx-shapemorph');
    }

    ready() {
      this.el.classList.add('dx-shapemorph');
      this.canvas = this.el.querySelector('canvas') || Utils.el('canvas', 'dx-shapemorph-canvas');
      if (!this.canvas.parentNode) this.el.appendChild(this.canvas);
      this.context = this.canvas.getContext('2d');
      this.sampler = document.createElement('canvas');
      this.sampler.width = this.sampler.height = 200;
      this.samplerContext = this.sampler.getContext('2d', { willReadFrequently: true });
      this.resolvePalette();
      this.buildSprites();
      this.addCleanup(Utils.onTheme(() => {
        this.resolvePalette();
        this.buildSprites();
      }));
      this.particles = [];
      this.links = [];
      this.shapeIndex = 0;
      this.phase = 'hold';
      this.clock = 0;
      this.time = 0;
      this.rotation = 0;
      this.rotationVelocity = 0;
      this.dragging = false;
      this.dragLastX = 0;
      this.origin = null;
      this.releasePointer = null;
      this.fit();
      this.spawnParticles();
      this.setTargets(this.currentShapeName(), true);
      this.bindDrag();
      this.listen(window, 'resize', () => {
        this.fit();
        this.spawnParticles();
        this.setTargets(this.currentShapeName(), true);
        this.origin = null;
        if (Utils.reducedMotion) this.paintStatic();
      });
      this.whenVisible((visible) => {
        if (visible && !this.releasePointer && !Utils.isTouch) this.releasePointer = Pointer.use();
        if (!visible && this.releasePointer) {
          this.releasePointer();
          this.releasePointer = null;
        }
        if (visible) this.origin = null;
      });
      if (Utils.reducedMotion) {
        const firstNamed = this.options.shapes.find((name) => name !== 'constellation') || 'star';
        this.setTargets(firstNamed, true);
        this.paintStatic();
        return;
      }
      this.onFrame((time, delta) => this.step(Math.min(delta, 0.05)));
    }

    bindDrag() {
      this.listen(this.canvas, 'pointerdown', (event) => {
        this.dragging = true;
        this.dragLastX = event.clientX;
        this.canvas.setPointerCapture(event.pointerId);
      });
      this.listen(this.canvas, 'pointermove', (event) => {
        if (!this.dragging) return;
        const deltaX = event.clientX - this.dragLastX;
        this.dragLastX = event.clientX;
        this.rotation += deltaX * 0.012;
        this.rotationVelocity = deltaX * 0.6;
      });
      const stop = () => {
        this.dragging = false;
      };
      this.listen(this.canvas, 'pointerup', stop);
      this.listen(this.canvas, 'pointercancel', stop);
    }

    resolvePalette() {
      const styles = getComputedStyle(this.el);
      this.palette = this.options.colors.map((token) => styles.getPropertyValue('--dx-' + token).trim() || '#8b7cf6');
    }

    buildSprites() {
      this.sprites = this.palette.map((color) => {
        const sprite = document.createElement('canvas');
        sprite.width = sprite.height = 32;
        const ctx = sprite.getContext('2d');
        const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.3, color);
        gradient.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 32, 32);
        return sprite;
      });
    }

    fit() {
      this.size = Utils.fitCanvas(this.canvas, this.context);
    }

    particleBudget() {
      const area = this.size.width * this.size.height;
      const base = Utils.clamp(Math.round(area / 560), 360, 1600);
      return Math.round(base * (Utils.isTouch ? 0.55 : 1) * this.options.density);
    }

    spawnParticles() {
      const count = this.particleBudget();
      const centerX = this.size.width / 2;
      const centerY = this.size.height / 2;
      while (this.particles.length > count) this.particles.pop();
      while (this.particles.length < count) {
        this.particles.push({
          x: centerX + (Math.random() - 0.5) * this.size.width,
          y: centerY + (Math.random() - 0.5) * this.size.height,
          fromX: 0,
          fromY: 0,
          fromZ: 0,
          relX: 0,
          relY: 0,
          relZ: 0,
          offsetX: 0,
          offsetY: 0,
          velocityX: 0,
          velocityY: 0,
          size: 0.5 + Math.random() * Math.random() * 1.8,
          sprite: (Math.random() * 3) | 0,
          phase: Math.random() * TAU,
          stagger: Math.random(),
          twinkle: 0.5 + Math.random() * 0.5
        });
      }
    }

    currentShapeName() {
      return this.options.shapes[this.shapeIndex % this.options.shapes.length];
    }

    shapePoints(name, count) {
      const points = [];
      const outline = OUTLINES[name];
      if (name === 'constellation' || !outline) {
        let seed = 421;
        for (let i = 0; i < count; i++) {
          seed = (seed * 16807) % 2147483647;
          const radius = Math.sqrt(seed / 2147483647);
          seed = (seed * 16807) % 2147483647;
          const angle = (seed / 2147483647) * TAU;
          points.push([Math.cos(angle) * radius * 1.3, Math.sin(angle) * radius * 1.05]);
        }
        return points;
      }
      const edgeCount = Math.round(count * (1 - this.options.fillRatio));
      for (let i = 0; i < edgeCount; i++) {
        const point = outline(i / edgeCount);
        points.push([point[0], point[1]]);
      }
      const ctx = this.samplerContext;
      const half = 100;
      ctx.clearRect(0, 0, 200, 200);
      ctx.beginPath();
      for (let i = 0; i <= 160; i++) {
        const point = outline(i / 160);
        const px = half + point[0] * 82;
        const py = half + point[1] * 82;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = '#fff';
      ctx.fill();
      const pixels = ctx.getImageData(0, 0, 200, 200).data;
      const inside = [];
      for (let sy = 0; sy < 200; sy += 2) {
        for (let sx = 0; sx < 200; sx += 2) {
          if (pixels[(sy * 200 + sx) * 4 + 3] > 60) inside.push([sx, sy]);
        }
      }
      const needed = count - edgeCount;
      for (let i = 0; i < needed; i++) {
        const pick = inside[Math.floor((i / needed) * inside.length)] || inside[inside.length - 1] || [half, half];
        const jitterX = (Math.random() - 0.5) * 2;
        const jitterY = (Math.random() - 0.5) * 2;
        points.push([(pick[0] + jitterX - half) / 82, (pick[1] + jitterY - half) / 82]);
      }
      return points;
    }

    applyTargets(points) {
      const centerAngle = (point) => Math.atan2(point[1], point[0]);
      points.sort((a, b) => centerAngle(a) - centerAngle(b) || (a[0] * a[0] + a[1] * a[1]) - (b[0] * b[0] + b[1] * b[1]));
      const depth = this.options.depth;
      for (let i = 0; i < this.particles.length; i++) {
        const particle = this.particles[i];
        const point = points[i % points.length];
        particle.fromX = particle.relX;
        particle.fromY = particle.relY;
        particle.fromZ = particle.relZ;
        particle.relX = point[0];
        particle.relY = point[1];
        particle.relZ = (Math.sin(particle.phase * 3.7) * 0.5 + (Math.random() - 0.5)) * depth * 0.5;
      }
      this.linksDirty = true;
    }

    setTargets(name, immediate) {
      this.applyTargets(this.shapePoints(name, this.particles.length));
      this.isConstellation = name === 'constellation';
      if (immediate) {
        for (let i = 0; i < this.particles.length; i++) {
          this.particles[i].fromX = this.particles[i].relX;
          this.particles[i].fromY = this.particles[i].relY;
          this.particles[i].fromZ = this.particles[i].relZ;
        }
      }
    }

    morphTo(target) {
      if (Array.isArray(target)) {
        this.applyTargets(target.map((point) => point.slice()));
        this.isConstellation = false;
      } else {
        const index = this.options.shapes.indexOf(target);
        if (index !== -1) this.shapeIndex = index;
        this.setTargets(target, false);
      }
      this.phase = 'morph';
      this.clock = 0;
    }

    buildLinks() {
      this.links = [];
      if (!this.isConstellation || !this.options.lines) return;
      const step = Math.max(1, (this.particles.length / 80) | 0);
      const chosen = [];
      for (let i = 0; i < this.particles.length; i += step) chosen.push(this.particles[i]);
      for (let i = 0; i < chosen.length; i++) {
        let best = null;
        let bestDist = Infinity;
        for (let j = 0; j < chosen.length; j++) {
          if (i === j) continue;
          const dx = chosen[i].relX - chosen[j].relX;
          const dy = chosen[i].relY - chosen[j].relY;
          const dist = dx * dx + dy * dy;
          if (dist < bestDist) {
            bestDist = dist;
            best = chosen[j];
          }
        }
        if (best) this.links.push([chosen[i], best]);
      }
    }

    step(delta) {
      if (!this.visible) return;
      this.time += delta;
      this.clock += delta;
      if (!this.dragging) {
        this.rotationVelocity = Utils.damp(this.rotationVelocity, this.options.autoRotate, 2.2, delta);
        this.rotation += this.rotationVelocity * delta;
      }
      if (this.options.autoCycle && this.phase === 'hold' && this.clock >= this.options.hold) {
        this.shapeIndex++;
        this.setTargets(this.currentShapeName(), false);
        this.phase = 'morph';
        this.clock = 0;
      } else if (this.phase === 'morph' && this.clock >= this.options.morph) {
        this.phase = 'hold';
        this.clock = 0;
      }
      this.paint(delta);
    }

    paint(delta) {
      const ctx = this.context;
      const width = this.size.width;
      const height = this.size.height;
      if (this.origin === null && this.el.isConnected) {
        this.origin = this.canvas.getBoundingClientRect();
      }
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,' + (1 - this.options.trail) + ')';
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';
      const centerX = width / 2;
      const centerY = height / 2;
      const scaleBase = Math.min(width, height) * this.options.scale;
      const morphing = this.phase === 'morph';
      const duration = this.options.morph;
      const cosR = Math.cos(this.rotation);
      const sinR = Math.sin(this.rotation);
      const pointerX = this.origin ? Pointer.x - this.origin.left : -9999;
      const pointerY = this.origin ? Pointer.y - this.origin.top : -9999;
      const repelRadius = this.options.repelRadius;
      const repelSq = repelRadius * repelRadius;
      const damping = Math.exp(-4.5 * delta);
      if (this.linksDirty && !morphing) {
        this.buildLinks();
        this.linksDirty = false;
      }
      if (this.links.length && !morphing && this.isConstellation) {
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < this.links.length; i++) {
          const a = this.links[i][0];
          const b = this.links[i][1];
          ctx.moveTo(centerX + (a.relX * cosR + a.relZ * sinR) * scaleBase, centerY + a.relY * scaleBase);
          ctx.lineTo(centerX + (b.relX * cosR + b.relZ * sinR) * scaleBase, centerY + b.relY * scaleBase);
        }
        ctx.stroke();
      }
      for (let i = 0; i < this.particles.length; i++) {
        const particle = this.particles[i];
        let relX = particle.relX;
        let relY = particle.relY;
        let relZ = particle.relZ;
        if (morphing) {
          const local = Utils.clamp((this.clock / duration - particle.stagger * 0.25) / 0.75, 0, 1);
          const eased = local < 0.5 ? 4 * local * local * local : 1 - Math.pow(-2 * local + 2, 3) / 2;
          relX = particle.fromX + (particle.relX - particle.fromX) * eased;
          relY = particle.fromY + (particle.relY - particle.fromY) * eased;
          relZ = particle.fromZ + (particle.relZ - particle.fromZ) * eased;
          const swirlAngle = Math.sin(local * Math.PI) * this.options.swirl * 0.5;
          const sx = relX * Math.cos(swirlAngle) - relY * Math.sin(swirlAngle);
          relY = relX * Math.sin(swirlAngle) + relY * Math.cos(swirlAngle);
          relX = sx;
        } else {
          relX += Math.sin(this.time * 0.7 + particle.phase) * 0.008;
          relY += Math.cos(this.time * 0.5 + particle.phase * 1.7) * 0.008;
        }
        const rotatedX = relX * cosR + relZ * sinR;
        const depthCue = -relX * sinR + relZ * cosR;
        const perspective = 1 + depthCue * 0.35;
        let baseX = centerX + rotatedX * scaleBase * perspective;
        let baseY = centerY + relY * scaleBase * perspective;
        const dx = baseX + particle.offsetX - pointerX;
        const dy = baseY + particle.offsetY - pointerY;
        const distSq = dx * dx + dy * dy;
        if (distSq < repelSq && distSq > 0.01) {
          const dist = Math.sqrt(distSq);
          const push = ((repelRadius - dist) / repelRadius) * 640;
          particle.velocityX += (dx / dist) * push * delta;
          particle.velocityY += (dy / dist) * push * delta;
        }
        particle.velocityX -= particle.offsetX * 8 * delta;
        particle.velocityY -= particle.offsetY * 8 * delta;
        particle.velocityX *= damping;
        particle.velocityY *= damping;
        particle.offsetX += particle.velocityX * delta;
        particle.offsetY += particle.velocityY * delta;
        baseX += particle.offsetX;
        baseY += particle.offsetY;
        const depthLight = Utils.clamp(0.55 + depthCue * 0.9, 0.18, 1.25);
        const twinkle = particle.twinkle * (0.72 + 0.28 * Math.sin(this.time * 2.2 + particle.phase));
        const drawSize = particle.size * 7 * twinkle * perspective;
        ctx.globalAlpha = Utils.clamp(twinkle * depthLight, 0.08, 1);
        ctx.drawImage(this.sprites[particle.sprite % this.sprites.length], baseX - drawSize / 2, baseY - drawSize / 2, drawSize, drawSize);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    paintStatic() {
      const ctx = this.context;
      const centerX = this.size.width / 2;
      const centerY = this.size.height / 2;
      const scaleBase = Math.min(this.size.width, this.size.height) * this.options.scale;
      ctx.clearRect(0, 0, this.size.width, this.size.height);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < this.particles.length; i++) {
        const particle = this.particles[i];
        const drawSize = particle.size * 6;
        ctx.globalAlpha = 0.8;
        ctx.drawImage(
          this.sprites[particle.sprite % this.sprites.length],
          centerX + particle.relX * scaleBase - drawSize / 2,
          centerY + particle.relY * scaleBase - drawSize / 2,
          drawSize,
          drawSize
        );
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  return ShapeMorph;
});
