Dixel.define('Tabs', ['Component', 'Motion', 'Ticker', 'Utils'], function (Component, Motion, Ticker, Utils) {
  'use strict';

  class Tabs extends Component {
    static defaults = {
      items: [],
      active: 0,
      onChange: null
    };

    build() {
      const el = Utils.el('div', 'dx-tabs');
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      const id = Utils.uid();
      const tabs = this.options.items
        .map((item, index) =>
          '<button class="dx-tabs-tab dx-focusable" type="button" role="tab" id="' + id + '-tab-' + index +
          '" aria-controls="' + id + '-panel-' + index + '" aria-selected="false" tabindex="-1">' + Utils.escape(item.label) + '</button>')
        .join('');
      const panels = this.options.items
        .map((item, index) =>
          '<div class="dx-tabs-panel" role="tabpanel" id="' + id + '-panel-' + index +
          '" aria-labelledby="' + id + '-tab-' + index + '" hidden>' + (typeof item.content === 'string' ? item.content : '') + '</div>')
        .join('');
      return '<div class="dx-tabs-list" role="tablist">' + tabs + '<span class="dx-tabs-indicator"></span></div>' +
        '<div class="dx-tabs-panels">' + panels + '</div>';
    }

    ready() {
      this.el.classList.add('dx-tabs');
      if (!this.el.querySelector('.dx-tabs-list')) this.el.innerHTML = this.markup();
      this.list = this.el.querySelector('.dx-tabs-list');
      this.indicator = this.el.querySelector('.dx-tabs-indicator');
      if (!this.indicator) {
        this.indicator = Utils.el('span', 'dx-tabs-indicator');
        this.list.appendChild(this.indicator);
      }
      this.buttons = Array.from(this.list.querySelectorAll('.dx-tabs-tab, [role="tab"]'));
      this.panels = Array.from(this.el.querySelectorAll('.dx-tabs-panel, [role="tabpanel"]'));
      this.options.items.forEach((item, index) => {
        if (item.content && typeof item.content !== 'string' && this.panels[index]) {
          Component.applyContent(item.content, this.panels[index], this);
        }
      });
      this.active = undefined;
      this.listen(this.list, 'click', (event) => {
        const button = event.target.closest('[role="tab"]');
        if (!button) return;
        this.select(this.buttons.indexOf(button));
      });
      this.listen(this.list, 'keydown', (event) => {
        const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (!direction) return;
        event.preventDefault();
        const next = (this.active + direction + this.buttons.length) % this.buttons.length;
        this.select(next);
        this.buttons[next].focus();
      });
      this.listen(window, 'resize', this.moveIndicator);
      this.listen(window, 'load', this.moveIndicator);
      this.select(Utils.clamp(Math.round(this.options.active) || 0, 0, Math.max(this.buttons.length - 1, 0)));
      const enable = Ticker.add(() => {
        this.el.classList.add('is-ready');
        enable();
      });
      this.addCleanup(enable);
    }

    select(index) {
      if (!Number.isInteger(index) || index < 0 || index >= this.buttons.length) return;
      const previous = this.active;
      if (previous === index) return;
      this.active = index;
      this.buttons.forEach((button, i) => {
        const selected = i === index;
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-selected', selected ? 'true' : 'false');
        button.setAttribute('tabindex', selected ? '0' : '-1');
      });
      this.panels.forEach((panel, i) => {
        panel.hidden = i !== index;
      });
      this.moveIndicator();
      if (previous !== undefined) {
        const panel = this.panels[index];
        if (panel) Motion.fromTo(panel, { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'outQuart' });
        if (this.options.onChange) this.options.onChange(index);
      }
    }

    moveIndicator() {
      const button = this.buttons[this.active];
      if (!button) return;
      this.indicator.style.transform = 'translateX(' + button.offsetLeft + 'px) scaleX(' + button.offsetWidth + ')';
    }
  }

  return Tabs;
});
