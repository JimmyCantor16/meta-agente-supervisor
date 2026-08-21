Dixel.define('TextField', ['Field'], function (Field) {
  'use strict';

  class TextField extends Field {
    static defaults = Object.assign({}, Field.defaults, {
      type: 'text',
      autocomplete: null,
      maxLength: null
    });

    buildControl() {
      const input = super.buildControl();
      input.type = this.options.type;
      if (this.options.autocomplete) input.setAttribute('autocomplete', this.options.autocomplete);
      if (this.options.maxLength) input.maxLength = this.options.maxLength;
      return input;
    }
  }

  return TextField;
});
