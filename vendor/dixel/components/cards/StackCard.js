Dixel.define('StackCard', ['Card', 'Motion', 'Utils'], function (Card, Motion, Utils) {
  'use strict';

  class StackCard extends Card {
    static defaults = Object.assign({}, Card.defaults, {
      items: [],
      offset: 16,
      scaleStep: 0.05,
      height: 240
    });

    build() {
      const el = Utils.el('div', 'dx-stack');
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      return this.options.items
        .map((item) => '<article class="dx-card dx-stack-item">' + item + '</article>')
        .join('');
    }

    ready() {
      this.el.classList.add('dx-stack');
      if (!this.el.children.length && this.options.items.length) this.el.innerHTML = this.markup();
      this.order = Array.from(this.el.children);
      this.order.forEach((child) => child.classList.add('dx-stack-item'));
      this.el.style.minHeight = this.options.height + this.options.offset * 2 + 'px';
      this.animating = false;
      this.width = this.el.clientWidth || 320;
      this.el.setAttribute('role', 'group');
      this.el.setAttribute('aria-label', 'Pila de tarjetas');
      this.el.setAttribute('tabindex', '0');
      this.el.classList.add('dx-focusable');
      this.listen(window, 'resize', () => {
        this.width = this.el.clientWidth || this.width;
      });
      this.listen(this.el, 'click', this.advance);
      this.listen(this.el, 'keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        this.advance();
      });
      this.applySlots(true);
    }

    slotValues(index) {
      return {
        x: 0,
        y: index * this.options.offset,
        rotate: 0,
        scale: 1 - index * this.options.scaleStep,
        opacity: index > 2 ? 0 : 1 - index * 0.12
      };
    }

    refreshDepth() {
      this.order.forEach((child, index) => {
        child.style.zIndex = this.order.length - index;
        child.classList.toggle('is-top', index === 0);
      });
    }

    applySlots(immediate) {
      this.refreshDepth();
      this.order.forEach((child, index) => {
        const values = this.slotValues(index);
        if (immediate) Motion.set(child, values);
        else Motion.to(child, Object.assign({ duration: 0.5, ease: 'outQuart' }, values));
      });
    }

    advance() {
      if (this.animating || this.order.length < 2) return;
      this.animating = true;
      const moved = this.order.shift();
      this.order.push(moved);
      if (Utils.reducedMotion) {
        this.applySlots(true);
        this.animating = false;
        return;
      }
      this.order.slice(0, -1).forEach((child, index) => {
        Motion.to(child, Object.assign({ duration: 0.5, ease: 'outQuart' }, this.slotValues(index)));
      });
      const lastSlot = this.slotValues(this.order.length - 1);
      Motion.to(moved, {
        x: this.width * 0.75,
        rotate: 9,
        opacity: 0,
        duration: 0.38,
        ease: 'outQuart',
        onComplete: () => {
          Motion.set(moved, Object.assign({}, lastSlot, { opacity: 0 }));
          this.refreshDepth();
          Motion.to(moved, { opacity: lastSlot.opacity, duration: 0.3 });
          this.animating = false;
        }
      });
    }
  }

  return StackCard;
});
