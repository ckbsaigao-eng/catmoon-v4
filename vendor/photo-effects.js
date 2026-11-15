/* 无框架、无安装步骤。加载本文件后使用 window.PhotoEffects.mount(...)。 */
(function () {
  'use strict';
  const mounted = new WeakMap();
  let serial = 0;
  let stopSharedTransition = null;
  const ease = 'cubic-bezier(.32,.72,0,1)';
  const reducedQuery = '(prefers-reduced-motion: reduce)';
  const fineQuery = '(hover: hover) and (pointer: fine)';

  function mount(target, options = {}) {
    const root = typeof target === 'string' ? document.querySelector(target) : target;
    if (!(root instanceof HTMLElement)) throw new Error('PhotoEffects.mount: 找不到照片容器。');
    if (mounted.has(root)) return mounted.get(root);
    const settings = { parallax: true, customCursor: true, sharedTransition: true,
      hoverDuration: 480, openDuration: 720, closeDuration: 540, ...options };
    for (const name of ['hoverDuration', 'openDuration', 'closeDuration']) {
      if (!Number.isFinite(settings[name]) || settings[name] < 0) throw new Error(name + ' 必须为非负毫秒数。');
    }
    const abort = new AbortController();
    const listen = (el, event, handler, extra = {}) => el.addEventListener(event, handler, { ...extra, signal: abort.signal });
    const reduce = matchMedia(reducedQuery), fine = matchMedia(fineQuery);
    const id = 'pe-lightbox-' + (++serial);
    const dialog = document.createElement('dialog');
    dialog.className = 'pe-lightbox';
    dialog.setAttribute('aria-labelledby', id + '-title');
    dialog.innerHTML = '<button class="pe-close" type="button" aria-label="关闭大图" autofocus>×</button>' +
      '<div class="pe-panel"><h2 class="pe-sr-only" id="' + id + '-title">照片预览</h2>' +
      '<img class="pe-large-image" alt=""><p class="pe-lightbox-caption"></p></div>';
    document.body.append(dialog);
    const viewer = dialog.querySelector('img'), panel = dialog.querySelector('.pe-panel');
    const closeButton = dialog.querySelector('.pe-close'), caption = dialog.querySelector('.pe-lightbox-caption');
    const title = dialog.querySelector('h2');
    const cursor = document.createElement('span');
    cursor.className = 'pe-cursor'; cursor.textContent = 'view'; cursor.setAttribute('aria-hidden', 'true');
    if (settings.customCursor) document.body.append(cursor);
    const originalCursorFlag = root.getAttribute('data-pe-cursor');
    const originalHoverTime = root.style.getPropertyValue('--pe-hover-time');
    root.dataset.peCursor = String(settings.customCursor);
    root.style.setProperty('--pe-hover-time', settings.hoverDuration + 'ms');

    let origin = null, source = null, request = 0, destroyed = false;
    let frame = 0, x = 0, y = 0, tx = 0, ty = 0, exitAnimation = null, unlockScroll = null;
    const visible = new Set();
    const items = Array.from(root.querySelectorAll('.pe-item')).map(item => {
      const button = item.querySelector('.pe-card'), motion = item.querySelector('.pe-motion');
      const image = button?.querySelector('img');
      if (!button || !motion || !image) throw new Error('每张照片需要 pe-item / pe-motion / pe-card / img 四层。');
      const angle = Number(item.dataset.peAngle || 0);
      if (!Number.isFinite(angle)) throw new Error('data-pe-angle 必须为角度数值。');
      const saved = [item.style.transform, motion.style.transform, button.style.getPropertyValue('--pe-counter-angle')];
      item.style.transform = 'rotate(' + angle + 'deg)';
      button.style.setProperty('--pe-counter-angle', (-angle) + 'deg');
      return { item, button, motion, image, saved };
    });
    const byElement = new Map(items.map(item => [item.item, item]));

    // 与原站相同：每一帧追赶目标位置的 12%，只有尚未静止时才继续绘制。
    function draw() {
      frame = 0;
      if (reduce.matches || !fine.matches || document.hidden || destroyed) return;
      x += (tx - x) * .12; y += (ty - y) * .12;
      for (const item of visible) item.motion.style.transform = 'translate3d(' + (x * 5) + 'px,' + (y * 4) + 'px,0)';
      if (Math.abs(tx - x) > .001 || Math.abs(ty - y) > .001) frame = requestAnimationFrame(draw);
    }
    function wake() {
      if (settings.parallax && visible.size && !frame && !reduce.matches && fine.matches && !document.hidden && !destroyed) frame = requestAnimationFrame(draw);
    }
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const item = byElement.get(entry.target);
        if (entry.isIntersecting) visible.add(item); else visible.delete(item);
      }
      wake();
    }, { rootMargin: '100px' });
    items.forEach(({ item }) => observer.observe(item));
    listen(document, 'pointermove', event => {
      if (event.pointerType !== 'mouse' || reduce.matches || !fine.matches || dialog.open) return;
      tx = (event.clientX / innerWidth - .5) * 2;
      ty = (event.clientY / innerHeight - .5) * 2;
      const card = event.target instanceof Element ? event.target.closest('.pe-card') : null;
      cursor.dataset.visible = String(!!card && root.contains(card));
      cursor.style.transform = 'translate3d(' + (event.clientX - 17.5) + 'px,' + (event.clientY - 17.5) + 'px,0)';
      wake();
    }, { passive: true });
    listen(document, 'pointerleave', () => { tx = ty = 0; cursor.dataset.visible = 'false'; wake(); });
    listen(document, 'keydown', () => { cursor.dataset.visible = 'false'; });
    function resetMotion() {
      cancelAnimationFrame(frame); frame = 0; x = y = tx = ty = 0;
      items.forEach(item => { item.motion.style.transform = item.saved[1]; });
      cursor.dataset.visible = 'false';
      if (reduce.matches) { stopSharedTransition?.(); exitAnimation?.finish(); }
    }
    listen(reduce, 'change', resetMotion); listen(fine, 'change', resetMotion);
    listen(document, 'visibilitychange', () => {
      if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else wake();
    });

    function lockScroll() {
      if (unlockScroll) return;
      const page = document.documentElement;
      const overflow = page.style.overflow, padding = page.style.paddingRight;
      const gap = Math.max(0, innerWidth - page.clientWidth);
      const existingPadding = parseFloat(getComputedStyle(page).paddingRight) || 0;
      page.style.overflow = 'hidden'; page.style.paddingRight = (existingPadding + gap) + 'px';
      unlockScroll = () => { page.style.overflow = overflow; page.style.paddingRight = padding; unlockScroll = null; };
    }

    // 同一个名字分别交给小图和大图；浏览器负责生成两次快照与中间帧。
    function transfer(direction, image, update, animate) {
      stopSharedTransition?.();
      const rect = image?.getBoundingClientRect();
      const supported = animate && settings.sharedTransition && !reduce.matches &&
        typeof document.startViewTransition === 'function' && image?.isConnected &&
        rect?.width > 0 && rect.bottom > 0 && rect.top < innerHeight;
      if (!supported) { update(false); return; }
      const page = document.documentElement;
      const originalNames = [image.style.viewTransitionName, viewer.style.viewTransitionName];
      const flag = page.getAttribute('data-pe-transfer');
      const times = [page.style.getPropertyValue('--pe-open-time'), page.style.getPropertyValue('--pe-close-time')];
      page.dataset.peTransfer = direction;
      page.style.setProperty('--pe-open-time', settings.openDuration + 'ms');
      page.style.setProperty('--pe-close-time', settings.closeDuration + 'ms');
      if (direction === 'open') image.style.viewTransitionName = 'pe-photograph';
      else viewer.style.viewTransitionName = 'pe-photograph';
      const token = request;
      let transition, cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        image.style.viewTransitionName = originalNames[0]; viewer.style.viewTransitionName = originalNames[1];
        if (flag === null) page.removeAttribute('data-pe-transfer'); else page.setAttribute('data-pe-transfer', flag);
        ['--pe-open-time', '--pe-close-time'].forEach((name, index) => {
          if (times[index]) page.style.setProperty(name, times[index]); else page.style.removeProperty(name);
        });
        if (stopSharedTransition === stop) stopSharedTransition = null;
      };
      const stop = () => { transition?.skipTransition(); cleanup(); };
      try {
        transition = document.startViewTransition(() => {
          if (destroyed || request !== token) return;
          image.style.viewTransitionName = direction === 'close' ? 'pe-photograph' : '';
          viewer.style.viewTransitionName = direction === 'open' ? 'pe-photograph' : '';
          update(true);
        });
        stopSharedTransition = stop;
        transition.ready.catch(() => {});
        transition.finished.then(cleanup, cleanup);
      } catch (_) { cleanup(); update(false); }
    }

    async function open(button, animate = true) {
      if (destroyed || !root.contains(button) || dialog.open) return;
      const image = button.querySelector('img');
      if (!image) return;
      const token = ++request;
      stopSharedTransition?.(); exitAnimation?.cancel();
      viewer.src = button.dataset.peFull || image.currentSrc || image.src;
      viewer.alt = image.alt;
      title.textContent = image.alt || '照片预览';
      caption.textContent = button.querySelector('.pe-caption')?.textContent || image.alt;
      // 高分辨率图片解码后才启动动画，防止飞到一半出现空白。
      try { await viewer.decode(); } catch (_) {
        viewer.src = image.currentSrc || image.src;
        try { await viewer.decode(); } catch (_) { return; }
      }
      if (destroyed || request !== token) return;
      origin = button; source = image; cursor.dataset.visible = 'false';
      transfer('open', image, shared => {
        dialog.dataset.peFallback = String(animate && !shared);
        lockScroll(); dialog.showModal();
      }, animate);
    }
    function finishClose() {
      const wasOpen = dialog.open;
      if (dialog.open) dialog.close();
      unlockScroll?.();
      if (wasOpen && origin?.isConnected) origin.focus({ preventScroll: true });
    }
    function close(animate = true) {
      const token = ++request;
      stopSharedTransition?.(); exitAnimation?.cancel();
      if (!dialog.open) return;
      const useShared = animate && settings.sharedTransition && !reduce.matches && typeof document.startViewTransition === 'function' && source?.isConnected;
      if (useShared) { transfer('close', source, finishClose, animate); return; }
      if (!animate) { finishClose(); return; }
      panel.getAnimations().forEach(animation => animation.cancel());
      exitAnimation = panel.animate(reduce.matches
        ? [{ opacity: 1 }, { opacity: 0 }]
        : [{ opacity: 1, transform: 'translate3d(0,0,0)' }, { opacity: 0, transform: 'translate3d(0,12px,0)' }],
        { duration: reduce.matches ? 140 : 250, easing: ease, fill: 'forwards' });
      exitAnimation.finished.then(() => { if (!destroyed && request === token) { finishClose(); exitAnimation.cancel(); } }, () => {});
    }
    listen(root, 'click', event => {
      const button = event.target instanceof Element ? event.target.closest('.pe-card') : null;
      if (!button || !root.contains(button)) return;
      event.preventDefault(); open(button, event.detail !== 0);
    });
    listen(closeButton, 'click', event => close(event.detail !== 0));
    listen(dialog, 'cancel', event => { event.preventDefault(); close(false); });
    let backdropDown = false;
    listen(dialog, 'pointerdown', event => { backdropDown = event.target === dialog; });
    listen(dialog, 'click', event => {
      if (backdropDown && event.target === dialog) close(event.detail !== 0);
      backdropDown = false;
    });
    listen(dialog, 'close', () => { unlockScroll?.(); cursor.dataset.visible = 'false'; });

    const controller = {
      open, close,
      destroy() {
        if (destroyed) return;
        destroyed = true; ++request; stopSharedTransition?.(); exitAnimation?.cancel();
        abort.abort(); cancelAnimationFrame(frame); observer.disconnect(); finishClose();
        dialog.remove(); cursor.remove();
        items.forEach(({ item, motion, button, saved }) => {
          item.style.transform = saved[0]; motion.style.transform = saved[1];
          if (saved[2]) button.style.setProperty('--pe-counter-angle', saved[2]); else button.style.removeProperty('--pe-counter-angle');
        });
        if (originalCursorFlag === null) root.removeAttribute('data-pe-cursor'); else root.setAttribute('data-pe-cursor', originalCursorFlag);
        if (originalHoverTime) root.style.setProperty('--pe-hover-time', originalHoverTime); else root.style.removeProperty('--pe-hover-time');
        mounted.delete(root);
      }
    };
    mounted.set(root, controller);
    return controller;
  }
  window.PhotoEffects = Object.freeze({ mount });
})();
