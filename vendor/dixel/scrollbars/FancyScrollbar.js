Dixel.define('FancyScrollbar', ['Component', 'Utils'], function (Component, Utils) {
  'use strict';

  let nativeHideUsers = 0;
  let nativeHideStyle = null;

  function hideNativePageScrollbar() {
    nativeHideUsers++;
    if (!nativeHideStyle) {
      nativeHideStyle = document.createElement('style');
      nativeHideStyle.textContent =
        'html{scrollbar-width:none;-ms-overflow-style:none}' +
        'html::-webkit-scrollbar,body::-webkit-scrollbar{width:0;height:0;display:none}';
      document.head.appendChild(nativeHideStyle);
    }
    return () => {
      nativeHideUsers--;
      if (nativeHideUsers <= 0 && nativeHideStyle) {
        nativeHideStyle.remove();
        nativeHideStyle = null;
        nativeHideUsers = 0;
      }
    };
  }

  class FancyScrollbar extends Component {
    static defaults = { autoHide: true, hideDelay: 1.4, minThumb: 40 };

    build() {
      return Utils.el('div', 'dx-scrollbar');
    }

    ready() {
      const isRail = this.el.classList.contains('dx-scrollbar');
      this.host = isRail ? null : this.el;
      this.rail = isRail ? this.el : Utils.el('div', 'dx-scrollbar dx-scrollbar--inset');
      this.thumb = Utils.el('div', 'dx-scrollbar-thumb');
      this.rail.appendChild(this.thumb);
      if (this.host) {
        const host = this.host;
        host.classList.add('dx-scrollhost');
        host.appendChild(this.rail);
        this.addCleanup(() => host.classList.remove('dx-scrollhost'));
      } else {
        this.addCleanup(hideNativePageScrollbar());
      }
      this.dirty = true;
      this.needMeasure = true;
      this.dragging = false;
      this.hovering = false;
      this.idle = false;
      this.lastActivity = 0;
      this.dragPointerY = 0;
      this.dragStartY = 0;
      this.dragStartScroll = 0;
      this.max = 0;
      this.railHeight = 0;
      this.thumbHeight = this.options.minThumb;
      this.listen(this.host || window, 'scroll', () => {
        this.dirty = true;
      }, { passive: true });
      this.listen(window, 'resize', () => {
        this.needMeasure = true;
      });
      this.listen(window, 'load', () => {
        this.needMeasure = true;
      });
      this.listen(this.rail, 'pointerenter', () => {
        this.hovering = true;
        this.wake();
      });
      this.listen(this.rail, 'pointerleave', () => {
        this.hovering = false;
      });
      this.listen(this.rail, 'pointerdown', this.jump);
      this.listen(this.thumb, 'pointerdown', this.startDrag);
      this.listen(this.thumb, 'pointermove', (event) => {
        if (this.dragging) this.dragPointerY = event.clientY;
      });
      this.listen(this.thumb, 'pointerup', this.endDrag);
      this.listen(this.thumb, 'pointercancel', this.endDrag);
      if (this.host) this.whenVisible(() => {
        this.dirty = true;
      });
      this.onFrame(this.update);
    }

    wake() {
      this.lastActivity = performance.now() / 1000;
      if (this.idle) {
        this.idle = false;
        this.rail.classList.remove('is-idle');
      }
    }

    currentScroll() {
      return this.host ? this.host.scrollTop : window.scrollY;
    }

    setScroll(value) {
      if (this.host) this.host.scrollTop = value;
      else window.scrollTo(0, value);
    }

    startDrag(event) {
      event.preventDefault();
      event.stopPropagation();
      this.dragging = true;
      this.dragStartY = event.clientY;
      this.dragPointerY = event.clientY;
      this.dragStartScroll = this.currentScroll();
      this.thumb.setPointerCapture(event.pointerId);
      this.rail.classList.add('is-drag');
      this.wake();
    }

    endDrag() {
      this.dragging = false;
      this.rail.classList.remove('is-drag');
    }

    jump(event) {
      if (event.target !== this.rail) return;
      const rect = this.rail.getBoundingClientRect();
      const travel = Math.max(this.railHeight - this.thumbHeight, 1);
      const ratio = Utils.clamp((event.clientY - rect.top - this.thumbHeight / 2) / travel, 0, 1);
      this.setScroll(ratio * this.max);
      this.dirty = true;
    }

    measure() {
      this.needMeasure = false;
      const total = this.host ? this.host.scrollHeight : document.documentElement.scrollHeight;
      const view = this.host ? this.host.clientHeight : innerHeight;
      this.max = Math.max(total - view, 0);
      this.railHeight = this.rail.clientHeight;
      this.thumbHeight = Math.max(this.options.minThumb, this.railHeight * (view / Math.max(total, 1)));
      this.thumb.style.height = this.thumbHeight + 'px';
      this.rail.classList.toggle('is-off', this.max <= 0);
      this.dirty = true;
    }

    update(time) {
      if (this.host && !this.visible) return;
      if (this.needMeasure) this.measure();
      if (this.dragging) {
        const travel = Math.max(this.railHeight - this.thumbHeight, 1);
        const target = this.dragStartScroll + (this.dragPointerY - this.dragStartY) * (this.max / travel);
        this.setScroll(Utils.clamp(target, 0, this.max));
        this.dirty = true;
      }
      if (this.dirty) {
        this.dirty = false;
        this.lastActivity = time;
        const position = this.currentScroll();
        const progress = this.max > 0 ? Utils.clamp(position / this.max, 0, 1) : 0;
        const travel = Math.max(this.railHeight - this.thumbHeight, 0);
        this.thumb.style.transform = 'translate3d(0,' + progress * travel + 'px,0)';
        if (this.host) this.rail.style.transform = 'translate3d(0,' + position + 'px,0)';
        if (this.idle) {
          this.idle = false;
          this.rail.classList.remove('is-idle');
        }
        return;
      }
      if (
        this.options.autoHide &&
        !this.idle &&
        !this.dragging &&
        !this.hovering &&
        time - this.lastActivity > this.options.hideDelay
      ) {
        this.idle = true;
        this.rail.classList.add('is-idle');
      }
    }
  }

  return FancyScrollbar;
});
