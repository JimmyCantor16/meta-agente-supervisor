Dixel.define('Card', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class Card extends Component {
    static defaults = {
      variant: 'surface',
      padding: 'md',
      hover: true,
      media: null,
      title: null,
      body: null,
      footer: null
    };

    build() {
      return Utils.el('article', this.classNames());
    }

    classNames() {
      let names = 'dx-card dx-card--' + this.options.variant + ' dx-card--pad-' + this.options.padding;
      if (this.options.hover) names += ' dx-card--hover';
      return names;
    }

    ready() {
      if (!this.el.classList.contains('dx-card')) {
        this.el.className += (this.el.className ? ' ' : '') + this.classNames();
      }
      if (this.el.children.length && !this.el.querySelector('.dx-card-body')) return;
      if (this.options.media) {
        this.slots.media = this.el.querySelector('.dx-card-media') || Utils.el('div', 'dx-card-media');
        if (!this.slots.media.parentNode) this.el.appendChild(this.slots.media);
        Component.applyContent(this.options.media, this.slots.media, this);
      }
      if (this.options.title) {
        const title = this.el.querySelector('.dx-card-title') || Utils.el('h3', 'dx-card-title');
        if (!title.parentNode) this.el.appendChild(title);
        title.textContent = typeof this.options.title === 'string' ? this.options.title : '';
        if (typeof this.options.title !== 'string') Component.applyContent(this.options.title, title, this);
      }
      this.slot = this.el.querySelector('.dx-card-body') || Utils.el('div', 'dx-card-body');
      if (!this.slot.parentNode) this.el.appendChild(this.slot);
      if (this.options.body) Component.applyContent(this.options.body, this.slot, this);
      if (this.options.footer) {
        this.slots.footer = this.el.querySelector('.dx-card-footer') || Utils.el('div', 'dx-card-footer');
        if (!this.slots.footer.parentNode) this.el.appendChild(this.slots.footer);
        Component.applyContent(this.options.footer, this.slots.footer, this);
      }
    }
  }

  return Card;
});
