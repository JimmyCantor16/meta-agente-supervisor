Dixel.define('Accordion', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class Accordion extends Component {
    static defaults = {
      items: [],
      multiple: false,
      stagger: 0.07
    };

    build() {
      return Utils.el('div', 'dx-acc');
    }

    ready() {
      this.el.classList.add('dx-acc');
      if (this.options.items.length && !this.el.querySelector('.dx-acc-item')) this.render();
      Array.from(this.el.querySelectorAll('.dx-acc-inner')).forEach((inner) => {
        if (inner.querySelector('.dx-acc-content')) return;
        const content = Utils.el('div', 'dx-acc-content');
        while (inner.firstChild) content.appendChild(inner.firstChild);
        inner.appendChild(content);
      });
      this.items = Array.from(this.el.querySelectorAll('.dx-acc-item'));
      this.items.forEach((item, index) => {
        item.style.transitionDelay = (index * this.options.stagger).toFixed(3) + 's';
        const head = item.querySelector('.dx-acc-head');
        if (head) this.listen(head, 'click', () => this.toggle(item));
      });
      this.whenVisible((visible) => {
        if (visible) this.el.classList.add('dx-acc--in');
      });
    }

    render() {
      this.options.items.forEach((data) => {
        const item = Utils.el('div', 'dx-acc-item' + (data.open ? ' dx-acc-item--open' : ''));
        const head = Utils.el('button', 'dx-acc-head dx-focusable', {
          type: 'button',
          'aria-expanded': data.open ? 'true' : 'false'
        });
        head.appendChild(Utils.el('span', 'dx-acc-title', { text: data.title }));
        const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        chevron.setAttribute('viewBox', '0 0 14 8');
        chevron.setAttribute('class', 'dx-acc-chevron');
        chevron.setAttribute('aria-hidden', 'true');
        chevron.innerHTML = '<path d="M1 1l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
        head.appendChild(chevron);
        const body = Utils.el('div', 'dx-acc-body');
        const inner = Utils.el('div', 'dx-acc-inner');
        const content = Utils.el('div', 'dx-acc-content');
        content.innerHTML = data.content || '';
        inner.appendChild(content);
        body.appendChild(inner);
        item.appendChild(head);
        item.appendChild(body);
        this.el.appendChild(item);
      });
    }

    toggle(item) {
      const willOpen = !item.classList.contains('dx-acc-item--open');
      if (willOpen && !this.options.multiple) {
        this.items.forEach((other) => {
          if (other !== item) this.setOpen(other, false);
        });
      }
      this.setOpen(item, willOpen);
    }

    setOpen(item, open) {
      item.classList.toggle('dx-acc-item--open', open);
      const head = item.querySelector('.dx-acc-head');
      if (head) head.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
  }

  return Accordion;
});
