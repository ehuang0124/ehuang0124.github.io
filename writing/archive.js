(() => {
  const dataNode = document.querySelector('#writing-data');
  const grid = document.querySelector('#story-grid');
  const pagination = document.querySelector('#pagination');
  const tagNav = document.querySelector('#tag-nav');
  const count = document.querySelector('#results-count');
  const range = document.querySelector('#results-range');
  const pageLabel = document.querySelector('#page-label');
  const emptyState = document.querySelector('#empty-state');

  if (!dataNode || !grid || !pagination || !tagNav) return;

  let items;
  try {
    items = JSON.parse(dataNode.textContent || '[]');
  } catch (error) {
    console.error('Writing archive data could not be read.', error);
    return;
  }

  const pageSize = 20;
  const labels = {
    essay: '散文',
    roadtrip: '公路',
    people: '人物',
    poem: '詩'
  };

  const escapeHTML = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[character]));

  const readState = () => {
    const params = new URLSearchParams(window.location.search);
    const tag = params.get('tag') || 'all';
    const requestedPage = Number.parseInt(params.get('page') || '1', 10);
    return {
      tag: ['all', ...Object.keys(labels)].includes(tag) ? tag : 'all',
      page: Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1
    };
  };

  const updateUrl = (tag, page) => {
    const url = new URL(window.location.href);
    if (tag === 'all') url.searchParams.delete('tag');
    else url.searchParams.set('tag', tag);
    if (page === 1) url.searchParams.delete('page');
    else url.searchParams.set('page', String(page));
    window.history.pushState({}, '', url);
  };

  const tagMarkup = (tags, small = false) => tags.map((tag) => (
    `<span class="tag${small ? ' tag--small' : ''} tag--${escapeHTML(tag)}">${escapeHTML(labels[tag] || tag)}</span>`
  )).join('');

  const imageMarkup = (item) => {
    if (!item.image) return '';
    return `<figure class="story-card-figure">
      <img class="story-card-image" src="${escapeHTML(item.image)}" alt="" loading="lazy" decoding="async">
      <figcaption class="story-card-figure-caption">原文附圖</figcaption>
    </figure>`;
  };

  const cardMarkup = (item, index) => {
    const excerpt = item.excerpt || '一篇收在書寫檔案裡的文章。';
    return `<article class="story-card${item.image ? ' story-card--has-image' : ''}">
  <a class="story-card-link" href="${escapeHTML(item.path)}">
    <div class="story-card-topline">
      <span class="story-card-number">${String(index).padStart(2, '0')}</span>
      <time datetime="${escapeHTML(item.date)}">${escapeHTML(item.date)}</time>
    </div>
    ${imageMarkup(item)}
    <h3 class="story-card-title">${escapeHTML(item.title)}</h3>
    <p class="story-excerpt"><span class="quote-mark" aria-hidden="true">“</span>${escapeHTML(excerpt)}</p>
    <div class="story-card-bottom">
      <span class="story-tags">${tagMarkup(item.tags, true)}</span>
      <span class="story-card-arrow" aria-hidden="true">↗</span>
    </div>
  </a>
</article>`;
  };

  const paginationButton = (label, page, disabled = false, current = false) => {
    const currentAttribute = current ? ' aria-current="page"' : '';
    return `<button class="pagination-link${current ? ' is-current' : ''}" type="button" data-page="${page}"${disabled ? ' disabled' : ''}${currentAttribute}>${label}</button>`;
  };

  const renderPagination = (page, totalPages) => {
    if (totalPages <= 1) {
      pagination.innerHTML = '';
      pagination.hidden = true;
      return;
    }

    const pages = [];
    pages.push(paginationButton('上一頁', page - 1, page === 1));
    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      pages.push(paginationButton(String(pageNumber).padStart(2, '0'), pageNumber, false, pageNumber === page));
    }
    pages.push(paginationButton('下一頁', page + 1, page === totalPages));
    pagination.innerHTML = pages.join('');
    pagination.hidden = false;
  };

  const render = () => {
    const state = readState();
    const filtered = state.tag === 'all'
      ? items
      : items.filter((item) => item.tags.includes(state.tag));
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const page = Math.min(state.page, totalPages);
    const start = (page - 1) * pageSize;
    const visible = filtered.slice(start, start + pageSize);

    if (page !== state.page) {
      const url = new URL(window.location.href);
      if (page === 1) url.searchParams.delete('page');
      else url.searchParams.set('page', String(page));
      window.history.replaceState({}, '', url);
    }

    grid.innerHTML = visible.map((item, index) => cardMarkup(item, start + index + 1)).join('');
    grid.hidden = visible.length === 0;
    emptyState.hidden = visible.length !== 0;
    count.textContent = `${filtered.length} 篇`;
    range.textContent = visible.length ? `第 ${start + 1}–${start + visible.length} 篇，共 ${filtered.length} 篇` : '沒有文章';
    pageLabel.textContent = totalPages > 1 ? `第 ${page} 頁，共 ${totalPages} 頁` : '僅一頁';
    renderPagination(page, totalPages);

    tagNav.querySelectorAll('[data-tag]').forEach((button) => {
      const active = button.dataset.tag === state.tag;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  };

  tagNav.addEventListener('click', (event) => {
    const button = event.target.closest('[data-tag]');
    if (!button) return;
    updateUrl(button.dataset.tag, 1);
    render();
    document.querySelector('#archive')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  pagination.addEventListener('click', (event) => {
    const button = event.target.closest('[data-page]');
    if (!button || button.disabled) return;
    updateUrl(readState().tag, Number(button.dataset.page));
    render();
    grid.focus({ preventScroll: true });
  });

  grid.addEventListener('error', (event) => {
    const image = event.target;
    if (!image || image.tagName !== 'IMG') return;
    const figure = image.closest('.story-card-figure');
    const card = image.closest('.story-card');
    figure?.remove();
    card?.classList.remove('story-card--has-image');
    card?.classList.add('story-card--no-image');
  }, true);

  window.addEventListener('popstate', render);
  render();
})();
