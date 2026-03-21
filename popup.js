let API_BASE = 'http://localhost:3000';
let categories = [];
let links = [];
let workspaces = [];
let allLinksForWorkspace = [];
let selectedCategoryId = null;
let searchQuery = '';
let viewMode = 'grid'; // 'grid' | 'list'
let draggedLinkId = null;
let draggedCategoryId = null;

const $ = (id) => document.getElementById(id);
const $categoryList = $('categoryList');
const $linkList = $('linkList');
const $workspaceList = $('workspaceList');
const $currentCategoryTitle = $('currentCategoryTitle');
const $apiStatus = $('apiStatus');
const $searchInput = $('searchInput');
const $linkModal = $('linkModal');
const $categoryListModal = $('categoryListModal');
const $categoryModal = $('categoryModal');
const $workspaceListModal = $('workspaceListModal');
const $workspaceModal = $('workspaceModal');
const $settingsModal = $('settingsModal');

function getApiBaseFromStorage() {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['apiBase'], (r) => resolve(r.apiBase || 'http://localhost:3000'));
    } else resolve('http://localhost:3000');
  });
}

function setApiBaseToStorage(url) {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ apiBase: url }, resolve);
    } else resolve();
  });
}

async function api(path, options = {}) {
  try {
    const res = await fetch(API_BASE + path, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error || (res.status === 409 ? '이미 같은 주소의 링크가 저장되어 있습니다.' : res.statusText);
      throw new Error(msg);
    }
    return data;
  } catch (e) {
    console.error(e);
    throw e;
  }
}

function setApiStatus(ok, message) {
  $apiStatus.textContent = message || (ok ? '연결됨' : `서버 연결 실패 (${API_BASE} 확인)`);
  $apiStatus.classList.toggle('error', !ok);
  $apiStatus.classList.toggle('ok', ok);
}

async function loadCategories() {
  try {
    categories = await api('/api/categories');
    setApiStatus(true);
    renderCategories();
    return true;
  } catch (e) {
    setApiStatus(false);
    return false;
  }
}

async function loadLinks() {
  try {
    const path = selectedCategoryId
      ? `/api/links?category_id=${selectedCategoryId}`
      : '/api/links';
    links = await api(path);
    renderLinks();
  } catch (e) {
    $linkList.innerHTML = '<li class="empty-state">링크를 불러올 수 없습니다.</li>';
  }
}

function renderCategories() {
  $categoryList.innerHTML = '';
  const canReorderCategories = categories.length > 1;
  $categoryList.classList.toggle('category-list--reorderable', canReorderCategories);

  const allBtn = document.createElement('li');
  allBtn.className = 'category-item-all';
  allBtn.innerHTML = `<button type="button" class="cat-btn ${selectedCategoryId === null ? 'active' : ''}" data-id="">전체</button>`;
  allBtn.querySelector('.cat-btn').addEventListener('click', () => {
    selectedCategoryId = null;
    renderCategories();
    loadLinks();
    $currentCategoryTitle.textContent = '전체 링크';
  });
  $categoryList.appendChild(allBtn);

  categories.forEach((cat) => {
    const li = document.createElement('li');
    const activeClass = selectedCategoryId === cat.id ? 'active' : '';
    const handleHtml = canReorderCategories
      ? `<button type="button" class="category-drag-handle" draggable="true" title="드래그하여 순서 변경" aria-label="순서 변경">⋮⋮</button>`
      : '';
    li.innerHTML = `${handleHtml}<button type="button" class="cat-btn ${activeClass}" data-id="${cat.id}">${escapeHtml(cat.name)}</button>`;
    const catBtn = li.querySelector('.cat-btn');
    catBtn.addEventListener('click', () => {
      selectedCategoryId = cat.id;
      renderCategories();
      loadLinks();
      $currentCategoryTitle.textContent = cat.name;
    });

    if (canReorderCategories) {
      const handle = li.querySelector('.category-drag-handle');
      if (handle) {
        handle.addEventListener('click', (e) => e.stopPropagation());
        handle.addEventListener('dragstart', (e) => {
          e.stopPropagation();
          draggedCategoryId = cat.id;
          li.classList.add('category-item-dragging');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(cat.id));
        });
        handle.addEventListener('dragend', () => {
          draggedCategoryId = null;
          li.classList.remove('category-item-dragging');
          $categoryList.querySelectorAll('.category-item-drag-over').forEach((el) => el.classList.remove('category-item-drag-over'));
        });
        li.addEventListener('dragover', (e) => {
          if (draggedCategoryId == null) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          $categoryList.querySelectorAll('.category-item-drag-over').forEach((el) => {
            if (el !== li) el.classList.remove('category-item-drag-over');
          });
          li.classList.add('category-item-drag-over');
        });
        li.addEventListener('dragleave', (e) => {
          if (!li.contains(e.relatedTarget)) li.classList.remove('category-item-drag-over');
        });
        li.addEventListener('drop', async (e) => {
          if (draggedCategoryId == null) return;
          e.preventDefault();
          e.stopPropagation();
          li.classList.remove('category-item-drag-over');
          const dragId = draggedCategoryId;
          const targetId = cat.id;
          if (dragId === targetId) return;
          const orderedIds = categories.map((c) => c.id);
          const from = orderedIds.indexOf(dragId);
          let to = orderedIds.indexOf(targetId);
          if (from === -1 || to === -1) return;
          const next = [...orderedIds];
          next.splice(from, 1);
          if (from < to) to -= 1;
          next.splice(to, 0, dragId);
          try {
            await persistCategoryOrder(next);
            await loadCategories();
            await loadLinks();
          } catch (err) {
            alert('카테고리 순서 저장 실패: ' + (err.message || ''));
          }
        });
      }
    }

    $categoryList.appendChild(li);
  });
}

