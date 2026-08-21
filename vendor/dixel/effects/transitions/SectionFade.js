Dixel.define('SectionFade', ['Component'], function (Component) {
  'use strict';

  class SectionFade extends Component {
    static defaults = { edges: 'both', size: 0 };

    ready() {
      this.el.classList.add('dx-sectionfade');
      if (this.options.edges !== 'bottom') this.el.classList.add('dx-sectionfade--top');
      if (this.options.edges !== 'top') this.el.classList.add('dx-sectionfade--bottom');
      if (this.options.size) this.el.style.setProperty('--dx-fade-size', this.options.size + 'px');
      this.addCleanup(() => {
        this.el.classList.remove('dx-sectionfade', 'dx-sectionfade--top', 'dx-sectionfade--bottom');
      });
    }
  }

  return SectionFade;
});
