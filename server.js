const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cron = require('node-cron');
const { pool, query, initDb } = require('./db');
const { scanFromCsv, scanFromDisk, getScanStatus } = require('./scanner');

const app = express();
const PORT = 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const JWT_SECRET = process.env.JWT_SECRET || 'link_in_jwt_secret_change_in_production';
const JWT_EXPIRES_IN = '30d';
const BCRYPT_ROUNDS = 10;
const CSV_UPLOAD_MAX_MB = Math.max(50, Number(process.env.CSV_UPLOAD_MAX_MB || 1024)); // default 1GB

const CSV_UPLOAD_DIR = path.join(__dirname, 'csv_temp');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(CSV_UPLOAD_DIR)) fs.mkdirSync(CSV_UPLOAD_DIR, { recursive: true });

// CSV 업로드용 multer (이미지와 분리)
const csvUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, CSV_UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `scan_${Date.now()}.csv`),
  }),
  limits: { fileSize: CSV_UPLOAD_MAX_MB * 1024 * 1024 },
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const m = file.mimetype.match(/\/(jpeg|jpg|png|gif|webp|svg\+xml)/);
    const ext = m ? (m[1] === 'svg+xml' ? 'svg' : m[1]) : 'png';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR));

// ----- 인증 미들웨어 -----
function authenticate(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }
  try {
    req.user = jwt.verify(auth.slice(7), JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: '인증이 만료되었습니다. 다시 로그인해 주세요.' });
  }
}

async function requireAdmin(req, res, next) {
  try {
    const rows = await query('SELECT username FROM users WHERE id = ?', [req.user.id]);
    const username = rows && rows[0] ? String(rows[0].username || '').trim().toLowerCase() : '';
    if (username !== 'admin') {
      return res.status(403).json({ error: '관리자(admin) 계정만 접근할 수 있습니다.' });
    }
    next();
  } catch (e) {
    return res.status(500).json({ error: e.message || '권한 확인 중 오류가 발생했습니다.' });
  }
}

async function getUserDepartment(userId) {
  const rows = await query('SELECT department FROM users WHERE id = ?', [userId]);
  return rows && rows[0] ? (rows[0].department || null) : null;
}

async function getUserAccessContext(userId) {
  const rows = await query('SELECT username, department FROM users WHERE id = ?', [userId]);
  if (!rows || rows.length === 0) return { isAdmin: false, department: null };
  const user = rows[0];
  return {
    isAdmin: String(user.username || '').trim().toLowerCase() === 'admin',
    department: user.department || null,
  };
}

function getRootAccessWhereSql(accessCtx) {
  if (accessCtx?.isAdmin) {
    return { clause: '1=1', params: [] };
  }
  return {
    clause: `(root.access_scope = 'all' OR (root.access_scope = 'department' AND EXISTS (SELECT 1 FROM file_root_departments frd WHERE frd.root_node_id = root.id AND frd.department = ?)))`,
    params: [accessCtx?.department || ''],
  };
}