async function loadWorkspaces() {
  try {
    workspaces = await api('/api/workspaces');
    renderWorkspaces();
  } catch (e) {
    workspaces = [];
    renderWorkspaces();
  }
}

function renderWorkspaces() {
  $workspaceList.innerHTML = '';
  workspaces.forEach((ws) => {
    const li = document.createElement('li');
    const label = ws.links && ws.links.length > 0 ? `${escapeHtml(ws.name)} (${ws.links.length})` : escapeHtml(ws.name);
    li.innerHTML = `<button type="button" class="workspace-btn" data-id="${ws.id}" title="선택한 링크를 탭으로 한꺼번에 열기">${label}</button>`;
    li.querySelector('.workspace-btn').addEventListener('click', () => openWorkspaceTabs(ws));
    $workspaceList.appendChild(li);
  });
}

function openWorkspaceTabs(workspace) {
  if (!workspace.links || workspace.links.length === 0) {
    alert('이 그룹에 포함된 링크가 없습니다. 그룹 편집에서 링크를 추가해 주세요.');
    return;
  }
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    workspace.links.forEach((link) => {
      if (link.url) chrome.tabs.create({ url: link.url });
    });
  } else {
    workspace.links.forEach((link) => {
      if (link.url) window.open(link.url, '_blank');
    });
  }
}

function openCategoryListModal() {
  renderCategoryListModalContent();
  $categoryListModal.classList.add('show');
}

function closeCategoryListModal() {
  $categoryListModal.classList.remove('show');
}

function renderCategoryListModalContent() {
  const listEl = $('categoryEditList');
  const emptyEl = $('categoryEditEmpty');
  listEl.innerHTML = '';
  if (categories.length === 0) {
    emptyEl.style.display = '';
    return;
  }
  emptyEl.style.display = 'none';
  categories.forEach((cat) => {
    const li = document.createElement('li');
    li.className = 'category-edit-item';
    li.innerHTML = `
      <span class="category-edit-name">${escapeHtml(cat.name)}</span>
      <div class="category-edit-actions">
        <button type="button" class="btn btn-sm" data-action="copy" title="주소·사이트명 복사">복사</button>
        <button type="button" class="btn btn-sm btn-edit" data-action="edit">수정</button>
        <button type="button" class="btn btn-sm btn-danger" data-action="delete">삭제</button>
      </div>
    `;
    li.querySelector('[data-action="copy"]').addEventListener('click', () => copyCategoryLinks(cat));
    li.querySelector('[data-action="edit"]').addEventListener('click', () => openCategoryModal(cat));
    li.querySelector('[data-action="delete"]').addEventListener('click', () => {
      deleteCategory(cat.id);
      if ($categoryListModal.classList.contains('show')) renderCategoryListModalContent();
    });
    listEl.appendChild(li);
  });
}

function logoFullUrl(url) {
  if (!url) return '';
  return url.startsWith('http') ? url : API_BASE + (url.startsWith('/') ? url : '/' + url);
}

function canReorderLinks() {
  return selectedCategoryId !== null && !String(searchQuery || '').trim();
}

