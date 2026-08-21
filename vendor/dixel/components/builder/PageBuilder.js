Dixel.define('PageBuilder', ['Component', 'Draggable', 'DropZone', 'Icon', 'Motion', 'Utils'], function (Component, Draggable, DropZone, Icon, Motion, Utils) {
  'use strict';

  const defaultPalette = [
    {
      group: 'Esenciales',
      items: [
        { class: 'Button', label: 'Botón', icon: 'cursorClick', options: { label: 'Comenzar', variant: 'solid', size: 'md' } },
        { class: 'GlowButton', label: 'Botón glow', icon: 'zap', options: { label: 'Lanzar', variant: 'solid', tone: 'cyan' } },
        { class: 'Badge', label: 'Badge', icon: 'tag', options: { label: 'Nuevo', tone: 'cyan', dot: true } },
        { class: 'Alert', label: 'Alerta', icon: 'checkCircle', options: { type: 'success', title: 'Guardado', message: 'Los cambios se aplicaron.', dismissible: false } }
      ]
    },
    {
      group: 'Tarjetas',
      items: [
        { class: 'Card', label: 'Tarjeta', icon: 'square', options: { title: 'Profundidad real', body: 'Superficies que capturan la luz de la interfaz.', footer: 'DIXEL · 2026' } },
        { class: 'TiltCard', label: 'Tarjeta tilt', icon: 'layers', options: { title: 'Sigue tu mano', body: 'Física amortiguada en cada eje.', maxTilt: 10, lift: 1.03 } },
        { class: 'PricingCard', label: 'Precios', icon: 'creditCard', options: { plan: 'Pro', price: '$29', period: '/mes', features: ['Proyectos ilimitados', 'Soporte prioritario', 'Analítica avanzada'], featured: true } }
      ]
    },
    {
      group: 'Formularios',
      items: [
        { class: 'TextField', label: 'Campo de texto', icon: 'edit', options: { label: 'Nombre completo', helper: 'Como aparece en tu documento', type: 'text' } },
        { class: 'SelectField', label: 'Selector', icon: 'list', options: { label: 'País', items: ['Colombia', 'México', 'Argentina', 'Chile'] } },
        { class: 'Switch', label: 'Interruptor', icon: 'toggleRight', options: { label: 'Notificaciones', checked: true } }
      ]
    },
    {
      group: 'Navegación',
      items: [
        { class: 'Tabs', label: 'Pestañas', icon: 'columns', options: { items: [{ label: 'Diseño', content: 'Sistemas visuales.' }, { label: 'Motion', content: 'Física en pantalla.' }, { label: 'Código', content: 'Vanilla puro.' }], active: 0 } },
        { class: 'Accordion', label: 'Acordeón', icon: 'rows', options: { items: [{ title: '¿Qué es DIXEL?', content: 'Una librería gráfica vanilla con UX cinematográfico.', open: true }, { title: '¿Tiene dependencias?', content: 'Cero. Todo corre sobre el núcleo propio.' }] } }
      ]
    },
    {
      group: 'Datos',
      items: [
        { class: 'StatCounter', label: 'Contador', icon: 'trendingUp', options: { value: 128450, label: 'Usuarios activos', suffix: '+', duration: 1.8 } },
        { class: 'KpiTile', label: 'KPI', icon: 'gauge', options: { label: 'Ingresos', value: 84300, prefix: '$', delta: 12.4, data: [30, 42, 38, 55, 49, 68, 61, 84], color: 'success' } },
        { class: 'LineChart', label: 'Líneas', icon: 'chartLine', options: { labels: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun'], series: [{ label: 'Ventas', data: [12, 19, 14, 26, 22, 34] }], pointMarkers: true, showGrid: true } },
        { class: 'BarChart', label: 'Barras', icon: 'chartBar', options: { data: [{ label: 'Lun', value: 42 }, { label: 'Mar', value: 61 }, { label: 'Mié', value: 38 }, { label: 'Jue', value: 74 }, { label: 'Vie', value: 55 }], format: 'number' } },
        { class: 'DonutProgress', label: 'Dona', icon: 'chartDonut', options: { segments: [{ label: 'Diseño', value: 34 }, { label: 'Desarrollo', value: 46 }, { label: 'QA', value: 20 }], centerLabel: 'Horas' } },
        { class: 'ProgressBar', label: 'Progreso', icon: 'loader', options: { value: 64, label: 'Subiendo archivos', showValue: true } }
      ]
    },
    {
      group: 'Texto',
      items: [
        { class: 'GradientText', label: 'Texto gradiente', icon: 'type', options: { text: 'Cinematográfico', gradient: 'hot' } },
        { class: 'Timeline', label: 'Línea de tiempo', icon: 'history', options: { items: [{ date: '2024', title: 'Idea', text: 'Nace el concepto.' }, { date: '2025', title: 'Núcleo', text: 'Ticker y Viewport compartidos.' }, { date: '2026', title: 'Lanzamiento', text: 'Constructor de templates.' }] } }
      ]
    }
  ];

  function clonePiece(piece) {
    return {
      class: piece.class,
      label: piece.label || piece.class,
      icon: piece.icon || 'box',
      options: JSON.parse(JSON.stringify(piece.options || {}))
    };
  }

  class PageBuilder extends Component {
    static defaults = {
      palette: null,
      onChange: null,
      paletteTitle: 'Piezas',
      emptyTitle: 'Arrastra tu primera pieza',
      emptyHint: 'Elige un bloque de la paleta y suéltalo en el lienzo.'
    };

    static palette() {
      return defaultPalette.map((group) => ({ group: group.group, items: group.items.map(clonePiece) }));
    }

    build() {
      return Utils.el('div', 'dx-builder dx-reset');
    }

    ready() {
      this.el.classList.add('dx-builder', 'dx-reset');
      this.pieceDraggables = [];
      this.flashTimer = null;
      this.addCleanup(() => clearTimeout(this.flashTimer));
      this.buildPalette();
      this.buildMain();
      this.live = Utils.el('span', 'dx-builder-live', { 'aria-live': 'polite' });
      this.el.appendChild(this.live);
      this.listen(this.canvas, 'click', this.onCanvasClick);
      this.addCleanup(() => {
        this.pieceDraggables.forEach((draggable) => draggable.destroy());
        this.blockElements().forEach((block) => this.disposeBlock(block));
        this.zone.destroy();
      });
      this.updateEmpty();
    }

    paletteGroups() {
      return this.options.palette || PageBuilder.palette();
    }

    buildPalette() {
      const palette = Utils.el('aside', 'dx-builder-palette', { 'aria-label': 'Paleta de piezas' });
      const head = Utils.el('header', 'dx-builder-palettehead');
      const title = Utils.el('h3', 'dx-builder-palettetitle', { text: this.options.paletteTitle });
      const toggle = Utils.el('button', 'dx-builder-palettetoggle dx-focusable', {
        type: 'button',
        'aria-label': 'Mostrar u ocultar la paleta',
        'aria-expanded': 'false'
      });
      toggle.innerHTML = Icon.svg('chevronUp', 16);
      head.appendChild(title);
      head.appendChild(toggle);
      palette.appendChild(head);
      const groups = Utils.el('div', 'dx-builder-groups');
      this.paletteGroups().forEach((group) => {
        const section = Utils.el('section', 'dx-builder-group');
        section.appendChild(Utils.el('h4', 'dx-builder-grouptitle', { text: group.group }));
        const list = Utils.el('div', 'dx-builder-pieces');
        (group.items || []).forEach((item) => {
          const piece = clonePiece(item);
          const button = Utils.el('button', 'dx-builder-piece dx-focusable', {
            type: 'button',
            'aria-label': 'Añadir ' + piece.label
          });
          button.innerHTML = '<span class="dx-builder-pieceicon">' + Icon.svg(piece.icon, 17) + '</span>' +
            '<span class="dx-builder-piecelabel">' + Utils.escape(piece.label) + '</span>';
          this.listen(button, 'click', () => this.addBlock(clonePiece(piece), this.blockElements().length));
          const draggable = new Draggable({
            mode: 'clone',
            payload: { type: 'dixel-piece', piece }
          }).attach(button);
          this.pieceDraggables.push(draggable);
          list.appendChild(button);
        });
        section.appendChild(list);
        groups.appendChild(section);
      });
      palette.appendChild(groups);
      this.listen(toggle, 'click', () => {
        const open = this.el.classList.toggle('is-palette-open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      this.palette = palette;
      this.el.appendChild(palette);
    }

    buildMain() {
      const main = Utils.el('div', 'dx-builder-main');
      main.appendChild(this.buildToolbar());
      const canvas = Utils.el('div', 'dx-builder-canvas', { role: 'list', 'aria-label': 'Lienzo del template' });
      const empty = Utils.el('div', 'dx-builder-empty');
      empty.innerHTML = '<span class="dx-builder-emptyicon">' + Icon.svg('sparkles', 30) + '</span>' +
        '<span class="dx-builder-emptytitle">' + Utils.escape(this.options.emptyTitle) + '</span>' +
        '<span class="dx-builder-emptyhint">' + Utils.escape(this.options.emptyHint) + '</span>';
      canvas.appendChild(empty);
      main.appendChild(canvas);
      this.canvas = canvas;
      this.emptyState = empty;
      this.zone = new DropZone({
        axis: 'vertical',
        itemSelector: '.dx-builder-block',
        accepts: (payload) => !!payload && (payload.type === 'dixel-piece' || payload.type === 'dixel-block'),
        onDrop: (info) => this.onCanvasDrop(info)
      }).attach(canvas);
      this.el.appendChild(main);
    }

    buildToolbar() {
      const toolbar = Utils.el('div', 'dx-builder-toolbar');
      this.countLabel = Utils.el('span', 'dx-builder-count', { text: '0 piezas' });
      toolbar.appendChild(this.countLabel);
      const exportButton = Utils.el('button', 'dx-builder-action dx-focusable', { type: 'button' });
      exportButton.innerHTML = Icon.svg('copy', 15) + '<span class="dx-builder-actionlabel">Exportar JSON</span>';
      this.listen(exportButton, 'click', this.copyExport);
      this.exportButton = exportButton;
      toolbar.appendChild(exportButton);
      const clearButton = Utils.el('button', 'dx-builder-action dx-builder-action--danger dx-focusable', { type: 'button' });
      clearButton.innerHTML = Icon.svg('trash', 15) + '<span class="dx-builder-actionlabel">Limpiar</span>';
      this.listen(clearButton, 'click', () => this.toggleConfirm(true));
      toolbar.appendChild(clearButton);
      const confirm = Utils.el('div', 'dx-builder-confirm', { role: 'alertdialog', 'aria-label': 'Confirmar limpieza' });
      confirm.appendChild(Utils.el('p', 'dx-builder-confirmtext', { text: '¿Vaciar el lienzo? Se eliminarán todas las piezas.' }));
      const confirmActions = Utils.el('div', 'dx-builder-confirmactions');
      const cancelButton = Utils.el('button', 'dx-builder-action dx-focusable', { type: 'button', text: 'Cancelar' });
      const acceptButton = Utils.el('button', 'dx-builder-action dx-builder-action--danger dx-focusable', { type: 'button', text: 'Vaciar' });
      this.listen(cancelButton, 'click', () => this.toggleConfirm(false));
      this.listen(acceptButton, 'click', () => {
        this.toggleConfirm(false);
        this.clearCanvas();
        this.announce('Lienzo vaciado.');
      });
      confirmActions.appendChild(cancelButton);
      confirmActions.appendChild(acceptButton);
      confirm.appendChild(confirmActions);
      this.confirm = confirm;
      toolbar.appendChild(confirm);
      return toolbar;
    }

    toggleConfirm(open) {
      this.confirm.classList.toggle('is-open', open);
    }

    blockElements() {
      return Array.from(this.canvas.querySelectorAll('.dx-builder-block'));
    }

    onCanvasClick(event) {
      const block = event.target.closest('.dx-builder-block');
      this.blockElements().forEach((candidate) => {
        candidate.classList.toggle('is-selected', candidate === block);
      });
    }

    onCanvasDrop(info) {
      if (info.payload && info.payload.type === 'dixel-piece') {
        this.addBlock(clonePiece(info.payload.piece), info.index);
        return;
      }
      if (info.moved) {
        this.announce('Bloque movido a la posición ' + (info.index + 1) + '.');
        this.emitChange();
      }
    }

    addBlock(piece, index) {
      let instance;
      try {
        instance = Dixel.create(piece.class, Object.assign({}, piece.options));
      } catch (error) {
        this.announce('No se pudo crear la pieza ' + piece.class + '.');
        return null;
      }
      const block = Utils.el('div', 'dx-builder-block', { role: 'listitem' });
      const tools = Utils.el('div', 'dx-builder-blocktools');
      const handle = Utils.el('button', 'dx-builder-tool dx-builder-handle dx-focusable', {
        type: 'button',
        'aria-label': 'Mover bloque ' + piece.label
      });
      handle.innerHTML = Icon.svg('dragHandle', 15);
      const duplicate = Utils.el('button', 'dx-builder-tool dx-focusable', {
        type: 'button',
        'aria-label': 'Duplicar bloque ' + piece.label
      });
      duplicate.innerHTML = Icon.svg('copy', 15);
      const remove = Utils.el('button', 'dx-builder-tool dx-builder-tool--danger dx-focusable', {
        type: 'button',
        'aria-label': 'Eliminar bloque ' + piece.label
      });
      remove.innerHTML = Icon.svg('trash', 15);
      tools.appendChild(handle);
      tools.appendChild(duplicate);
      tools.appendChild(remove);
      const body = Utils.el('div', 'dx-builder-blockbody');
      block.appendChild(tools);
      block.appendChild(body);
      const reference = this.blockElements()[index] || null;
      this.canvas.insertBefore(block, reference);
      try {
        instance.mount(body);
      } catch (error) {
        instance.destroy();
        block.remove();
        this.announce('No se pudo montar la pieza ' + piece.class + '.');
        return null;
      }
      block.__dxBlock = { piece, instance };
      block.__dxBlockDraggable = new Draggable({
        mode: 'move',
        handle: '.dx-builder-handle',
        payload: { type: 'dixel-block' }
      }).attach(block);
      this.listen(remove, 'click', () => this.removeBlock(block));
      this.listen(duplicate, 'click', () => this.duplicateBlock(block));
      this.listen(handle, 'keydown', (event) => this.onHandleKey(event, block));
      Motion.fromTo(block, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3, ease: 'out' });
      this.updateEmpty();
      this.emitChange();
      this.announce('Pieza ' + piece.label + ' añadida en la posición ' + (this.blockElements().indexOf(block) + 1) + '.');
      return block;
    }

    onHandleKey(event, block) {
      const moves = { ArrowUp: -1, ArrowDown: 1 };
      if (moves[event.key] === undefined) return;
      event.preventDefault();
      this.moveBlock(block, moves[event.key]);
    }

    moveBlock(block, delta) {
      const rest = this.blockElements().filter((candidate) => candidate !== block);
      const current = this.blockElements().indexOf(block);
      const target = Utils.clamp(current + delta, 0, rest.length);
      if (target === current) return;
      this.canvas.insertBefore(block, rest[target] || null);
      this.emitChange();
      this.announce('Bloque en la posición ' + (this.blockElements().indexOf(block) + 1) + '.');
      block.querySelector('.dx-builder-handle').focus();
    }

    duplicateBlock(block) {
      const meta = block.__dxBlock;
      const index = this.blockElements().indexOf(block) + 1;
      this.addBlock(clonePiece(meta.piece), index);
    }

    disposeBlock(block) {
      if (block.__dxBlockDraggable) block.__dxBlockDraggable.destroy();
      if (block.__dxBlock) block.__dxBlock.instance.destroy();
      block.remove();
    }

    removeBlock(block) {
      const label = block.__dxBlock.piece.label;
      Motion.to(block, {
        opacity: 0,
        scale: 0.95,
        duration: 0.2,
        ease: 'in',
        onComplete: () => {
          this.disposeBlock(block);
          this.updateEmpty();
          this.emitChange();
        }
      });
      this.announce('Pieza ' + label + ' eliminada.');
    }

    clearCanvas(silent) {
      this.blockElements().forEach((block) => this.disposeBlock(block));
      this.updateEmpty();
      if (!silent) this.emitChange();
    }

    serialize() {
      return this.blockElements().map((block) => ({
        class: block.__dxBlock.piece.class,
        options: JSON.parse(JSON.stringify(block.__dxBlock.piece.options))
      }));
    }

    load(layout) {
      this.clearCanvas(true);
      (layout || []).forEach((entry) => {
        this.addBlock(clonePiece({ class: entry.class, label: entry.class, options: entry.options }), this.blockElements().length);
      });
      this.emitChange();
    }

    copyExport() {
      const json = JSON.stringify(this.serialize(), null, 2);
      const done = () => {
        this.flashExport();
        this.announce('JSON copiado al portapapeles.');
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(json).then(done, () => this.copyFallback(json, done));
      } else {
        this.copyFallback(json, done);
      }
    }

    copyFallback(text, done) {
      const area = Utils.el('textarea', 'dx-builder-clip');
      area.value = text;
      this.el.appendChild(area);
      area.select();
      try {
        document.execCommand('copy');
      } catch (error) {}
      area.remove();
      done();
    }

    flashExport() {
      const label = this.exportButton.querySelector('.dx-builder-actionlabel');
      const original = label.textContent;
      label.textContent = 'Copiado';
      clearTimeout(this.flashTimer);
      this.flashTimer = setTimeout(() => {
        label.textContent = original;
      }, 1400);
    }

    updateEmpty() {
      const count = this.blockElements().length;
      this.canvas.classList.toggle('is-empty', count === 0);
      if (this.countLabel) this.countLabel.textContent = count + (count === 1 ? ' pieza' : ' piezas');
    }

    emitChange() {
      this.updateEmpty();
      if (this.options.onChange) this.options.onChange(this.serialize());
    }

    announce(message) {
      if (this.live) this.live.textContent = message;
    }
  }

  return PageBuilder;
});
