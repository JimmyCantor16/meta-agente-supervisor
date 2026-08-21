Dixel.define('MasonryGrid', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class MasonryGrid extends Component {
    static defaults = {
      minWidth: 260,
      gap: null,
      stagger: 0.06,
      maxStagger: 0.7,
      items: []
    };

    build() {
      return Utils.el('div', 'dx-masonry');
    }

    ready() {
      this.el.classList.add('dx-masonry');
      if (!this.el.children.length && this.options.items.length) {
        this.options.items.forEach((html) => {
          const item = Utils.el('div', 'dx-masonry-card');
          item.innerHTML = html;
          this.el.appendChild(item);
        });
      }
      this.el.style.columnWidth = this.options.minWidth + 'px';
      if (this.options.gap) this.el.style.columnGap = this.options.gap;
      Array.from(this.el.children).forEach((child, index) => {
        child.classList.add('dx-masonry-item');
        child.style.transitionDelay = Math.min(index * this.options.stagger, this.options.maxStagger).toFixed(3) + 's';
      });
      if (Utils.reducedMotion) {
        this.el.classList.add('dx-masonry--in');
        return;
      }
      this.whenVisible((visible) => {
        if (visible) this.el.classList.add('dx-masonry--in');
      });
    }
  }

  return MasonryGrid;
});