async function persistLinkOrder(orderedIds) {
  const items = orderedIds.map((id, sort_order) => ({ id, sort_order }));
  await api('/api/links/reorder', {
    method: 'PATCH',
    body: JSON.stringify({ items }),
  });
}

async function persistCategoryOrder(orderedIds) {
  const items = orderedIds.map((id, sort_order) => ({ id, sort_order }));
  await api('/api/categories/reorder', {
    method: 'PATCH',
    body: JSON.stringify({ items }),
  });
}

function getFilteredLinks() {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return links;
  return links.filter(
    (l) =>
      (l.site_name && l.site_name.toLowerCase().includes(q)) ||
      (l.url && l.url.toLowerCase().includes(q)) ||
      (l.description && l.description.toLowerCase().includes(q)) ||
      (l.category_name && l.category_name.toLowerCase().includes(q))
  );
}

function getLinksGroupedByCategory(linkList) {
  const byCategory = new Map();
  for (const link of linkList) {
    const cid = link.category_id ?? 0;
    const cname = link.category_name ?? '(미분류)';
    if (!byCategory.has(cid)) byCategory.set(cid, { categoryId: cid, categoryName: cname, links: [] });
    byCategory.get(cid).links.push(link);
  }
  const order = new Map(categories.map((c, i) => [c.id, i]));
  return [...byCategory.values()].sort((a, b) => (order.get(a.categoryId) ?? 999) - (order.get(b.categoryId) ?? 999));
}

function formatLinksForCopy(linkList) {
  return linkList.map((l) => `${l.site_name || '(이름 없음)'} - ${l.url || ''}`).join('\n');
}

async function copyCurrentLinks() {
  const filtered = getFilteredLinks();
  if (filtered.length === 0) {
    alert('복사할 링크가 없습니다.');
    return;
  }
  const text = formatLinksForCopy(filtered);
  try {
    await navigator.clipboard.writeText(text);
    alert('클립보드에 복사되었습니다.\n\n표시 중인 링크 ' + filtered.length + '개');
  } catch (e) {
    alert('복사 실패: ' + (e.message || '클립보드 접근을 허용해 주세요.'));
  }
}

async function copyCategoryLinks(cat) {
  try {
    const linkList = await api('/api/links?category_id=' + cat.id);
    if (linkList.length === 0) {
      alert('"' + cat.name + '" 카테고리에 링크가 없습니다.');
      return;
    }
    const text = formatLinksForCopy(linkList);
    await navigator.clipboard.writeText(text);
    alert('클립보드에 복사되었습니다.\n\n' + cat.name + ' 링크 ' + linkList.length + '개');
  } catch (e) {
    alert('복사 실패: ' + (e.message || ''));
  }
}

