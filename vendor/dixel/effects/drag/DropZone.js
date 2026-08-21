Dixel.define('DropZone', ['Component', 'DragManager', 'Draggable', 'Utils'], function (Component, DragManager, Draggable, Utils) {
  'use strict';

  class DropZone extends Component {
    static defaults = {
      accepts: null,
      axis: 'vertical',
      sortable: false,
      itemSelector: null,
      gap: 10,
      highlight: true,
      onEnter: null,
      onLeave: null,
      onDrop: null
    };

    build() {
      return Utils.el('div', 'dx-dropzone');
    }

    ready() {
      const host = this.el;
      host.classList.add('dx-dropzone');
      this.placeholder = Utils.el('div', 'dx-drop-placeholder', { 'aria-hidden': 'true' });
      this.items = [];
      this.zoneRect = null;
      this.dragIndex = -1;
      this.currentIndex = -1;
      this.gapSize = this.options.gap;
      this.pad = { top: 0, left: 0, right: 0, bottom: 0 };
      this.inset = { left: 0, top: 0 };
      this.settleTimer = null;
      this.grabbed = null;
      this.grabOrigin = -1;
      this.sortables = [];
      this.addCleanup(DragManager.register(this));
      if (this.options.sortable) this.enableSortable();
      this.addCleanup(() => {
        clearTimeout(this.settleTimer);
        this.placeholder.remove();
        this.clearShifts();
        host.classList.remove('dx-dropzone', 'is-over', 'is-drag-active', 'is-settling');
      });
    }

    destroy() {
      if (this.destroyed) return;
      this.owned = false;
      super.destroy();
    }

    vertical() {
      return this.options.axis !== 'horizontal';
    }

    itemElements() {
      const selector = this.options.itemSelector;
      return Array.from(this.el.children).filter((child) => {
        if (child === this.placeholder || child.classList.contains('dx-drop-placeholder')) return false;
        if (child.classList.contains('dx-drop-live')) return false;
        return selector ? child.matches(selector) : true;
      });
    }

    acceptsDrag(drag) {
      const accepts = this.options.accepts;
      if (typeof accepts === 'function') return !!accepts(drag.payload, drag);
      if (typeof accepts === 'string') return !!(drag.payload && drag.payload.type === accepts);
      return true;
    }

    measure(drag) {
      const rect = this.el.getBoundingClientRect();
      const style = getComputedStyle(this.el);
      this.zoneRect = { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      this.pad = {
        top: parseFloat(style.paddingTop) || 0,
        left: parseFloat(style.paddingLeft) || 0,
        right: parseFloat(style.paddingRight) || 0,
        bottom: parseFloat(style.paddingBottom) || 0
      };
      this.inset = { left: this.el.clientLeft, top: this.el.clientTop };
      this.dragIndex = -1;
      this.items = this.itemElements().map((el, index) => {
        const itemRect = el.getBoundingClientRect();
        if (el === drag.el) this.dragIndex = index;
        return {
          el,
          top: itemRect.top,
          left: itemRect.left,
          bottom: itemRect.bottom,
          right: itemRect.right,
          midX: itemRect.left + itemRect.width / 2,
          midY: itemRect.top + itemRect.height / 2
        };
      });
      this.gapSize = this.computeGap();
      this.currentIndex = -1;
    }

    computeGap() {
      if (this.items.length < 2) return this.options.gap;
      const first = this.items[0];
      const second = this.items[1];
      const gap = this.vertical() ? second.top - first.bottom : second.left - first.right;
      return Math.max(gap, 4);
    }

    dragEnter(drag) {
      this.el.classList.add('is-drag-active');
      this.el.classList.remove('is-settling');
      if (this.options.highlight) this.el.classList.add('is-over');
      this.showPlaceholder(drag);
      if (this.options.onEnter) this.options.onEnter(drag.payload, drag);
    }

    dragOver(drag, x, y) {
      const index = this.hitIndex(x, y);
      if (index === this.currentIndex) return;
      this.applyPreview(drag, index);
    }

    dragLeave(drag) {
      this.el.classList.remove('is-over');
      this.placeholder.remove();
      this.currentIndex = -1;
      if (this.dragIndex >= 0 && drag.mode === 'move') this.showCollapsed(drag);
      else this.clearShifts();
      if (this.options.onLeave) this.options.onLeave(drag.payload, drag);
    }

    hitIndex(x, y) {
      const vertical = this.vertical();
      let index = 0;
      this.items.forEach((item, itemIndex) => {
        if (itemIndex === this.dragIndex) return;
        if (vertical ? y > item.midY : x > item.midX) index++;
      });
      return index;
    }

    shiftAmount(drag) {
      return (this.vertical() ? drag.height : drag.width) + this.gapSize;
    }

    applyPreview(drag, index) {
      this.currentIndex = index;
      const vertical = this.vertical();
      const amount = this.shiftAmount(drag);
      let slot = 0;
      this.items.forEach((item, itemIndex) => {
        if (itemIndex === this.dragIndex) return;
        let shift = 0;
        if (this.dragIndex >= 0 && itemIndex > this.dragIndex) shift -= amount;
        if (slot >= index) shift += amount;
        item.el.style.transform = shift
          ? (vertical ? 'translate3d(0,' + shift + 'px,0)' : 'translate3d(' + shift + 'px,0,0)')
          : '';
        slot++;
      });
      this.movePlaceholder(drag, index);
    }

    showCollapsed(drag) {
      if (this.dragIndex < 0) return;
      this.el.classList.add('is-drag-active');
      const vertical = this.vertical();
      const amount = this.shiftAmount(drag);
      this.items.forEach((item, itemIndex) => {
        if (itemIndex === this.dragIndex) return;
        item.el.style.transform = itemIndex > this.dragIndex
          ? (vertical ? 'translate3d(0,' + -amount + 'px,0)' : 'translate3d(' + -amount + 'px,0,0)')
          : '';
      });
      this.currentIndex = -1;
    }

    showPlaceholder(drag) {
      const vertical = this.vertical();
      const contentWidth = this.zoneRect.right - this.zoneRect.left - this.pad.left - this.pad.right - this.inset.left * 2;
      const contentHeight = this.zoneRect.bottom - this.zoneRect.top - this.pad.top - this.pad.bottom - this.inset.top * 2;
      this.placeholder.style.width = (vertical ? Math.max(contentWidth, 20) : drag.width) + 'px';
      this.placeholder.style.height = (vertical ? drag.height : Math.max(contentHeight, 20)) + 'px';
      this.el.appendChild(this.placeholder);
    }

    movePlaceholder(drag, index) {
      const position = this.slotPosition(drag, index);
      this.placeholder.style.transform = 'translate3d(' + position.x + 'px,' + position.y + 'px,0)';
    }

    slotPosition(drag, index) {
      const vertical = this.vertical();
      const amount = this.shiftAmount(drag);
      const rest = [];
      this.items.forEach((item, itemIndex) => {
        if (itemIndex === this.dragIndex) return;
        rest.push({ item, after: this.dragIndex >= 0 && itemIndex > this.dragIndex });
      });
      const originX = this.zoneRect.left + this.inset.left;
      const originY = this.zoneRect.top + this.inset.top;
      let main;
      if (!rest.length) {
        main = vertical ? this.pad.top : this.pad.left;
      } else if (index < rest.length) {
        const entry = rest[index];
        main = (vertical ? entry.item.top - originY : entry.item.left - originX) - (entry.after ? amount : 0);
      } else {
        const entry = rest[rest.length - 1];
        main = (vertical ? entry.item.bottom - originY : entry.item.right - originX) - (entry.after ? amount : 0) + this.gapSize;
      }
      const cross = rest.length
        ? (vertical ? rest[0].item.left - originX : rest[0].item.top - originY)
        : (vertical ? this.pad.left : this.pad.top);
      return vertical ? { x: cross, y: main } : { x: main, y: cross };
    }

    receiveDrop(drag, x, y) {
      const index = this.currentIndex >= 0 ? this.currentIndex : this.hitIndex(x, y);
      this.settle();
      let moved = false;
      if (drag.mode === 'move' && drag.el) {
        if (!(this.dragIndex >= 0 && index === this.dragIndex)) {
          const rest = this.itemElements().filter((el) => el !== drag.el);
          this.el.insertBefore(drag.el, rest[index] || null);
          moved = true;
        }
        if (this.options.sortable) this.refreshSortable();
      }
      const result = { payload: drag.payload, index, source: drag.source, zone: this, moved };
      if (this.options.onDrop) this.options.onDrop(result);
      return result;
    }

    settle() {
      this.el.classList.add('is-settling');
      this.el.classList.remove('is-over');
      this.placeholder.remove();
      this.clearShifts();
      this.currentIndex = -1;
      clearTimeout(this.settleTimer);
      this.settleTimer = setTimeout(() => {
        if (this.el) this.el.classList.remove('is-settling', 'is-drag-active');
      }, 80);
    }

    resetPreview(restore) {
      if (!this.el) return;
      if (!restore) this.el.classList.add('is-settling');
      this.el.classList.remove('is-over');
      this.placeholder.remove();
      this.clearShifts();
      this.currentIndex = -1;
      clearTimeout(this.settleTimer);
      this.settleTimer = setTimeout(() => {
        if (this.el) this.el.classList.remove('is-settling', 'is-drag-active');
      }, restore ? 340 : 80);
    }

    clearShifts() {
      this.items.forEach((item) => {
        item.el.style.transform = '';
      });
    }

    enableSortable() {
      this.live = Utils.el('span', 'dx-drop-live', { 'aria-live': 'polite' });
      this.el.appendChild(this.live);
      this.refreshSortable();
      this.listen(this.el, 'keydown', this.onKey);
      this.addCleanup(() => {
        this.live.remove();
        this.sortables.forEach((draggable) => draggable.destroy());
        this.sortables = [];
      });
    }

    sortablePayload(el) {
      const type = typeof this.options.accepts === 'string' ? this.options.accepts : 'dx-item';
      return { type, el };
    }

    refreshSortable() {
      this.itemElements().forEach((el) => {
        if (el.__dxDraggable) return;
        if (!el.hasAttribute('tabindex')) {
          el.setAttribute('tabindex', '0');
          el.classList.add('dx-focusable');
        }
        const draggable = new Draggable({ mode: 'move', payload: this.sortablePayload(el) }).attach(el);
        this.sortables.push(draggable);
      });
    }

    announce(message) {
      if (this.live) this.live.textContent = message;
    }

    onKey(event) {
      const items = this.itemElements();
      const item = items.find((el) => el === event.target);
      if (!item) return;
      const key = event.key;
      if (key === ' ' || key === 'Enter') {
        event.preventDefault();
        if (this.grabbed === item) this.dropGrab(item, items);
        else if (!this.grabbed) this.startGrab(item, items);
        return;
      }
      if (this.grabbed !== item) return;
      if (key === 'Escape') {
        event.preventDefault();
        this.cancelGrab(item);
        return;
      }
      const vertical = this.vertical();
      const backward = vertical ? 'ArrowUp' : 'ArrowLeft';
      const forward = vertical ? 'ArrowDown' : 'ArrowRight';
      if (key !== backward && key !== forward) return;
      event.preventDefault();
      this.moveGrabbed(item, key === forward ? 1 : -1);
    }

    startGrab(item, items) {
      this.grabbed = item;
      this.grabOrigin = items.indexOf(item);
      item.classList.add('is-grabbed');
      this.announce('Elemento seleccionado. Usa las flechas para moverlo, espacio para soltar, Escape para cancelar.');
    }

    dropGrab(item, items) {
      const index = items.indexOf(item);
      const origin = this.grabOrigin;
      item.classList.remove('is-grabbed');
      this.grabbed = null;
      this.grabOrigin = -1;
      if (index !== origin && this.options.onDrop) {
        this.options.onDrop({ payload: this.sortablePayload(item), index, source: null, zone: this, moved: true });
      }
      this.announce(index !== origin ? 'Soltado en la posición ' + (index + 1) + '.' : 'Soltado sin cambios.');
      item.focus();
    }

    cancelGrab(item) {
      const rest = this.itemElements().filter((el) => el !== item);
      this.el.insertBefore(item, rest[this.grabOrigin] || null);
      item.classList.remove('is-grabbed');
      this.grabbed = null;
      this.grabOrigin = -1;
      this.announce('Movimiento cancelado.');
      item.focus();
    }

    moveGrabbed(item, delta) {
      const rest = this.itemElements().filter((el) => el !== item);
      const current = this.itemElements().indexOf(item);
      const target = Utils.clamp(current + delta, 0, rest.length);
      if (target === current) return;
      this.el.insertBefore(item, rest[target] || null);
      this.announce('Posición ' + (this.itemElements().indexOf(item) + 1) + ' de ' + (rest.length + 1) + '.');
      item.focus();
    }
  }

  return DropZone;
});
