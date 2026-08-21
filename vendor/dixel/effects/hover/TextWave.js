Dixel.define('TextWave', ['Component', 'Pointer', 'Utils'], function (Component, Pointer, Utils) {
  'use strict';

  class TextWave extends Component {
    static defaults = { amplitude: 14, radius: 90, lag: 13 };

    ready() {
      if (Utils.isTouch || Utils.reducedMotion) return;
      this.el.classList.add('dx-textwave');
      this.chars = [];
      this.split();
      this.measure();
      this.rectLeft = 0;
      this.hovering = false;
      this.active = false;
      this.listen(window, 'resize', this.measure);
      this.listen(window, 'load', this.measure);
      this.listen(this.el, 'pointerenter', this.enter);
      this.listen(this.el, 'pointerleave', this.leave);
      this.onFrame(this.update);
    }

    split() {
      const text = this.el.textContent;
      this.el.textContent = '';
      const fragment = document.createDocumentFragment();
      for (const char of text) {
        const span = Utils.el('span', 'dx-textwave-char');
        span.textContent = char;
        fragment.appendChild(span);
        this.chars.push({ span, center: 0, y: 0 });
      }
      this.el.appendChild(fragment);
    }

    measure() {
      const base = this.el.getBoundingClientRect().left;
      for (let i = 0; i < this.chars.length; i++) {
        const rect = this.chars[i].span.getBoundingClientRect();
        this.chars[i].center = rect.left - base + rect.width / 2;
      }
    }

    enter() {
      this.rectLeft = this.el.getBoundingClientRect().left;
      this.hovering = true;
      this.active = true;
    }

    leave() {
      this.hovering = false;
    }

    update(time, delta) {
      if (!this.active) return;
      const pointerX = Pointer.x - this.rectLeft;
      const sigma = this.options.radius;
      let moving = false;
      for (let i = 0; i < this.chars.length; i++) {
        const char = this.chars[i];
        let target = 0;
        if (this.hovering) {
          const distance = (pointerX - char.center) / sigma;
          target = -this.options.amplitude * Math.exp(-distance * distance);
        }
        char.y = Utils.damp(char.y, target, this.options.lag, delta);
        if (Math.abs(char.y - target) > 0.04 || target !== 0) moving = true;
        char.span.style.transform = char.y ? 'translate3d(0,' + char.y + 'px,0)' : '';
      }
      if (!this.hovering && !moving) {
        for (let i = 0; i < this.chars.length; i++) {
          this.chars[i].y = 0;
          this.chars[i].span.style.transform = '';
        }
        this.active = false;
      }
    }
  }

  return TextWave;
});