function renderLinks() {
  const filtered = getFilteredLinks();
  const reorderable = canReorderLinks();
  const groupByCategory = selectedCategoryId === null;
  $linkList.classList.toggle('list-view', viewMode === 'list');
  $linkList.classList.toggle('link-list--reorderable', reorderable);
  $linkList.classList.toggle('link-list--grouped', groupByCategory);
  $linkList.innerHTML = '';
  if (links.length === 0) {
    $linkList.innerHTML = '<li class="empty-state">등록된 링크가 없습니다.<br/>+ 링크 추가로 저장하세요.</li>';
    return;
  }
  if (filtered.length === 0) {
    $linkList.innerHTML = '<li class="empty-state">검색 결과가 없습니다.</li>';
    return;
  }
  const items = groupByCategory
    ? getLinksGroupedByCategory(filtered).flatMap((g) => [
        { type: 'section', categoryName: g.categoryName },
        ...g.links.map((link) => ({ type: 'link', link })),
      ])
    : filtered.map((link) => ({ type: 'link', link }));
  items.forEach((item) => {
    if (item.type === 'section') {
      const li = document.createElement('li');
      li.className = 'category-section';
      li.innerHTML = `<div class="category-section-header">${escapeHtml(item.categoryName)}</div>`;
      $linkList.appendChild(li);
      return;
    }
    const link = item.link;
    const li = document.createElement('li');
    const imgSrc = logoFullUrl(link.site_image);
    const thumb = imgSrc
      ? `<img class="thumb" src="${escapeAttr(imgSrc)}" alt="" /><span class="thumb-placeholder thumb-placeholder-fallback">${escapeHtml((link.site_name || '?')[0])}</span>`
      : `<span class="thumb-placeholder">${escapeHtml((link.site_name || '?')[0])}</span>`;
    const isList = viewMode === 'list';
    const cardClass = isList ? 'link-row' : 'link-card';
    const urlShort = link.url ? (link.url.length > 50 ? link.url.slice(0, 47) + '...' : link.url) : '';
    const menuItems = [
      { action: 'edit', label: '수정' },
      ...(link.note ? [{ action: 'memo', label: '메모 보기' }] : []),
      { action: 'go', label: '사이트 이동' },
      { action: 'delete', label: '삭제', danger: true },
    ];
    const dropdownHtml = `
      <div class="card-dropdown" role="menu">
        ${menuItems.map((item) => `
          <button type="button" class="card-dropdown-item ${item.danger ? 'card-dropdown-item-danger' : ''}" data-action="${item.action}">${escapeHtml(item.label)}</button>
        `).join('')}
      </div>
    `;
    const dragHandleHtml = reorderable
      ? `<button type="button" class="link-drag-handle" draggable="true" title="드래그하여 순서 변경" aria-label="순서 변경">⋮⋮</button>`
      : '';
    li.innerHTML = isList
      ? `
      ${dragHandleHtml}
      <div class="${cardClass}" data-link-id="${link.id}">
        ${thumb}
        <div class="body">
          <p class="name">${escapeHtml(link.site_name)}</p>
          ${urlShort ? `<p class="url-text">${escapeHtml(urlShort)}</p>` : ''}
        </div>
        <div class="card-menu">
          <button type="button" class="card-menu-btn" title="메뉴" aria-haspopup="true" aria-expanded="false">⋮</button>
          ${dropdownHtml}
        </div>
      </div>
    `
      : `
      ${dragHandleHtml}
      <div class="${cardClass}" data-link-id="${link.id}">
        ${thumb}
        <div class="body">
          <p class="name">${escapeHtml(link.site_name)}</p>
          ${link.description ? `<p class="desc">${escapeHtml(link.description)}</p>` : ''}
        </div>
        <div class="card-menu">
          <button type="button" class="card-menu-btn" title="메뉴" aria-haspopup="true" aria-expanded="false">⋮</button>
          ${dropdownHtml}
        </div>
      </div>
    `;
    const card = li.querySelector(`.${cardClass}`);
    const thumbImg = card.querySelector('.thumb');
    const thumbPlaceholder = card.querySelector('.thumb-placeholder');
    if (thumbImg && thumbPlaceholder) {
      thumbImg.addEventListener('error', () => {
        thumbImg.classList.add('thumb-hidden');
        thumbPlaceholder.classList.remove('thumb-placeholder-fallback');
      });
    }
    const menuBtn = card.querySelector('.card-menu-btn');
    const dropdown = card.querySelector('.card-dropdown');
    const closeDropdown = () => dropdown.classList.remove('open');
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.card-dropdown.open').forEach((d) => d.classList.remove('open'));
      dropdown.classList.toggle('open');
      const isOpen = dropdown.classList.contains('open');
      menuBtn.setAttribute('aria-expanded', isOpen);
      if (isOpen) {
        setTimeout(() => document.addEventListener('click', function closeOnClick() {
          document.removeEventListener('click', closeOnClick);
          closeDropdown();
          menuBtn.setAttribute('aria-expanded', 'false');
        }, { once: true }), 0);
      }
    });
    dropdown.querySelectorAll('.card-dropdown-item').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeDropdown();
        menuBtn.setAttribute('aria-expanded', 'false');
        const action = btn.getAttribute('data-action');
        if (action === 'edit') openLinkModal(link);
        else if (action === 'delete') deleteLink(link.id);
        else if (action === 'memo') showMemoPanel(link);
        else if (action === 'go' && link.url) {
          if (typeof chrome !== 'undefined' && chrome.tabs) chrome.tabs.create({ url: link.url });
          else window.open(link.url, '_blank');
        }
      });
    });
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card-menu')) return;
      if (e.target.closest('.link-drag-handle')) return;
      e.stopPropagation();
      showMemoPanel(link);
    });
    if (reorderable) {
      const handle = li.querySelector('.link-drag-handle');
      if (handle) {
        handle.addEventListener('click', (e) => e.stopPropagation());
        handle.addEventListener('dragstart', (e) => {
          e.stopPropagation();
          draggedLinkId = link.id;
          li.classList.add('link-item-dragging');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(link.id));
        });
        handle.addEventListener('dragend', () => {
          draggedLinkId = null;
          li.classList.remove('link-item-dragging');
          $linkList.querySelectorAll('.link-item-drag-over').forEach((el) => el.classList.remove('link-item-drag-over'));
        });
        li.addEventListener('dragover', (e) => {
          if (draggedLinkId == null) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          $linkList.querySelectorAll('.link-item-drag-over').forEach((el) => {
            if (el !== li) el.classList.remove('link-item-drag-over');
          });
          li.classList.add('link-item-drag-over');
        });
        li.addEventListener('dragleave', (e) => {
          if (!li.contains(e.relatedTarget)) li.classList.remove('link-item-drag-over');
        });
        li.addEventListener('drop', async (e) => {
          if (draggedLinkId == null) return;
          e.preventDefault();
          e.stopPropagation();
          li.classList.remove('link-item-drag-over');
          const dragId = draggedLinkId;
          const targetId = link.id;
          if (dragId === targetId) return;
          const orderedIds = filtered.map((l) => l.id);
          const from = orderedIds.indexOf(dragId);
          let to = orderedIds.indexOf(targetId);
          if (from === -1 || to === -1) return;
          const next = [...orderedIds];
          next.splice(from, 1);
          if (from < to) to -= 1;
          next.splice(to, 0, dragId);
          try {
            await persistLinkOrder(next);
            await loadLinks();
          } catch (err) {
            alert('순서 저장 실패: ' + (err.message || ''));
          }
        });
      }
    }
    $linkList.appendChild(li);
    if (imgSrc && imgSrc.includes('localhost')) {
      fetch(imgSrc).then((r) => r.ok && r.blob()).then((blob) => {
        const thumbImg = li.querySelector('.thumb');
        if (thumbImg && blob) thumbImg.src = URL.createObjectURL(blob);
      }).catch(() => {});
    }
  });
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s ?? '';
  return div.innerHTML;
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

