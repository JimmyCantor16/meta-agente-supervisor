Dixel.define('CompareSlider', ['Component', 'Utils', 'Ticker'], function (Component, Utils, Ticker) {
  'use strict';

  class CompareSlider extends Component {
    static defaults = {
      start: 0.5,
      labelBefore: null,
      labelAfter: null,
      step: 0.03,
      before: null,
      after: null
    };

    build() {
      return Utils.el('div', 'dx-compare');
    }

    ready() {
      this.el.classList.add('dx-compare');
      if (!this.el.children.length && (this.options.before || this.options.after)) {
        const beforePane = Utils.el('div', 'dx-compare-panel dx-compare-panel--before');
        beforePane.innerHTML = this.options.before || '';
        const afterPane = Utils.el('div', 'dx-compare-panel dx-compare-panel--after');
        afterPane.innerHTML = this.options.after || '';
        this.el.appendChild(beforePane);
        this.el.appendChild(afterPane);
      }
      const layers = Array.from(this.el.children);
      if (layers[0]) layers[0].classList.add('dx-compare-before');
      this.after = Utils.el('div', 'dx-compare-after');
      if (layers[1]) this.after.appendChild(layers[1]);
      this.el.appendChild(this.after);
      this.handle = Utils.el('div', 'dx-compare-handle dx-focusable', {
        role: 'slider',
        tabindex: '0',
        'aria-label': 'Comparar',
        'aria-valuemin': '0',
        'aria-valuemax': '100'
      });
      this.handle.innerHTML =
        '<span class="dx-compare-grip" aria-hidden="true">' +
        '<svg viewBox="0 0 14 10"><path d="M5 1 1 5l4 4M9 1l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        '</span>';
      this.el.appendChild(this.handle);
      if (this.options.labelBefore) this.el.appendChild(Utils.el('span', 'dx-compare-label dx-compare-label--before', { text: this.options.labelBefore }));
      if (this.options.labelAfter) this.el.appendChild(Utils.el('span', 'dx-compare-label dx-compare-label--after', { text: this.options.labelAfter }));
      this.fraction = Utils.clamp(this.options.start, 0, 1);
      this.width = 0;
      this.left = 0;
      this.pendingX = null;
      this.stopFrames = null;
      this.measureQueued = false;
      this.measure();
      this.apply();
      this.listen(window, 'resize', () => this.queueMeasure());
      this.listen(window, 'load', () => this.queueMeasure());
      this.listen(this.el, 'pointerdown', this.onDown);
      this.listen(this.el, 'pointermove', this.onMove);
      this.listen(this.el, 'pointerup', this.onUp);
      this.listen(this.el, 'pointercancel', this.onUp);
      this.listen(this.handle, 'keydown', this.onKey);
      this.addCleanup(() => this.halt());
    }

    measure() {
      const rect = this.el.getBoundingClientRect();
      this.width = rect.width || 1;
      this.left = rect.left;
    }

    queueMeasure() {
      if (this.measureQueued) return;
      this.measureQueued = true;
      if (!this.stopMeasureRegistered) {
        this.stopMeasureRegistered = true;
        this.addCleanup(() => {
          if (this.stopMeasure) this.stopMeasure();
        });
      }
      this.stopMeasure = Ticker.add(() => {
        this.stopMeasure();
        this.stopMeasure = null;
        this.measureQueued = false;
        this.measure();
        this.apply();
      });
    }

    onDown(event) {
      event.preventDefault();
      this.el.setPointerCapture(event.pointerId);
      this.el.classList.add('dx-compare--dragging');
      this.measure();
      this.pendingX = event.clientX;
      this.run();
    }

    onMove(event) {
      if (!this.stopFrames) return;
      this.pendingX = event.clientX;
    }

    onUp(event) {
      if (this.el.hasPointerCapture(event.pointerId)) this.el.releasePointerCapture(event.pointerId);
      this.el.classList.remove('dx-compare--dragging');
      this.halt();
    }

    onKey(event) {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') this.setFraction(this.fraction - this.options.step);
      else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') this.setFraction(this.fraction + this.options.step);
      else if (event.key === 'Home') this.setFraction(0);
      else if (event.key === 'End') this.setFraction(1);
      else return;
      event.preventDefault();
    }

    run() {
      if (this.stopFrames) return;
      this.stopFrames = Ticker.add(() => {
        if (this.pendingX === null) return;
        const fraction = (this.pendingX - this.left) / this.width;
        this.pendingX = null;
        this.setFraction(fraction);
      });
    }

    halt() {
      if (!this.stopFrames) return;
      this.stopFrames();
      this.stopFrames = null;
    }

    setFraction(fraction) {
      const next = Utils.clamp(fraction, 0, 1);
      if (next === this.fraction) return;
      this.fraction = next;
      this.apply();
    }

    apply() {
      this.after.style.clipPath = 'inset(0 ' + ((1 - this.fraction) * 100).toFixed(3) + '% 0 0)';
      this.handle.style.transform = 'translate3d(' + (this.fraction * this.width).toFixed(2) + 'px,0,0)';
      this.handle.setAttribute('aria-valuenow', String(Math.round(this.fraction * 100)));
    }
  }

  return CompareSlider;
});
