/* Shared full-page travel navigation. Original links remain usable without JS. */
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
  dialog.innerHTML = `<div class="travel-menu-head"><a href="/personal/travel/" class="travel-menu-brand">旅行地図<small>Travel Atlas</small></a><button type="button" class="travel-menu-close" aria-label="關閉選單">×</button></div><nav class="travel-menu-links" aria-label="主要導覽"><a href="/personal/travel/">旅行首頁 <span>HOME ↗</span></a><a href="/personal/travel/east-japan/">東海道 <span>TŌKAIDŌ ↗</span></a><a href="/personal/travel/kyushu/">九州 <span>KYUSHU ↗</span></a><a href="/personal/travel/okinawa/">沖繩 <span>OKINAWA ↗</span></a><a href="/personal/travel/map/">世界蓋章 <span>STAMP ATLAS ↗</span></a><a href="/writing/">文字紀錄 <span>WRITING ↗</span></a></nav><div class="travel-menu-local"></div><a class="travel-menu-home" href="/">Eva Huang ↗</a>`;
  if (original) {
    if (header.closest('.topbar')) {
      const local = dialog.querySelector('.travel-menu-local');
      const nav = original.cloneNode(true);
      nav.className = 'travel-menu-page-links';
      local.append(nav);
    }
    original.hidden = true;
  }
  header.append(button);
  document.body.append(dialog);
  button.addEventListener('click', () => {
    dialog.showModal();
    document.documentElement.classList.add('travel-menu-open');
    button.setAttribute('aria-expanded', 'true');
  });
  dialog.querySelector('.travel-menu-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if (e.target.closest('a')) dialog.close(); });
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('travel-menu-open');
    button.setAttribute('aria-expanded', 'false');
    button.focus();
  });
})();