function showMemoPanel(link) {
  const panel = $('memoPanel');
  const titleEl = $('memoPanelTitle');
  const bodyEl = $('memoPanelBody');
  const goLink = $('memoPanelGoLink');
  if (!panel || !titleEl || !bodyEl) return;
  titleEl.textContent = link.site_name || '메모';
  bodyEl.textContent = link.note || '';
  bodyEl.classList.toggle('memo-panel-empty', !link.note);
  if (goLink) {
    goLink.href = link.url || '#';
    goLink.style.display = link.url ? '' : 'none';
  }
  panel.classList.add('show');
}

function hideMemoPanel() {
  const panel = $('memoPanel');
  if (panel) panel.classList.remove('show');
}

async function deleteLink(id) {
  if (!confirm('이 링크를 삭제할까요?')) return;
  try {
    await api(`/api/links/${id}`, { method: 'DELETE' });
    hideMemoPanel();
    loadLinks();
  } catch (e) {
    alert('삭제 실패: ' + e.message);
  }
}

function updateLogoPreview(url) {
  const el = $('logoPreview');
  const hint = $('logoDropHint');
  if (!url) {
    el.innerHTML = '';
    if (hint) hint.style.display = '';
    return;
  }
  if (hint) hint.style.display = 'none';
  const src = url.startsWith('http') ? url : API_BASE + url;
  el.innerHTML = `<img src="${escapeAttr(src)}" alt="로고 미리보기" />`;
  const img = el.querySelector('img');
  if (img) img.addEventListener('error', () => { img.classList.add('thumb-hidden'); });
}

async function uploadLogoFile(file) {
  const form = new FormData();
  form.append('image', file);
  const res = await fetch(API_BASE + '/api/upload', { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  const fullUrl = data.url?.startsWith('http') ? data.url : (API_BASE + (data.url?.startsWith('/') ? data.url : '/' + (data.url || '')));
  $('siteImage').value = fullUrl;
  updateLogoPreview(fullUrl);
}

function handleLogoFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    alert('이미지 파일만 올릴 수 있습니다.');
    return;
  }
  uploadLogoFile(file).catch((err) => alert('업로드 실패: ' + err.message));
}

