Dixel.define('CursorTrail', ['Component', 'Pointer', 'Utils'], function (Component, Pointer, Utils) {
  'use strict';

  class CursorTrail extends Component {
    static defaults = { count: 12, size: 9, lag: 17, blend: false };

    build() {
      return Utils.el('div', 'dx-cursor-layer');
    }

    ready() {
      if (Utils.isTouch || Utils.reducedMotion) {
        this.el.classList.add('dx-cursor-layer--off');
        return;
      }
      this.el.classList.add('dx-cursor-layer');
      const blend = this.options.blend ? ' dx-cursor-blend' : '';
      this.points = [];
      for (let i = 0; i < this.options.count; i++) {
        const node = Utils.el('div', 'dx-cursor-trail-dot' + blend);
        node.style.width = node.style.height = this.options.size + 'px';
        node.style.opacity = String(1 - i / this.options.count);
        this.el.appendChild(node);
        this.points.push({ node, x: Pointer.x, y: Pointer.y });
      }
      this.settled = false;
      this.addCleanup(Pointer.use());
      this.onFrame(this.update, true);
    }

    update(time, delta) {
      const first = this.points[0];
      let maxMove = Math.max(Math.abs(Pointer.x - first.x), Math.abs(Pointer.y - first.y));
      first.x = Pointer.x;
      first.y = Pointer.y;
      let leadX = first.x;
      let leadY = first.y;
      for (let i = 1; i < this.points.length; i++) {
        const point = this.points[i];
        const nextX = Utils.damp(point.x, leadX, this.options.lag, delta);
        const nextY = Utils.damp(point.y, leadY, this.options.lag, delta);
        maxMove = Math.max(maxMove, Math.abs(nextX - point.x), Math.abs(nextY - point.y));
        point.x = nextX;
        point.y = nextY;
        leadX = point.x;
        leadY = point.y;
      }
      if (maxMove < 0.02) {
        if (this.settled) return;
        this.settled = true;
      } else {
        this.settled = false;
      }
      const half = this.options.size / 2;
      for (let i = 0; i < this.points.length; i++) {
        const point = this.points[i];
        const shrink = 1 - (i / this.points.length) * 0.75;
        point.node.style.transform =
          'translate3d(' + (point.x - half) + 'px,' + (point.y - half) + 'px,0) scale(' + shrink + ')';
      }
    }
  }

  return CursorTrail;
});
