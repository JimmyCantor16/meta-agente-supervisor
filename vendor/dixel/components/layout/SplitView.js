Dixel.define('SplitView', ['Component', 'Utils', 'Ticker'], function (Component, Utils, Ticker) {
  'use strict';

  const HANDLE_STYLES = ['pill', 'line', 'dots', 'chevrons'];
  const chevron = '<svg viewBox="0 0 8 14" aria-hidden="true"><path d="M7 1 1 7l6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  class SplitView extends Component {
    static defaults = {
      start: 0.5,
      min: 0.2,
      max: 0.8,
      step: 0.03,
      orientation: 'horizontal',
      handleStyle: 'pill',
      panes: []
    };

    build() {
      const el = Utils.el('div', 'dx-splitview');
      for (let i = 0; i < 2; i++) {
        const pane = Utils.el('div');
        if (this.options.panes[i]) {
          pane.classList.add('dx-splitview-pane--pad');
          pane.innerHTML = this.options.panes[i];
        }
        el.appendChild(pane);
      }
      return el;
    }

    ready() {
      this.horizontal = this.options.orientation !== 'vertical';
      this.el.classList.add('dx-splitview', this.horizontal ? 'dx-splitview--h' : 'dx-splitview--v');
      const panes = Array.from(this.el.children);
      panes.forEach((pane) => pane.classList.add('dx-splitview-pane'));
      const handleStyle = HANDLE_STYLES.indexOf(this.options.handleStyle) === -1 ? 'pill' : this.options.handleStyle;
      this.handle = Utils.el('div', 'dx-splitview-handle dx-splitview-handle--' + handleStyle + ' dx-focusable', {
        role: 'separator',
        'aria-orientation': this.horizontal ? 'vertical' : 'horizontal',
        tabindex: '0',
        'aria-valuemin': String(Math.round(this.options.min * 100)),
        'aria-valuemax': String(Math.round(this.options.max * 100))
      });
      const grip = Utils.el('span', 'dx-splitview-grip', { 'aria-hidden': 'true' });
      if (handleStyle === 'chevrons') {
        grip.innerHTML = '<span class="dx-splitview-chev dx-splitview-chev--prev">' + chevron + '</span>' +
          '<span class="dx-splitview-chev dx-splitview-chev--next">' + chevron + '</span>';
      }
      this.handle.appendChild(grip);
      if (panes[1]) this.el.insertBefore(this.handle, panes[1]);
      else this.el.appendChild(this.handle);
      this.fraction = Utils.clamp(this.options.start, this.options.min, this.options.max);
      this.pending = null;
      this.bounds = null;
      this.stopFrames = null;
      this.apply();
      this.listen(this.handle, 'pointerdown', this.onDown);
      this.listen(this.handle, 'pointermove', this.onMove);
      this.listen(this.handle, 'pointerup', this.onUp);
      this.listen(this.handle, 'pointercancel', this.onUp);
      this.listen(this.handle, 'keydown', this.onKey);
      this.addCleanup(() => this.halt());
    }

    pointerPosition(event) {
      return this.horizontal ? event.clientX : event.clientY;
    }

    onDown(event) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      this.handle.setPointerCapture(event.pointerId);
      this.bounds = this.el.getBoundingClientRect();
      this.el.classList.add('dx-splitview--dragging');
      this.pending = this.pointerPosition(event);
      this.run();
    }

    onMove(event) {
      if (this.bounds === null) return;
      this.pending = this.pointerPosition(event);
    }

    onUp(event) {
      if (this.bounds === null) return;
      if (this.handle.hasPointerCapture(event.pointerId)) this.handle.releasePointerCapture(event.pointerId);
      this.bounds = null;
      this.el.classList.remove('dx-splitview--dragging');
      this.halt();
    }

    onKey(event) {
      const step = this.options.step;
      const decrease = this.horizontal ? 'ArrowLeft' : 'ArrowUp';
      const increase = this.horizontal ? 'ArrowRight' : 'ArrowDown';
      if (event.key === decrease) this.setFraction(this.fraction - step);
      else if (event.key === increase) this.setFraction(this.fraction + step);
      else if (event.key === 'Home') this.setFraction(this.options.min);
      else if (event.key === 'End') this.setFraction(this.options.max);
      else return;
      event.preventDefault();
    }

    run() {
      if (this.stopFrames) return;
      this.stopFrames = Ticker.add(() => {
        if (this.pending === null || !this.bounds) return;
        const fraction = this.horizontal
          ? (this.pending - this.bounds.left) / (this.bounds.width || 1)
          : (this.pending - this.bounds.top) / (this.bounds.height || 1);
        this.pending = null;
        this.setFraction(fraction);
      });
    }

    halt() {
      if (!this.stopFrames) return;
      this.stopFrames();
      this.stopFrames = null;
    }

    setFraction(fraction) {
      const next = Utils.clamp(fraction, this.options.min, this.options.max);
      if (next === this.fraction) return;
      this.fraction = next;
      this.apply();
    }

    apply() {
      const template = this.fraction.toFixed(4) + 'fr auto ' + (1 - this.fraction).toFixed(4) + 'fr';
      if (this.horizontal) this.el.style.gridTemplateColumns = template;
      else this.el.style.gridTemplateRows = template;
      this.handle.setAttribute('aria-valuenow', String(Math.round(this.fraction * 100)));
    }
  }

  return SplitView;
});
