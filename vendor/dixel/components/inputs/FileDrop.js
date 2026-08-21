Dixel.define('FileDrop', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const uploadIcon =
    '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4m0 0 4 4m-4-4-4 4"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/></svg>';

  class FileDrop extends Component {
    static defaults = {
      label: 'Drop files here',
      hint: 'or click to browse',
      accept: '',
      multiple: true,
      name: '',
      onFiles: null
    };

    build() {
      const el = Utils.el('div', 'dx-drop dx-reset dx-motion', {
        tabindex: '0',
        role: 'button',
        'aria-label': this.options.label
      });
      this.populate(el);
      return el;
    }

    populate(el) {
      el.appendChild(Utils.el('span', 'dx-drop-icon', { html: uploadIcon, 'aria-hidden': 'true' }));
      el.appendChild(Utils.el('span', 'dx-drop-title', { text: this.options.label }));
      el.appendChild(Utils.el('span', 'dx-drop-hint', { text: this.options.hint }));
      this.filesEl = Utils.el('span', 'dx-drop-files');
      el.appendChild(this.filesEl);
      this.input = Utils.el('input', 'dx-drop-input', { type: 'file' });
      if (this.options.accept) this.input.accept = this.options.accept;
      if (this.options.multiple) this.input.multiple = true;
      if (this.options.name) this.input.name = this.options.name;
      el.appendChild(this.input);
    }

    ready() {
      if (!this.input) {
        this.el.classList.add('dx-drop', 'dx-reset', 'dx-motion');
        this.el.setAttribute('tabindex', '0');
        this.el.setAttribute('role', 'button');
        this.el.setAttribute('aria-label', this.options.label);
        this.populate(this.el);
      }
      this.dragDepth = 0;
      this.listen(this.el, 'click', this.openPicker);
      this.listen(this.el, 'keydown', this.handleKeyDown);
      this.listen(this.el, 'dragenter', this.handleDragEnter);
      this.listen(this.el, 'dragover', this.handleDragOver);
      this.listen(this.el, 'dragleave', this.handleDragLeave);
      this.listen(this.el, 'drop', this.handleDrop);
      this.listen(this.input, 'change', this.handlePicked);
    }

    openPicker(event) {
      if (event.target === this.input) return;
      this.input.click();
    }

    handleKeyDown(event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.input.click();
      }
    }

    handleDragEnter(event) {
      event.preventDefault();
      this.dragDepth++;
      this.el.classList.add('is-over');
    }

    handleDragOver(event) {
      event.preventDefault();
    }

    handleDragLeave() {
      this.dragDepth = Math.max(this.dragDepth - 1, 0);
      if (!this.dragDepth) this.el.classList.remove('is-over');
    }

    handleDrop(event) {
      event.preventDefault();
      this.dragDepth = 0;
      this.el.classList.remove('is-over');
      this.acceptFiles(event.dataTransfer.files);
    }

    handlePicked() {
      this.acceptFiles(this.input.files);
      this.input.value = '';
    }

    acceptFiles(fileList) {
      const files = Array.from(fileList || []);
      if (!files.length) return;
      this.filesEl.textContent = files.map((file) => file.name).join(', ');
      this.el.classList.add('is-loaded');
      if (!Utils.reducedMotion) {
        Motion.fromTo(this.filesEl, { y: 8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: 'out' });
      }
      if (this.options.onFiles) this.options.onFiles(files, this);
    }
  }

  return FileDrop;
});
