Dixel.define('Timeline', ['Component', 'Utils', 'ScrollWatch'], function (Component, Utils, ScrollWatch) {
  'use strict';

  class Timeline extends Component {
    static defaults = {
      items: []
    };

    build() {
      return Utils.el('div', 'dx-timeline');
    }

    ready() {
      this.el.classList.add('dx-timeline');
      if (this.options.items.length && !this.el.querySelector('.dx-timeline-item')) this.render();
      this.fill = this.el.querySelector('.dx-timeline-fill');
      this.items = Array.from(this.el.querySelectorAll('.dx-timeline-item'));
      this.ratios = [];
      this.measure();
      this.listen(window, 'resize', () => this.measure());
      if (Utils.reducedMotion) {
        if (this.fill) this.fill.style.transform = 'scaleY(1)';
        this.items.forEach((item) => item.classList.add('dx-timeline-item--lit'));
        return;
      }
      this.addCleanup(ScrollWatch.watch(this.el, {
        progress: (progress) => this.paint(progress)
      }));
    }

    render() {
      const rail = Utils.el('div', 'dx-timeline-rail', { 'aria-hidden': 'true' });
      rail.appendChild(Utils.el('div', 'dx-timeline-fill'));
      this.el.appendChild(rail);
      const list = Utils.el('ol', 'dx-timeline-list');
      this.options.items.forEach((data) => {
        const item = Utils.el('li', 'dx-timeline-item');
        item.appendChild(Utils.el('span', 'dx-timeline-node', { 'aria-hidden': 'true' }));
        const card = Utils.el('div', 'dx-timeline-card');
        if (data.date) card.appendChild(Utils.el('span', 'dx-timeline-date', { text: data.date }));
        if (data.title) card.appendChild(Utils.el('h4', 'dx-timeline-title', { text: data.title }));
        if (data.text) card.appendChild(Utils.el('p', 'dx-timeline-text', { text: data.text }));
        item.appendChild(card);
        list.appendChild(item);
      });
      this.el.appendChild(list);
    }

    measure() {
      const total = this.el.offsetHeight || 1;
      this.ratios = this.items.map((item) => (item.offsetTop + 14) / total);
    }

    paint(progress) {
      if (this.fill) this.fill.style.transform = 'scaleY(' + progress.toFixed(4) + ')';
      for (let i = 0; i < this.items.length; i++) {
        this.items[i].classList.toggle('dx-timeline-item--lit', this.ratios[i] <= progress);
      }
    }
  }

  return Timeline;
});
