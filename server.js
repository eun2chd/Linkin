const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const { pool, query, initDb } = require('./db');

const app = express();
const PORT = 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const m = file.mimetype.match(/\/(jpeg|jpg|png|gif|webp|svg\+xml)/);
    const ext = m ? (m[1] === 'svg+xml' ? 'svg' : m[1]) : 'png';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR));

// ----- 메타 크롤링 (og:image, og:title, og:description) -----
function getMetaFromHtml(html, baseUrl) {
  const result = { site_name: null, site_image: null, description: null };
  const base = new URL(baseUrl);
  const getAbs = (u) => {
    if (!u) return null;
    u = u.trim();
    if (/^https?:\/\//i.test(u)) return u;
    try {
      return new URL(u, base).href;
    } catch {
      return null;
    }
  };
  const reMeta = (property) =>
    new RegExp(
      `<meta[^>]*content=["']([^"']+)["'][^>]*(?:property=["']${property}["']|name=["']${property}["'])` +
        `|(?:property=["']${property}["']|name=["']${property}["'])[^>]*content=["']([^"']+)["']`,
      'i'
    );
  const mImage = html.match(reMeta('og:image'));
  if (mImage) result.site_image = getAbs(mImage[1] || mImage[2]);
  const mTitle = html.match(reMeta('og:title'));
  if (mTitle) result.site_name = (mTitle[1] || mTitle[2] || '').trim().replace(/<[^>]+>/g, '') || null;
  if (!result.site_name) {
    const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (t) result.site_name = t[1].trim().replace(/<[^>]+>/g, '').slice(0, 200) || null;
  }
  const mDesc = html.match(reMeta('og:description'));
  if (mDesc) result.description = (mDesc[1] || mDesc[2] || '').trim().replace(/<[^>]+>/g, '').slice(0, 500) || null;
  return result;
}

app.get('/api/fetch-meta', async (req, res) => {
  try {
    const rawUrl = req.query.url;
    if (!rawUrl || typeof rawUrl !== 'string') {
      return res.status(400).json({ error: 'url 쿼리가 필요합니다.' });
    }
    const url = new URL(rawUrl.trim());
    if (!['http:', 'https:'].includes(url.protocol)) {
      return res.status(400).json({ error: 'http 또는 https URL만 가능합니다.' });
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url.href, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Link_in/1.0)' },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!response.ok) {
      return res.status(400).json({ error: '페이지를 가져올 수 없습니다. (' + response.status + ')' });
    }
    const html = await response.text();
    const meta = getMetaFromHtml(html, url.href);
    res.json(meta);
  } catch (e) {
    if (e.name === 'AbortError') return res.status(408).json({ error: '요청 시간이 초과되었습니다.' });
    if (e.code === 'ENOTFOUND') return res.status(400).json({ error: '사이트에 연결할 수 없습니다.' });
    console.error('GET /api/fetch-meta', e);
    res.status(500).json({ error: e.message || '메타 정보를 가져오지 못했습니다.' });
  }
});

// ----- 로고 업로드 -----
app.post('/api/upload', (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: '파일이 너무 큽니다. (최대 10MB)' });
      console.error('POST /api/upload', err);
      return res.status(500).json({ error: err.message || '업로드 실패' });
    }
    next();
  });
}, (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '이미지 파일이 없습니다.' });
    const url = `/uploads/${req.file.filename}`;
    res.json({ url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ----- 카테고리 API -----
app.get('/api/categories', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM categories ORDER BY sort_order, id');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** body: { items: [{ id: number, sort_order: number }, ...] } */
app.patch('/api/categories/reorder', async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items 배열이 필요합니다.' });
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const row of items) {
        const id = Number(row.id);
        const sortOrder = Number(row.sort_order);
        if (!Number.isFinite(id) || !Number.isFinite(sortOrder)) continue;
        await conn.execute('UPDATE categories SET sort_order = ? WHERE id = ?', [sortOrder, id]);
      }
      await conn.commit();
      res.json({ ok: true });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error('PATCH /api/categories/reorder', e);
    res.status(500).json({ error: e.message || '순서 저장 중 오류가 났습니다.' });
  }
});