// ----- 메타 크롤링 -----
function getMetaFromHtml(html, baseUrl) {
  const result = { site_name: null, site_image: null, description: null };
  const base = new URL(baseUrl);
  const getAbs = (u) => {
    if (!u) return null;
    u = u.trim();
    if (/^https?:\/\//i.test(u)) return u;
    try { return new URL(u, base).href; } catch { return null; }
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
app.post('/api/upload', authenticate, (req, res, next) => {
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

// ----- 인증 API -----
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { username, password, name, department } = req.body;
    if (!username || !password || !name) {
      return res.status(400).json({ error: '아이디, 비밀번호, 이름은 필수입니다.' });
    }
    if (String(username).length < 3) {
      return res.status(400).json({ error: '아이디는 3자 이상이어야 합니다.' });
    }
    if (String(password).length < 4) {
      return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다.' });
    }
    const existing = await query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing && existing.length > 0) {
      return res.status(409).json({ error: '이미 사용중인 아이디입니다.' });
    }
    const hashed = await bcrypt.hash(String(password), BCRYPT_ROUNDS);
    const r = await query(
      'INSERT INTO users (username, password, name, department) VALUES (?, ?, ?, ?)',
      [String(username).trim(), hashed, String(name).trim(), department ? String(department).trim() : null]
    );
    const userId = r.insertId;
    const token = jwt.sign(
      { id: userId, username: String(username).trim(), name: String(name).trim() },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    res.status(201).json({
      token,
      user: { id: userId, username: String(username).trim(), name: String(name).trim(), department: department || null },
    });
  } catch (e) {
    console.error('POST /api/auth/signup', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '아이디와 비밀번호를 입력해 주세요.' });
    }
    const rows = await query('SELECT * FROM users WHERE username = ?', [String(username).trim()]);
    if (!rows || rows.length === 0) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }
    const user = rows[0];
    const isMatch = await bcrypt.compare(String(password), user.password);
    if (!isMatch) {
      return res.status(401).json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' });
    }
    const token = jwt.sign(
      { id: user.id, username: user.username, name: user.name },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );
    res.json({
      token,
      user: { id: user.id, username: user.username, name: user.name, department: user.department },
    });
  } catch (e) {
    console.error('POST /api/auth/login', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    const rows = await query('SELECT id, username, name, department FROM users WHERE id = ?', [req.user.id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/auth/me', authenticate, async (req, res) => {
  try {
    const { name, department, currentPassword, newPassword } = req.body;
    const rows = await query('SELECT * FROM users WHERE id = ?', [req.user.id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    const user = rows[0];

    if (newPassword) {
      if (!currentPassword) return res.status(400).json({ error: '현재 비밀번호를 입력해 주세요.' });
      const isMatch = await bcrypt.compare(String(currentPassword), user.password);
      if (!isMatch) return res.status(401).json({ error: '현재 비밀번호가 올바르지 않습니다.' });
      if (String(newPassword).length < 4) return res.status(400).json({ error: '새 비밀번호는 4자 이상이어야 합니다.' });
    }

    const updates = [];
    const params = [];
    if (name && typeof name === 'string' && name.trim()) {
      updates.push('name = ?');
      params.push(name.trim());
    }
    if (department !== undefined) {
      updates.push('department = ?');
      params.push(department ? String(department).trim() || null : null);
    }
    if (newPassword) {
      const hashed = await bcrypt.hash(String(newPassword), BCRYPT_ROUNDS);
      updates.push('password = ?');
      params.push(hashed);
    }
    if (updates.length === 0) return res.status(400).json({ error: '변경할 내용이 없습니다.' });

    params.push(req.user.id);
    await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    const updated = await query('SELECT id, username, name, department FROM users WHERE id = ?', [req.user.id]);
    res.json(updated[0]);
  } catch (e) {
    console.error('PUT /api/auth/me', e);
    res.status(500).json({ error: e.message });
  }
});

// ----- 카테고리 API -----
app.get('/api/categories', authenticate, async (req, res) => {
  try {
    const rows = await query(
      `SELECT c.*, u.name AS shared_by_name
       FROM categories c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.user_id = ? OR c.is_shared = 1
       ORDER BY c.sort_order, c.id`,
      [req.user.id]
    );
    // is_shared이고 내 것이 아닌 경우에만 shared_by_name 노출
    const result = rows.map((r) => ({
      ...r,
      shared_by_name: (r.is_shared && r.user_id !== req.user.id) ? r.shared_by_name : null,
      is_mine: r.user_id === req.user.id,
    }));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/categories/reorder', authenticate, async (req, res) => {
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
        await conn.execute(
          'UPDATE categories SET sort_order = ? WHERE id = ? AND user_id = ?',
          [sortOrder, id, req.user.id]
        );
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

app.post('/api/categories', authenticate, async (req, res) => {
  try {
    const { name, sort_order = 0, is_shared = false } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: '카테고리 이름이 필요합니다.' });
    }
    const r = await query(
      'INSERT INTO categories (name, sort_order, user_id, is_shared) VALUES (?, ?, ?, ?)',
      [name.trim(), sort_order, req.user.id, is_shared ? 1 : 0]
    );
    const id = r && r.insertId != null ? r.insertId : r;
    res.status(201).json({ id, name: name.trim(), sort_order, user_id: req.user.id, is_shared: !!is_shared });
  } catch (e) {
    console.error('POST /api/categories', e);
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/categories/:id', authenticate, async (req, res) => {
  try {
    const { name, sort_order, is_shared } = req.body;
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'id가 필요합니다.' });
    const cats = await query('SELECT * FROM categories WHERE id = ?', [id]);
    if (!cats || cats.length === 0) return res.status(404).json({ error: '카테고리를 찾을 수 없습니다.' });
    if (cats[0].user_id !== req.user.id) return res.status(403).json({ error: '권한이 없습니다.' });
    const nameVal = typeof name === 'string' ? name.trim() : null;
    const orderVal = typeof sort_order === 'number' ? sort_order : null;
    const sharedVal = is_shared !== undefined ? (is_shared ? 1 : 0) : null;
    await query(
      'UPDATE categories SET name = COALESCE(?, name), sort_order = COALESCE(?, sort_order), is_shared = COALESCE(?, is_shared) WHERE id = ?',
      [nameVal, orderVal, sharedVal, id]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /api/categories', e);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/categories/:id', authenticate, async (req, res) => {
  try {
    const cats = await query('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    if (!cats || cats.length === 0) return res.status(404).json({ error: '카테고리를 찾을 수 없습니다.' });
    if (cats[0].user_id !== req.user.id) return res.status(403).json({ error: '권한이 없습니다.' });
    await query('DELETE FROM categories WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ----- 링크 API -----
app.get('/api/links', authenticate, async (req, res) => {
  try {
    const categoryId = req.query.category_id;
    // 본인 링크 OR 공유 카테고리에 속한 링크 모두 반환
    let sql = `SELECT l.*, c.name AS category_name
               FROM links l
               JOIN categories c ON l.category_id = c.id
               WHERE (l.user_id = ? OR c.is_shared = 1)`;
    const params = [req.user.id];
    if (categoryId) {
      sql += ' AND l.category_id = ?';
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

app.patch('/api/links/reorder', authenticate, async (req, res) => {
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
        await conn.execute(
          'UPDATE links SET sort_order = ? WHERE id = ? AND user_id = ?',
          [sortOrder, id, req.user.id]
        );
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

// ----- 파일 탐색기 API (tree 구조) -----

// 루트 폴더 접근권한 조회/설정
app.get('/api/files/root-access', authenticate, requireAdmin, async (req, res) => {
  try {
    const rows = await query(
      `SELECT root.id, root.name, root.full_path, root.access_scope
       FROM file_nodes root
       WHERE root.parent_id IS NULL
       ORDER BY root.name ASC`,
    );
    const ids = rows.map((r) => Number(r.id)).filter(Number.isFinite);
    let deptRows = [];
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      deptRows = await query(
        `SELECT root_node_id, department
         FROM file_root_departments
         WHERE root_node_id IN (${placeholders})
         ORDER BY department ASC`,
        ids
      );
    }
    const deptMap = new Map();
    deptRows.forEach((r) => {
      const key = Number(r.root_node_id);
      if (!deptMap.has(key)) deptMap.set(key, []);
      deptMap.get(key).push(r.department);
    });
    res.json(rows.map((r) => ({
      ...r,
      access_departments: deptMap.get(Number(r.id)) || [],
    })));
  } catch (e) {
    console.error('GET /api/files/root-access', e);
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/files/root-access/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: '유효한 루트 폴더 id가 필요합니다.' });
    const scope = String(req.body?.access_scope || '').trim();
    const deptListRaw = Array.isArray(req.body?.access_departments)
      ? req.body.access_departments
      : (req.body?.access_department ? String(req.body.access_department).split(',') : []);
    const departments = deptListRaw
      .map((d) => String(d || '').trim())
      .filter((d) => d.length > 0);
    if (!['all', 'department'].includes(scope)) {
      return res.status(400).json({ error: "access_scope는 'all' 또는 'department'여야 합니다." });
    }
    if (scope === 'department' && departments.length === 0) {
      return res.status(400).json({ error: '부서 제한일 때 access_departments가 필요합니다.' });
    }
    const roots = await query('SELECT id FROM file_nodes WHERE id = ? AND parent_id IS NULL', [id]);
    if (!roots || roots.length === 0) {
      return res.status(404).json({ error: '루트 폴더를 찾을 수 없습니다.' });
    }
    await query(
      'UPDATE file_nodes SET access_scope = ?, access_department = ? WHERE id = ?',
      [scope, null, id]
    );
    await query('DELETE FROM file_root_departments WHERE root_node_id = ?', [id]);
    if (scope === 'department') {
      for (const dept of departments) {
        await query(
          'INSERT IGNORE INTO file_root_departments (root_node_id, department) VALUES (?, ?)',
          [id, dept]
        );
      }
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /api/files/root-access/:id', e);
    res.status(500).json({ error: e.message });
  }
});

// 파일명 검색
app.get('/api/files/search', authenticate, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json([]);
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 200) : 50;
    const accessCtx = await getUserAccessContext(req.user.id);
    const access = getRootAccessWhereSql(accessCtx);
    const rows = await query(
      `SELECT fn.id, fn.parent_id, fn.name, fn.full_path, fn.is_folder, fn.size, fn.modified
       FROM file_nodes fn
       JOIN file_nodes root ON root.id = fn.root_id
       WHERE (fn.name LIKE ? OR fn.full_path LIKE ?)
         AND ${access.clause}
       ORDER BY is_folder DESC, modified DESC
       LIMIT ${limit}`,
      [`%${q}%`, `%${q}%`, ...access.params]
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /api/files/search', e);
    res.status(500).json({ error: e.message });
  }
});

// 최근 열람 파일 (유저별)
app.get('/api/files/recent', authenticate, async (req, res) => {
  try {
    const rawLimit = Number(req.query.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : 30;
    const accessCtx = await getUserAccessContext(req.user.id);
    const access = getRootAccessWhereSql(accessCtx);
    const rows = await query(
      `SELECT fn.id, fn.parent_id, fn.name, fn.full_path, fn.is_folder, fn.size, fn.modified, frv.last_viewed_at, frv.view_count
       FROM file_recent_views frv
       JOIN file_nodes fn ON fn.id = frv.node_id
       JOIN file_nodes root ON root.id = fn.root_id
       WHERE frv.user_id = ?
         AND fn.is_folder = 0
         AND ${access.clause}
       ORDER BY frv.last_viewed_at DESC
       LIMIT ${limit}`
      ,
      [req.user.id, ...access.params]
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /api/files/recent', e);
    res.status(500).json({ error: e.message });
  }
});

// 최근 열람 기록(유저별)
app.post('/api/files/recent/:node_id', authenticate, async (req, res) => {
  try {
    const nodeId = Number(req.params.node_id);
    if (!Number.isFinite(nodeId)) return res.status(400).json({ error: '유효한 node_id가 필요합니다.' });
    const accessCtx = await getUserAccessContext(req.user.id);
    const access = getRootAccessWhereSql(accessCtx);
    const rows = await query(
      `SELECT n.id
       FROM file_nodes n
       JOIN file_nodes root ON root.id = n.root_id
       WHERE n.id = ?
         AND ${access.clause}
       LIMIT 1`,
      [nodeId, ...access.params]
    );
    if (!rows || rows.length === 0) return res.status(403).json({ error: '접근 권한이 없는 파일입니다.' });
    await query(
      `INSERT INTO file_recent_views (user_id, node_id, view_count)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE view_count = view_count + 1, last_viewed_at = CURRENT_TIMESTAMP`,
      [req.user.id, nodeId]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('POST /api/files/recent/:node_id', e);
    res.status(500).json({ error: e.message });
  }
});

// 즐겨찾기 목록
app.get('/api/files/favorites', authenticate, async (req, res) => {
  try {
    const accessCtx = await getUserAccessContext(req.user.id);
    const access = getRootAccessWhereSql(accessCtx);
    const rows = await query(
      `SELECT fn.id, fn.parent_id, fn.name, fn.full_path, fn.is_folder, fn.size, fn.modified
       FROM file_favorites ff
       JOIN file_nodes fn ON fn.id = ff.node_id
       JOIN file_nodes root ON root.id = fn.root_id
       WHERE ff.user_id = ?
         AND ${access.clause}
       ORDER BY ff.created_at DESC`,
      [req.user.id, ...access.params]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 즐겨찾기 추가
app.post('/api/files/favorites', authenticate, async (req, res) => {
  try {
    const { node_id } = req.body;
    if (!node_id) return res.status(400).json({ error: 'node_id가 필요합니다.' });
    await query(
      'INSERT IGNORE INTO file_favorites (user_id, node_id) VALUES (?, ?)',
      [req.user.id, node_id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 즐겨찾기 삭제
app.delete('/api/files/favorites/:node_id', authenticate, async (req, res) => {
  try {
    await query(
      'DELETE FROM file_favorites WHERE user_id = ? AND node_id = ?',
      [req.user.id, req.params.node_id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 특정 parent_id의 자식 노드 반환
app.get('/api/files/nodes', authenticate, async (req, res) => {
  try {
    const { parent_id } = req.query;
    const accessCtx = await getUserAccessContext(req.user.id);
    let rows;
    if (!parent_id || parent_id === 'null') {
      rows = await query(
        `SELECT
           root.id,
           root.parent_id,
           root.name,
           root.full_path,
           root.is_folder,
           root.size,
           root.modified,
           root.access_scope,
           (
             SELECT GROUP_CONCAT(frd.department ORDER BY frd.department SEPARATOR ', ')
             FROM file_root_departments frd
             WHERE frd.root_node_id = root.id
           ) AS access_department,
           CASE
             WHEN ? = 1 THEN 1
             WHEN root.access_scope = 'all' THEN 1
             WHEN root.access_scope = 'department' AND EXISTS (
               SELECT 1 FROM file_root_departments frd
               WHERE frd.root_node_id = root.id AND frd.department = ?
             ) THEN 1
             ELSE 0
           END AS can_access
         FROM file_nodes root
         WHERE root.parent_id IS NULL
         ORDER BY root.is_folder DESC, root.name ASC`,
        [accessCtx.isAdmin ? 1 : 0, accessCtx.department || '']
      );
    } else {
      const access = getRootAccessWhereSql(accessCtx);
      const parentRows = await query(
        `SELECT n.id
         FROM file_nodes n
         JOIN file_nodes root ON root.id = COALESCE(n.root_id, n.id)
         WHERE n.id = ?
           AND ${access.clause}
         LIMIT 1`,
        [Number(parent_id), ...access.params]
      );
      if (!parentRows || parentRows.length === 0) {
        return res.status(403).json({ error: '접근 권한이 없는 폴더입니다.' });
      }
      rows = await query(
        'SELECT id, parent_id, name, full_path, is_folder, size, modified FROM file_nodes WHERE parent_id = ? ORDER BY is_folder DESC, name ASC',
        [Number(parent_id)]
      );
    }
    res.json(rows);
  } catch (e) {
    console.error('GET /api/files/nodes', e);
    res.status(500).json({ error: e.message });
  }
});

// 스캔 상태 조회
app.get('/api/files/scan-status', authenticate, async (req, res) => {
  try {
    const status = getScanStatus();
    const countRow = await query('SELECT COUNT(*) as total FROM file_nodes');
    res.json({ ...status, total: countRow[0].total });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// CSV 임포트 트리거
app.post('/api/files/scan/csv', authenticate, async (req, res) => {
  const status = getScanStatus();
  if (status.running) return res.status(409).json({ error: '이미 스캔 중입니다.' });
  res.json({ message: 'CSV 임포트를 시작합니다.' });
  scanFromCsv().catch(e => console.error('[Scanner] CSV 오류:', e.message));
});

// Z:\ 디스크 직접 스캔 트리거
app.post('/api/files/scan/disk', authenticate, async (req, res) => {
  const status = getScanStatus();
  if (status.running) return res.status(409).json({ error: '이미 스캔 중입니다.' });
  res.json({ message: '디스크 스캔을 시작합니다.' });
  scanFromDisk().catch(e => console.error('[Scanner] 디스크 오류:', e.message));
});

// 로컬 PC에서 CSV 파일 업로드 후 자동 임포트
app.post('/api/files/upload-csv', authenticate, (req, res, next) => {
  csvUpload.single('csv')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res) => {
  const status = getScanStatus();
  if (status.running) return res.status(409).json({ error: '이미 스캔 중입니다.' });
  if (!req.file) return res.status(400).json({ error: 'CSV 파일이 없습니다.' });
  const csvPath = req.file.path;
  res.json({ message: `CSV 업로드 완료 (${req.file.size.toLocaleString()} bytes). 임포트를 시작합니다.` });
  scanFromCsv(csvPath)
    .then(() => { try { fs.unlinkSync(csvPath); } catch (_) {} })
    .catch(e => {
      console.error('[Scanner] 업로드 CSV 오류:', e.message);
      try { fs.unlinkSync(csvPath); } catch (_) {}
    });
});

app.get('/api/links/:id', authenticate, async (req, res) => {
  try {
    const rows = await query(
      'SELECT l.*, c.name AS category_name FROM links l JOIN categories c ON l.category_id = c.id WHERE l.id = ? AND l.user_id = ?',
      [req.params.id, req.user.id]
    );
    if (!rows || rows.length === 0) return res.status(404).json({ error: '링크를 찾을 수 없습니다.' });
    res.json(rows[0]);
  } catch (e) {
    console.error('GET /api/links/:id', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/links', authenticate, async (req, res) => {
  try {
    const { category_id, url, site_name, site_image, description, note, sort_order = 0 } = req.body;
    const urlTrim = url && String(url).trim();
    if (!urlTrim) return res.status(400).json({ error: 'URL을 입력해 주세요.' });
    const cats = await query(
      'SELECT * FROM categories WHERE id = ? AND (user_id = ? OR is_shared = 1)',
      [category_id, req.user.id]
    );
    if (!cats || cats.length === 0) return res.status(403).json({ error: '접근할 수 없는 카테고리입니다.' });
    const existing = await query('SELECT id FROM links WHERE url = ? AND user_id = ?', [urlTrim, req.user.id]);
    if (existing && existing.length > 0) {
      return res.status(409).json({ error: '이미 같은 주소의 링크가 저장되어 있습니다.' });
    }
    const logo = site_image && String(site_image).trim() ? String(site_image).trim() : null;
    const noteVal = note && String(note).trim() ? String(note).trim() : null;
    const r = await query(
      'INSERT INTO links (category_id, url, site_name, site_image, description, note, sort_order, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [category_id, urlTrim, site_name, logo, description || null, noteVal, sort_order, req.user.id]
    );
    const id = r && r.insertId != null ? r.insertId : r;
    res.status(201).json({
      id, category_id, url: urlTrim, site_name, site_image: logo,
      description: description || null, note: noteVal, sort_order, user_id: req.user.id,
    });
  } catch (e) {
    console.error('POST /api/links', e);
    res.status(500).json({ error: e.message || '저장 중 오류가 났습니다.' });
  }
});

app.put('/api/links/:id', authenticate, async (req, res) => {
  try {
    const { category_id, url, site_name, site_image, description, note, sort_order } = req.body;
    const id = req.params.id;
    const linkRows = await query('SELECT * FROM links WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!linkRows || linkRows.length === 0) return res.status(404).json({ error: '해당 링크가 없거나 권한이 없습니다.' });
    if (category_id) {
      const cats = await query(
        'SELECT * FROM categories WHERE id = ? AND (user_id = ? OR is_shared = 1)',
        [category_id, req.user.id]
      );
      if (!cats || cats.length === 0) return res.status(403).json({ error: '접근할 수 없는 카테고리입니다.' });
    }
    const urlToSave = url !== undefined && url !== null ? String(url).trim() : undefined;
    if (urlToSave !== undefined) {
      const existing = await query('SELECT id FROM links WHERE url = ? AND id != ? AND user_id = ?', [urlToSave, id, req.user.id]);
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
      WHERE id = ? AND user_id = ?`,
      [v(category_id), v(urlToSave), v(site_name), logo, v(description), noteVal === undefined ? null : noteVal, v(sort_order), id, req.user.id]
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

app.delete('/api/links/:id', authenticate, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM links WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '해당 링크가 없거나 권한이 없습니다.' });
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('DELETE /api/links/:id', e);
    res.status(500).json({ error: e.message });
  }
});

// ----- 작업 그룹(워크스페이스) API -----
app.get('/api/workspaces', authenticate, async (req, res) => {
  try {
    const rows = await query(
      'SELECT id, name, sort_order FROM workspaces WHERE user_id = ? ORDER BY sort_order, id',
      [req.user.id]
    );
    const withLinks = await Promise.all(
      rows.map(async (w) => {
        const linkRows = await query(
          `SELECT l.id, l.url, l.site_name, l.site_image, l.description
           FROM workspace_links wl
           JOIN links l ON l.id = wl.link_id
           JOIN categories c ON l.category_id = c.id
           WHERE wl.workspace_id = ?
             AND (l.user_id = ? OR c.is_shared = 1)
           ORDER BY wl.sort_order, wl.link_id`,
          [w.id, req.user.id]
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

app.post('/api/workspaces', authenticate, async (req, res) => {
  try {
    const { name, link_ids = [], sort_order = 0 } = req.body;
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: '그룹 이름을 입력해 주세요.' });
    }
    const [r] = await pool.execute(
      'INSERT INTO workspaces (name, sort_order, user_id) VALUES (?, ?, ?)',
      [name.trim(), sort_order, req.user.id]
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

app.put('/api/workspaces/:id', authenticate, async (req, res) => {
  try {
    const { name, link_ids } = req.body;
    const id = req.params.id;
    const ws = await query('SELECT * FROM workspaces WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!ws || ws.length === 0) return res.status(404).json({ error: '권한이 없거나 없는 그룹입니다.' });
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

app.delete('/api/workspaces/:id', authenticate, async (req, res) => {
  try {
    const [result] = await pool.execute(
      'DELETE FROM workspaces WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: '권한이 없거나 없는 그룹입니다.' });
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

let serverStarted = false;
function startServer() {
  if (serverStarted) return;
  serverStarted = true;
  app.listen(PORT, '0.0.0.0', () => {
    const ip = getLocalIP();
    const addr = ip ? `http://${ip}:${PORT}` : `http://localhost:${PORT}`;
    console.log(`Link_in API server ${addr}`);
  });

  // 매주 월요일 오전 3시 자동 스캔 (CSV 우선, 실패 시 디스크)
  cron.schedule('0 3 * * 1', async () => {
    console.log('[Scheduler] 주간 자동 스캔 시작');
    try {
      await scanFromCsv();
    } catch (e) {
      console.warn('[Scheduler] CSV 실패, 디스크 스캔 시도:', e.message);
      await scanFromDisk().catch(e2 => console.error('[Scheduler] 디스크 스캔 실패:', e2.message));
    }
  });
}
initDb()
  .then(() => startServer())
  .catch((e) => {
    console.error('DB 초기화 실패:', e);
    startServer();
  });
