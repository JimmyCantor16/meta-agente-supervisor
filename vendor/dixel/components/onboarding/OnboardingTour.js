Dixel.define('OnboardingTour', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const focusableSelector = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

  class OnboardingTour extends Component {
    static defaults = {
      steps: [],
      padding: 10,
      launcherLabel: 'Iniciar recorrido',
      prevLabel: 'Anterior',
      nextLabel: 'Siguiente',
      doneLabel: 'Terminar',
      skipLabel: 'Saltar',
      onStep: null,
      onFinish: null,
      onSkip: null
    };

    build() {
      const el = Utils.el('button', 'dx-tour-launcher dx-focusable', { type: 'button' });
      el.innerHTML = '<span class="dx-tour-launcher-dot" aria-hidden="true"></span><span>' + Utils.escape(this.options.launcherLabel) + '</span>';
      return el;
    }

    ready() {
      this.el.classList.add('dx-tour-launcher', 'dx-focusable');
      this.steps = this.options.steps || [];
      this.index = 0;
      this.isOpen = false;
      this.lastFocus = null;
      this.unbindKeys = null;
      this.viewW = 0;
      this.viewH = 0;
      this.layer = this.buildLayer();
      document.body.appendChild(this.layer);
      this.pieces = ['top', 'bottom', 'left', 'right'].map((side) => this.layer.querySelector('.dx-tour-veil--' + side));
      this.ring = this.layer.querySelector('.dx-tour-ring');
      this.card = this.layer.querySelector('.dx-tour-card');
      this.titleEl = this.layer.querySelector('.dx-tour-title');
      this.textEl = this.layer.querySelector('.dx-tour-text');
      this.countEl = this.layer.querySelector('.dx-tour-count');
      this.dotsEl = this.layer.querySelector('.dx-tour-dots');
      this.prevBtn = this.layer.querySelector('.dx-tour-prev');
      this.nextBtn = this.layer.querySelector('.dx-tour-next');
      this.skipBtn = this.layer.querySelector('.dx-tour-skip');
      this.listen(this.el, 'click', () => this.start());
      this.listen(this.prevBtn, 'click', () => this.prev());
      this.listen(this.nextBtn, 'click', () => this.next());
      this.listen(this.skipBtn, 'click', () => this.finish(true));
      this.listen(this.layer, 'wheel', (event) => event.preventDefault(), { passive: false });
      this.listen(this.layer, 'touchmove', (event) => event.preventDefault(), { passive: false });
      this.listen(window, 'resize', () => {
        if (this.isOpen) this.showStep(this.index, false);
      });
      this.addCleanup(() => {
        this.releaseKeys();
        this.layer.remove();
      });
    }

    buildLayer() {
      const layer = Utils.el('div', 'dx-tour dx-reset', { 'aria-hidden': 'true' });
      const titleId = Utils.uid();
      const veils = ['top', 'bottom', 'left', 'right'].map((side) => '<div class="dx-tour-veil dx-tour-veil--' + side + '"></div>').join('');
      const dots = (this.options.steps || []).map(() => '<span class="dx-tour-dot"></span>').join('');
      layer.innerHTML = veils +
        '<div class="dx-tour-ring" aria-hidden="true"></div>' +
        '<div class="dx-tour-card" role="dialog" aria-modal="true" aria-labelledby="' + titleId + '" tabindex="-1">' +
        '<div class="dx-tour-head"><span class="dx-tour-count"></span>' +
        '<button class="dx-tour-skip dx-focusable" type="button">' + Utils.escape(this.options.skipLabel) + '</button></div>' +
        '<h3 class="dx-tour-title dx-text-balance" id="' + titleId + '"></h3>' +
        '<p class="dx-tour-text"></p>' +
        '<div class="dx-tour-foot"><div class="dx-tour-dots" aria-hidden="true">' + dots + '</div>' +
        '<div class="dx-tour-nav">' +
        '<button class="dx-tour-btn dx-tour-prev dx-focusable" type="button">' + Utils.escape(this.options.prevLabel) + '</button>' +
        '<button class="dx-tour-btn dx-tour-btn--primary dx-tour-next dx-focusable" type="button">' + Utils.escape(this.options.nextLabel) + '</button>' +
        '</div></div></div>';
      return layer;
    }

    measureView() {
      this.viewW = window.innerWidth;
      this.viewH = window.innerHeight;
    }

    start(startIndex) {
      if (this.isOpen || !this.steps.length) return;
      this.isOpen = true;
      this.lastFocus = document.activeElement;
      this.measureView();
      this.layer.classList.add('is-open');
      this.layer.setAttribute('aria-hidden', 'false');
      Motion.set(this.pieces[0], { x: 0, y: 0, scaleX: 1, scaleY: 1 });
      Motion.set(this.pieces[1], { x: 0, y: this.viewH, scaleX: 1, scaleY: 0 });
      Motion.set(this.pieces[2], { x: 0, y: 0, scaleX: 0, scaleY: 0 });
      Motion.set(this.pieces[3], { x: this.viewW, y: 0, scaleX: 0, scaleY: 0 });
      Motion.set(this.ring, { opacity: 0 });
      Motion.set(this.card, { opacity: 0 });
      this.unbindKeys = Utils.on(document, 'keydown', (event) => this.onKey(event));
      this.showStep(startIndex || 0, true);
    }

    onKey(event) {
      if (event.key === 'Escape') this.finish(true);
      else if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.next();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.prev();
      } else if (event.key === 'Tab') this.trapFocus(event);
    }

    showStep(index, entering) {
      const step = this.steps[index];
      if (!step) return;
      this.index = index;
      this.measureView();
      const target = this.resolveTarget(step.target);
      if (target) this.bringIntoView(target);
      const box = this.focusBox(target);
      this.moveVeil(box);
      this.moveRing(box, !!target);
      this.fillCard(step, index);
      this.placeCard(box, step.placement || 'bottom', entering, !!target);
      if (this.options.onStep) this.options.onStep(index, step);
    }

    resolveTarget(target) {
      if (!target) return null;
      if (target instanceof Element) return target;
      return document.querySelector(target);
    }

    bringIntoView(target) {
      const rect = target.getBoundingClientRect();
      if (rect.top < 72 || rect.bottom > this.viewH - 72) {
        target.scrollIntoView({ block: 'center', inline: 'nearest' });
      }
    }

    focusBox(target) {
      if (!target) {
        const cx = Math.round(this.viewW / 2);
        const cy = Math.round(this.viewH / 2);
        return { left: cx, top: cy, right: cx, bottom: cy };
      }
      const rect = target.getBoundingClientRect();
      const pad = this.options.padding;
      return {
        left: Math.round(Utils.clamp(rect.left - pad, 0, this.viewW)),
        top: Math.round(Utils.clamp(rect.top - pad, 0, this.viewH)),
        right: Math.round(Utils.clamp(rect.right + pad, 0, this.viewW)),
        bottom: Math.round(Utils.clamp(rect.bottom + pad, 0, this.viewH))
      };
    }

    moveVeil(box) {
      const w = this.viewW;
      const h = this.viewH;
      const bandY = (box.bottom - box.top) / h;
      const move = { duration: 0.55, ease: 'inOut' };
      Motion.to(this.pieces[0], Object.assign({ x: 0, y: 0, scaleX: 1, scaleY: box.top / h }, move));
      Motion.to(this.pieces[1], Object.assign({ x: 0, y: box.bottom, scaleX: 1, scaleY: (h - box.bottom) / h }, move));
      Motion.to(this.pieces[2], Object.assign({ x: 0, y: box.top, scaleX: box.left / w, scaleY: bandY }, move));
      Motion.to(this.pieces[3], Object.assign({ x: box.right, y: box.top, scaleX: (w - box.right) / w, scaleY: bandY }, move));
    }

    moveRing(box, hasTarget) {
      if (!hasTarget) {
        Motion.to(this.ring, { opacity: 0, duration: 0.15 });
        return;
      }
      const ring = this.ring;
      Motion.to(ring, {
        opacity: 0,
        duration: 0.16,
        onComplete: () => {
          ring.style.left = box.left + 'px';
          ring.style.top = box.top + 'px';
          ring.style.width = (box.right - box.left) + 'px';
          ring.style.height = (box.bottom - box.top) + 'px';
          Motion.to(ring, { opacity: 1, duration: 0.3 });
        }
      });
    }

    fillCard(step, index) {
      const last = index === this.steps.length - 1;
      this.countEl.textContent = (index + 1) + ' de ' + this.steps.length;
      this.titleEl.innerHTML = step.title ? Utils.escape(step.title) : '';
      this.textEl.innerHTML = step.text || '';
      this.prevBtn.disabled = index === 0;
      this.nextBtn.textContent = last ? this.options.doneLabel : this.options.nextLabel;
      Array.from(this.dotsEl.children).forEach((dot, i) => {
        dot.classList.toggle('is-active', i === index);
        dot.classList.toggle('is-done', i < index);
      });
    }

    placeCard(box, placement, entering, hasTarget) {
      const mobile = this.viewW < 640;
      this.card.classList.toggle('dx-tour-card--sheet', mobile);
      const cardW = this.card.offsetWidth;
      const cardH = this.card.offsetHeight;
      let x = 0;
      let y = 0;
      if (!mobile) {
        const pos = this.cardPosition(box, hasTarget ? placement : 'center', cardW, cardH);
        x = pos.x;
        y = pos.y;
      }
      if (entering) {
        Motion.fromTo(this.card, { x, y: y + 14, opacity: 0 }, { x, y, opacity: 1, duration: 0.45, ease: 'out' });
      } else {
        Motion.to(this.card, { x, y, opacity: 1, duration: 0.5, ease: 'inOut' });
      }
      this.card.focus({ preventScroll: true });
    }

    cardPosition(box, placement, cardW, cardH) {
      const edge = 12;
      const gap = 16;
      const maxX = this.viewW - cardW - edge;
      const maxY = this.viewH - cardH - edge;
      const centerX = (box.left + box.right) / 2;
      const centerY = (box.top + box.bottom) / 2;
      let side = placement;
      if (side === 'bottom' && box.bottom + gap + cardH > this.viewH - edge) side = 'top';
      if (side === 'top' && box.top - gap - cardH < edge) side = 'bottom';
      if (side === 'right' && box.right + gap + cardW > this.viewW - edge) side = 'left';
      if (side === 'left' && box.left - gap - cardW < edge) side = 'right';
      if (side === 'center') return { x: Utils.clamp((this.viewW - cardW) / 2, edge, maxX), y: Utils.clamp((this.viewH - cardH) / 2, edge, maxY) };
      if (side === 'top') return { x: Utils.clamp(centerX - cardW / 2, edge, maxX), y: Utils.clamp(box.top - gap - cardH, edge, maxY) };
      if (side === 'left') return { x: Utils.clamp(box.left - gap - cardW, edge, maxX), y: Utils.clamp(centerY - cardH / 2, edge, maxY) };
      if (side === 'right') return { x: Utils.clamp(box.right + gap, edge, maxX), y: Utils.clamp(centerY - cardH / 2, edge, maxY) };
      return { x: Utils.clamp(centerX - cardW / 2, edge, maxX), y: Utils.clamp(box.bottom + gap, edge, maxY) };
    }

    next() {
      if (!this.isOpen) return;
      if (this.index >= this.steps.length - 1) this.finish(false);
      else this.showStep(this.index + 1, false);
    }

    prev() {
      if (!this.isOpen || this.index === 0) return;
      this.showStep(this.index - 1, false);
    }

    goTo(index) {
      if (this.isOpen) this.showStep(Utils.clamp(index, 0, this.steps.length - 1), false);
      else this.start(index);
    }

    finish(skipped) {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.layer.classList.remove('is-open');
      this.layer.setAttribute('aria-hidden', 'true');
      this.releaseKeys();
      if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus();
      if (skipped && this.options.onSkip) this.options.onSkip(this.index);
      if (!skipped && this.options.onFinish) this.options.onFinish();
    }

    trapFocus(event) {
      const focusables = Array.from(this.card.querySelectorAll(focusableSelector));
      if (!focusables.length) {
        event.preventDefault();
        this.card.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === this.card)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!this.card.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    }

    releaseKeys() {
      if (this.unbindKeys) {
        this.unbindKeys();
        this.unbindKeys = null;
      }
    }
  }

  return OnboardingTour;
});
