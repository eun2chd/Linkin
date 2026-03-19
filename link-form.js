const API_BASE = 'http://localhost:3000';
const params = new URLSearchParams(window.location.search);
const editId = params.get('id');
const preselectCategoryId = params.get('category_id');

const $ = (id) => document.getElementById(id);

async function api(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = res.ok ? await res.json().catch(() => ({})) : null;
  if (!res.ok) throw new Error(data?.error || res.statusText);
  return data;
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s ?? '';
  return div.innerHTML;
}
function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
function logoFullUrl(url) {
  if (!url) return '';
  return url.startsWith('http') ? url : API_BASE + (url.startsWith('/') ? url : '/' + url);
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
  const fullUrl = data.url.startsWith('http') ? data.url : API_BASE + data.url;
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

async function init() {
  $('pageTitle').textContent = editId ? '링크 수정' : '링크 추가';

  const categories = await api('/api/categories');
  const sel = $('linkCategory');
  sel.innerHTML = categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');

  if (preselectCategoryId) sel.value = preselectCategoryId;

  if (editId) {
    const allLinks = await api('/api/links');
    const link = allLinks.find((l) => String(l.id) === String(editId));
    if (link) {
      $('linkId').value = link.id;
      $('linkUrl').value = link.url || '';
      $('siteName').value = link.site_name || '';
      $('siteImage').value = logoFullUrl(link.site_image) || '';
      $('linkDescription').value = link.description || '';
      sel.value = link.category_id;
      updateLogoPreview($('siteImage').value.trim());
    }
  }

  const dropZone = $('logoDropZone');
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('logo-drop-over');
  });
  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('logo-drop-over');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('logo-drop-over');
    const file = e.dataTransfer.files[0];
    handleLogoFile(file);
  });

  $('logoClearBtn').addEventListener('click', () => {
    $('siteImage').value = '';
    updateLogoPreview('');
    const hint = $('logoDropHint');
    if (hint) hint.style.display = '';
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
    };
    try {
      if (id) {
        await api(`/api/links/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await api('/api/links', { method: 'POST', body: JSON.stringify(payload) });
      }
      $('linkForm').style.display = 'none';
      $('successMsg').style.display = 'block';
    } catch (err) {
      alert('저장 실패: ' + err.message);
    }
  });

  $('cancelBtn').addEventListener('click', () => window.close());
  $('backLink').addEventListener('click', (e) => {
    e.preventDefault();
    window.close();
  });
}

init().catch((err) => {
  alert('로드 실패: ' + err.message + '\n서버(localhost:3000)가 켜져 있는지 확인하세요.');
});