function openLinkModal(link = null) {
  $('linkModalTitle').textContent = link ? '링크 수정' : '링크 추가';
  $('linkId').value = link ? link.id : '';
  $('linkUrl').value = link ? link.url : '';
  $('siteName').value = link ? link.site_name : '';
  $('siteImage').value = link ? (logoFullUrl(link.site_image) || '') : '';
  $('linkDescription').value = link ? link.description || '' : '';
  $('linkNote').value = link ? link.note || '' : '';
  updateLogoPreview($('siteImage').value.trim());
  const sel = $('linkCategory');
  sel.innerHTML = categories.map((c) => `<option value="${c.id}" ${(link && link.category_id === c.id) || (!link && selectedCategoryId === c.id) ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
  if (!link && selectedCategoryId) sel.value = selectedCategoryId;
  $('linkSortOrder').value = link ? (link.sort_order ?? 0) : 0;
  if (categories.length === 0) {
    alert('먼저 카테고리를 추가해 주세요.');
    return;
  }
  $linkModal.classList.add('show');
}

function closeLinkModal() {
  $linkModal.classList.remove('show');
}

async function fetchMetaAndFill() {
  const url = $('linkUrl').value.trim();
  if (!url) {
    alert('먼저 URL을 입력해 주세요.');
    return;
  }
  const btn = $('fetchMetaBtn');
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '가져오는 중…';
  try {
    const res = await fetch(API_BASE + '/api/fetch-meta?url=' + encodeURIComponent(url));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    if (data.site_name) $('siteName').value = data.site_name;
    if (data.description) $('linkDescription').value = data.description;
    if (data.site_image) {
      $('siteImage').value = data.site_image;
      updateLogoPreview(data.site_image);
      const hint = $('logoDropHint');
      if (hint) hint.style.display = 'none';
    }
  } catch (e) {
    alert('사이트 정보를 가져오지 못했습니다: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
}

function openCategoryModal(cat = null) {
  $('categoryModalTitle').textContent = cat ? '카테고리 수정' : '카테고리 추가';
  $('categoryId').value = cat ? cat.id : '';
  $('categoryName').value = cat ? cat.name : '';
  $('categorySubmitBtn').textContent = cat ? '수정' : '추가';
  $categoryModal.classList.add('show');
}

function closeCategoryModal() {
  $categoryModal.classList.remove('show');
}

async function deleteCategory(id) {
  if (!confirm('이 카테고리를 삭제할까요? 해당 카테고리의 링크도 함께 삭제됩니다.')) return;
  try {
    await api(`/api/categories/${id}`, { method: 'DELETE' });
    if (selectedCategoryId === id) {
      selectedCategoryId = null;
      $currentCategoryTitle.textContent = '전체 링크';
    }
    await loadCategories();
    loadLinks();
  } catch (e) {
    alert('삭제 실패: ' + e.message);
  }
}

$('categoryForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('categoryName').value.trim();
  const id = $('categoryId').value;
  if (!name) return;
  try {
    if (id) {
      await api(`/api/categories/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
      if (selectedCategoryId === +id) $currentCategoryTitle.textContent = name;
    } else {
      await api('/api/categories', { method: 'POST', body: JSON.stringify({ name }) });
    }
    closeCategoryModal();
    await loadCategories();
    loadLinks();
    if ($categoryListModal.classList.contains('show')) renderCategoryListModalContent();
  } catch (err) {
    alert(id ? '수정 실패: ' + err.message : '추가 실패: ' + err.message);
  }
});

$('fetchMetaBtn').addEventListener('click', fetchMetaAndFill);

$('logoClearBtn').addEventListener('click', () => {
  $('siteImage').value = '';
  updateLogoPreview('');
  const hint = $('logoDropHint');
  if (hint) hint.style.display = '';
});

const logoDropZone = $('logoDropZone');
if (logoDropZone) {
  logoDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    logoDropZone.classList.add('logo-drop-over');
  });
  logoDropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    logoDropZone.classList.remove('logo-drop-over');
  });
  logoDropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    logoDropZone.classList.remove('logo-drop-over');
    const file = e.dataTransfer.files[0];
    handleLogoFile(file);
  });
}

$('logoSelectFileBtn').addEventListener('click', () => {
  const input = $('logoFileInput');
  if (input) input.click();
});
$('logoFileInput').addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (file) handleLogoFile(file);
  e.target.value = '';
});