app.post('/api/categories', async (req, res) => {
  try {
    const { name, sort_order = 0 } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: '카테고리 이름이 필요합니다.' });
    }
    const r = await query('INSERT INTO categories (name, sort_order) VALUES (?, ?)', [name.trim(), sort_order]);
    const id = r && r.insertId != null ? r.insertId : r;
    res.status(201).json({ id, name: name.trim(), sort_order });
  } catch (e) {
    console.error('POST /api/categories', e);
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/categories/:id', async (req, res) => {
  try {
    const { name, sort_order } = req.body;
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'id가 필요합니다.' });
    const nameVal = typeof name === 'string' ? name.trim() : null;
    const orderVal = typeof sort_order === 'number' ? sort_order : null;
    await query(
      'UPDATE categories SET name = COALESCE(?, name), sort_order = COALESCE(?, sort_order) WHERE id = ?',
      [nameVal, orderVal, id]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /api/categories', e);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/categories/:id', async (req, res) => {
  try {
    await query('DELETE FROM categories WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ----- 링크 API -----
app.get('/api/links', async (req, res) => {
  try {
    const categoryId = req.query.category_id;
    let sql = 'SELECT l.*, c.name AS category_name FROM links l JOIN categories c ON l.category_id = c.id';
    const params = [];
    if (categoryId) {
      sql += ' WHERE l.category_id = ?';
      params.push(categoryId);
    }
    sql += ' ORDER BY l.sort_order, l.id';
    const rows = await query(sql, params);
    res.json(rows);
  } catch (e) {
    console.error('GET /api/links', e);
    res.status(500).json({ error: e.message });
  }
});

/** body: { items: [{ id: number, sort_order: number }, ...] } */
app.patch('/api/links/reorder', async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items 배열이 필요합니다.' });
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const row of items) {
        const id = Number(row.id);
        const sortOrder = Number(row.sort_order);
        if (!Number.isFinite(id) || !Number.isFinite(sortOrder)) continue;
        await conn.execute('UPDATE links SET sort_order = ? WHERE id = ?', [sortOrder, id]);
      }
      await conn.commit();
      res.json({ ok: true });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error('PATCH /api/links/reorder', e);
    res.status(500).json({ error: e.message || '순서 저장 중 오류가 났습니다.' });
  }
});

app.get('/api/links/:id', async (req, res) => {
  try {
    const rows = await query(
      'SELECT l.*, c.name AS category_name FROM links l JOIN categories c ON l.category_id = c.id WHERE l.id = ?',
      [req.params.id]
    );
    if (!rows || rows.length === 0) return res.status(404).json({ error: '링크를 찾을 수 없습니다.' });
    res.json(rows[0]);
  } catch (e) {
    console.error('GET /api/links/:id', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/links', async (req, res) => {
  try {
    const { category_id, url, site_name, site_image, description, note, sort_order = 0 } = req.body;
    const urlTrim = url && String(url).trim();
    if (!urlTrim) return res.status(400).json({ error: 'URL을 입력해 주세요.' });
    const existing = await query('SELECT id FROM links WHERE url = ?', [urlTrim]);
    if (existing && existing.length > 0) {
      return res.status(409).json({ error: '이미 같은 주소의 링크가 저장되어 있습니다.' });
    }
    const logo = site_image && String(site_image).trim() ? String(site_image).trim() : null;
    const noteVal = note && String(note).trim() ? String(note).trim() : null;
    const r = await query(
      'INSERT INTO links (category_id, url, site_name, site_image, description, note, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [category_id, urlTrim, site_name, logo, description || null, noteVal, sort_order]
    );
    const id = r && r.insertId != null ? r.insertId : r;
    res.status(201).json({
      id,
      category_id,
      url: urlTrim,
      site_name,
      site_image: logo,
      description: description || null,
      note: noteVal,
      sort_order,
    });
  } catch (e) {
    console.error('POST /api/links', e);
    res.status(500).json({ error: e.message || '저장 중 오류가 났습니다.' });
  }
});

app.put('/api/links/:id', async (req, res) => {
  try {
    const { category_id, url, site_name, site_image, description, note, sort_order } = req.body;
    const id = req.params.id;
    const urlToSave = url !== undefined && url !== null ? String(url).trim() : undefined;
    if (urlToSave !== undefined) {
      const existing = await query('SELECT id FROM links WHERE url = ? AND id != ?', [urlToSave, id]);
      if (existing && existing.length > 0) {
        return res.status(409).json({ error: '이미 같은 주소의 링크가 저장되어 있습니다.' });
      }
    }
    const logo = site_image === undefined || site_image === null ? null : (String(site_image).trim() || null);
    const noteVal = note !== undefined && note !== null ? (String(note).trim() || null) : undefined;
    const v = (x) => (x === undefined ? null : x);
    const [result] = await pool.execute(
      `UPDATE links SET
        category_id = COALESCE(?, category_id),
        url = COALESCE(?, url),
        site_name = COALESCE(?, site_name),
        site_image = ?,
        description = ?,
        note = COALESCE(?, note),
        sort_order = COALESCE(?, sort_order)
      WHERE id = ?`,
      [v(category_id), v(urlToSave), v(site_name), logo, v(description), noteVal === undefined ? null : noteVal, v(sort_order), id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '해당 링크가 없거나 이미 삭제되었습니다.' });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /api/links/:id', e);
    res.status(500).json({ error: e.message || '수정 중 오류가 났습니다.' });
  }
});

app.delete('/api/links/:id', async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM links WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '해당 링크가 없거나 이미 삭제되었습니다.' });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/links/:id', e);
    res.status(500).json({ error: e.message });
  }
});

