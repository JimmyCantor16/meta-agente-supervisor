Dixel.define('ChatThread', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const tones = ['primary', 'cyan', 'magenta', 'success', 'warning'];
  const sentIcon = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const readIcon = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12.5l4.5 4.5L16.5 7.5"/><path d="M11 14.5l2.5 2.5L23 7.5"/></svg>';

  class ChatThread extends Component {
    static defaults = {
      messages: [],
      label: 'Conversación'
    };

    build() {
      const el = Utils.el('div', 'dx-chat dx-reset', { role: 'log', 'aria-label': this.options.label });
      el.innerHTML = '<div class="dx-chat-scroll"><div class="dx-chat-list"></div></div>';
      return el;
    }

    ready() {
      this.el.classList.add('dx-chat', 'dx-reset');
      if (!this.el.querySelector('.dx-chat-list')) {
        this.el.innerHTML = '<div class="dx-chat-scroll"><div class="dx-chat-list"></div></div>';
      }
      if (!this.el.getAttribute('role')) this.el.setAttribute('role', 'log');
      this.scroller = this.el.querySelector('.dx-chat-scroll');
      this.list = this.el.querySelector('.dx-chat-list');
      this.nearBottom = true;
      this.lastKey = null;
      this.lastGroup = null;
      this.listen(this.scroller, 'scroll', this.trackScroll, { passive: true });
      (this.options.messages || []).forEach((message) => this.append(message, true));
      this.scrollToEnd(true);
    }

    trackScroll() {
      const scroller = this.scroller;
      this.nearBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 48;
    }

    push(message) {
      const bubble = this.append(message, false);
      if (this.nearBottom) this.scrollToEnd(false);
      return bubble;
    }

    append(message, silent) {
      const data = this.normalize(message);
      const key = (data.own ? 'own' : 'other') + '|' + data.author;
      if (!this.lastGroup || this.lastKey !== key) {
        this.lastGroup = this.createGroup(data);
        this.lastKey = key;
        this.list.appendChild(this.lastGroup.el);
      }
      const bubble = this.createBubble(data);
      this.lastGroup.stack.appendChild(bubble);
      if (!silent) {
        Motion.fromTo(bubble, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35, ease: 'out' });
      }
      return bubble;
    }

    normalize(message) {
      return {
        author: message.author || 'Anónimo',
        initials: message.initials || this.initialsOf(message.author || 'A'),
        text: message.text || '',
        html: !!message.html,
        time: this.formatTime(message.time),
        own: !!message.own,
        status: message.status || 'sent',
        tone: message.tone || tones[this.hashOf(message.author || '') % tones.length]
      };
    }

    initialsOf(name) {
      const parts = name.trim().split(/\s+/);
      const first = parts[0] ? parts[0][0] : '';
      const second = parts[1] ? parts[1][0] : '';
      return (first + second).toUpperCase();
    }

    hashOf(text) {
      let hash = 0;
      for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
      return hash;
    }

    formatTime(time) {
      if (typeof time === 'string') return time;
      const date = time instanceof Date ? time : new Date(time || Date.now());
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return hours + ':' + minutes;
    }

    createGroup(data) {
      const el = Utils.el('div', 'dx-chat-group dx-chat-group--' + (data.own ? 'own' : 'other'));
      let stack;
      if (data.own) {
        stack = Utils.el('div', 'dx-chat-stack');
        el.appendChild(stack);
      } else {
        const avatar = Utils.el('span', 'dx-chat-avatar dx-chat-avatar--' + data.tone, { 'aria-hidden': 'true', text: data.initials });
        const body = Utils.el('div', 'dx-chat-groupbody');
        const name = Utils.el('span', 'dx-chat-author', { text: data.author });
        stack = Utils.el('div', 'dx-chat-stack');
        body.appendChild(name);
        body.appendChild(stack);
        el.appendChild(avatar);
        el.appendChild(body);
      }
      return { el, stack };
    }

    createBubble(data) {
      const bubble = Utils.el('div', 'dx-chat-bubble');
      const status = data.own
        ? '<span class="dx-chat-status' + (data.status === 'read' ? ' is-read' : '') + '" aria-label="' + (data.status === 'read' ? 'Leído' : 'Enviado') + '">' + (data.status === 'read' ? readIcon : sentIcon) + '</span>'
        : '';
      bubble.innerHTML =
        '<div class="dx-chat-bubblebody">' + (data.html ? data.text : Utils.escape(data.text)) + '</div>' +
        '<span class="dx-chat-meta"><time>' + Utils.escape(data.time || '') + '</time>' + status + '</span>';
      return bubble;
    }

    markRead() {
      this.el.querySelectorAll('.dx-chat-group--own .dx-chat-status').forEach((status) => {
        if (status.classList.contains('is-read')) return;
        status.classList.add('is-read');
        status.setAttribute('aria-label', 'Leído');
        status.innerHTML = readIcon;
      });
    }

    scrollToEnd(instant) {
      this.scroller.scrollTo({
        top: this.scroller.scrollHeight,
        behavior: instant || Utils.reducedMotion ? 'auto' : 'smooth'
      });
      this.nearBottom = true;
    }
  }

  return ChatThread;
});
