Dixel.define('TickNumber', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  class TickNumber extends Component {
    static defaults = { duration: 0.6, stagger: 0.04, value: null };

    build() {
      return Utils.el('span', 'dx-ticknumber');
    }

    ready() {
      this.el.classList.add('dx-ticknumber');
      this.pattern = '';
      this.text = '';
      this.columns = [];
      const initial = this.options.value !== null
        ? String(this.options.value)
        : (this.el.textContent || '0').trim() || '0';
      this.el.textContent = '';
      this.set(initial);
    }

    set(value) {
      const text = String(value);
      if (text === this.text) return this;
      this.text = text;
      const pattern = text.replace(/[0-9]/g, 'd');
      if (pattern !== this.pattern) this.buildColumns(text, pattern);
      let digitIndex = 0;
      for (let i = 0; i < text.length; i++) {
        const column = this.columns[i];
        if (column.strip) {
          const digit = text.charCodeAt(i) - 48;
          column.strip.style.transitionDelay = (digitIndex * this.options.stagger).toFixed(2) + 's';
          column.strip.style.transform = 'translate3d(0,' + -digit + 'em,0)';
          digitIndex++;
        } else {
          column.node.textContent = text[i];
        }
      }
      return this;
    }

    buildColumns(text, pattern) {
      this.pattern = pattern;
      this.el.textContent = '';
      this.columns = [];
      for (let i = 0; i < text.length; i++) {
        if (text[i] >= '0' && text[i] <= '9') {
          const column = Utils.el('span', 'dx-tick-col');
          const strip = Utils.el('span', 'dx-tick-strip');
          strip.style.setProperty('--dx-tick-duration', this.options.duration + 's');
          for (let digit = 0; digit <= 9; digit++) {
            strip.appendChild(Utils.el('span', 'dx-tick-cell', { text: String(digit) }));
          }
          column.appendChild(strip);
          this.el.appendChild(column);
          this.columns.push({ node: column, strip });
        } else {
          const node = Utils.el('span', 'dx-tick-char', { text: text[i] });
          this.el.appendChild(node);
          this.columns.push({ node, strip: null });
        }
      }
    }
  }

  return TickNumber;
});
