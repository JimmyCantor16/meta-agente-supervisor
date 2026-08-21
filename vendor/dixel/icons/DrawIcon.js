Dixel.define('DrawIcon', ['Icon', 'Utils'], function (Icon, Utils) {
  'use strict';

  class DrawIcon extends Icon {
    static defaults = Object.assign({}, Icon.defaults, {
      duration: 1.1,
      redraw: true
    });

    ready() {
      super.ready();
      this.el.classList.add('dx-icon--draw');
      this.el.style.setProperty('--dx-icon-draw-duration', this.options.duration + 's');
      this.prepareStrokes();
      this.whenVisible((isVisible) => {
        if (Utils.reducedMotion) {
          this.el.classList.add('dx-icon--drawn');
          return;
        }
        if (isVisible) this.el.classList.add('dx-icon--drawn');
        else if (this.options.redraw) this.el.classList.remove('dx-icon--drawn');
      });
    }

    prepareStrokes() {
      this.el.querySelectorAll('path, circle, rect, ellipse, line, polyline').forEach((shape, index) => {
        const length = shape.getTotalLength ? Math.ceil(shape.getTotalLength()) : 100;
        shape.style.strokeDasharray = length;
        shape.style.strokeDashoffset = length;
        shape.style.transitionDelay = index * 0.12 + 's';
      });
    }

    swap(name) {
      super.swap(name);
      this.el.classList.remove('dx-icon--drawn');
      this.prepareStrokes();
      if (this.visible) {
        void this.el.offsetWidth;
        this.el.classList.add('dx-icon--drawn');
      }
    }
  }

  return DrawIcon;
});
