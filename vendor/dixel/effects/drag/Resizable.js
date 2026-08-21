Dixel.define('Resizable', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  const AXES = {
    e: { x: 1, y: 0 },
    w: { x: -1, y: 0 },
    s: { x: 0, y: 1 },
    n: { x: 0, y: -1 },
    se: { x: 1, y: 1 },
    sw: { x: -1, y: 1 },
    ne: { x: 1, y: -1 },
    nw: { x: -1, y: -1 }
  };

  class Resizable extends Component {
    static defaults = {
      handles: ['e', 's', 'se'],
      minWidth: 60,
      minHeight: 40,
      maxWidth: Infinity,
      maxHeight: Infinity,
      aspect: false,
      enabled: true,
      onResizeStart: null,
      onResize: null,
      onResizeEnd: null
    };

    ready() {
      this.host = this.el;
      this.host.classList.add('dx-resizable');
      const position = getComputedStyle(this.host).position;
      if (position === 'static') this.host.style.position = 'relative';
      this.handleNodes = [];
      this.options.handles.forEach((direction) => {
        if (!AXES[direction]) return;
        const handle = Utils.el('span', 'dx-resize-handle dx-resize-handle--' + direction);
        handle.setAttribute('aria-hidden', 'true');
        this.bindHandle(handle, AXES[direction]);
        this.host.appendChild(handle);
        this.handleNodes.push(handle);
      });
      this.setEnabled(this.options.enabled);
      this.activeStops = new Set();
      this.addCleanup(() => {
        this.activeStops.forEach((stop) => stop());
        this.activeStops.clear();
        this.handleNodes.forEach((node) => node.remove());
      });
    }

    setEnabled(enabled) {
      this.enabled = enabled !== false;
      this.host.classList.toggle('dx-resizable--on', this.enabled);
    }

    enable() {
      this.setEnabled(true);
    }

    disable() {
      this.setEnabled(false);
    }

    fitAspect(width, ratio) {
      width = Utils.clamp(width, this.options.minWidth, this.options.maxWidth);
      let height = width / ratio;
      if (height < this.options.minHeight) {
        height = this.options.minHeight;
        width = height * ratio;
      }
      if (height > this.options.maxHeight) {
        height = this.options.maxHeight;
        width = height * ratio;
      }
      return { width: Utils.clamp(width, this.options.minWidth, this.options.maxWidth), height };
    }

    bindHandle(handle, axis) {
      handle.addEventListener('pointerdown', (event) => {
        if (!this.enabled || event.button !== 0) return;
        event.stopPropagation();
        event.preventDefault();
        handle.setPointerCapture(event.pointerId);
        const pointerId = event.pointerId;
        const rect = this.host.getBoundingClientRect();
        const startWidth = rect.width;
        const startHeight = rect.height;
        const startX = event.clientX;
        const startY = event.clientY;
        const ratio = startWidth / Math.max(startHeight, 1);
        const style = getComputedStyle(this.host);
        const anchored = style.position === 'absolute' || style.position === 'fixed';
        const startLeft = this.host.offsetLeft;
        const startTop = this.host.offsetTop;
        this.host.classList.add('is-resizing');
        if (this.options.onResizeStart) this.options.onResizeStart(startWidth, startHeight, this);
        const move = (ev) => {
          if (ev.pointerId !== pointerId) return;
          let width = startWidth + (ev.clientX - startX) * axis.x;
          let height = startHeight + (ev.clientY - startY) * axis.y;
          if (this.options.aspect) {
            if (axis.y && !axis.x) width = height * ratio;
            const fitted = this.fitAspect(width, ratio);
            width = fitted.width;
            height = fitted.height;
          } else {
            width = Utils.clamp(width, this.options.minWidth, this.options.maxWidth);
            height = Utils.clamp(height, this.options.minHeight, this.options.maxHeight);
          }
          width = Math.round(width);
          height = Math.round(height);
          if (axis.x) this.host.style.width = width + 'px';
          if (axis.y || this.options.aspect) this.host.style.height = height + 'px';
          if (anchored && axis.x === -1) this.host.style.left = (startLeft + (startWidth - width)) + 'px';
          if (anchored && axis.y === -1) this.host.style.top = (startTop + (startHeight - height)) + 'px';
          if (this.options.onResize) this.options.onResize(width, height, this);
        };
        const up = (ev) => {
          if (ev && ev.pointerId !== undefined && ev.pointerId !== pointerId) return;
          removeEventListener('pointermove', move);
          removeEventListener('pointerup', up);
          removeEventListener('pointercancel', up);
          this.activeStops.delete(up);
          this.host.classList.remove('is-resizing');
          const finalRect = this.host.getBoundingClientRect();
          if (this.options.onResizeEnd) this.options.onResizeEnd(finalRect.width, finalRect.height, this);
        };
        addEventListener('pointermove', move);
        addEventListener('pointerup', up);
        addEventListener('pointercancel', up);
        this.activeStops.add(up);
      });
    }
  }

  return Resizable;
});
