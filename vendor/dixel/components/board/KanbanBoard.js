Dixel.define('KanbanBoard', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  class KanbanBoard extends Component {
    static defaults = {
      columns: [],
      longPress: 260,
      onMove: null
    };

    build() {
      const el = Utils.el('div', 'dx-kanban dx-reset', { role: 'group', 'aria-label': 'Tablero kanban' });
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      return (this.options.columns || []).map((column) => this.columnMarkup(column)).join('');
    }

    columnMarkup(column) {
      const cards = (column.cards || []).map((card) => this.cardMarkup(card)).join('');
      return '<section class="dx-kanban-col">' +
        '<header class="dx-kanban-colhead"><h3 class="dx-kanban-coltitle">' + Utils.escape(column.title) + '</h3>' +
        '<span class="dx-kanban-count">' + (column.cards || []).length + '</span></header>' +
        '<div class="dx-kanban-cards" role="list">' + cards + '</div>' +
        '</section>';
    }

    cardMarkup(card) {
      const tone = card.tone || 'primary';
      const tag = card.tag ? '<span class="dx-kanban-tag dx-kanban-tag--' + tone + '">' + Utils.escape(card.tag) + '</span>' : '';
      return '<article class="dx-kanban-card dx-focusable" role="listitem" tabindex="0">' +
        tag + '<span class="dx-kanban-cardtitle">' + (card.html ? card.title : Utils.escape(card.title)) + '</span></article>';
    }

    ready() {
      this.el.classList.add('dx-kanban', 'dx-reset');
      if (!this.el.querySelector('.dx-kanban-col')) this.el.innerHTML = this.markup();
      this.live = Utils.el('span', 'dx-kanban-live', { 'aria-live': 'polite' });
      this.el.appendChild(this.live);
      this.press = null;
      this.drag = null;
      this.geo = null;
      this.grabbed = null;
      this.grabOrigin = null;
      this.listen(this.el, 'pointerdown', this.onPress);
      this.listen(this.el, 'keydown', this.onKey);
      this.addCleanup(() => {
        this.teardownPress();
        if (this.drag) this.drag.ghost.remove();
        document.body.classList.remove('dx-kanban-grabbing');
      });
    }

    columnLists() {
      return Array.from(this.el.querySelectorAll('.dx-kanban-cards'));
    }

    columnTitles() {
      return Array.from(this.el.querySelectorAll('.dx-kanban-coltitle')).map((title) => title.textContent);
    }

    cardTitle(card) {
      const title = card.querySelector('.dx-kanban-cardtitle');
      return title ? title.textContent : '';
    }

    announce(message) {
      this.live.textContent = message;
    }

    updateCounts() {
      this.el.querySelectorAll('.dx-kanban-col').forEach((column) => {
        column.querySelector('.dx-kanban-count').textContent = column.querySelectorAll('.dx-kanban-card').length;
      });
    }

    onPress(event) {
      const card = event.target.closest('.dx-kanban-card');
      if (!card || this.press || this.drag || this.grabbed) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const touch = event.pointerType === 'touch';
      const pointerId = event.pointerId;
      this.press = {
        card,
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
            if (upEvent.pointerId === pointerId) this.onRelease();
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
        this.autoScroll(event.clientX, event.clientY);
        this.preview(event.clientX, event.clientY);
        return;
      }
      const deltaX = event.clientX - this.press.startX;
      const deltaY = event.clientY - this.press.startY;
      const distance = Math.hypot(deltaX, deltaY);
      if (this.press.touch) {
        if (distance > 10) this.teardownPress();
        return;
      }
      if (distance > 6) this.beginDrag(event.clientX, event.clientY);
    }

    beginDrag(pointerX, pointerY) {
      const press = this.press;
      if (!press || this.drag) return;
      clearTimeout(press.timer);
      const card = press.card;
      const rect = card.getBoundingClientRect();
      this.captureGeometry(card);
      const ghost = card.cloneNode(true);
      ghost.classList.add('dx-kanban-ghost');
      ghost.classList.remove('dx-focusable');
      ghost.removeAttribute('tabindex');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.style.width = rect.width + 'px';
      document.body.appendChild(ghost);
      this.drag = {
        card,
        ghost,
        width: rect.width,
        height: rect.height,
        offsetX: pointerX - rect.left,
        offsetY: pointerY - rect.top,
        originCol: this.geo.originCol,
        originIndex: this.geo.originIndex,
        previewCol: this.geo.originCol,
        previewIndex: this.geo.originIndex,
        shifted: []
      };
      Motion.set(ghost, { x: pointerX - this.drag.offsetX, y: pointerY - this.drag.offsetY, rotate: 2.5, scale: 1.04 });
      card.classList.add('is-origin');
      this.el.classList.add('is-dragging');
      document.body.classList.add('dx-kanban-grabbing');
    }

    captureGeometry(card) {
      const geo = { cols: [], originCol: 0, originIndex: 0, gap: 10 };
      this.columnLists().forEach((list, colIndex) => {
        const rect = list.parentElement.getBoundingClientRect();
        const items = Array.from(list.children)
          .filter((child) => child.classList.contains('dx-kanban-card'))
          .map((el, cardIndex) => {
            const cardRect = el.getBoundingClientRect();
            if (el === card) {
              geo.originCol = colIndex;
              geo.originIndex = cardIndex;
            }
            return { el, mid: cardRect.top + cardRect.height / 2, top: cardRect.top, height: cardRect.height };
          });
        geo.cols.push({ list, left: rect.left, right: rect.right, center: rect.left + rect.width / 2, items });
      });
      const sample = geo.cols.find((col) => col.items.length > 1);
      if (sample) geo.gap = Math.max(sample.items[1].top - sample.items[0].top - sample.items[0].height, 6);
      this.geo = geo;
    }

    followGhost(pointerX, pointerY) {
      Motion.set(this.drag.ghost, { x: pointerX - this.drag.offsetX, y: pointerY - this.drag.offsetY });
    }

    autoScroll(pointerX, pointerY) {
      const margin = 70;
      let scrolled = false;
      let deltaY = 0;
      if (pointerY < margin) deltaY = -14;
      else if (pointerY > innerHeight - margin) deltaY = 14;
      if (deltaY) {
        window.scrollBy(0, deltaY);
        scrolled = true;
      }
      const rect = this.el.getBoundingClientRect();
      let deltaX = 0;
      if (pointerX < rect.left + margin) deltaX = -14;
      else if (pointerX > rect.right - margin) deltaX = 14;
      if (deltaX && this.el.scrollWidth > this.el.clientWidth) {
        this.el.scrollLeft += deltaX;
        scrolled = true;
      }
      if (scrolled) this.captureGeometry(this.drag.card);
    }

    preview(pointerX, pointerY) {
      const col = this.hitColumn(pointerX);
      const index = this.hitIndex(col, pointerY);
      if (col === this.drag.previewCol && index === this.drag.previewIndex) return;
      this.applyPreview(col, index);
    }

    hitColumn(pointerX) {
      let found = -1;
      this.geo.cols.forEach((col, index) => {
        if (pointerX >= col.left && pointerX <= col.right) found = index;
      });
      if (found >= 0) return found;
      let best = 0;
      let bestDistance = Infinity;
      this.geo.cols.forEach((col, index) => {
        const distance = Math.abs(pointerX - col.center);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      });
      return best;
    }

    hitIndex(colIndex, pointerY) {
      let index = 0;
      this.geo.cols[colIndex].items.forEach((item) => {
        if (item.el !== this.drag.card && pointerY > item.mid) index++;
      });
      return index;
    }

    applyPreview(col, index) {
      const drag = this.drag;
      drag.shifted.forEach((el) => {
        el.style.transform = '';
      });
      const shifted = [];
      const amount = drag.height + this.geo.gap;
      this.geo.cols.forEach((column, colIndex) => {
        column.items.forEach((item, cardIndex) => {
          if (item.el === drag.card) return;
          let shift = 0;
          if (colIndex === drag.originCol && col === colIndex) {
            const slot = cardIndex > drag.originIndex ? cardIndex - 1 : cardIndex;
            if (cardIndex < drag.originIndex && slot >= index) shift = amount;
            else if (cardIndex > drag.originIndex && slot < index) shift = -amount;
          } else if (colIndex === drag.originCol) {
            if (cardIndex > drag.originIndex) shift = -amount;
          } else if (colIndex === col) {
            if (cardIndex >= index) shift = amount;
          }
          if (shift) {
            item.el.style.transform = 'translate3d(0,' + shift + 'px,0)';
            shifted.push(item.el);
          }
        });
      });
      drag.previewCol = col;
      drag.previewIndex = index;
      drag.shifted = shifted;
    }

    onRelease() {
      if (!this.press) return;
      if (!this.drag) {
        this.teardownPress();
        return;
      }
      this.settleDrag();
    }

    settleDrag() {
      const drag = this.drag;
      const board = this.el;
      board.classList.add('is-settling');
      drag.shifted.forEach((el) => {
        el.style.transform = '';
      });
      const moved = drag.previewCol !== drag.originCol || drag.previewIndex !== drag.originIndex;
      if (moved) {
        const list = this.geo.cols[drag.previewCol].list;
        const rest = Array.from(list.children).filter((child) => child !== drag.card && child.classList.contains('dx-kanban-card'));
        list.insertBefore(drag.card, rest[drag.previewIndex] || null);
      }
      const rect = drag.card.getBoundingClientRect();
      const ghost = drag.ghost;
      const card = drag.card;
      Motion.to(ghost, {
        x: rect.left,
        y: rect.top,
        rotate: 0,
        scale: 1,
        duration: 0.26,
        ease: 'out',
        onComplete: () => {
          ghost.remove();
          card.classList.remove('is-origin');
          Motion.fromTo(card, { opacity: 0 }, { opacity: 1, duration: 0.2 });
          board.classList.remove('is-settling');
        }
      });
      board.classList.remove('is-dragging');
      document.body.classList.remove('dx-kanban-grabbing');
      this.updateCounts();
      if (moved) this.reportMove(card, drag.originCol, drag.originIndex, drag.previewCol, drag.previewIndex);
      this.drag = null;
      this.teardownPress();
    }

    abortDrag() {
      if (!this.drag) {
        this.teardownPress();
        return;
      }
      const drag = this.drag;
      drag.shifted.forEach((el) => {
        el.style.transform = '';
      });
      const ghost = drag.ghost;
      Motion.to(ghost, { opacity: 0, scale: 0.96, duration: 0.16, ease: 'in', onComplete: () => ghost.remove() });
      drag.card.classList.remove('is-origin');
      this.el.classList.remove('is-dragging');
      document.body.classList.remove('dx-kanban-grabbing');
      this.drag = null;
      this.teardownPress();
    }

    teardownPress() {
      if (!this.press) return;
      clearTimeout(this.press.timer);
      this.press.unbinds.forEach((unbind) => unbind());
      this.press = null;
    }

    reportMove(card, fromCol, fromIndex, toCol, toIndex) {
      const titles = this.columnTitles();
      const info = {
        card: this.cardTitle(card),
        from: titles[fromCol],
        to: titles[toCol],
        fromIndex,
        toIndex
      };
      this.announce('«' + info.card + '» movida a ' + info.to + ', posición ' + (toIndex + 1) + '.');
      if (this.options.onMove) this.options.onMove(info, card);
    }

    locate(card) {
      const lists = this.columnLists();
      for (let colIndex = 0; colIndex < lists.length; colIndex++) {
        const cards = Array.from(lists[colIndex].children).filter((child) => child.classList.contains('dx-kanban-card'));
        const cardIndex = cards.indexOf(card);
        if (cardIndex >= 0) return { col: colIndex, index: cardIndex };
      }
      return { col: 0, index: 0 };
    }

    onKey(event) {
      const card = event.target.closest('.dx-kanban-card');
      if (!card) return;
      const key = event.key;
      if (key === ' ' || key === 'Enter') {
        event.preventDefault();
        if (this.grabbed === card) this.dropGrab();
        else if (!this.grabbed) this.startGrab(card);
        return;
      }
      if (this.grabbed !== card) return;
      if (key === 'Escape') {
        event.preventDefault();
        this.cancelGrab();
        return;
      }
      const moves = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
      if (!moves[key]) return;
      event.preventDefault();
      this.moveGrabbed(moves[key][0], moves[key][1]);
    }

    startGrab(card) {
      this.grabbed = card;
      this.grabOrigin = this.locate(card);
      card.classList.add('is-grabbed');
      this.announce('«' + this.cardTitle(card) + '» seleccionada. Usa las flechas para moverla, espacio para soltar, Escape para cancelar.');
    }

    dropGrab() {
      const card = this.grabbed;
      const position = this.locate(card);
      const origin = this.grabOrigin;
      card.classList.remove('is-grabbed');
      this.grabbed = null;
      this.grabOrigin = null;
      if (position.col !== origin.col || position.index !== origin.index) {
        this.reportMove(card, origin.col, origin.index, position.col, position.index);
      } else {
        this.announce('Tarjeta soltada sin cambios.');
      }
      card.focus();
    }

    cancelGrab() {
      const card = this.grabbed;
      const origin = this.grabOrigin;
      const list = this.columnLists()[origin.col];
      const rest = Array.from(list.children).filter((child) => child !== card && child.classList.contains('dx-kanban-card'));
      list.insertBefore(card, rest[origin.index] || null);
      card.classList.remove('is-grabbed');
      this.grabbed = null;
      this.grabOrigin = null;
      this.updateCounts();
      this.announce('Movimiento cancelado.');
      card.focus();
    }

    moveGrabbed(colDelta, rowDelta) {
      const card = this.grabbed;
      const lists = this.columnLists();
      const position = this.locate(card);
      if (colDelta !== 0) {
        const targetCol = position.col + colDelta;
        if (targetCol < 0 || targetCol >= lists.length) return;
        const list = lists[targetCol];
        const cards = Array.from(list.children).filter((child) => child.classList.contains('dx-kanban-card'));
        list.insertBefore(card, cards[Math.min(position.index, cards.length)] || null);
      } else {
        const list = lists[position.col];
        const rest = Array.from(list.children).filter((child) => child !== card && child.classList.contains('dx-kanban-card'));
        const target = Utils.clamp(position.index + rowDelta, 0, rest.length);
        if (target === position.index) return;
        list.insertBefore(card, rest[target] || null);
      }
      this.updateCounts();
      const landed = this.locate(card);
      this.announce('Posición ' + (landed.index + 1) + ' en ' + this.columnTitles()[landed.col] + '.');
      card.focus();
    }
  }

  return KanbanBoard;
});
