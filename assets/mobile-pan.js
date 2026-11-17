(() => {
  const mq = matchMedia('(max-width: 650px) and (orientation: portrait)');
  let offset = 0, startX = 0, startY = 0, startOffset = 0, direction = '', active = false;
  const width = () => Math.max(innerWidth, innerHeight * 1.6);
  const set = value => {
    offset = Math.min(0, Math.max(innerWidth - width(), value));
    document.documentElement.style.setProperty('--chapter-pan', `${offset}px`);
  };
  const center = () => set((innerWidth - width()) / 2);
  const init = stage => {
  const journey = stage.closest('.journey');
  center();
  new MutationObserver(() => {
    if (!mq.matches || stage.dataset.chapter === 'night-sky') return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const current = [...document.querySelectorAll('.memory')].find(el => el.dataset.memoryId === stage.dataset.chapter)?.querySelector('.memory-content');
      if (current) set(innerWidth / 2 - (current.offsetLeft + current.offsetWidth / 2));
      else center();
    }));
  }).observe(stage, {attributes:true, attributeFilter:['data-chapter']});
  addEventListener('resize', center);
  journey.addEventListener('touchstart', e => {
    active = mq.matches && e.touches.length === 1 && journey.dataset.access === 'story' && stage.dataset.chapter !== 'night-sky';
    if (!active) return;
    startX = e.touches[0].clientX; startY = e.touches[0].clientY;
    startOffset = offset; direction = '';
  }, {passive:true});
  journey.addEventListener('touchmove', e => {
    if (!active || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - startX, dy = e.touches[0].clientY - startY;
    if (!direction && Math.max(Math.abs(dx), Math.abs(dy)) > 8) direction = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (direction === 'x') { e.preventDefault(); set(startOffset + dx); }
  }, {passive:false});
  journey.addEventListener('touchend', () => { active = false; }, {passive:true});
  journey.addEventListener('touchcancel', () => { active = false; }, {passive:true});
  };
  const start = () => {
  const stage = document.querySelector('.journey .chapter-stage');
  if (stage) { observer.disconnect(); init(stage); }
  };
  const observer = new MutationObserver(start);
  observer.observe(document.documentElement, {childList:true, subtree:true});
  start();
})();
