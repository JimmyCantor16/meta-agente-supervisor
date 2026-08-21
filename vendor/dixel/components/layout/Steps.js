Dixel.define('Steps', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class Steps extends Component {
    static defaults = {
      steps: [],
      current: 0,
      stagger: 0.14,
      colors: null
    };

    colorFor(index) {
      if (!this.options.colors || !this.options.colors.length) return null;
      const token = this.options.colors[index % this.options.colors.length];
      return token.indexOf('#') === 0 || token.indexOf('rgb') === 0 ? token : 'var(--dx-' + token + ')';
    }

    build() {
      return Utils.el('ol', 'dx-steps');
    }

    ready() {
      this.el.classList.add('dx-steps');
      if (this.options.steps.length && !this.el.querySelector('.dx-steps-item')) this.render();
      this.items = Array.from(this.el.querySelectorAll('.dx-steps-item'));
      this.current = Utils.clamp(this.options.current, 0, Math.max(this.items.length - 1, 0));
      this.applyState();
      this.whenVisible((visible) => {
        if (visible) this.el.classList.add('dx-steps--in');
      });
    }

    render() {
      this.options.steps.forEach((label, index) => {
        const item = Utils.el('li', 'dx-steps-item');
        const stepColor = this.colorFor(index);
        if (stepColor) item.style.setProperty('--dx-step-color', stepColor);
        if (index > 0) {
          const connector = Utils.el('span', 'dx-steps-connector', { 'aria-hidden': 'true' });
          const fill = Utils.el('span', 'dx-steps-connector-fill');
          fill.style.transitionDelay = (index * this.options.stagger).toFixed(3) + 's';
          connector.appendChild(fill);
          item.appendChild(connector);
        }
        const dot = Utils.el('span', 'dx-steps-dot');
        dot.style.transitionDelay = (index * this.options.stagger).toFixed(3) + 's';
        dot.appendChild(Utils.el('span', 'dx-steps-num', { text: String(index + 1) }));
        const check = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        check.setAttribute('viewBox', '0 0 12 10');
        check.setAttribute('class', 'dx-steps-check');
        check.setAttribute('aria-hidden', 'true');
        check.innerHTML = '<path d="M1 5.5 4.5 9 11 1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
        dot.appendChild(check);
        item.appendChild(dot);
        item.appendChild(Utils.el('span', 'dx-steps-label', { text: label }));
        this.el.appendChild(item);
      });
    }

    applyState() {
      this.items.forEach((item, index) => {
        item.classList.toggle('dx-steps-item--done', index < this.current);
        item.classList.toggle('dx-steps-item--active', index === this.current);
        item.classList.toggle('dx-steps-item--reached', index <= this.current);
      });
    }

    go(index) {
      this.clearStagger();
      this.current = Utils.clamp(index, 0, this.items.length - 1);
      this.applyState();
    }

    clearStagger() {
      if (this.staggerCleared) return;
      this.staggerCleared = true;
      this.el.querySelectorAll('.dx-steps-dot, .dx-steps-connector-fill').forEach((node) => {
        node.style.transitionDelay = '0s';
      });
    }

    next() {
      this.go(this.current + 1);
    }

    prev() {
      this.go(this.current - 1);
    }
  }

  return Steps;
});
