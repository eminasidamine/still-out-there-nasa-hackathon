// The entrance: four pictures around the name, and "Scroll to enter". It covers the page while the journey loads
// underneath. The first scroll, swipe, key or click sends the pictures flying outward and opens the journey.
// It only shows when you arrive at the start; a link to a stop (#/moon …) goes straight there.
const intro = document.getElementById('intro');
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

if (intro) {
  const atStart = ['', '#', '#/', '#/start'].includes(location.hash);
  if (!atStart) intro.remove();
  else {
    document.documentElement.classList.add('has-intro');
    let gone = false;
    const block = (e) => { if (!gone) e.preventDefault(); };
    const leave = () => {
      if (gone) return;
      gone = true;
      removeEventListener('wheel', onWheel, { passive: false });
      removeEventListener('touchmove', block, { passive: false });
      removeEventListener('keydown', onKey);
      scrollTo(0, 0);
      intro.classList.add('is-leaving');
      document.documentElement.classList.remove('has-intro');
      setTimeout(() => intro.remove(), reduced() ? 0 : 1400);
    };
    const onWheel = (e) => { e.preventDefault(); if (e.deltaY > 4) leave(); };
    let y0 = null;
    const onKey = (e) => { if ([' ', 'Enter', 'ArrowDown', 'PageDown', 'ArrowRight', 'ArrowLeft'].includes(e.key)) { e.preventDefault(); leave(); } };
    addEventListener('wheel', onWheel, { passive: false });
    addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
    addEventListener('touchmove', block, { passive: false });
    addEventListener('touchend', (e) => { if (y0 != null && y0 - e.changedTouches[0].clientY > 30) leave(); y0 = null; }, { passive: true });
    addEventListener('keydown', onKey);
    document.getElementById('intro-enter')?.addEventListener('click', leave);
    intro.focus?.();
  }
}
