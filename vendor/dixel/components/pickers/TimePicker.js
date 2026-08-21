Dixel.define('TimePicker', ['PickerBase', 'Motion', 'Utils'], function (PickerBase, Motion, Utils) {
  'use strict';

  const clockIcon = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';
  const upIcon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';
  const downIcon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

  function pad(value) {
    return value < 10 ? '0' + value : '' + value;
  }

  class TimePicker extends PickerBase {
    static defaults = Object.assign({}, PickerBase.defaults, {
      placeholder: 'Elegir hora',
      value: null,
      format: 24,
      stepMinutes: 5,
      formatToggle: false,
      quickMinutes: [0, 15, 30, 45]
    });

    triggerIcon() {
      return clockIcon;
    }

    panelMarkup() {
      const unit = (name, label) =>
        '<div class="dx-time-unit" data-unit="' + name + '">' +
        '<button class="dx-time-step dx-focusable" type="button" data-dir="1" aria-label="Aumentar ' + label.toLowerCase() + '">' + upIcon + '</button>' +
        '<div class="dx-time-value dx-focusable" role="spinbutton" tabindex="0" aria-label="' + label + '"></div>' +
        '<button class="dx-time-step dx-focusable" type="button" data-dir="-1" aria-label="Reducir ' + label.toLowerCase() + '">' + downIcon + '</button>' +
        '</div>';
      const quick = this.options.quickMinutes && this.options.quickMinutes.length
        ? '<div class="dx-time-quick" role="group" aria-label="Minutos rápidos">' +
          this.options.quickMinutes
            .map((minute) => '<button class="dx-time-chip dx-focusable" type="button" data-minute="' + minute + '">:' + pad(minute) + '</button>')
            .join('') +
          '</div>'
        : '';
      const toggle = this.options.formatToggle
        ? '<button class="dx-time-format dx-focusable" type="button"></button>'
        : '';
      return '<div class="dx-time-units">' +
        unit('h', 'Horas') +
        '<span class="dx-time-sep" aria-hidden="true">:</span>' +
        unit('m', 'Minutos') +
        '<div class="dx-time-ampm" role="group" aria-label="Meridiano">' +
        '<button class="dx-time-ap dx-focusable" type="button" data-ap="0">AM</button>' +
        '<button class="dx-time-ap dx-focusable" type="button" data-ap="1">PM</button>' +
        '</div>' +
        '</div>' + quick + toggle;
    }

    setupPanel() {
      const now = new Date();
      const step = this.options.stepMinutes;
      this.format = this.options.format === 12 ? 12 : 24;
      this.hour = now.getHours();
      this.minute = (Math.round(now.getMinutes() / step) * step) % 60;
      if (this.options.value) {
        const parts = this.options.value.split(':');
        this.hour = Utils.clamp(Number(parts[0]) || 0, 0, 23);
        this.minute = Utils.clamp(Number(parts[1]) || 0, 0, 59);
      }
      this.hasValue = Boolean(this.options.value);
      this.units = {
        h: this.panel.querySelector('[data-unit="h"] .dx-time-value'),
        m: this.panel.querySelector('[data-unit="m"] .dx-time-value')
      };
      this.ampm = this.panel.querySelector('.dx-time-ampm');
      this.formatBtn = this.panel.querySelector('.dx-time-format');
      ['h', 'm'].forEach((name) => {
        const unitEl = this.panel.querySelector('[data-unit="' + name + '"]');
        this.listen(unitEl, 'click', (event) => {
          const button = event.target.closest('.dx-time-step');
          if (button) this.spin(name, Number(button.getAttribute('data-dir')));
        });
        this.listen(unitEl, 'wheel', (event) => {
          event.preventDefault();
          this.spin(name, event.deltaY < 0 ? 1 : -1);
        }, { passive: false });
        this.listen(this.units[name], 'keydown', (event) => {
          const direction = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
          if (!direction) return;
          event.preventDefault();
          this.spin(name, direction);
        });
      });
      this.listen(this.ampm, 'click', (event) => {
        const button = event.target.closest('.dx-time-ap');
        if (!button) return;
        this.setMeridiem(button.getAttribute('data-ap') === '1');
      });
      const quick = this.panel.querySelector('.dx-time-quick');
      if (quick) {
        this.listen(quick, 'click', (event) => {
          const chip = event.target.closest('.dx-time-chip');
          if (!chip) return;
          this.minute = Number(chip.getAttribute('data-minute'));
          this.bump(this.units.m, 1);
          this.commit();
        });
      }
      if (this.formatBtn) {
        this.listen(this.formatBtn, 'click', () => {
          this.format = this.format === 12 ? 24 : 12;
          this.render();
          if (this.hasValue) this.updateDisplay();
        });
      }
      this.render();
      if (this.hasValue) this.updateDisplay();
    }

    onOpen() {
      this.units.h.focus();
    }

    spin(name, direction) {
      if (name === 'h') this.hour = (this.hour + direction + 24) % 24;
      else this.minute = (this.minute + direction * this.options.stepMinutes + 60) % 60;
      this.bump(this.units[name], direction);
      this.commit();
    }

    setMeridiem(pm) {
      const base = this.hour % 12;
      const next = pm ? base + 12 : base;
      if (next === this.hour) return;
      this.hour = next;
      this.commit();
    }

    bump(el, direction) {
      if (Utils.reducedMotion) return;
      Motion.fromTo(
        el,
        { y: direction > 0 ? -12 : 12, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.26, ease: 'out' }
      );
    }

    commit() {
      this.hasValue = true;
      this.render();
      this.updateDisplay();
      if (this.options.onChange) this.options.onChange(pad(this.hour) + ':' + pad(this.minute), this);
    }

    getValue() {
      return this.hasValue ? pad(this.hour) + ':' + pad(this.minute) : null;
    }

    setValue(value) {
      const parts = String(value || '').split(':');
      const hour = Number(parts[0]);
      const minute = Number(parts[1]);
      if (!Number.isInteger(hour) || !Number.isInteger(minute)) return;
      this.hour = Utils.clamp(hour, 0, 23);
      this.minute = Utils.clamp(minute, 0, 59);
      this.hasValue = true;
      this.render();
      this.updateDisplay();
    }

    render() {
      const twelve = this.format === 12;
      this.panel.classList.toggle('is-12h', twelve);
      this.units.h.textContent = pad(twelve ? this.hour % 12 || 12 : this.hour);
      this.units.m.textContent = pad(this.minute);
      this.units.h.setAttribute('aria-valuemin', '0');
      this.units.h.setAttribute('aria-valuemax', '23');
      this.units.h.setAttribute('aria-valuenow', String(this.hour));
      this.units.h.setAttribute('aria-valuetext', this.units.h.textContent + (twelve ? (this.hour < 12 ? ' AM' : ' PM') : ' horas'));
      this.units.m.setAttribute('aria-valuemin', '0');
      this.units.m.setAttribute('aria-valuemax', '59');
      this.units.m.setAttribute('aria-valuenow', String(this.minute));
      this.units.m.setAttribute('aria-valuetext', pad(this.minute) + ' minutos');
      Array.from(this.ampm.querySelectorAll('.dx-time-ap')).forEach((button) => {
        const active = (button.getAttribute('data-ap') === '1') === this.hour >= 12;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      const chips = this.panel.querySelectorAll('.dx-time-chip');
      for (let i = 0; i < chips.length; i++) {
        chips[i].classList.toggle('is-active', Number(chips[i].getAttribute('data-minute')) === this.minute);
      }
      if (this.formatBtn) this.formatBtn.textContent = twelve ? 'Usar formato 24 h' : 'Usar formato 12 h';
    }

    updateDisplay() {
      if (this.format === 12) {
        const hour12 = this.hour % 12 || 12;
        this.setDisplay(pad(hour12) + ':' + pad(this.minute) + ' ' + (this.hour < 12 ? 'AM' : 'PM'));
        return;
      }
      this.setDisplay(pad(this.hour) + ':' + pad(this.minute));
    }
  }

  return TimePicker;
});