// ----- 작업 그룹(워크스페이스) API -----
app.get('/api/workspaces', async (req, res) => {
  try {
    const rows = await query(
      'SELECT id, name, sort_order FROM workspaces ORDER BY sort_order, id'
    );
    const withLinks = await Promise.all(
      rows.map(async (w) => {
        const linkRows = await query(
          `SELECT l.id, l.url, l.site_name, l.site_image, l.description
           FROM workspace_links wl
           JOIN links l ON l.id = wl.link_id
           WHERE wl.workspace_id = ?
           ORDER BY wl.sort_order, wl.link_id`,
          [w.id]
        );
        return { ...w, links: linkRows };
      })
    );
    res.json(withLinks);
  } catch (e) {
    console.error('GET /api/workspaces', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/workspaces', async (req, res) => {
  try {
    const { name, link_ids = [], sort_order = 0 } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: '그룹 이름을 입력해 주세요.' });
    }
    const [r] = await pool.execute(
      'INSERT INTO workspaces (name, sort_order) VALUES (?, ?)',
      [name.trim(), sort_order]
    );
    const workspaceId = r.insertId;
    if (link_ids && link_ids.length > 0) {
      for (let i = 0; i < link_ids.length; i++) {
        await pool.execute(
          'INSERT INTO workspace_links (workspace_id, link_id, sort_order) VALUES (?, ?, ?)',
          [workspaceId, link_ids[i], i]
        );
      }
    }
    res.status(201).json({ id: workspaceId, name: name.trim(), sort_order, links: [] });
  } catch (e) {
    console.error('POST /api/workspaces', e);
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/workspaces/:id', async (req, res) => {
  try {
    const { name, link_ids } = req.body;
    const id = req.params.id;
    if (name !== undefined && name !== null && String(name).trim()) {
      await query('UPDATE workspaces SET name = ? WHERE id = ?', [String(name).trim(), id]);
    }
    if (link_ids && Array.isArray(link_ids)) {
      await query('DELETE FROM workspace_links WHERE workspace_id = ?', [id]);
      for (let i = 0; i < link_ids.length; i++) {
        await pool.execute(
          'INSERT INTO workspace_links (workspace_id, link_id, sort_order) VALUES (?, ?, ?)',
          [id, link_ids[i], i]
        );
      }
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /api/workspaces/:id', e);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/workspaces/:id', async (req, res) => {
  try {
    await query('DELETE FROM workspaces WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}

// DB 초기화 후 서버 시작 (모든 라우트 등록 후 실행)
let serverStarted = false;
function startServer() {
  if (serverStarted) return;
  serverStarted = true;
  app.listen(PORT, '0.0.0.0', () => {
    const ip = getLocalIP();
    const addr = ip ? `http://${ip}:${PORT}` : `http://localhost:${PORT}`;
    console.log(`Link_in API server ${addr}`);
  });
}
initDb()
  .then(() => startServer())
  .catch((e) => {
    console.error('DB 초기화 실패:', e);
    startServer();
  });
