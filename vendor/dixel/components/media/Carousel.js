Dixel.define('Carousel', ['Component', 'Utils', 'Ticker'], function (Component, Utils, Ticker) {
  'use strict';

  const EFFECTS = ['slide', 'coverflow', 'fade', 'ring'];

  class Carousel extends Component {
    static defaults = {
      dots: true,
      arrows: true,
      loop: true,
      startIndex: 0,
      snapStrength: 9,
      dragThreshold: 6,
      effect: 'slide',
      coverflowRotate: 35,
      coverflowDepth: 140,
      autoSpeed: 12,
      pauseOnHover: false,
      ringRadius: null,
      ringInterval: 3,
      ringSettle: 5,
      ringTilt: 58,
      ringScaleStep: 0.07,
      ringDepth: 0.55,
      ringGap: 0.72,
      ringFriction: 3.2,
      onChange: null,
      slides: []
    };

    build() {
      return Utils.el('div', 'dx-carousel');
    }

    ready() {
      this.effect = EFFECTS.indexOf(this.options.effect) === -1 ? 'slide' : this.options.effect;
      this.el.classList.add('dx-carousel', 'dx-carousel--' + this.effect);
      if (!this.el.children.length && this.options.slides.length) {
        this.options.slides.forEach((html) => {
          const slide = Utils.el('div');
          slide.innerHTML = html;
          this.el.appendChild(slide);
        });
      }
      this.viewport = Utils.el('div', 'dx-carousel-viewport');
      this.track = Utils.el('div', 'dx-carousel-track');
      const slides = Array.from(this.el.children);
      slides.forEach((slide) => {
        slide.classList.add('dx-carousel-slide');
        this.track.appendChild(slide);
      });
      this.slides = slides;
      this.viewport.appendChild(this.track);
      this.el.appendChild(this.viewport);
      this.index = Utils.clamp(this.options.startIndex, 0, Math.max(slides.length - 1, 0));
      this.x = 0;
      this.target = 0;
      this.velocity = 0;
      this.dragging = false;
      this.moved = false;
      this.pendingX = null;
      this.stopFrames = null;
      this.measureQueued = false;
      this.stopMeasure = null;
      this.snapPoints = [];
      this.addCleanup(() => {
        if (this.stopMeasure) this.stopMeasure();
      });
      this.slides.forEach((slide) => {
        slide.querySelectorAll('img').forEach((img) => {
          if (!img.complete) this.listen(img, 'load', () => this.queueMeasure());
        });
      });
      if (this.effect === 'ring') {
        this.setupRing();
        return;
      }
      if (this.options.arrows && slides.length > 1) this.buildArrows();
      if (this.options.dots && slides.length > 1) this.buildDots();
      this.measure();
      this.jumpTo(this.index);
      this.listen(window, 'resize', () => this.queueMeasure());
      this.listen(window, 'load', () => this.queueMeasure());
      this.listen(this.viewport, 'pointerdown', this.onDown);
      this.listen(this.viewport, 'pointermove', this.onMove);
      this.listen(this.viewport, 'pointerup', this.onUp);
      this.listen(this.viewport, 'pointercancel', this.onUp);
      this.listen(this.viewport, 'click', this.onClick, true);
      this.listen(this.el, 'keydown', this.onKey);
      this.addCleanup(() => this.halt());
      this.whenVisible((visible) => {
        if (!visible) {
          this.halt();
          return;
        }
        this.queueMeasure();
        if (!this.dragging && this.x !== this.target) this.run();
      });
    }

    buildArrows() {
      const chevron = '<svg viewBox="0 0 8 14" aria-hidden="true"><path d="M7 1 1 7l6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      this.prevBtn = Utils.el('button', 'dx-carousel-arrow dx-carousel-arrow--prev dx-focusable', { type: 'button', 'aria-label': 'Anterior' });
      this.prevBtn.innerHTML = chevron;
      this.nextBtn = Utils.el('button', 'dx-carousel-arrow dx-carousel-arrow--next dx-focusable', { type: 'button', 'aria-label': 'Siguiente' });
      this.nextBtn.innerHTML = chevron;
      this.listen(this.prevBtn, 'click', () => this.prev());
      this.listen(this.nextBtn, 'click', () => this.next());
      this.el.appendChild(this.prevBtn);
      this.el.appendChild(this.nextBtn);
    }

    buildDots() {
      this.dotsEl = Utils.el('div', 'dx-carousel-dots', { role: 'tablist' });
      this.dots = this.slides.map((slide, index) => {
        const dot = Utils.el('button', 'dx-carousel-dot', { type: 'button', 'aria-label': 'Ir a ' + (index + 1) });
        this.listen(dot, 'click', () => this.go(index));
        this.dotsEl.appendChild(dot);
        return dot;
      });
      this.el.appendChild(this.dotsEl);
    }

    setupRing() {
      this.angle = 0;
      this.spinVelocity = 0;
      this.hoverPaused = false;
      this.grabStartX = 0;
      this.ringTarget = null;
      this.ringWait = 0;
      this.measure();
      this.paintRing();
      this.listen(window, 'resize', () => this.queueMeasure());
      this.listen(window, 'load', () => this.queueMeasure());
      this.addCleanup(() => this.halt());
      if (this.options.arrows && this.slides.length > 1) this.buildArrows();
      if (this.options.dots && this.slides.length > 1) this.buildDots();
      if (!this.el.hasAttribute('tabindex')) this.el.setAttribute('tabindex', '0');
      this.el.setAttribute('role', 'region');
      this.el.setAttribute('aria-roledescription', 'carrusel');
      this.listen(this.el, 'keydown', this.onRingKey);
      this.syncRingUi();
      if (Utils.reducedMotion) return;
      this.listen(this.viewport, 'pointerdown', this.onRingDown);
      this.listen(this.viewport, 'pointermove', this.onRingMove);
      this.listen(this.viewport, 'pointerup', this.onRingUp);
      this.listen(this.viewport, 'pointercancel', this.onRingUp);
      this.listen(this.viewport, 'click', this.onClick, true);
      if (this.options.pauseOnHover) {
        this.listen(this.el, 'pointerenter', (event) => {
          if (event.pointerType === 'mouse') this.hoverPaused = true;
        });
        this.listen(this.el, 'pointerleave', () => {
          this.hoverPaused = false;
          this.run();
        });
      }
      this.whenVisible((visible) => {
        if (!visible) {
          this.halt();
          return;
        }
        this.queueMeasure();
        this.run();
      });
    }

    ringIndex() {
      const count = this.slides.length;
      if (!count) return 0;
      return ((Math.round(-this.angle / this.ringStep) % count) + count) % count;
    }

    goRing(index) {
      const count = this.slides.length;
      if (!count) return;
      const full = count * this.ringStep;
      let target = -index * this.ringStep;
      target += Math.round((this.angle - target) / full) * full;
      this.spinVelocity = 0;
      this.ringWait = 0;
      this.ringTarget = target;
      if (Utils.reducedMotion) {
        this.angle = target;
        this.paintRing();
        this.syncRingUi();
        return;
      }
      this.run();
    }

    onRingKey(event) {
      if (event.target !== this.el) return;
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.goRing(this.ringIndex() + 1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.goRing(this.ringIndex() - 1);
      }
    }

    syncRingUi() {
      const active = this.ringIndex();
      if (this.dots) {
        this.dots.forEach((dot, index) => dot.classList.toggle('dx-carousel-dot--active', index === active));
      }
      if (this.lastRingIndex !== active) {
        this.lastRingIndex = active;
        if (this.options.onChange) this.options.onChange(active, this);
      }
    }

    onRingDown(event) {
      this.viewport.setPointerCapture(event.pointerId);
      this.dragging = true;
      this.moved = false;
      this.grabX = event.clientX;
      this.grabStartX = event.clientX;
      this.pendingX = null;
      this.spinVelocity = 0;
      this.el.classList.add('dx-carousel--dragging');
      this.run();
    }

    onRingMove(event) {
      if (!this.dragging) return;
      this.pendingX = event.clientX;
      if (Math.abs(event.clientX - this.grabStartX) > this.options.dragThreshold) this.moved = true;
    }

    onRingUp(event) {
      if (!this.dragging) return;
      if (this.viewport.hasPointerCapture(event.pointerId)) this.viewport.releasePointerCapture(event.pointerId);
      this.dragging = false;
      this.el.classList.remove('dx-carousel--dragging');
    }

    stepRing(delta) {
      const safeDelta = Math.max(delta, 0.001);
      if (this.dragging) {
        this.ringTarget = null;
        if (this.pendingX === null) return;
        const turned = (this.pendingX - this.grabX) * this.ringDragFactor;
        this.grabX = this.pendingX;
        this.pendingX = null;
        this.angle += turned;
        this.spinVelocity = Utils.clamp(turned / safeDelta, -420, 420);
        this.paintRing();
        return;
      }
      if (this.spinVelocity) {
        this.spinVelocity = Utils.damp(this.spinVelocity, 0, this.options.ringFriction, safeDelta);
        this.angle += this.spinVelocity * safeDelta;
        if (Math.abs(this.spinVelocity) < 14) this.spinVelocity = 0;
        this.paintRing();
        return;
      }
      if (this.ringTarget === null || this.ringTarget === undefined) {
        this.ringTarget = Math.round(this.angle / this.ringStep) * this.ringStep;
        this.ringWait = 0;
      }
      if (Math.abs(this.ringTarget - this.angle) > 0.04) {
        this.angle = Utils.damp(this.angle, this.ringTarget, this.options.ringSettle, safeDelta);
        this.paintRing();
        this.ringWait = 0;
        return;
      }
      if (this.angle !== this.ringTarget) {
        this.angle = this.ringTarget;
        this.paintRing();
        this.syncRingUi();
      }
      if (this.hoverPaused || this.options.ringInterval <= 0) {
        this.halt();
        return;
      }
      this.ringWait += safeDelta;
      if (this.ringWait >= this.options.ringInterval) {
        this.ringTarget -= this.ringStep;
        this.ringWait = 0;
      }
    }

    paintRing() {
      const count = this.slides.length;
      const edge = count / 2;
      for (let i = 0; i < count; i++) {
        let offset = this.angle / this.ringStep + i;
        offset -= Math.round(offset / count) * count;
        const distance = Math.abs(offset);
        const turn = -Utils.clamp(offset, -1, 1) * this.options.ringTilt;
        const x = offset * this.cardGapX;
        const z = -distance * this.cardDepth;
        const scale = 1 - Math.min(distance, 2.5) * this.options.ringScaleStep;
        const fade = Utils.clamp((edge - distance) * 2, 0, 1);
        this.slides[i].style.transform =
          'translateX(-50%) translate3d(' + x.toFixed(1) + 'px,0,' + z.toFixed(1) + 'px)' +
          ' rotateY(' + turn.toFixed(2) + 'deg) scale(' + scale.toFixed(3) + ')';
        this.slides[i].style.opacity = fade.toFixed(3);
        this.slides[i].style.zIndex = String(100 - Math.round(distance * 10));
      }
    }

    measure() {
      const viewportWidth = this.viewport.clientWidth;
      this.viewportWidth = viewportWidth;
      if (this.effect === 'ring') {
        const count = Math.max(this.slides.length, 1);
        const slideWidth = this.slides[0] ? this.slides[0].offsetWidth : 0;
        let maxHeight = 0;
        this.slides.forEach((slide) => {
          maxHeight = Math.max(maxHeight, slide.offsetHeight);
        });
        this.ringStep = 360 / count;
        this.cardGapX = this.options.ringRadius || Math.min(slideWidth * this.options.ringGap, viewportWidth * 0.3);
        this.cardDepth = Math.round(slideWidth * this.options.ringDepth);
        this.ringDragFactor = this.ringStep / Math.max(this.cardGapX, 60);
        this.track.style.transform = '';
        if (maxHeight) this.track.style.height = maxHeight + 'px';
        this.paintRing();
        return;
      }
      if (this.effect === 'fade') {
        this.maxX = 0;
        this.minX = -Math.max(this.slides.length - 1, 0) * viewportWidth;
        this.snapPoints = this.slides.map((slide, index) => -index * viewportWidth);
        return;
      }
      if (this.effect === 'coverflow') {
        this.slideMetrics = this.slides.map((slide) => ({
          center: slide.offsetLeft + slide.offsetWidth / 2,
          width: slide.offsetWidth || 1
        }));
        this.snapPoints = this.slideMetrics.map((metric) => viewportWidth / 2 - metric.center);
        this.maxX = this.snapPoints.length ? Math.max.apply(null, this.snapPoints) : 0;
        this.minX = this.snapPoints.length ? Math.min.apply(null, this.snapPoints) : 0;
        return;
      }
      const trackWidth = this.track.scrollWidth;
      this.minX = Math.min(viewportWidth - trackWidth, 0);
      this.maxX = 0;
      this.snapPoints = this.slides.map((slide) => Utils.clamp(-slide.offsetLeft, this.minX, this.maxX));
    }

    queueMeasure() {
      if (this.measureQueued) return;
      this.measureQueued = true;
      this.stopMeasure = Ticker.add(() => {
        this.stopMeasure();
        this.stopMeasure = null;
        this.measureQueued = false;
        this.measure();
        if (this.effect === 'ring') this.paintRing();
        else this.jumpTo(this.index);
      });
    }

    wrapIndex(index) {
      const count = this.slides.length;
      if (!count) return 0;
      if (this.options.loop) return ((index % count) + count) % count;
      return Utils.clamp(index, 0, count - 1);
    }

    prev() {
      this.go((this.effect === 'ring' ? this.ringIndex() : this.index) - 1);
    }

    next() {
      this.go((this.effect === 'ring' ? this.ringIndex() : this.index) + 1);
    }

    go(index) {
      if (this.effect === 'ring') {
        this.goRing(index);
        return;
      }
      this.index = this.wrapIndex(index);
      this.target = this.snapPoints[this.index] || 0;
      this.syncUi();
      if (Utils.reducedMotion) {
        this.x = this.target;
        this.paint();
        return;
      }
      this.run();
    }

    jumpTo(index) {
      if (this.effect === 'ring') {
        this.angle = -this.wrapIndex(index) * this.ringStep;
        this.ringTarget = this.angle;
        this.paintRing();
        this.syncRingUi();
        return;
      }
      this.index = this.wrapIndex(index);
      this.target = this.snapPoints[this.index] || 0;
      this.x = this.target;
      this.paint();
      this.syncUi();
    }

    syncUi() {
      if (this.dots) {
        this.dots.forEach((dot, index) => dot.classList.toggle('dx-carousel-dot--active', index === this.index));
      }
      if (this.prevBtn && !this.options.loop) {
        this.prevBtn.disabled = this.index === 0;
        this.nextBtn.disabled = this.index === this.slides.length - 1;
      }
      if (this.lastIndex !== this.index) {
        this.lastIndex = this.index;
        if (this.options.onChange) this.options.onChange(this.index, this);
      }
    }

    onDown(event) {
      if (this.slides.length < 2) return;
      this.viewport.setPointerCapture(event.pointerId);
      this.dragging = true;
      this.moved = false;
      this.grabX = event.clientX;
      this.startX = this.x;
      this.pendingX = event.clientX;
      this.velocity = 0;
      this.el.classList.add('dx-carousel--dragging');
      this.run();
    }

    onMove(event) {
      if (!this.dragging) return;
      this.pendingX = event.clientX;
      if (Math.abs(event.clientX - this.grabX) > this.options.dragThreshold) this.moved = true;
    }

    onUp(event) {
      if (!this.dragging) return;
      if (this.viewport.hasPointerCapture(event.pointerId)) this.viewport.releasePointerCapture(event.pointerId);
      this.dragging = false;
      this.el.classList.remove('dx-carousel--dragging');
      this.settle();
    }

    onClick(event) {
      if (!this.moved) return;
      event.preventDefault();
      event.stopPropagation();
      this.moved = false;
    }

    onKey(event) {
      if (event.key === 'ArrowLeft') this.go(this.index - 1);
      else if (event.key === 'ArrowRight') this.go(this.index + 1);
      else return;
      event.preventDefault();
    }

    settle() {
      const projected = this.x + this.velocity * 0.16;
      let nearest = 0;
      let nearestDistance = Infinity;
      this.snapPoints.forEach((point, index) => {
        const distance = Math.abs(point - projected);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearest = index;
        }
      });
      if (nearest === this.index && Math.abs(this.velocity) > 260) {
        nearest = this.wrapIndex(this.index + (this.velocity < 0 ? 1 : -1));
        if (!this.options.loop) nearest = Utils.clamp(nearest, 0, this.slides.length - 1);
      }
      this.index = nearest;
      this.target = this.snapPoints[this.index] || 0;
      this.syncUi();
      if (Utils.reducedMotion) {
        this.x = this.target;
        this.paint();
        this.halt();
        return;
      }
      this.run();
    }

    rubber(value) {
      if (value > this.maxX) return this.maxX + (value - this.maxX) * 0.28;
      if (value < this.minX) return this.minX + (value - this.minX) * 0.28;
      return value;
    }

    run() {
      if (this.stopFrames) return;
      this.stopFrames = Ticker.add((time, delta) => this.step(delta));
    }

    halt() {
      if (!this.stopFrames) return;
      this.stopFrames();
      this.stopFrames = null;
    }

    step(delta) {
      if (this.effect === 'ring') {
        this.stepRing(delta);
        return;
      }
      const safeDelta = Math.max(delta, 0.001);
      if (this.dragging) {
        if (this.pendingX === null) return;
        const desired = this.startX + (this.pendingX - this.grabX);
        const bounded = this.rubber(desired);
        this.velocity = (bounded - this.x) / safeDelta;
        this.x = bounded;
        this.paint();
        return;
      }
      this.x = Utils.damp(this.x, this.target, this.options.snapStrength, safeDelta);
      this.paint();
      if (Math.abs(this.target - this.x) < 0.4) {
        this.x = this.target;
        this.paint();
        this.halt();
      }
    }

    paint() {
      if (this.effect === 'fade') {
        this.paintFade();
        return;
      }
      this.track.style.transform = 'translate3d(' + this.x.toFixed(2) + 'px,0,0)';
      if (this.effect === 'coverflow') this.paintCoverflow();
    }

    paintCoverflow() {
      if (!this.slideMetrics) return;
      const half = this.viewportWidth / 2;
      for (let i = 0; i < this.slides.length; i++) {
        const metric = this.slideMetrics[i];
        const distance = (metric.center + this.x - half) / metric.width;
        const turn = Utils.clamp(distance, -1, 1);
        const depth = Math.min(Math.abs(distance), 2.5);
        this.slides[i].style.transform =
          'translateZ(' + (-this.options.coverflowDepth * depth).toFixed(1) + 'px)' +
          ' rotateY(' + (-this.options.coverflowRotate * turn).toFixed(2) + 'deg)';
        this.slides[i].style.zIndex = String(100 - Math.round(depth * 10));
      }
    }

    paintFade() {
      this.track.style.transform = '';
      const progress = this.viewportWidth ? -this.x / this.viewportWidth : 0;
      for (let i = 0; i < this.slides.length; i++) {
        const opacity = Utils.clamp(1 - Math.abs(progress - i), 0, 1);
        this.slides[i].style.opacity = opacity.toFixed(3);
        this.slides[i].style.zIndex = opacity > 0.5 ? '2' : '1';
      }
    }
  }

  return Carousel;
});
