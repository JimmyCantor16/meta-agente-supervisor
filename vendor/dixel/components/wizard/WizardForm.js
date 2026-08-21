Dixel.define('WizardForm', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const checkIcon = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const bigCheckIcon = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const chevronIcon = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

  class WizardForm extends Component {
    static defaults = {
      steps: [],
      summaryTitle: 'Revisa tu información',
      summaryText: 'Confirma que todo esté correcto antes de enviar.',
      summaryLabel: 'Resumen',
      successTitle: '¡Todo listo!',
      successText: 'Recibimos tu información correctamente.',
      prevLabel: 'Anterior',
      nextLabel: 'Siguiente',
      confirmLabel: 'Confirmar',
      requiredMessage: 'Este campo es obligatorio.',
      emailMessage: 'Ingresa un correo válido.',
      minLengthMessage: 'Usa al menos {n} caracteres.',
      onComplete: null
    };

    build() {
      const el = Utils.el('form', 'dx-wizard dx-reset', { novalidate: '' });
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      const steps = this.options.steps || [];
      const dotLabels = steps.map((step) => step.title).concat([this.options.summaryLabel]);
      const dots = dotLabels.map((label, index) =>
        '<div class="dx-wizard-dot"><span class="dx-wizard-dotmark"><span class="dx-wizard-dotnum">' + (index + 1) + '</span>' +
        '<span class="dx-wizard-dotcheck">' + checkIcon + '</span></span>' +
        '<span class="dx-wizard-dotlabel">' + Utils.escape(label) + '</span></div>'
      ).join('');
      const sections = steps.map((step) => this.stepMarkup(step)).join('');
      return '<header class="dx-wizard-head">' +
        '<div class="dx-wizard-dots">' + dots + '</div>' +
        '<div class="dx-wizard-progress" aria-hidden="true"><span class="dx-wizard-progressfill"></span></div>' +
        '</header>' +
        '<div class="dx-wizard-viewport"><div class="dx-wizard-track">' + sections +
        '<section class="dx-wizard-step dx-wizard-step--summary">' +
        '<h3 class="dx-wizard-steptitle" tabindex="-1">' + Utils.escape(this.options.summaryTitle) + '</h3>' +
        '<p class="dx-wizard-stepdesc">' + Utils.escape(this.options.summaryText) + '</p>' +
        '<dl class="dx-wizard-summary"></dl></section>' +
        '<section class="dx-wizard-step dx-wizard-step--success">' +
        '<span class="dx-wizard-check" aria-hidden="true">' + bigCheckIcon + '</span>' +
        '<h3 class="dx-wizard-steptitle" tabindex="-1">' + Utils.escape(this.options.successTitle) + '</h3>' +
        '<p class="dx-wizard-stepdesc">' + Utils.escape(this.options.successText) + '</p></section>' +
        '</div></div>' +
        '<footer class="dx-wizard-foot">' +
        '<button class="dx-wizard-btn dx-wizard-prev dx-focusable" type="button">' + Utils.escape(this.options.prevLabel) + '</button>' +
        '<span class="dx-wizard-countinfo"></span>' +
        '<button class="dx-wizard-btn dx-wizard-btn--primary dx-wizard-next dx-focusable" type="submit">' + Utils.escape(this.options.nextLabel) + '</button>' +
        '</footer>';
    }

    stepMarkup(step) {
      const description = step.description ? '<p class="dx-wizard-stepdesc">' + Utils.escape(step.description) + '</p>' : '';
      const fields = (step.fields || []).map((field) => this.fieldMarkup(field)).join('');
      return '<section class="dx-wizard-step">' +
        '<h3 class="dx-wizard-steptitle" tabindex="-1">' + Utils.escape(step.title) + '</h3>' + description +
        '<div class="dx-wizard-fields">' + fields + '</div></section>';
    }

    fieldMarkup(field) {
      const id = Utils.uid();
      const errorId = id + '-error';
      const required = field.required ? ' <span class="dx-wizard-req" aria-hidden="true">*</span>' : '';
      let control;
      if (field.type === 'select') {
        const optionList = (field.options || []).map((option) => {
          const value = typeof option === 'string' ? option : option.value;
          const label = typeof option === 'string' ? option : option.label;
          const selected = field.value === value ? ' selected' : '';
          return '<option value="' + Utils.escape(value) + '"' + selected + '>' + Utils.escape(label) + '</option>';
        }).join('');
        const placeholder = field.placeholder ? '<option value="" disabled' + (field.value ? '' : ' selected') + '>' + Utils.escape(field.placeholder) + '</option>' : '';
        control = '<span class="dx-wizard-selectwrap"><select class="dx-wizard-input dx-wizard-select" id="' + id + '" name="' + field.name + '" aria-describedby="' + errorId + '">' +
          placeholder + optionList + '</select><span class="dx-wizard-chevron" aria-hidden="true">' + chevronIcon + '</span></span>';
      } else {
        const type = field.type === 'email' ? 'email' : 'text';
        control = '<input class="dx-wizard-input" id="' + id + '" type="' + type + '" name="' + field.name + '"' +
          (field.placeholder ? ' placeholder="' + Utils.escape(field.placeholder) + '"' : '') +
          (field.value ? ' value="' + Utils.escape(field.value) + '"' : '') +
          ' aria-describedby="' + errorId + '" autocomplete="off">';
      }
      return '<div class="dx-wizard-field" data-name="' + field.name + '">' +
        '<label class="dx-wizard-label" for="' + id + '">' + Utils.escape(field.label) + required + '</label>' +
        control + '<span class="dx-wizard-error" id="' + errorId + '" role="alert"></span></div>';
    }

    ready() {
      this.el.classList.add('dx-wizard', 'dx-reset');
      if (!this.el.querySelector('.dx-wizard-track')) this.el.innerHTML = this.markup();
      this.steps = this.options.steps || [];
      this.data = {};
      this.index = 0;
      this.viewport = this.el.querySelector('.dx-wizard-viewport');
      this.track = this.el.querySelector('.dx-wizard-track');
      this.sections = Array.from(this.track.children);
      this.dots = Array.from(this.el.querySelectorAll('.dx-wizard-dot'));
      this.progressFill = this.el.querySelector('.dx-wizard-progressfill');
      this.summaryEl = this.el.querySelector('.dx-wizard-summary');
      this.prevBtn = this.el.querySelector('.dx-wizard-prev');
      this.nextBtn = this.el.querySelector('.dx-wizard-next');
      this.countEl = this.el.querySelector('.dx-wizard-countinfo');
      this.listen(this.el, 'submit', (event) => {
        event.preventDefault();
        this.next();
      });
      this.listen(this.prevBtn, 'click', () => this.prev());
      this.listen(this.el, 'input', (event) => {
        const wrap = event.target.closest('.dx-wizard-field');
        if (wrap) this.clearError(wrap);
      });
      this.listen(window, 'resize', () => this.relayout());
      this.sync(true);
    }

    measureWidth() {
      return this.viewport.clientWidth || 0;
    }

    relayout() {
      const width = this.measureWidth();
      Motion.set(this.track, { x: -this.index * width });
      this.viewport.classList.add('is-instant');
      this.setHeight();
      this.viewport.classList.remove('is-instant');
    }

    setHeight() {
      const section = this.sections[this.index];
      this.viewport.style.height = section.offsetHeight + 'px';
    }

    sync(instant) {
      const total = this.sections.length;
      const lastNavigable = total - 2;
      const success = this.index === total - 1;
      this.sections.forEach((section, index) => {
        const active = index === this.index;
        section.classList.toggle('is-active', active);
        if ('inert' in section) section.inert = !active;
        section.setAttribute('aria-hidden', active ? 'false' : 'true');
      });
      this.dots.forEach((dot, index) => {
        dot.classList.toggle('is-active', index === this.index && !success);
        dot.classList.toggle('is-done', index < this.index || success);
      });
      this.progressFill.style.transform = 'scaleX(' + Utils.clamp(this.index / (total - 1), 0, 1) + ')';
      this.el.classList.toggle('is-complete', success);
      this.prevBtn.disabled = this.index === 0;
      this.nextBtn.textContent = this.index === lastNavigable ? this.options.confirmLabel : this.options.nextLabel;
      this.countEl.textContent = success ? '' : 'Paso ' + (this.index + 1) + ' de ' + (lastNavigable + 1);
      if (instant) {
        Motion.set(this.track, { x: -this.index * this.measureWidth() });
        this.setHeight();
      }
    }

    next() {
      const summaryIndex = this.sections.length - 2;
      if (this.index < this.steps.length) {
        if (!this.validate(this.index)) return;
        this.collect(this.index);
        if (this.index + 1 === summaryIndex) this.fillSummary();
        this.goTo(this.index + 1);
      } else if (this.index === summaryIndex) {
        if (this.options.onComplete) this.options.onComplete(Object.assign({}, this.data));
        this.goTo(this.index + 1);
      }
    }

    prev() {
      if (this.index === 0 || this.index === this.sections.length - 1) return;
      this.goTo(this.index - 1);
    }

    goTo(index) {
      this.index = index;
      const width = this.measureWidth();
      Motion.to(this.track, { x: -index * width, duration: 0.5, ease: 'inOut' });
      this.setHeight();
      this.sync(false);
      const heading = this.sections[index].querySelector('.dx-wizard-steptitle');
      if (heading) heading.focus({ preventScroll: true });
    }

    fieldsOf(stepIndex) {
      return Array.from(this.sections[stepIndex].querySelectorAll('.dx-wizard-field')).map((wrap) => {
        const name = wrap.getAttribute('data-name');
        const config = (this.steps[stepIndex].fields || []).find((field) => field.name === name) || {};
        return { wrap, config, input: wrap.querySelector('.dx-wizard-input'), errorEl: wrap.querySelector('.dx-wizard-error') };
      });
    }

    validate(stepIndex) {
      let firstInvalid = null;
      this.fieldsOf(stepIndex).forEach((field) => {
        const value = field.input.value.trim();
        let message = '';
        if (field.config.required && !value) message = this.options.requiredMessage;
        else if (value && field.config.type === 'email' && !emailPattern.test(value)) message = this.options.emailMessage;
        else if (value && field.config.minLength && value.length < field.config.minLength) {
          message = this.options.minLengthMessage.replace('{n}', field.config.minLength);
        }
        if (message) {
          this.showError(field, message);
          if (!firstInvalid) firstInvalid = field;
        } else {
          this.clearError(field.wrap);
        }
      });
      if (firstInvalid) {
        this.shake(this.sections[stepIndex]);
        firstInvalid.input.focus();
        return false;
      }
      return true;
    }

    showError(field, message) {
      field.errorEl.textContent = message;
      field.wrap.classList.add('is-invalid');
      field.input.setAttribute('aria-invalid', 'true');
    }

    clearError(wrap) {
      if (!wrap.classList.contains('is-invalid')) return;
      wrap.classList.remove('is-invalid');
      wrap.querySelector('.dx-wizard-error').textContent = '';
      wrap.querySelector('.dx-wizard-input').removeAttribute('aria-invalid');
    }

    shake(section) {
      if (Utils.reducedMotion) return;
      section.classList.remove('is-shake');
      void section.offsetWidth;
      section.classList.add('is-shake');
      const unbind = Utils.on(section, 'animationend', () => {
        section.classList.remove('is-shake');
        unbind();
      });
    }

    collect(stepIndex) {
      this.fieldsOf(stepIndex).forEach((field) => {
        this.data[field.config.name] = field.input.value.trim();
      });
    }

    displayValue(field) {
      const value = this.data[field.name] || '';
      if (field.type === 'select' && value) {
        const option = (field.options || []).find((item) => (typeof item === 'string' ? item : item.value) === value);
        if (option) return typeof option === 'string' ? option : option.label;
      }
      return value || '—';
    }

    fillSummary() {
      this.summaryEl.innerHTML = this.steps.map((step) =>
        (step.fields || []).map((field) =>
          '<div class="dx-wizard-sumrow"><dt>' + Utils.escape(field.label) + '</dt><dd>' + Utils.escape(this.displayValue(field)) + '</dd></div>'
        ).join('')
      ).join('');
      this.setHeight();
    }
  }

  return WizardForm;
});
