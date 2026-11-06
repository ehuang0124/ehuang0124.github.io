/* Shared full-page travel navigation — one trigger per page.
   Site destinations, the page's own section index and its local links all live
   in the same dialog. Original links remain usable without JS. */
(() => {
  const header = document.querySelector('.ng-header-in, .topbar-in, .site-header');
  if (!header) return;
  const original = header.querySelector('.ng-nav, .nav, .header-links');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'travel-menu-toggle';
  button.setAttribute('aria-haspopup', 'dialog');
  button.setAttribute('aria-controls', 'travel-menu');
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = '<span>MENU</span><i aria-hidden="true"></i>';
  const dialog = document.createElement('dialog');
  dialog.id = 'travel-menu';
  dialog.className = 'travel-menu';
  dialog.setAttribute('aria-label', '旅行導覽');
  dialog.innerHTML = `<div class="travel-menu-head"><a href="/personal/travel/" class="travel-menu-brand">旅行地図<small>Travel Atlas</small></a><button type="button" class="travel-menu-close" aria-label="關閉選單">×</button></div><nav class="travel-menu-links" aria-label="主要導覽"><a href="/personal/travel/east-japan/">東海道 <span>TŌKAIDŌ ↗</span></a><a href="/personal/travel/kyushu/">九州 <span>KYUSHU ↗</span></a><a href="/personal/travel/okinawa/">沖繩 <span>OKINAWA ↗</span></a><a href="/personal/travel/map/">世界蓋章 <span>STAMP ATLAS ↗</span></a></nav><div class="travel-menu-page" hidden><p class="travel-menu-label">這頁 <span>ON THIS PAGE</span></p><nav class="travel-menu-section" aria-label="頁面分類"></nav></div><div class="travel-menu-local"></div><div class="travel-menu-foot"><a href="/personal/travel/">旅行首頁</a><a href="/writing/">文字紀錄 ↗</a><a href="/">Eva Huang ↗</a></div>`;

  // The page's section index is the fallback nav; once the menu exists it is the
  // only place those links live, so the page never shows two stacked menus.
  const sections = document.querySelector('[data-page-sections]');
  if (sections) {
    const links = [...sections.querySelectorAll('a')];
    if (links.length) {
      const host = dialog.querySelector('.travel-menu-section');
      links.forEach(link => host.append(link));
      dialog.querySelector('.travel-menu-page').hidden = false;
      sections.remove();
    }
  }

  if (original) {
    if (header.closest('.topbar')) {
      const local = dialog.querySelector('.travel-menu-local');
      const nav = original.cloneNode(true);
      nav.className = 'travel-menu-page-links';
      local.append(nav);
    }
    original.hidden = true;
  }

  // Mark the page you are on, so the single menu still answers "where am I?".
  const here = location.pathname.replace(/index\.html$/, '');
  dialog.querySelectorAll('.travel-menu-links a, .travel-menu-foot a').forEach(link => {
    const path = new URL(link.getAttribute('href'), location.href).pathname.replace(/index\.html$/, '');
    if (path === here) link.setAttribute('aria-current', 'page');
  });

  header.append(button);
  document.body.append(dialog);
  button.addEventListener('click', () => {
    dialog.showModal();
    document.documentElement.classList.add('travel-menu-open');
    button.setAttribute('aria-expanded', 'true');
  });
  dialog.querySelector('.travel-menu-close').addEventListener('click', () => dialog.close());
  let focusTarget = null;
  dialog.addEventListener('click', e => {
    const link = e.target.closest('a');
    if (!link) return;
    const hash = link.getAttribute('href') || '';
    const target = hash.startsWith('#') && hash.length > 1 ? document.getElementById(hash.slice(1)) : null;
    if (!target) { dialog.close(); return; }
    // In-page sections are not focusable, so hand focus to the section the menu
    // jumped to instead of letting it fall back to the toggle at the top.
    focusTarget = target;
    dialog.returnValue = 'section';
    dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('travel-menu-open');
    button.setAttribute('aria-expanded', 'false');
    if (dialog.returnValue === 'section') {
      dialog.returnValue = '';
      const target = focusTarget;
      focusTarget = null;
      if (target) {
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
      return;
    }
    button.focus();
  });
})();
