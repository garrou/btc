(() => {
  function arrows(wrap) {
    const scroller = wrap.querySelector('.chain');
    const prev = wrap.querySelector('.nav-prev'), next = wrap.querySelector('.nav-next');
    const update = () => {
      wrap.classList.toggle('can-prev', scroller.scrollLeft > 4);
      wrap.classList.toggle('can-next', scroller.scrollLeft < scroller.scrollWidth - scroller.clientWidth - 4);
    };
    const go = (dir) => scroller.scrollBy({ left: dir * scroller.clientWidth * 0.8, behavior: 'smooth' });
    prev.addEventListener('click', () => go(-1));
    next.addEventListener('click', () => go(1));
    scroller.addEventListener('scroll', update, { passive: true });
    new ResizeObserver(update).observe(scroller);
    new MutationObserver(update).observe(scroller, { childList: true, subtree: true });
    update();
  }

  function overlay(scroller) {
    const host = document.createElement('div'); host.className = 'scroll-host';
    scroller.replaceWith(host);
    const thumb = document.createElement('div'); thumb.className = 'thumb'; thumb.hidden = true;
    host.append(scroller, thumb);
    let hideTimer = 0;
    const update = () => {
      const { scrollHeight: sh, clientHeight: ch, scrollTop: st } = scroller;
      thumb.hidden = sh <= ch + 1;
      if (thumb.hidden) return;
      const h = Math.max(28, (ch * ch) / sh);
      thumb.style.height = `${h}px`;
      thumb.style.transform = `translateY(${(st / (sh - ch)) * (ch - h)}px)`;
    };
    scroller.addEventListener('scroll', () => {
      update();
      host.classList.add('active'); clearTimeout(hideTimer);
      hideTimer = setTimeout(() => host.classList.remove('active'), 900);
    }, { passive: true });
    new ResizeObserver(update).observe(scroller);
    new MutationObserver(update).observe(scroller, { childList: true, subtree: true });
    thumb.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      thumb.setPointerCapture(e.pointerId);
      host.classList.add('drag');
      const y0 = e.clientY, top0 = scroller.scrollTop;
      const move = (ev) => {
        const range = scroller.clientHeight - thumb.offsetHeight;
        if (range > 0) scroller.scrollTop = top0 + ((ev.clientY - y0) * (scroller.scrollHeight - scroller.clientHeight)) / range;
      };
      const up = () => { host.classList.remove('drag'); thumb.removeEventListener('pointermove', move); thumb.removeEventListener('pointerup', up); };
      thumb.addEventListener('pointermove', move);
      thumb.addEventListener('pointerup', up);
    });
    update();
  }

  document.querySelectorAll('.chain-wrap').forEach(arrows);
  document.querySelectorAll('.js-scroll').forEach(overlay);
})();
