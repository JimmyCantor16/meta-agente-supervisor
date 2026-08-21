Dixel.define('TextArea', ['Field', 'Utils'], function (Field, Utils) {
  'use strict';

  class TextArea extends Field {
    static defaults = Object.assign({}, Field.defaults, {
      label: 'Message',
      rows: 3,
      maxRows: null,
      wrap: true
    });

    rootClassNames() {
      return super.rootClassNames() + ' dx-field--area';
    }

    buildControl() {
      const area = Utils.el('textarea', 'dx-field-input dx-scroll-thin');
      area.rows = this.options.rows;
      area.value = this.options.value || '';
      if (this.options.wrap === false) {
        area.wrap = 'off';
        area.classList.add('dx-field-input--nowrap');
      }
      return area;
    }

    ready() {
      super.ready();
      this.maxHeight = 0;
      this.computeMaxHeight();
      this.listen(this.control, 'input', this.autosize);
      this.listen(window, 'resize', () => {
        this.computeMaxHeight();
        this.autosize();
      });
      this.whenVisible((isVisible) => {
        if (!isVisible) return;
        this.computeMaxHeight();
        this.autosize();
      });
    }

    computeMaxHeight() {
      if (!this.options.maxRows) {
        this.maxHeight = 0;
        return;
      }
      const style = getComputedStyle(this.control);
      const lineHeight = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) || 16) * 1.5;
      const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
      this.maxHeight = Math.round(lineHeight * this.options.maxRows + padding);
    }

    autosize() {
      this.control.style.height = 'auto';
      const full = this.control.scrollHeight;
      const viewportCap = Math.round(innerHeight * 0.4);
      const cap = this.maxHeight ? Math.min(this.maxHeight, viewportCap) : viewportCap;
      const clipped = full > cap;
      this.control.style.height = (clipped ? cap : full) + 'px';
      this.control.style.overflowY = clipped ? 'auto' : 'hidden';
    }
  }

  return TextArea;
});
