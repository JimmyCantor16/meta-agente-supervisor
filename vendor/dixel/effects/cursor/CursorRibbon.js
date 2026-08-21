Dixel.define('CursorRibbon', ['Component', 'Pointer', 'Utils'], function (Component, Pointer, Utils) {
  'use strict';

  class CursorRibbon extends Component {
    static defaults = { points: 26, width: 9, lag: 22 };

    build() {
      return Utils.el('div', 'dx-cursor-layer');
    }

    ready() {
      if (Utils.isTouch || Utils.reducedMotion) {
        this.el.classList.add('dx-cursor-layer--off');
        return;
      }
      this.el.classList.add('dx-cursor-layer');
      this.canvas = Utils.el('canvas', 'dx-cursor-ribbon');
      this.el.appendChild(this.canvas);
      this.context = this.canvas.getContext('2d');
      const readColors = () => {
        this.colorA = Utils.token('primary', '#6d5cff');
        this.colorB = Utils.token('cyan', '#2ee6d6');
      };
      readColors();
      this.addCleanup(Utils.onTheme(readColors));
      this.trail = [];
      for (let i = 0; i < this.options.points; i++) {
        this.trail.push({ x: Pointer.x, y: Pointer.y });
      }
      this.cleared = true;
      this.fit();
      this.listen(window, 'resize', this.fit);
      this.addCleanup(Pointer.use());
      this.onFrame(this.update, true);
    }

    fit() {
      const size = Utils.fitCanvas(this.canvas, this.context);
      this.width = size.width;
      this.height = size.height;
      const gradient = this.context.createLinearGradient(0, 0, size.width, size.height);
      gradient.addColorStop(0, this.colorA);
      gradient.addColorStop(1, this.colorB);
      this.context.strokeStyle = gradient;
      this.context.lineCap = 'round';
      this.context.lineJoin = 'round';
    }

    update(time, delta) {
      const trail = this.trail;
      const first = trail[0];
      first.x = Pointer.x;
      first.y = Pointer.y;
      let leadX = first.x;
      let leadY = first.y;
      let spread = 0;
      for (let i = 1; i < trail.length; i++) {
        const point = trail[i];
        point.x = Utils.damp(point.x, leadX, this.options.lag, delta);
        point.y = Utils.damp(point.y, leadY, this.options.lag, delta);
        spread = Math.max(spread, Math.abs(point.x - leadX), Math.abs(point.y - leadY));
        leadX = point.x;
        leadY = point.y;
      }
      if (spread < 0.4) {
        if (!this.cleared) {
          this.context.clearRect(0, 0, this.width, this.height);
          this.cleared = true;
        }
        return;
      }
      this.cleared = false;
      const ctx = this.context;
      ctx.clearRect(0, 0, this.width, this.height);
      const count = trail.length - 1;
      for (let i = 0; i < count; i++) {
        const fade = 1 - i / count;
        ctx.globalAlpha = fade;
        ctx.lineWidth = Math.max(this.options.width * fade, 0.5);
        ctx.beginPath();
        ctx.moveTo(trail[i].x, trail[i].y);
        ctx.lineTo(trail[i + 1].x, trail[i + 1].y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  return CursorRibbon;
});
