Dixel.define('ColorFlow', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  function parseColor(value) {
    const text = String(value || '').trim();
    if (text[0] === '#') {
      const hex = text.slice(1);
      const full = hex.length === 3 ? hex.split('').map((char) => char + char).join('') : hex;
      const int = parseInt(full, 16);
      if (Number.isNaN(int)) return null;
      return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
    }
    const match = text.match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    const parts = match[1].split(',').map(parseFloat);
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
  }

  class ColorFlow extends Component {
    static defaults = { selector: '[data-flow-color]', property: '--dx-flow-bg', stops: null };

    ready() {
      this.root = document.documentElement;
      this.stops = [];
      this.lastY = -1;
      this.lastValue = '';
      this.fallback = parseColor(getComputedStyle(this.root).getPropertyValue('--dx-bg')) || [7, 7, 13];
      this.root.classList.add('dx-colorflow');
      this.addCleanup(() => {
        this.root.classList.remove('dx-colorflow');
        this.root.style.removeProperty(this.options.property);
      });
      this.measure();
      this.listen(window, 'resize', this.measure);
      this.listen(window, 'load', this.measure);
      this.onFrame(this.update);
    }

    measure() {
      const scrollY = window.scrollY;
      const sections = this.el.querySelectorAll(this.options.selector);
      const declared = this.options.stops || [];
      this.stops = [];
      for (let i = 0; i < sections.length; i++) {
        const rect = sections[i].getBoundingClientRect();
        const raw = sections[i].getAttribute('data-flow-color') || declared[i];
        this.stops.push({
          center: rect.top + scrollY + rect.height / 2,
          color: parseColor(raw) || this.fallback
        });
      }
      this.stops.sort((a, b) => a.center - b.center);
      this.lastY = -1;
    }

    blend(from, to, amount) {
      return [
        Math.round(Utils.lerp(from[0], to[0], amount)),
        Math.round(Utils.lerp(from[1], to[1], amount)),
        Math.round(Utils.lerp(from[2], to[2], amount))
      ];
    }

    update() {
      const stops = this.stops;
      if (!stops.length) return;
      const y = window.scrollY;
      if (y === this.lastY) return;
      this.lastY = y;
      const sample = y + innerHeight / 2;
      let color = stops[stops.length - 1].color;
      if (sample <= stops[0].center) {
        color = stops[0].color;
      } else if (sample < stops[stops.length - 1].center) {
        for (let i = 0; i < stops.length - 1; i++) {
          if (sample < stops[i + 1].center) {
            const amount = (sample - stops[i].center) / (stops[i + 1].center - stops[i].center);
            color = this.blend(stops[i].color, stops[i + 1].color, amount);
            break;
          }
        }
      }
      const value = 'rgb(' + color[0] + ',' + color[1] + ',' + color[2] + ')';
      if (value === this.lastValue) return;
      this.lastValue = value;
      this.root.style.setProperty(this.options.property, value);
    }
  }

  return ColorFlow;
});
