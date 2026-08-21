Dixel.define('Draggable', ['Component', 'DragManager', 'Motion', 'Utils'], function (Component, DragManager, Motion, Utils) {
  'use strict';

  class Draggable extends Component {
    static defaults = {
      handle: null,
      payload: null,
      mode: 'move',
      ghost: null,
      longPress: 260,
      tilt: true,
      disabled: false,
      onStart: null,
      onEnd: null
    };

    build() {
      return Utils.el('div', 'dx-draggable');
    }

    attach(el) {
      return super.attach(el && el.el instanceof Element ? el.el : el);
    }

    ready() {
      const host = this.el;
      host.__dxDraggable = this;
      host.classList.add('dx-draggable');
      this.press = null;
      this.drag = null;
      this.listen(host, 'pointerdown', this.onPress);
      this.addCleanup(() => {
        this.teardownPress();
        if (this.drag) {
          DragManager.cancel();
          this.drag.ghost.remove();
          this.drag = null;
        }
        document.body.classList.remove('dx-dragging');
        host.classList.remove('dx-draggable', 'dx-drag-origin');
        delete host.__dxDraggable;
      });
    }

    destroy() {
      if (this.destroyed) return;
      this.owned = false;
      super.destroy();
    }

    onPress(event) {
      if (this.options.disabled || this.press || this.drag || DragManager.active) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (this.options.handle && !event.target.closest(this.options.handle)) return;
      const touch = event.pointerType === 'touch';
      const pointerId = event.pointerId;
      this.press = {
        startX: event.clientX,
        startY: event.clientY,
        touch,
        pointerId,
        timer: null,
        unbinds: [
          Utils.on(document, 'pointermove', (moveEvent) => {
            if (moveEvent.pointerId === pointerId) this.onPointerMove(moveEvent);
          }),
          Utils.on(document, 'pointerup', (upEvent) => {
            if (upEvent.pointerId === pointerId) this.onRelease(upEvent);
          }),
          Utils.on(document, 'pointercancel', (cancelEvent) => {
            if (cancelEvent.pointerId === pointerId) this.abortDrag();
          }),
          Utils.on(document, 'touchmove', (touchEvent) => {
            if (this.drag) touchEvent.preventDefault();
          }, { passive: false })
        ]
      };
      if (touch) {
        this.press.timer = setTimeout(() => this.beginDrag(this.press.startX, this.press.startY), this.options.longPress);
      }
    }

    onPointerMove(event) {
      if (!this.press) return;
      if (this.drag) {
        this.followGhost(event.clientX, event.clientY);
        DragManager.move(event.clientX, event.clientY);
        return;
      }
      const distance = Math.hypot(event.clientX - this.press.startX, event.clientY - this.press.startY);
      if (this.press.touch) {
        if (distance > 10) this.teardownPress();
        return;
      }
      if (distance > 6) this.beginDrag(event.clientX, event.clientY);
    }

    beginDrag(pointerX, pointerY) {
      const press = this.press;
      if (!press || this.drag || !this.el) return;
      if (DragManager.active) {
        this.teardownPress();
        return;
      }
      clearTimeout(press.timer);
      const rect = this.el.getBoundingClientRect();
      const ghost = this.buildGhost(rect);
      document.body.appendChild(ghost);
      this.drag = {
        source: this,
        mode: this.options.mode,
        el: this.options.mode === 'move' ? this.el : null,
        payload: typeof this.options.payload === 'function' ? this.options.payload(this.el) : this.options.payload,
        ghost,
        width: rect.width,
        height: rect.height,
        originX: rect.left,
        originY: rect.top,
        offsetX: pointerX - rect.left,
        offsetY: pointerY - rect.top,
        lastX: pointerX,
        lastTime: performance.now(),
        tilt: 0,
        zones: []
      };
      Motion.set(ghost, { x: pointerX - this.drag.offsetX, y: pointerY - this.drag.offsetY, scale: 1.03 });
      if (this.options.mode === 'move') this.el.classList.add('dx-drag-origin');
      document.body.classList.add('dx-dragging');
      DragManager.start(this.drag);
      DragManager.move(pointerX, pointerY);
      if (this.options.onStart) this.options.onStart(this.drag.payload, this);
    }

    buildGhost(rect) {
      let ghost;
      if (typeof this.options.ghost === 'function') ghost = this.options.ghost(this.el, rect);
      else if (this.options.ghost instanceof Element) ghost = this.options.ghost;
      else {
        ghost = this.el.cloneNode(true);
        ghost.style.width = rect.width + 'px';
        ghost.style.height = rect.height + 'px';
      }
      ghost.classList.add('dx-drag-ghost');
      ghost.classList.remove('dx-draggable', 'dx-focusable');
      ghost.removeAttribute('tabindex');
      ghost.setAttribute('aria-hidden', 'true');
      return ghost;
    }

    followGhost(pointerX, pointerY) {
      const drag = this.drag;
      const now = performance.now();
      const delta = Math.max(now - drag.lastTime, 1);
      const velocityX = (pointerX - drag.lastX) / delta;
      drag.lastX = pointerX;
      drag.lastTime = now;
      if (this.options.tilt && !Utils.reducedMotion) {
        drag.tilt = Utils.lerp(drag.tilt, Utils.clamp(velocityX * 6, -8, 8), 0.22);
      }
      Motion.set(drag.ghost, {
        x: pointerX - drag.offsetX,
        y: pointerY - drag.offsetY,
        rotate: drag.tilt,
        scale: 1.03
      });
    }

    onRelease(event) {
      if (!this.press) return;
      if (!this.drag) {
        this.teardownPress();
        return;
      }
      this.settleDrag(event.clientX, event.clientY);
    }

    settleDrag(pointerX, pointerY) {
      const drag = this.drag;
      const host = this.el;
      const result = DragManager.drop(pointerX, pointerY);
      const ghost = drag.ghost;
      document.body.classList.remove('dx-dragging');
      if (result && drag.mode === 'move' && drag.el) {
        const target = drag.el;
        const rect = target.getBoundingClientRect();
        Motion.to(ghost, {
          x: rect.left,
          y: rect.top,
          rotate: 0,
          scale: 1,
          duration: 0.26,
          ease: 'out',
          onComplete: () => {
            ghost.remove();
            target.classList.remove('dx-drag-origin');
            Motion.fromTo(target, { opacity: 0 }, { opacity: 1, duration: 0.2 });
          }
        });
      } else if (result) {
        Motion.to(ghost, { opacity: 0, scale: 0.9, duration: 0.18, ease: 'in', onComplete: () => ghost.remove() });
      } else {
        const origin = drag.el;
        Motion.to(ghost, {
          x: drag.originX,
          y: drag.originY,
          rotate: 0,
          scale: 1,
          duration: 0.4,
          ease: 'outBack',
          onComplete: () => {
            ghost.remove();
            if (origin) origin.classList.remove('dx-drag-origin');
          }
        });
      }
      if (host) {
        const suppress = Utils.on(host, 'click', (clickEvent) => {
          clickEvent.preventDefault();
          clickEvent.stopImmediatePropagation();
        }, { capture: true });
        setTimeout(suppress, 0);
      }
      this.drag = null;
      this.teardownPress();
      if (this.options.onEnd) this.options.onEnd(result, this);
    }

    abortDrag() {
      if (!this.drag) {
        this.teardownPress();
        return;
      }
      const drag = this.drag;
      DragManager.cancel();
      document.body.classList.remove('dx-dragging');
      const ghost = drag.ghost;
      const origin = drag.el;
      Motion.to(ghost, {
        opacity: 0,
        scale: 0.96,
        duration: 0.16,
        ease: 'in',
        onComplete: () => {
          ghost.remove();
          if (origin) origin.classList.remove('dx-drag-origin');
        }
      });
      this.drag = null;
      this.teardownPress();
      if (this.options.onEnd) this.options.onEnd(null, this);
    }

    teardownPress() {
      if (!this.press) return;
      clearTimeout(this.press.timer);
      this.press.unbinds.forEach((unbind) => unbind());
      this.press = null;
    }
  }

  return Draggable;
});
