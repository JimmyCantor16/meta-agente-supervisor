Dixel.define('ChatInput', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const sendIcon = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 12L20 4.5 14.5 20l-3-6.5-7-1.5z"/><path d="M11.5 13.5L20 4.5"/></svg>';

  class ChatInput extends Component {
    static defaults = {
      placeholder: 'Escribe un mensaje…',
      sendLabel: 'Enviar mensaje',
      maxHeight: 132,
      onSend: null
    };

    build() {
      const el = Utils.el('form', 'dx-chatinput dx-reset');
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      return '<textarea class="dx-chatinput-field" rows="1" placeholder="' + Utils.escape(this.options.placeholder) + '" aria-label="' + Utils.escape(this.options.placeholder) + '"></textarea>' +
        '<button class="dx-chatinput-send dx-focusable" type="submit" aria-label="' + Utils.escape(this.options.sendLabel) + '" disabled>' + sendIcon + '</button>';
    }

    ready() {
      this.el.classList.add('dx-chatinput', 'dx-reset');
      if (!this.el.querySelector('.dx-chatinput-field')) this.el.innerHTML = this.markup();
      this.field = this.el.querySelector('.dx-chatinput-field');
      this.sendBtn = this.el.querySelector('.dx-chatinput-send');
      this.listen(this.el, 'submit', (event) => {
        event.preventDefault();
        this.send();
      });
      this.listen(this.field, 'input', () => {
        this.autosize();
        this.updateState();
      });
      this.listen(this.field, 'keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          this.send();
        }
      });
      this.updateState();
    }

    send() {
      const value = this.field.value.trim();
      if (!value) return;
      if (this.options.onSend) this.options.onSend(value);
      this.field.value = '';
      this.autosize();
      this.updateState();
      Motion.fromTo(this.sendBtn, { scale: 0.78 }, { scale: 1, duration: 0.35, ease: 'outBack' });
      this.field.focus();
    }

    autosize() {
      this.field.style.height = 'auto';
      this.field.style.height = Math.min(this.field.scrollHeight, this.options.maxHeight) + 'px';
    }

    updateState() {
      const hasText = this.field.value.trim().length > 0;
      this.sendBtn.disabled = !hasText;
      this.el.classList.toggle('is-ready', hasText);
    }

    focus() {
      this.field.focus();
    }
  }

  return ChatInput;
});
