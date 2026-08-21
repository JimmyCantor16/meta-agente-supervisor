Dixel.define('CommandBar', ['Component', 'Motion', 'Utils', 'Overlays'], function (Component, Motion, Utils, Overlays) {
  'use strict';

  const searchIcon = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>';

  class CommandBar extends Component {
    static defaults = {
      commands: [],
      placeholder: 'Escribe un comando…',
      emptyText: 'Sin resultados',
      hotkey: true
    };

    build() {
      const el = Utils.el('div', 'dx-cmdbar', { 'aria-hidden': 'true' });
      el.innerHTML = this.markup();
      return el;
    }

    markup() {
      this.listId = Utils.uid();
      return '<div class="dx-cmdbar-overlay"></div>' +
        '<div class="dx-cmdbar-panel" role="dialog" aria-modal="true" aria-label="Barra de comandos">' +
        '<header class="dx-cmdbar-head">' + searchIcon +
        '<input class="dx-cmdbar-input" type="text" placeholder="' + Utils.escape(this.options.placeholder) +
        '" aria-label="Buscar comandos" role="combobox" aria-expanded="true" aria-controls="' + this.listId + '" aria-autocomplete="list">' +
        '<kbd class="dx-cmdbar-kbd">Esc</kbd>' +
        '</header>' +
        '<ul class="dx-cmdbar-list dx-scroll-thin" id="' + this.listId + '" role="listbox" aria-label="Comandos"></ul>' +
        '<footer class="dx-cmdbar-foot"><span><kbd>↑</kbd><kbd>↓</kbd> navegar</span><span><kbd>Enter</kbd> ejecutar</span></footer>' +
        '</div>';
    }

    ready() {
      this.el.classList.add('dx-cmdbar');
      if (!this.el.querySelector('.dx-cmdbar-panel')) this.el.innerHTML = this.markup();
      this.el.setAttribute('aria-hidden', 'true');
      this.panel = this.el.querySelector('.dx-cmdbar-panel');
      this.overlay = this.el.querySelector('.dx-cmdbar-overlay');
      this.input = this.el.querySelector('.dx-cmdbar-input');
      this.list = this.el.querySelector('.dx-cmdbar-list');
      this.filtered = [];
      this.activeIndex = 0;
      this.isOpen = false;
      this.lastFocus = null;
      this.previousOverflow = '';
      this.listen(this.overlay, 'click', this.close);
      this.listen(this.input, 'input', () => this.renderList(this.input.value));
      this.listen(this.input, 'keydown', this.onKeydown);
      this.listen(this.list, 'click', (event) => {
        const option = event.target.closest('[data-index]');
        if (option) this.run(Number(option.getAttribute('data-index')));
      });
      this.listen(this.list, 'pointerover', (event) => {
        const option = event.target.closest('[data-index]');
        if (option) this.setActive(Number(option.getAttribute('data-index')), true);
      });
      if (this.options.hotkey) {
        this.listen(window, 'keydown', (event) => {
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            this.toggle();
          }
        });
      }
      this.addCleanup(() => this.unlockScroll());
    }

    onKeydown(event) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.setActive(this.activeIndex + 1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.setActive(this.activeIndex - 1);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        this.run(this.activeIndex);
      }
    }

    toggle() {
      if (this.isOpen) this.close();
      else this.open();
    }

    open() {
      if (this.isOpen) return;
      this.isOpen = true;
      this.lastFocus = document.activeElement;
      this.el.classList.add('is-open');
      this.el.setAttribute('aria-hidden', 'false');
      this.releaseScroll = Overlays.lock(this);
      this.popEscape = Overlays.pushEscape(() => this.close());
      this.input.value = '';
      this.renderList('');
      Motion.fromTo(this.panel, { scale: 0.94, y: 12, opacity: 0 }, { scale: 1, y: 0, opacity: 1, duration: 0.32, ease: 'outQuart' });
      const options = Array.from(this.list.children).slice(0, 8);
      if (options.length) Motion.fromTo(options, { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: 'outQuart', stagger: 0.03 });
      this.input.focus();
    }

    close() {
      if (!this.isOpen) return;
      this.isOpen = false;
      this.unlockScroll();
      Motion.to(this.panel, {
        scale: 0.96,
        y: 8,
        opacity: 0,
        duration: 0.16,
        ease: 'in',
        onComplete: () => {
          if (this.isOpen || !this.el) return;
          this.el.classList.remove('is-open');
          this.el.setAttribute('aria-hidden', 'true');
        }
      });
      if (this.lastFocus && this.lastFocus.focus) this.lastFocus.focus();
    }

    unlockScroll() {
      if (this.popEscape) {
        this.popEscape();
        this.popEscape = null;
      }
      if (this.releaseScroll) {
        this.releaseScroll();
        this.releaseScroll = null;
      }
    }

    renderList(query) {
      const normalized = query.trim().toLowerCase();
      this.filtered = this.options.commands.filter((command) => {
        if (!normalized) return true;
        return (command.label + ' ' + (command.keywords || '')).toLowerCase().includes(normalized);
      });
      if (!this.filtered.length) {
        this.list.innerHTML = '<li class="dx-cmdbar-empty">' + Utils.escape(this.options.emptyText) + '</li>';
        this.input.removeAttribute('aria-activedescendant');
        return;
      }
      this.list.innerHTML = this.filtered
        .map((command, index) => {
          const icon = command.icon ? '<span class="dx-cmdbar-icon" aria-hidden="true">' + command.icon + '</span>' : '';
          const hint = command.hint ? '<kbd class="dx-cmdbar-hint">' + Utils.escape(command.hint) + '</kbd>' : '';
          return '<li class="dx-cmdbar-option" role="option" aria-selected="false" id="' + this.listId + '-' + index +
            '" data-index="' + index + '">' + icon + '<span class="dx-cmdbar-label">' + Utils.escape(command.label) + '</span>' + hint + '</li>';
        })
        .join('');
      this.setActive(0, true);
    }

    setActive(index, skipScroll) {
      if (!this.filtered.length) return;
      this.activeIndex = Utils.clamp(index, 0, this.filtered.length - 1);
      Array.from(this.list.children).forEach((option, i) => {
        const active = i === this.activeIndex;
        option.classList.toggle('is-active', active);
        option.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      this.input.setAttribute('aria-activedescendant', this.listId + '-' + this.activeIndex);
      const activeOption = this.list.children[this.activeIndex];
      if (activeOption && !skipScroll) activeOption.scrollIntoView({ block: 'nearest' });
    }

    run(index) {
      const command = this.filtered[index];
      if (!command) return;
      this.close();
      if (command.onSelect) command.onSelect(command);
    }
  }

  return CommandBar;
});
