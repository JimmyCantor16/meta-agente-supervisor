Dixel.define('RatingStars', ['Component', 'Motion', 'Utils'], function (Component, Motion, Utils) {
  'use strict';

  const starIcon =
    '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M12 3.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>';

  class RatingStars extends Component {
    static defaults = {
      label: 'Rating',
      count: 5,
      value: 0,
      allowClear: true,
      onChange: null
    };

    build() {
      const el = Utils.el('div', 'dx-rating dx-reset dx-motion');
      this.populate(el);
      return el;
    }

    populate(el) {
      if (this.options.label) {
        el.appendChild(Utils.el('span', 'dx-rating-label', { text: this.options.label }));
      }
      this.row = Utils.el('div', 'dx-rating-stars', {
        role: 'radiogroup',
        'aria-label': this.options.label || 'Rating'
      });
      this.stars = [];
      for (let i = 0; i < this.options.count; i++) {
        const star = Utils.el('button', 'dx-rating-star', {
          type: 'button',
          role: 'radio',
          'aria-checked': 'false',
          'aria-label': i + 1 + ' of ' + this.options.count,
          html: starIcon
        });
        this.row.appendChild(star);
        this.stars.push(star);
      }
      el.appendChild(this.row);
    }

    ready() {
      if (!this.stars) {
        this.el.classList.add('dx-rating', 'dx-reset', 'dx-motion');
        this.populate(this.el);
      }
      this.current = Utils.clamp(this.options.value, 0, this.stars.length);
      this.paint();
      this.listen(this.row, 'click', this.handleClick);
      this.listen(this.row, 'keydown', this.handleKeyDown);
      if (!Utils.isTouch) {
        this.listen(this.row, 'pointerover', this.handlePreview);
        this.listen(this.row, 'pointerleave', this.clearPreview);
      }
    }

    handleClick(event) {
      const star = event.target.closest('.dx-rating-star');
      if (!star) return;
      const rating = this.stars.indexOf(star) + 1;
      this.setValue(rating === this.current && this.options.allowClear ? 0 : rating);
    }

    handleKeyDown(event) {
      if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
        event.preventDefault();
        this.setValue(Math.min(this.current + 1, this.stars.length));
        this.stars[this.current - 1].focus();
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
        event.preventDefault();
        this.setValue(Math.max(this.current - 1, 0));
        if (this.current > 0) this.stars[this.current - 1].focus();
      }
    }

    handlePreview(event) {
      const star = event.target.closest('.dx-rating-star');
      if (!star) return;
      const until = this.stars.indexOf(star);
      this.stars.forEach((each, index) => {
        each.classList.toggle('is-hot', index <= until);
      });
    }

    clearPreview() {
      this.stars.forEach((star) => star.classList.remove('is-hot'));
    }

    setValue(rating) {
      if (rating === this.current) return;
      const grew = rating > this.current;
      this.current = rating;
      this.paint();
      if (grew && !Utils.reducedMotion) {
        Motion.fromTo(
          this.stars.slice(0, rating),
          { scale: 0.6 },
          { scale: 1, duration: 0.4, ease: 'outBack', stagger: 0.04 }
        );
      }
      if (this.options.onChange) this.options.onChange(rating, this);
    }

    paint() {
      this.stars.forEach((star, index) => {
        star.classList.toggle('is-filled', index < this.current);
        star.setAttribute('aria-checked', String(index + 1 === this.current));
      });
    }

    get value() {
      return this.current;
    }

    set value(next) {
      this.setValue(Utils.clamp(next, 0, this.stars.length));
    }
  }

  return RatingStars;
});
