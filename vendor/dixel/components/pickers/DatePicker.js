Dixel.define('DatePicker', ['PickerBase', 'Motion', 'Utils'], function (PickerBase, Motion, Utils) {
  'use strict';

  const calendarIcon = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v3.5M16 3v3.5"/></svg>';
  const arrow = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';

  function pad(value) {
    return value < 10 ? '0' + value : '' + value;
  }

  function keyOf(date) {
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  function dateOf(key) {
    const parts = key.split('-');
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  class DatePicker extends PickerBase {
    static defaults = Object.assign({}, PickerBase.defaults, {
      placeholder: 'Elegir fecha',
      value: null,
      range: false,
      format: 'dd/mm/yyyy',
      firstDay: 1,
      min: null,
      max: null,
      isDisabled: null,
      months: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
      days: ['lu', 'ma', 'mi', 'ju', 'vi', 'sá', 'do']
    });

    triggerIcon() {
      return calendarIcon;
    }

    panelMarkup() {
      const week = Array.from({ length: 7 }, (unused, index) => {
        const weekday = (this.options.firstDay + index) % 7;
        return '<span class="dx-cal-weekday" aria-hidden="true">' + this.options.days[(weekday + 6) % 7] + '</span>';
      }).join('');
      return '<div class="dx-cal-head">' +
        '<button class="dx-cal-nav dx-cal-prev dx-focusable" type="button" aria-label="Anterior">' + arrow + '</button>' +
        '<button class="dx-cal-title dx-focusable" type="button" aria-live="polite" aria-label="Cambiar de vista"></button>' +
        '<button class="dx-cal-nav dx-cal-next dx-focusable" type="button" aria-label="Siguiente">' + arrow + '</button>' +
        '</div>' +
        '<div class="dx-cal-week">' + week + '</div>' +
        '<div class="dx-cal-viewport"><div class="dx-cal-grid" role="grid" aria-label="Calendario"></div></div>';
    }

    setupPanel() {
      this.todayKey = keyOf(new Date());
      if (this.options.range) {
        const initial = this.options.value || {};
        this.rangeStart = initial.start || null;
        this.rangeEnd = initial.end || null;
      } else {
        this.value = this.options.value || null;
      }
      const anchor = dateOf(this.options.range ? this.rangeStart || this.todayKey : this.value || this.todayKey);
      this.viewYear = anchor.getFullYear();
      this.viewMonth = anchor.getMonth();
      this.view = 'days';
      this.gridAnimating = false;
      this.title = this.panel.querySelector('.dx-cal-title');
      this.weekRow = this.panel.querySelector('.dx-cal-week');
      this.viewport = this.panel.querySelector('.dx-cal-viewport');
      this.grid = this.panel.querySelector('.dx-cal-grid');
      this.listen(this.title, 'click', this.drillUp);
      this.listen(this.panel.querySelector('.dx-cal-prev'), 'click', () => this.navigate(-1));
      this.listen(this.panel.querySelector('.dx-cal-next'), 'click', () => this.navigate(1));
      this.listen(this.viewport, 'click', this.handleGridClick);
      this.listen(this.viewport, 'keydown', this.onGridKeydown);
      this.renderGrid();
      this.updateDisplay();
    }

    onOpen() {
      const target = this.grid.querySelector('[tabindex="0"]');
      if (target) target.focus();
    }

    handleGridClick(event) {
      const day = event.target.closest('.dx-cal-day');
      if (day) {
        this.select(day.getAttribute('data-date'));
        return;
      }
      const month = event.target.closest('.dx-cal-month');
      if (month) {
        this.viewMonth = Number(month.getAttribute('data-month'));
        this.setView('days', 1);
        return;
      }
      const year = event.target.closest('.dx-cal-year');
      if (year) {
        this.viewYear = Number(year.getAttribute('data-year'));
        this.setView('months', 1);
      }
    }

    drillUp() {
      if (this.view === 'days') this.setView('months', -1);
      else if (this.view === 'months') this.setView('years', -1);
      else this.setView('days', 1);
    }

    setView(view, direction) {
      if (this.gridAnimating || view === this.view) return;
      this.view = view;
      this.swapGrid(direction, 'y');
      const target = this.grid.querySelector('[tabindex="0"]');
      if (target && this.isOpen) target.focus();
    }

    yearBase() {
      return Math.floor(this.viewYear / 12) * 12;
    }

    titleText() {
      if (this.view === 'months') return String(this.viewYear);
      if (this.view === 'years') return this.yearBase() + ' – ' + (this.yearBase() + 11);
      return this.options.months[this.viewMonth] + ' ' + this.viewYear;
    }

    selectedKey() {
      return this.options.range ? this.rangeStart : this.value;
    }

    gridClassNames() {
      return this.view === 'days' ? 'dx-cal-grid' : 'dx-cal-grid dx-cal-grid--cells';
    }

    gridMarkup() {
      if (this.view === 'months') return this.monthsMarkup();
      if (this.view === 'years') return this.yearsMarkup();
      return this.daysMarkup();
    }

    daysMarkup() {
      const first = new Date(this.viewYear, this.viewMonth, 1);
      const offset = (first.getDay() - this.options.firstDay + 7) % 7;
      let cells = '';
      for (let i = 0; i < 42; i++) {
        const date = new Date(this.viewYear, this.viewMonth, 1 - offset + i);
        const key = keyOf(date);
        let classes = 'dx-cal-day';
        let disabled = false;
        if ((this.options.min && key < this.options.min) ||
            (this.options.max && key > this.options.max) ||
            (this.options.isDisabled && this.options.isDisabled(date, key))) {
          classes += ' is-disabled';
          disabled = true;
        }
        if (date.getMonth() !== this.viewMonth) classes += ' is-outside';
        if (key === this.todayKey) classes += ' is-today';
        let selected = false;
        if (this.options.range) {
          if (key === this.rangeStart) {
            classes += ' is-selected is-range-start';
            selected = true;
          }
          if (key === this.rangeEnd) {
            classes += ' is-selected is-range-end';
            selected = true;
          }
          if (this.rangeStart && this.rangeEnd && key > this.rangeStart && key < this.rangeEnd) {
            classes += ' is-in-range';
          }
        } else if (key === this.value) {
          classes += ' is-selected';
          selected = true;
        }
        cells += '<button type="button" class="' + classes + '"' + (disabled ? ' disabled aria-disabled="true"' : '') +
          ' role="gridcell" tabindex="-1" data-date="' + key +
          '" aria-label="' + date.getDate() + ' de ' + this.options.months[date.getMonth()] + ' de ' + date.getFullYear() +
          '" aria-selected="' + selected + '">' + date.getDate() + '</button>';
      }
      return cells;
    }

    monthsMarkup() {
      const today = new Date();
      const selected = this.selectedKey() ? dateOf(this.selectedKey()) : null;
      let cells = '';
      for (let month = 0; month < 12; month++) {
        let classes = 'dx-cal-cell dx-cal-month';
        if (today.getFullYear() === this.viewYear && today.getMonth() === month) classes += ' is-today';
        const isSelected = Boolean(selected) &&
          selected.getFullYear() === this.viewYear &&
          selected.getMonth() === month;
        if (isSelected) classes += ' is-selected';
        cells += '<button type="button" class="' + classes + '" role="gridcell" tabindex="-1" data-month="' + month +
          '" aria-label="' + this.options.months[month] + ' de ' + this.viewYear +
          '" aria-selected="' + isSelected + '">' + this.options.months[month].slice(0, 3) + '</button>';
      }
      return cells;
    }

    yearsMarkup() {
      const base = this.yearBase();
      const currentYear = new Date().getFullYear();
      const selected = this.selectedKey() ? dateOf(this.selectedKey()).getFullYear() : null;
      let cells = '';
      for (let i = 0; i < 12; i++) {
        const year = base + i;
        let classes = 'dx-cal-cell dx-cal-year';
        if (year === currentYear) classes += ' is-today';
        const isSelected = year === selected;
        if (isSelected) classes += ' is-selected';
        cells += '<button type="button" class="' + classes + '" role="gridcell" tabindex="-1" data-year="' + year +
          '" aria-selected="' + isSelected + '">' + year + '</button>';
      }
      return cells;
    }

    renderGrid() {
      this.grid.className = this.gridClassNames();
      this.grid.innerHTML = this.gridMarkup();
      this.title.textContent = this.titleText();
      this.weekRow.classList.toggle('is-hidden', this.view !== 'days');
      this.updateRoving();
    }

    updateRoving() {
      const target = this.grid.querySelector('.is-selected:not(.is-outside)') ||
        this.grid.querySelector('.is-today:not(.is-outside)') ||
        this.grid.querySelector('[role="gridcell"]:not(.is-outside)');
      if (target) target.setAttribute('tabindex', '0');
    }

    navigate(direction, focusKey) {
      if (this.gridAnimating) return;
      if (this.view === 'days') {
        const next = new Date(this.viewYear, this.viewMonth + direction, 1);
        this.viewYear = next.getFullYear();
        this.viewMonth = next.getMonth();
      } else if (this.view === 'months') {
        this.viewYear += direction;
      } else {
        this.viewYear += direction * 12;
      }
      this.swapGrid(direction, 'x', focusKey);
    }

    swapGrid(direction, axis, focusKey) {
      const oldGrid = this.grid;
      const newGrid = Utils.el('div', this.gridClassNames() + ' is-incoming', { role: 'grid', 'aria-label': 'Calendario' });
      newGrid.innerHTML = this.gridMarkup();
      this.viewport.appendChild(newGrid);
      this.grid = newGrid;
      this.title.textContent = this.titleText();
      this.weekRow.classList.toggle('is-hidden', this.view !== 'days');
      this.updateRoving();
      const finish = () => {
        oldGrid.remove();
        newGrid.classList.remove('is-incoming');
        this.gridAnimating = false;
        if (focusKey) {
          const cell = newGrid.querySelector('[data-date="' + focusKey + '"]');
          if (cell) cell.focus();
        }
      };
      if (Utils.reducedMotion) {
        finish();
        return;
      }
      this.gridAnimating = true;
      const shift = axis === 'y' ? { y: direction * 26 } : { x: direction * 36 };
      const back = axis === 'y' ? { y: -direction * 26 } : { x: -direction * 36 };
      Motion.fromTo(newGrid, Object.assign({ opacity: 0 }, shift), { x: 0, y: 0, opacity: 1, duration: 0.3, ease: 'outQuart' });
      Motion.to(oldGrid, Object.assign({ opacity: 0, duration: 0.3, ease: 'outQuart', onComplete: finish }, back));
    }

    onGridKeydown(event) {
      if (this.view !== 'days') {
        this.onCellsKeydown(event);
        return;
      }
      const focused = document.activeElement;
      if (!focused || !focused.hasAttribute('data-date')) return;
      const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      let targetDate = null;
      if (steps[event.key] !== undefined) {
        targetDate = dateOf(focused.getAttribute('data-date'));
        targetDate.setDate(targetDate.getDate() + steps[event.key]);
      } else if (event.key === 'PageUp' || event.key === 'PageDown') {
        event.preventDefault();
        this.navigate(event.key === 'PageUp' ? -1 : 1);
        return;
      } else {
        return;
      }
      event.preventDefault();
      const targetKey = keyOf(targetDate);
      const inView = targetDate.getMonth() === this.viewMonth && targetDate.getFullYear() === this.viewYear;
      if (inView) {
        const cell = this.grid.querySelector('[data-date="' + targetKey + '"]:not(.is-outside)');
        if (cell) cell.focus();
        return;
      }
      const direction = targetKey < keyOf(new Date(this.viewYear, this.viewMonth, 1)) ? -1 : 1;
      this.navigate(direction, targetKey);
    }

    onCellsKeydown(event) {
      if (event.key === 'PageUp' || event.key === 'PageDown') {
        event.preventDefault();
        this.navigate(event.key === 'PageUp' ? -1 : 1);
        return;
      }
      const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 };
      if (steps[event.key] === undefined) return;
      const focused = document.activeElement;
      if (!focused || !this.grid.contains(focused)) return;
      event.preventDefault();
      const cells = Array.from(this.grid.querySelectorAll('[role="gridcell"]'));
      const index = Utils.clamp(cells.indexOf(focused) + steps[event.key], 0, cells.length - 1);
      cells[index].focus();
    }

    select(key) {
      if (this.options.range) {
        if (!this.rangeStart || (this.rangeStart && this.rangeEnd)) {
          this.rangeStart = key;
          this.rangeEnd = null;
        } else if (key < this.rangeStart) {
          this.rangeStart = key;
        } else {
          this.rangeEnd = key;
        }
      } else {
        this.value = key;
      }
      const selectedDate = dateOf(key);
      if (selectedDate.getMonth() !== this.viewMonth || selectedDate.getFullYear() !== this.viewYear) {
        this.viewYear = selectedDate.getFullYear();
        this.viewMonth = selectedDate.getMonth();
      }
      this.renderGrid();
      const cell = this.grid.querySelector('[data-date="' + key + '"]:not(.is-outside)');
      if (cell) {
        cell.focus();
        Motion.fromTo(cell, { scale: 0.6 }, { scale: 1, duration: 0.35, ease: 'outBack' });
      }
      this.updateDisplay();
      this.emitChange();
      if (!this.options.range || (this.rangeStart && this.rangeEnd)) this.finishSelection();
    }

    finishSelection() {
      this.close();
      this.trigger.focus();
    }

    formatKey(key) {
      const date = dateOf(key);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const fullYear = String(date.getFullYear());
      const monthName = this.options.months[date.getMonth()].slice(0, 3);
      return String(this.options.format)
        .replace('yyyy', fullYear)
        .replace('yy', fullYear.slice(2))
        .replace('mon', monthName)
        .replace('mm', month)
        .replace('dd', day);
    }

    updateDisplay() {
      if (this.options.range) {
        if (this.rangeStart && this.rangeEnd) {
          this.setDisplay(this.formatKey(this.rangeStart) + ' — ' + this.formatKey(this.rangeEnd));
        } else if (this.rangeStart) {
          this.setDisplay(this.formatKey(this.rangeStart) + ' — …');
        } else {
          this.setDisplay(null);
        }
        return;
      }
      this.setDisplay(this.value ? this.formatKey(this.value) : null);
    }

    emitChange() {
      if (!this.options.onChange) return;
      if (this.options.range) this.options.onChange({ start: this.rangeStart, end: this.rangeEnd }, this);
      else this.options.onChange(this.value, this);
    }

    getValue() {
      return this.options.range ? { start: this.rangeStart, end: this.rangeEnd } : this.value;
    }

    setValue(value) {
      if (this.options.range) {
        const next = value || {};
        this.rangeStart = next.start || null;
        this.rangeEnd = next.end || null;
      } else {
        this.value = value || null;
      }
      const anchorKey = this.options.range ? this.rangeStart || this.todayKey : this.value || this.todayKey;
      const anchor = dateOf(anchorKey);
      this.viewYear = anchor.getFullYear();
      this.viewMonth = anchor.getMonth();
      this.view = 'days';
      this.renderGrid();
      this.updateDisplay();
    }
  }

  return DatePicker;
});