$('linkForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('linkId').value;
  const payload = {
    category_id: +$('linkCategory').value,
    url: $('linkUrl').value.trim(),
    site_name: $('siteName').value.trim(),
    site_image: $('siteImage').value.trim() || null,
    description: $('linkDescription').value.trim() || null,
    note: $('linkNote').value.trim() || null,
    sort_order: parseInt($('linkSortOrder').value, 10) || 0,
  };
  try {
    if (id) {
      await api(`/api/links/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      await api('/api/links', { method: 'POST', body: JSON.stringify(payload) });
    }
    closeLinkModal();
    loadLinks();
  } catch (err) {
    alert('저장 실패: ' + err.message);
  }
});

$('copyLinksBtn').addEventListener('click', copyCurrentLinks);
$('addLinkBtn').addEventListener('click', () => {
  if (categories.length === 0) {
    alert('먼저 카테고리를 추가해 주세요.');
    return;
  }
  openLinkModal();
});

if ($searchInput) {
  $searchInput.addEventListener('input', () => {
    searchQuery = $searchInput.value;
    renderLinks();
  });
}
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    if ($searchInput) {
      $searchInput.focus();
      $searchInput.select();
    }
  }
});

function setViewMode(mode) {
  viewMode = mode;
  $('viewGridBtn').classList.toggle('active', mode === 'grid');
  $('viewListBtn').classList.toggle('active', mode === 'list');
  renderLinks();
}
$('viewGridBtn').addEventListener('click', () => setViewMode('grid'));
$('viewListBtn').addEventListener('click', () => setViewMode('list'));

function openWorkspaceListModal() {
  renderWorkspaceListModalContent();
  $workspaceListModal.classList.add('show');
}

function closeWorkspaceListModal() {
  $workspaceListModal.classList.remove('show');
}

function renderWorkspaceListModalContent() {
  const listEl = $('workspaceEditList');
  const emptyEl = $('workspaceEditEmpty');
  listEl.innerHTML = '';
  if (workspaces.length === 0) {
    emptyEl.style.display = '';
    return;
  }
  emptyEl.style.display = 'none';
  workspaces.forEach((ws) => {
    const li = document.createElement('li');
    li.className = 'category-edit-item';
    const linkCount = ws.links ? ws.links.length : 0;
    li.innerHTML = `
      <span class="category-edit-name">${escapeHtml(ws.name)} <small>(${linkCount}개 링크)</small></span>
      <div class="category-edit-actions">
        <button type="button" class="btn btn-sm btn-edit" data-action="edit">수정</button>
        <button type="button" class="btn btn-sm btn-danger" data-action="delete">삭제</button>
      </div>
    `;
    li.querySelector('[data-action="edit"]').addEventListener('click', () => openWorkspaceModal(ws));
    li.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      if (!confirm(`"${ws.name}" 그룹을 삭제할까요?`)) return;
      try {
        await api(`/api/workspaces/${ws.id}`, { method: 'DELETE' });
        await loadWorkspaces();
        if ($workspaceListModal.classList.contains('show')) renderWorkspaceListModalContent();
      } catch (e) {
        alert('삭제 실패: ' + e.message);
      }
    });
    listEl.appendChild(li);
  });
}

function updateWorkspaceSelectAllState() {
  const container = $('workspaceLinkCheckboxes');
  const all = container.querySelectorAll('input[type="checkbox"]');
  const checked = container.querySelectorAll('input[type="checkbox"]:checked');
  const selectAll = $('workspaceSelectAll');
  if (!selectAll) return;
  if (all.length === 0) {
    selectAll.checked = false;
    selectAll.indeterminate = false;
    return;
  }
  if (checked.length === 0) {
    selectAll.checked = false;
    selectAll.indeterminate = false;
  } else if (checked.length === all.length) {
    selectAll.checked = true;
    selectAll.indeterminate = false;
  } else {
    selectAll.checked = false;
    selectAll.indeterminate = true;
  }
}

async function openWorkspaceModal(workspace = null) {
  $('workspaceModalTitle').textContent = workspace ? '작업 그룹 수정' : '작업 그룹 추가';
  $('workspaceId').value = workspace ? workspace.id : '';
  $('workspaceName').value = workspace ? workspace.name : '';
  try {
    allLinksForWorkspace = await api('/api/links');
  } catch (e) {
    allLinksForWorkspace = [];
  }
  const container = $('workspaceLinkCheckboxes');
  container.innerHTML = '';
  const selectedIds = workspace && workspace.links ? workspace.links.map((l) => l.id) : [];
  allLinksForWorkspace.forEach((link) => {
    const label = document.createElement('label');
    label.className = 'workspace-link-check';
    const checked = selectedIds.includes(link.id);
    label.innerHTML = `<input type="checkbox" value="${link.id}" ${checked ? 'checked' : ''} /> <span>${escapeHtml(link.site_name)}</span>`;
    label.querySelector('input').addEventListener('change', updateWorkspaceSelectAllState);
    container.appendChild(label);
  });
  updateWorkspaceSelectAllState();
  $workspaceModal.classList.add('show');
}

function closeWorkspaceModal() {
  $workspaceModal.classList.remove('show');
}

$('workspaceForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('workspaceName').value.trim();
  const id = $('workspaceId').value;
  const checkboxes = $('workspaceLinkCheckboxes').querySelectorAll('input[type="checkbox"]:checked');
  const link_ids = Array.from(checkboxes).map((cb) => parseInt(cb.value, 10));
  try {
    if (id) {
      await api(`/api/workspaces/${id}`, { method: 'PUT', body: JSON.stringify({ name, link_ids }) });
    } else {
      await api('/api/workspaces', { method: 'POST', body: JSON.stringify({ name, link_ids }) });
    }
    closeWorkspaceModal();
    await loadWorkspaces();
    if ($workspaceListModal.classList.contains('show')) renderWorkspaceListModalContent();
  } catch (err) {
    alert('저장 실패: ' + err.message);
  }
});

$('memoPanelClose').addEventListener('click', hideMemoPanel);

document.addEventListener('click', (e) => {
  const panel = $('memoPanel');
  if (!panel || !panel.classList.contains('show')) return;
  if (panel.contains(e.target)) return;
  hideMemoPanel();
});

$('editCategoryBtn').addEventListener('click', openCategoryListModal);
$('editWorkspaceBtn').addEventListener('click', openWorkspaceListModal);

const sidebarEl = document.querySelector('.sidebar');
const sidebarCollapseBtn = $('sidebarCollapseBtn');
if (sidebarEl && sidebarCollapseBtn) {
  const iconEl = sidebarCollapseBtn.querySelector('.sidebar-footer-icon');
  const labelEl = sidebarCollapseBtn.querySelector('.sidebar-footer-label');
  sidebarCollapseBtn.addEventListener('click', () => {
    sidebarEl.classList.toggle('collapsed');
    const isCollapsed = sidebarEl.classList.contains('collapsed');
    if (iconEl) iconEl.textContent = isCollapsed ? '›' : '‹';
    if (labelEl) labelEl.textContent = isCollapsed ? '펼치기' : '접기';
    sidebarCollapseBtn.title = isCollapsed ? '사이드바 펼치기' : '사이드바 접기';
  });
}

$('addCategoryInListBtn').addEventListener('click', () => openCategoryModal());
$('categoryListModalClose').addEventListener('click', closeCategoryListModal);
$('linkModalClose').addEventListener('click', closeLinkModal);
$('linkFormCancel').addEventListener('click', closeLinkModal);
$('categoryModalClose').addEventListener('click', closeCategoryModal);
$('categoryFormCancel').addEventListener('click', closeCategoryModal);
$('addWorkspaceInListBtn').addEventListener('click', () => openWorkspaceModal());
$('workspaceListModalClose').addEventListener('click', closeWorkspaceListModal);
$('workspaceModalClose').addEventListener('click', closeWorkspaceModal);
$('workspaceFormCancel').addEventListener('click', closeWorkspaceModal);
const workspaceSelectAllEl = $('workspaceSelectAll');
if (workspaceSelectAllEl) {
  workspaceSelectAllEl.addEventListener('change', () => {
    const container = $('workspaceLinkCheckboxes');
    container.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.checked = workspaceSelectAllEl.checked;
    });
    workspaceSelectAllEl.indeterminate = false;
  });
}
function openSettingsModal() {
  $('apiBaseInput').value = API_BASE;
  $settingsModal.classList.add('show');
}
function closeSettingsModal() {
  $settingsModal.classList.remove('show');
}

$('settingsBtn').addEventListener('click', openSettingsModal);
$('settingsModalClose').addEventListener('click', closeSettingsModal);
$('settingsFormCancel').addEventListener('click', closeSettingsModal);

$('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  let url = $('apiBaseInput').value.trim();
  if (!url) url = 'http://localhost:3000';
  if (!url.startsWith('http')) url = 'http://' + url;
  try {
    await setApiBaseToStorage(url);
    API_BASE = url.replace(/\/+$/, '');
    closeSettingsModal();
    const ok = await loadCategories();
    if (ok) loadLinks();
    else $currentCategoryTitle.textContent = '전체 링크';
    await loadWorkspaces();
    setViewMode(viewMode);
  } catch (err) {
    alert('저장 실패: ' + err.message);
  }
});

async function init() {
  API_BASE = await getApiBaseFromStorage();
  API_BASE = API_BASE.replace(/\/+$/, '');
  const ok = await loadCategories();
  if (ok) loadLinks();
  else $currentCategoryTitle.textContent = '전체 링크';
  await loadWorkspaces();
  setViewMode(viewMode);
}

init();
