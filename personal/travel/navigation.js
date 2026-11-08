/* Shared travel navigation — one trigger per page.
   Handles both the landing/itinerary pages (.ng-header-in) and the stamp atlas
   (.site-header + .atlas-collections). The atlas keeps a visible collection
   bar; this script only adds the single MENU drawer on mobile. */
(() => {
  // Find the page header and its inline nav (any of the three variants).
  const header = document.querySelector('.ng-header-in, .topbar-in, .site-header');
  if (!header) return;
  const original = header.querySelector('.ng-nav, .nav, .header-links, .site-nav');
  const existingToggle = header.querySelector('.travel-menu-toggle, .site-menu-toggle');

  // Reuse an existing toggle if the page already placed one (atlas redesign).
  let button = existingToggle;
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'travel-menu-toggle';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-controls', 'travel-menu');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = '<span>MENU</span><i aria-hidden="true"></i>';
    header.append(button);
  } else {
    // Ensure it points at the shared dialog.
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-controls', 'travel-menu');
    if (!button.hasAttribute('aria-expanded')) button.setAttribute('aria-expanded', 'false');
  }

  const dialog = document.createElement('dialog');
  dialog.id = 'travel-menu';
  dialog.className = 'travel-menu';
  dialog.setAttribute('aria-label', '旅行導覽');

  // Build dialog chrome.
  dialog.innerHTML = `<div class="travel-menu-head"><a href="/personal/travel/" class="travel-menu-brand">旅行地図<small>Travel Atlas</small></a><button type="button" class="travel-menu-close" aria-label="關閉選單">×</button></div><nav class="travel-menu-links" aria-label="主要導覽"><a href="/personal/travel/east-japan/">東海道 <span>TŌKAIDŌ ↗</span></a><a href="/personal/travel/kyushu/">九州 <span>KYUSHU ↗</span></a><a href="/personal/travel/okinawa/">沖繩 <span>OKINAWA ↗</span></a><a href="/personal/travel/map/">世界蓋章 <span>STAMP ATLAS ↗</span></a></nav><div class="travel-menu-collections" hidden><p class="travel-menu-label">收藏主題 <span>COLLECTIONS</span></p><nav class="travel-menu-collection-list" aria-label="旅行收藏主題"></nav></div><div class="travel-menu-page" hidden><p class="travel-menu-label">這頁 <span>ON THIS PAGE</span></p><nav class="travel-menu-section" aria-label="頁面分類"></nav></div><div class="travel-menu-local"></div><div class="travel-menu-foot"><a href="/personal/travel/">旅行首頁</a><a href="/writing/">文字紀錄 ↗</a><a href="/">Eva Huang ↗</a></div>`;

  // On-page section index — move into dialog so page never shows two menus.
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

  // For atlas pages, mirror the visible collection pills into the drawer so
  // mobile visitors can switch collections without leaving the menu.
  const atlasPills = document.querySelector('#collections-pills');
  const collectionsHost = dialog.querySelector('.travel-menu-collections');
  const collectionsList = dialog.querySelector('.travel-menu-collection-list');
  if (atlasPills && collectionsHost && collectionsList) {
    const cloneChoices = () => {
      collectionsList.replaceChildren();
      [...atlasPills.querySelectorAll('.collection-pill')].forEach(pill => {
        const entry = document.createElement('a');
        entry.href = '#';
        entry.dataset.category = pill.dataset.category;
        entry.setAttribute('role', 'button');
        // Keep counts live — update on app.js signal via MutationObserver fallback
        const num = pill.querySelector('.pill-num')?.textContent || '';
        const name = pill.querySelector('.pill-name strong')?.textContent || '';
        const sub = pill.querySelector('.pill-name small')?.textContent || '';
        const count = pill.querySelector('.pill-count')?.textContent || '';
        entry.innerHTML = `<span class="travel-collection-num">${num}</span><span class="travel-collection-name"><strong>${name}</strong><small>${sub}</small></span><span class="travel-collection-count">${count}</span><span class="travel-collection-arrow" aria-hidden="true">↗</span>`;
        entry.className = 'travel-collection-link';
        if (pill.getAttribute('aria-selected') === 'true') entry.setAttribute('aria-current', 'true');
        entry.addEventListener('click', e => {
          e.preventDefault();
          const cat = entry.dataset.category;
          // Delegate to atlas app if present.
          const target = document.querySelector(`#pill-${cat}`) || document.querySelector(`[data-category="${cat}"]`);
          if (target) target.click();
          dialog.close();
        });
        collectionsList.append(entry);
      });
      // Sync counts: observe pill-count changes
      collectionsHost.hidden = false;
    };
    cloneChoices();
    // Keep counts and active state in sync
    const observer = new MutationObserver(cloneChoices);
    observer.observe(atlasPills, { subtree: true, childList: true, attributes: true, characterData: true });

    // Also update active state when app.js changes selection via category change
    document.addEventListener('atlas:categorychange', cloneChoices);
  }

  // Local header nav (desktop inline) — keep visible via CSS; on mobile it
  // lives only inside the drawer. For atlas we use CSS to hide/show, not
  // hidden attribute. For older pages, also avoid hiding via attribute.
  if (original) {
    if (header.closest('.topbar')) {
      const local = dialog.querySelector('.travel-menu-local');
      const nav = original.cloneNode(true);
      nav.className = 'travel-menu-page-links';
      local.append(nav);
    }
    // Only hide via attribute for legacy compact headers; new site-nav stays
    // visible and is hidden/shown by CSS breakpoints.
    if (!original.classList.contains('site-nav')) {
      original.hidden = true;
    }
  }

  // Mark current page in the main links
  const here = location.pathname.replace(/index\.html$/, '');
  dialog.querySelectorAll('.travel-menu-links a, .travel-menu-foot a').forEach(link => {
    const path = new URL(link.getAttribute('href'), location.href).pathname.replace(/index\.html$/, '');
    if (path === here) link.setAttribute('aria-current', 'page');
  });

  // Also mark atlas collection current if drawer was built (fallback)
  // The observer above handles live updates.

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

  // Close on backdrop click — dialog handles this natively, but ensure we
  // don't trap when clicking the collection links (already handled).
})();
