let API_BASE = 'http://localhost:3000';
let authToken = null;
let currentUser = null;
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
const $linkPageView = $('linkPageView');
const $explorerPageView = $('explorerPageView');
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

function getAuthToken() {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['authToken'], (r) => resolve(r.authToken || null));
    } else resolve(localStorage.getItem('authToken'));
  });
}

function setAuthToken(token) {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ authToken: token }, resolve);
    } else { localStorage.setItem('authToken', token); resolve(); }
  });
}

function clearAuthToken() {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.remove(['authToken'], resolve);
    } else { localStorage.removeItem('authToken'); resolve(); }
  });
}

async function api(path, options = {}) {
  try {
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const res = await fetch(API_BASE + path, { headers, ...options });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      authToken = null;
      currentUser = null;
      await clearAuthToken();
      showAuthScreen('login');
      throw new Error(data?.error || '인증이 만료되었습니다. 다시 로그인해 주세요.');
    }
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

function showAuthScreen(tab = 'login') {
  const overlay = $('authOverlay');
  if (overlay) overlay.classList.add('show');
  switchAuthTab(tab);
  const saved = localStorage.getItem('savedUsername');
  if (saved) {
    const el = $('loginUsername');
    const cb = $('rememberUsername');
    if (el) el.value = saved;
    if (cb) cb.checked = true;
  }
  if ($authApiBaseInput) $authApiBaseInput.value = API_BASE;
}

function hideAuthScreen() {
  const overlay = $('authOverlay');
  if (overlay) overlay.classList.remove('show');
}

function switchAuthTab(tab) {
  const loginForm = $('loginForm');
  const signupForm = $('signupForm');
  const loginTab = $('authTabLogin');
  const signupTab = $('authTabSignup');
  if (!loginForm || !signupForm) return;
  if (tab === 'login') {
    loginForm.style.display = '';
    signupForm.style.display = 'none';
    if (loginTab) loginTab.classList.add('active');
    if (signupTab) signupTab.classList.remove('active');
  } else {
    loginForm.style.display = 'none';
    signupForm.style.display = '';
    if (loginTab) loginTab.classList.remove('active');
    if (signupTab) signupTab.classList.add('active');
  }
}

function updateUserDisplay() {
  if (!currentUser) return;
  const nameEl = $('userDisplayName');
  const deptEl = $('userDisplayDept');
  const topNameEl = $('topbarUserName');
  const topDeptEl = $('topbarUserDept');
  const explorerNameEl = $('explorerUserName');
  const explorerDeptEl = $('explorerUserDept');
  const name = currentUser.name || currentUser.username || '-';
  const dept = currentUser.department || '';
  if (nameEl) nameEl.textContent = name;
  if (deptEl) deptEl.textContent = dept;
  if (topNameEl) topNameEl.textContent = name;
  if (topDeptEl) topDeptEl.textContent = dept;
  if (explorerNameEl) explorerNameEl.textContent = name;
  if (explorerDeptEl) explorerDeptEl.textContent = dept;
  updateExplorerAdminControls();
}

async function logout() {
  await clearAuthToken();
  authToken = null;
  currentUser = null;
  categories = [];
  links = [];
  workspaces = [];
  selectedCategoryId = null;
  $categoryList.innerHTML = '';
  $linkList.innerHTML = '';
  $workspaceList.innerHTML = '';
  updateExplorerAdminControls();
  showAuthScreen('login');
}

async function loadAppData() {
  const ok = await loadCategories();
  if (ok) loadLinks();
  else $currentCategoryTitle.textContent = '전체 링크';
  await loadWorkspaces();
  setViewMode(viewMode);
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
    const handleHtml = (canReorderCategories && cat.is_mine !== false)
      ? `<button type="button" class="category-drag-handle" draggable="true" title="드래그하여 순서 변경" aria-label="순서 변경">⋮⋮</button>`
      : '';
    const sharedBadge = cat.is_shared
      ? (cat.is_mine !== false
          ? `<span class="cat-shared-badge cat-shared-badge--mine" title="전체 공유 중">공유중</span>`
          : `<span class="cat-shared-badge" title="${escapeAttr(cat.shared_by_name || '')}님이 전체 공유">${escapeHtml(cat.shared_by_name || '')} 공유</span>`)
      : '';
    li.innerHTML = `${handleHtml}<button type="button" class="cat-btn ${activeClass}" data-id="${cat.id}">${escapeHtml(cat.name)}${sharedBadge}</button>`;
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
    const sharedBadge = cat.is_shared ? '<span class="category-badge-shared">공유</span>' : '';
    const isOther = cat.is_shared && cat.is_mine === false;
    const sharedBy = isOther
      ? `<span class="category-shared-by">${escapeHtml(cat.shared_by_name || '')}님이 전체 공유한 카테고리</span>`
      : '';
    li.innerHTML = `
      <span class="category-edit-name">${escapeHtml(cat.name)}${sharedBadge}${sharedBy}</span>
      <div class="category-edit-actions">
        ${!isOther ? `<button type="button" class="btn btn-sm" data-action="copy" title="주소·사이트명 복사">복사</button>` : ''}
        ${!isOther ? `<button type="button" class="btn btn-sm btn-edit" data-action="edit">수정</button>` : ''}
        ${!isOther ? `<button type="button" class="btn btn-sm btn-danger" data-action="delete">삭제</button>` : ''}
      </div>
    `;
    const copyBtn = li.querySelector('[data-action="copy"]');
    const editBtn = li.querySelector('[data-action="edit"]');
    const deleteBtn = li.querySelector('[data-action="delete"]');
    if (copyBtn) copyBtn.addEventListener('click', () => copyCategoryLinks(cat));
    if (editBtn) editBtn.addEventListener('click', () => openCategoryModal(cat));
    if (deleteBtn) deleteBtn.addEventListener('click', async () => {
      await deleteCategory(cat.id);
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
  const headers = {};
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch(API_BASE + '/api/upload', { method: 'POST', body: form, headers });
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
  $('categoryIsShared').checked = cat ? !!(cat.is_shared) : false;
  $('categorySubmitBtn').textContent = cat ? '수정' : '추가';
  $categoryModal.classList.add('show');
}

function closeCategoryModal() {
  $categoryModal.classList.remove('show');
}

async function deleteCategory(id) {
  const cat = categories.find((c) => c.id === id);
  const catName = cat ? cat.name : '이 카테고리';
  const isSharedOwn = cat && cat.is_shared && cat.is_mine !== false;
  const sharedWarning = isSharedOwn ? '\n⚠️ 공유 카테고리입니다. 다른 사용자에게서도 사라집니다.' : '';
  if (!confirm(`"${catName}" 카테고리를 삭제할까요?\n\n⚠️ 카테고리 안의 링크가 전부 삭제됩니다.${sharedWarning}\n\n이 작업은 되돌릴 수 없습니다.`)) return;
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
  const is_shared = $('categoryIsShared').checked;
  if (!name) return;
  try {
    if (id) {
      await api(`/api/categories/${id}`, { method: 'PUT', body: JSON.stringify({ name, is_shared }) });
      if (selectedCategoryId === +id) $currentCategoryTitle.textContent = name;
    } else {
      await api('/api/categories', { method: 'POST', body: JSON.stringify({ name, is_shared }) });
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

// ── Miller Columns (lazy loading, parent_id 기반) ──────────────
// millerCols: 각 컬럼의 노드 배열
// millerSelected: 각 컬럼에서 선택된 노드
let millerCols = [];
let millerSelected = [];
let explorerMode = 'browse'; // browse | search | recent | favorites
let favoriteNodeIds = new Set();
let rootAccessMap = new Map();

function isAdminUser() {
  return String(currentUser?.username || '').trim().toLowerCase() === 'admin';
}

function updateExplorerAdminControls() {
  const isAdmin = isAdminUser();
  const scanCsvBtn = $('scanCsvBtn');
  const scanDiskBtn = $('scanDiskBtn');
  if (scanCsvBtn) scanCsvBtn.style.display = isAdmin ? '' : 'none';
  if (scanDiskBtn) scanDiskBtn.style.display = isAdmin ? '' : 'none';
}

function formatFileSize(bytes) {
  if (bytes == null || bytes === '') return '-';
  const n = Number(bytes);
  if (!Number.isFinite(n)) return '-';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
  return (n / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

function formatFileDate(d) {
  if (!d) return '-';
  try {
    const date = new Date(d);
    return isNaN(date.getTime()) ? '-' : date.toLocaleString('ko-KR');
  } catch { return '-'; }
}

async function copyText(text) {
  if (!text) throw new Error('복사할 텍스트가 없습니다.');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

async function refreshFavoriteIds() {
  try {
    const rows = await api('/api/files/favorites');
    favoriteNodeIds = new Set(rows.map((r) => Number(r.id)).filter(Number.isFinite));
  } catch (_) {
    favoriteNodeIds = new Set();
  }
}

async function refreshRootAccessMap() {
  if (!isAdminUser()) {
    rootAccessMap = new Map();
    return;
  }
  try {
    const rows = await api('/api/files/root-access');
    rootAccessMap = new Map(rows.map((r) => [Number(r.id), r]));
  } catch (e) {
    console.error('[Explorer Access] fetch failed', e);
    rootAccessMap = new Map();
  }
}

function getRootAccessInfo(node) {
  if (!node || !node.is_folder || node.parent_id !== null) return null;
  return rootAccessMap.get(Number(node.id)) || {
    id: node.id,
    access_scope: 'all',
    access_departments: [],
  };
}

function attachNodeActions(node, row) {
  const copyBtn = row.querySelector('[data-action="copy-path"]');
  const favBtn = row.querySelector('[data-action="toggle-favorite"]');
  if (copyBtn) {
    copyBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await copyText(node.full_path || node.name || '');
        copyBtn.textContent = '복사됨';
        setTimeout(() => { copyBtn.textContent = '경로복사'; }, 900);
      } catch (err) {
        alert('복사 실패: ' + (err.message || ''));
      }
    });
  }
  if (favBtn) {
    favBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const isFav = favoriteNodeIds.has(Number(node.id));
      try {
        if (isFav) {
          await api(`/api/files/favorites/${node.id}`, { method: 'DELETE' });
          favoriteNodeIds.delete(Number(node.id));
        } else {
          await api('/api/files/favorites', {
            method: 'POST',
            body: JSON.stringify({ node_id: node.id }),
          });
          favoriteNodeIds.add(Number(node.id));
        }
        renderMillerColumns();
      } catch (err) {
        alert('즐겨찾기 처리 실패: ' + (err.message || ''));
      }
    });
  }
}

function attachRootAccessActions(node, row) {
  const saveBtn = row.querySelector('[data-action="save-root-access"]');
  const scopeSel = row.querySelector('[data-role="root-access-scope"]');
  const deptInput = row.querySelector('[data-role="root-access-dept"]');
  const deptWrap = row.querySelector('[data-role="root-access-dept-wrap"]');
  const stateText = row.querySelector('[data-role="root-access-state"]');
  if (!saveBtn || !scopeSel || !deptInput || !deptWrap || !stateText) return;

  const syncDeptVisibility = () => {
    const isDept = scopeSel.value === 'department';
    deptWrap.style.display = isDept ? '' : 'none';
  };
  scopeSel.addEventListener('change', syncDeptVisibility);
  syncDeptVisibility();

  saveBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const scope = scopeSel.value;
    const departments = deptInput.value
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
    if (scope === 'department' && departments.length === 0) {
      alert('부서 제한을 선택하면 부서명을 1개 이상 입력해야 합니다.');
      return;
    }
    saveBtn.disabled = true;
    stateText.textContent = '저장 중...';
    try {
      await api(`/api/files/root-access/${node.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          access_scope: scope,
          access_departments: scope === 'department' ? departments : [],
        }),
      });
      await refreshRootAccessMap();
      stateText.textContent = '저장 완료';
      stateText.classList.add('ok');
      setTimeout(() => {
        stateText.textContent = '';
        stateText.classList.remove('ok');
      }, 1200);
    } catch (err) {
      stateText.textContent = '저장 실패';
      stateText.classList.remove('ok');
      alert('권한 저장 실패: ' + (err.message || ''));
    } finally {
      saveBtn.disabled = false;
    }
  });
}

function renderMillerColumns() {
  const container = $('millerColumns');
  const previewEmpty = $('explorerPreviewEmpty');
  const previewContent = $('explorerPreviewContent');
  if (!container) return;
  container.innerHTML = '';

  millerCols.forEach((nodes, colIdx) => {
    const col = document.createElement('div');
    col.className = 'miller-column';

    const header = document.createElement('div');
    header.className = 'miller-column-header';
    header.textContent = colIdx === 0 ? 'Z:\\' : (millerSelected[colIdx - 1]?.name || '');
    col.appendChild(header);

    const list = document.createElement('div');
    list.className = 'miller-column-list';

    if (nodes.length === 0) {
      list.innerHTML = '<div class="miller-empty">비어 있음</div>';
    }

    nodes.forEach((node) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'miller-column-item';
      const icon = node.is_folder ? '📁' : '📄';
      const isFav = favoriteNodeIds.has(Number(node.id));
      const isRoot = node.parent_id === null;
      const canAccess = node.can_access === undefined ? true : !!Number(node.can_access);
      const accessScope = node.access_scope || 'all';
      const accessBadge = isRoot
        ? (accessScope === 'department'
            ? `부서:${escapeHtml(node.access_department || '-')}`
            : '전체')
        : '';
      if (millerSelected[colIdx]?.id === node.id) btn.classList.add('active');
      if (isRoot && !canAccess) btn.classList.add('disabled');
      btn.innerHTML = `
        <span class="miller-column-item-icon">${icon}</span>
        <span class="miller-column-item-main">
          <span class="miller-column-item-name">${escapeHtml(node.name)}</span>
          ${isRoot ? `<span class="miller-column-item-badge">${accessBadge}</span>` : ''}
        </span>
        <span class="miller-column-item-fav">${isFav ? '★' : ''}</span>
      `;
      btn.addEventListener('click', () => {
        if (isRoot && !canAccess) {
          alert('이 폴더는 현재 계정/부서 권한으로 접근할 수 없습니다.');
          return;
        }
        onMillerNodeClick(node, colIdx);
      });
      list.appendChild(btn);
    });

    col.appendChild(list);
    container.appendChild(col);
  });

  // 선택된 파일 미리보기
  const lastSelected = millerSelected[millerSelected.length - 1];
  if (lastSelected && !lastSelected.is_folder) {
    const isFav = favoriteNodeIds.has(Number(lastSelected.id));
    previewEmpty.style.display = 'none';
    previewContent.style.display = '';
    const loginName = currentUser?.name || currentUser?.username || '-';
    const loginDept = currentUser?.department || '(부서 미지정)';
    previewContent.innerHTML = `
      <div class="explorer-login-user">접속 사용자: ${escapeHtml(loginName)} / ${escapeHtml(loginDept)}</div>
      <div class="preview-filename">${escapeHtml(lastSelected.name)}</div>
      <div class="explorer-preview-actions">
        <button type="button" class="btn btn-sm" data-action="copy-path">경로복사</button>
        <button type="button" class="btn btn-sm" data-action="toggle-favorite">${isFav ? '즐겨찾기해제' : '즐겨찾기추가'}</button>
      </div>
      <div class="meta-row"><span class="meta-label">경로</span><span class="meta-value">${escapeHtml(lastSelected.full_path || '')}</span></div>
      <div class="meta-row"><span class="meta-label">크기</span><span class="meta-value">${formatFileSize(lastSelected.size)}</span></div>
      <div class="meta-row"><span class="meta-label">수정일</span><span class="meta-value">${formatFileDate(lastSelected.modified)}</span></div>
    `;
    attachNodeActions(lastSelected, previewContent);
  } else if (lastSelected && lastSelected.is_folder) {
    const access = getRootAccessInfo(lastSelected);
    const isRootFolder = lastSelected.parent_id === null;
    const accessHtml = access && isAdminUser()
      ? `
        <div class="explorer-access-box">
          <div class="explorer-access-title">접근 권한 (루트 폴더)</div>
          <div class="explorer-access-row">
            <label>공개 범위</label>
            <select data-role="root-access-scope">
              <option value="all" ${access.access_scope !== 'department' ? 'selected' : ''}>전체 공유</option>
              <option value="department" ${access.access_scope === 'department' ? 'selected' : ''}>부서 제한</option>
            </select>
          </div>
          <div class="explorer-access-row" data-role="root-access-dept-wrap" style="${access.access_scope === 'department' ? '' : 'display:none'}">
            <label>허용 부서명 (쉼표로 여러 개 입력)</label>
            <input type="text" data-role="root-access-dept" value="${escapeAttr((access.access_departments || []).join(', '))}" placeholder="예: 교육부, 전략기획부" />
          </div>
          <div class="explorer-access-actions">
            <button type="button" class="btn btn-sm btn-primary" data-action="save-root-access">권한 저장</button>
            <span class="explorer-access-state" data-role="root-access-state"></span>
          </div>
        </div>
      `
      : '';
    previewEmpty.style.display = 'none';
    previewContent.style.display = '';
    const loginName = currentUser?.name || currentUser?.username || '-';
    const loginDept = currentUser?.department || '(부서 미지정)';
    previewContent.innerHTML = `
      <div class="explorer-login-user">접속 사용자: ${escapeHtml(loginName)} / ${escapeHtml(loginDept)}</div>
      <div class="preview-filename">${escapeHtml(lastSelected.name)}</div>
      <div class="meta-row"><span class="meta-label">종류</span><span class="meta-value">${isRootFolder ? '루트 폴더' : '폴더'}</span></div>
      <div class="meta-row"><span class="meta-label">경로</span><span class="meta-value">${escapeHtml(lastSelected.full_path || '')}</span></div>
      ${accessHtml}
    `;
    if (accessHtml) attachRootAccessActions(lastSelected, previewContent);
  } else if (millerSelected.length === 0) {
    previewEmpty.style.display = '';
    previewContent.style.display = 'none';
    previewContent.innerHTML = '';
  }

  // 마지막 컬럼으로 스크롤
  setTimeout(() => { if (container.lastChild) container.lastChild.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'end' }); }, 50);
}

async function loadExplorerSearch() {
  const input = $('explorerSearchInput');
  const q = input ? input.value.trim() : '';
  if (q.length < 2) {
    alert('검색어를 2글자 이상 입력해 주세요.');
    return;
  }
  const prevCols = millerCols.map((col) => [...col]);
  const prevSelected = [...millerSelected];
  explorerMode = 'search';
  const container = $('millerColumns');
  if (container) container.innerHTML = '<div class="miller-loading">검색 중…</div>';
  try {
    console.log('[Explorer Search] start', { query: q, apiBase: API_BASE });
    const rows = await api(`/api/files/search?q=${encodeURIComponent(q)}&limit=200`);
    console.log('[Explorer Search] success', { query: q, resultCount: rows.length });
    millerCols = [rows];
    millerSelected = [];
    renderMillerColumns();
  } catch (e) {
    console.error('[Explorer Search] failed', {
      query: q,
      message: e?.message,
      stack: e?.stack,
    });
    // 실패해도 탐색 화면 상태를 유지한다.
    millerCols = prevCols;
    millerSelected = prevSelected;
    renderMillerColumns();
    alert('검색 실패: ' + (e?.message || '서버 응답을 확인해 주세요.'));
  }
}

async function loadExplorerRecent() {
  explorerMode = 'recent';
  const container = $('millerColumns');
  if (container) container.innerHTML = '<div class="miller-loading">최근 파일 불러오는 중…</div>';
  try {
    const rows = await api('/api/files/recent?limit=100');
    millerCols = [rows];
    millerSelected = [];
    renderMillerColumns();
  } catch (e) {
    if (container) container.innerHTML = '<div class="explorer-error">최근 파일 조회 실패</div>';
  }
}

async function loadExplorerFavorites() {
  explorerMode = 'favorites';
  const container = $('millerColumns');
  if (container) container.innerHTML = '<div class="miller-loading">즐겨찾기 불러오는 중…</div>';
  try {
    const rows = await api('/api/files/favorites');
    favoriteNodeIds = new Set(rows.map((r) => Number(r.id)).filter(Number.isFinite));
    millerCols = [rows];
    millerSelected = [];
    renderMillerColumns();
  } catch (e) {
    if (container) container.innerHTML = '<div class="explorer-error">즐겨찾기 조회 실패</div>';
  }
}

async function onMillerNodeClick(node, colIdx) {
  // 해당 컬럼 이후 컬럼 제거
  const prevCols = millerCols.map((col) => [...col]);
  const prevSelected = [...millerSelected];
  millerCols = millerCols.slice(0, colIdx + 1);
  millerSelected = millerSelected.slice(0, colIdx);
  millerSelected[colIdx] = node;

  if (node.is_folder) {
    // 자식 로드
    try {
      console.log('[Explorer Browse] load children', { nodeId: node.id, path: node.full_path });
      const children = await api(`/api/files/nodes?parent_id=${node.id}`);
      console.log('[Explorer Browse] children loaded', { nodeId: node.id, count: children.length });
      millerCols.push(children);
    } catch (e) {
      console.error('[Explorer Browse] children load failed', {
        nodeId: node.id,
        path: node.full_path,
        message: e?.message,
      });
      millerCols = prevCols;
      millerSelected = prevSelected;
      alert('폴더 열기 실패: ' + (e?.message || ''));
    }
  }
  if (!node.is_folder) {
    api(`/api/files/recent/${node.id}`, { method: 'POST' }).catch((e) => {
      console.warn('[Explorer Recent] track failed', e?.message || e);
    });
  }
  renderMillerColumns();
}

async function loadExplorerRoot() {
  const container = $('millerColumns');
  if (container) container.innerHTML = '<div class="miller-loading">로딩 중…</div>';
  try {
    const roots = await api('/api/files/nodes');
    await refreshFavoriteIds();
    await refreshRootAccessMap();
    millerCols = [roots];
    millerSelected = [];
    renderMillerColumns();
    await loadScanStatus();
  } catch (e) {
    if (container) container.innerHTML = '<div class="explorer-error">데이터가 없습니다. CSV 임포트 또는 디스크 스캔을 실행하세요.</div>';
  }
}

async function loadScanStatus() {
  try {
    const status = await api('/api/files/scan-status');
    const el = $('explorerScanStatus');
    if (!el) return;
    if (status.total > 0) {
      const lastTime = status.last?.time ? new Date(status.last.time).toLocaleDateString('ko-KR') : '-';
      el.textContent = `${status.total.toLocaleString()}개 항목 · 마지막 스캔: ${lastTime}`;
    } else {
      el.textContent = '데이터 없음 — 스캔 필요';
    }
  } catch (_) {}
}

function showExplorerPage() {
  hideMemoPanel();
  const sidebarEl = document.querySelector('.sidebar');
  if (sidebarEl) sidebarEl.classList.add('sidebar--hidden');
  if ($linkPageView) $linkPageView.classList.add('page-view--hidden');
  if ($explorerPageView) $explorerPageView.classList.remove('page-view--hidden');
  explorerMode = 'browse';
  loadExplorerRoot();
}
function showLinkPage() {
  const sidebarEl = document.querySelector('.sidebar');
  if (sidebarEl) sidebarEl.classList.remove('sidebar--hidden');
  if ($linkPageView) $linkPageView.classList.remove('page-view--hidden');
  if ($explorerPageView) $explorerPageView.classList.add('page-view--hidden');
}

$('explorerBtn').addEventListener('click', showExplorerPage);
$('backToLinksBtn').addEventListener('click', showLinkPage);
const $explorerBrowseBtn = $('explorerBrowseBtn');
if ($explorerBrowseBtn) {
  $explorerBrowseBtn.addEventListener('click', () => {
    explorerMode = 'browse';
    const input = $('explorerSearchInput');
    if (input) input.value = '';
    loadExplorerRoot();
  });
}
const $explorerSearchBtn = $('explorerSearchBtn');
if ($explorerSearchBtn) $explorerSearchBtn.addEventListener('click', loadExplorerSearch);
const $explorerSearchInput = $('explorerSearchInput');
if ($explorerSearchInput) {
  $explorerSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      loadExplorerSearch();
    }
  });
}
const $explorerRecentBtn = $('explorerRecentBtn');
if ($explorerRecentBtn) $explorerRecentBtn.addEventListener('click', loadExplorerRecent);
const $explorerFavoritesBtn = $('explorerFavoritesBtn');
if ($explorerFavoritesBtn) $explorerFavoritesBtn.addEventListener('click', loadExplorerFavorites);

// CSV 임포트 버튼
const $scanCsvBtn = $('scanCsvBtn');
if ($scanCsvBtn) {
  $scanCsvBtn.addEventListener('click', async () => {
    $scanCsvBtn.disabled = true;
    $scanCsvBtn.textContent = '임포트 중…';
    const el = $('explorerScanStatus');
    if (el) el.textContent = 'CSV 임포트 중… (잠시 후 새로고침하세요)';
    try {
      await api('/api/files/scan/csv', { method: 'POST' });
      setTimeout(() => { loadExplorerRoot(); $scanCsvBtn.disabled = false; $scanCsvBtn.textContent = 'CSV 임포트'; }, 8000);
    } catch (e) {
      alert('임포트 실패: ' + e.message);
      $scanCsvBtn.disabled = false;
      $scanCsvBtn.textContent = 'CSV 임포트';
    }
  });
}

// 디스크 직접 스캔 버튼
const $scanDiskBtn = $('scanDiskBtn');
if ($scanDiskBtn) {
  $scanDiskBtn.addEventListener('click', async () => {
    if (!confirm('Z:\\ 드라이브를 직접 스캔합니다. 시간이 걸릴 수 있습니다.')) return;
    $scanDiskBtn.disabled = true;
    $scanDiskBtn.textContent = '스캔 중…';
    const el = $('explorerScanStatus');
    if (el) el.textContent = 'Z:\\ 스캔 중… (완료 후 자동 새로고침)';
    try {
      await api('/api/files/scan/disk', { method: 'POST' });
      setTimeout(() => { loadExplorerRoot(); $scanDiskBtn.disabled = false; $scanDiskBtn.textContent = '디스크 스캔'; }, 15000);
    } catch (e) {
      alert('스캔 실패: ' + e.message);
      $scanDiskBtn.disabled = false;
      $scanDiskBtn.textContent = '디스크 스캔';
    }
  });
}
updateExplorerAdminControls();

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
  authToken = await getAuthToken();
  if (authToken) {
    try {
      const me = await fetch(API_BASE + '/api/auth/me', {
        headers: { 'Authorization': `Bearer ${authToken}` },
      }).then((r) => r.ok ? r.json() : Promise.reject());
      currentUser = me;
      updateUserDisplay();
      hideAuthScreen();
      await loadAppData();
    } catch (e) {
      authToken = null;
      currentUser = null;
      await clearAuthToken();
      showAuthScreen('login');
    }
  } else {
    showAuthScreen('login');
  }
}

// ----- 로그인 폼 -----
const $loginForm = $('loginForm');
if ($loginForm) {
  $loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = $('loginUsername').value.trim();
    const password = $('loginPassword').value;
    const remember = $('rememberUsername').checked;
    const errEl = $('loginError');
    errEl.textContent = '';
    try {
      const res = await fetch(API_BASE + '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '로그인 실패');
      authToken = data.token;
      currentUser = data.user;
      await setAuthToken(authToken);
      if (remember) localStorage.setItem('savedUsername', username);
      else localStorage.removeItem('savedUsername');
      updateUserDisplay();
      hideAuthScreen();
      await loadAppData();
    } catch (err) {
      errEl.textContent = err.message;
    }
  });
}

// ----- 회원가입 폼 -----
const $signupForm = $('signupForm');
if ($signupForm) {
  $signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = $('signupUsername').value.trim();
    const password = $('signupPassword').value;
    const name = $('signupName').value.trim();
    const department = $('signupDepartment').value.trim();
    const errEl = $('signupError');
    errEl.textContent = '';
    try {
      const res = await fetch(API_BASE + '/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, name, department }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '회원가입 실패');
      authToken = data.token;
      currentUser = data.user;
      await setAuthToken(authToken);
      updateUserDisplay();
      hideAuthScreen();
      await loadAppData();
    } catch (err) {
      errEl.textContent = err.message;
    }
  });
}

// ----- 인증 탭 전환 -----
const $authTabLogin = $('authTabLogin');
const $authTabSignup = $('authTabSignup');
if ($authTabLogin) $authTabLogin.addEventListener('click', () => switchAuthTab('login'));
if ($authTabSignup) $authTabSignup.addEventListener('click', () => switchAuthTab('signup'));

// ----- 인증 화면 서버 주소 설정 -----
const $authServerToggle = $('authServerToggle');
const $authServerWrap = $('authServerWrap');
const $authApiBaseInput = $('authApiBaseInput');
const $authApiBaseSave = $('authApiBaseSave');
if ($authServerToggle && $authServerWrap) {
  $authServerToggle.addEventListener('click', () => {
    const visible = $authServerWrap.style.display !== 'none';
    $authServerWrap.style.display = visible ? 'none' : '';
    if (!visible && $authApiBaseInput) $authApiBaseInput.value = API_BASE;
  });
}
if ($authApiBaseSave && $authApiBaseInput) {
  $authApiBaseSave.addEventListener('click', async () => {
    let url = $authApiBaseInput.value.trim();
    if (!url) return;
    if (!url.startsWith('http')) url = 'http://' + url;
    API_BASE = url.replace(/\/+$/, '');
    await setApiBaseToStorage(API_BASE);
    if ($authServerWrap) $authServerWrap.style.display = 'none';
    const errEl = $('loginError');
    if (errEl) errEl.textContent = `서버 주소 저장됨: ${API_BASE}`;
  });
}

// ----- 로그아웃 -----
const $logoutBtn = $('logoutBtn');
if ($logoutBtn) $logoutBtn.addEventListener('click', logout);

// ----- 내 정보 수정 -----
function openProfileModal() {
  if (!currentUser) return;
  $('profileUsername').value = currentUser.username || '';
  $('profileName').value = currentUser.name || '';
  const deptSel = $('profileDepartment');
  if (deptSel) deptSel.value = currentUser.department || '';
  $('profileCurrentPassword').value = '';
  $('profileNewPassword').value = '';
  $('profileError').textContent = '';
  $('profileSuccess').textContent = '';
  $('profileModal').classList.add('show');
}
function closeProfileModal() {
  $('profileModal').classList.remove('show');
}

const $profileBtn = $('profileBtn');
if ($profileBtn) $profileBtn.addEventListener('click', openProfileModal);

$('profileModalClose').addEventListener('click', closeProfileModal);
$('profileFormCancel').addEventListener('click', closeProfileModal);

$('profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('profileName').value.trim();
  const department = $('profileDepartment').value.trim();
  const currentPassword = $('profileCurrentPassword').value;
  const newPassword = $('profileNewPassword').value;
  const errEl = $('profileError');
  const okEl = $('profileSuccess');
  errEl.textContent = '';
  okEl.textContent = '';
  try {
    const payload = { name, department };
    if (newPassword) {
      payload.currentPassword = currentPassword;
      payload.newPassword = newPassword;
    }
    const updated = await api('/api/auth/me', { method: 'PUT', body: JSON.stringify(payload) });
    currentUser = { ...currentUser, ...updated };
    updateUserDisplay();
    okEl.textContent = '저장되었습니다.';
    $('profileCurrentPassword').value = '';
    $('profileNewPassword').value = '';
    setTimeout(closeProfileModal, 1200);
  } catch (err) {
    errEl.textContent = err.message;
  }
});

init();
