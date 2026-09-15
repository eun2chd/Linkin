const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const sharp = require('sharp');
const cron = require('node-cron');
const { pool, query, initDb } = require('./db');
const { scanFromCsv, getScanStatus } = require('./scanner');

const app = express();
const PORT = 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const JWT_SECRET = process.env.JWT_SECRET || 'link_in_jwt_secret_change_in_production';
const JWT_EXPIRES_IN = '30d';
const BCRYPT_ROUNDS = 10;

// 링크 계정정보(아이디/비번) 저장용 대칭키 암호화 - JWT_SECRET에서 파생시켜 별도 env 없이도 안정적인 키 확보
const ACCOUNT_ENC_KEY = crypto.scryptSync(JWT_SECRET, 'link_accounts_enc_salt_v1', 32);
function encryptSecret(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ACCOUNT_ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}
function decryptSecret(b64) {
  const buf = Buffer.from(String(b64), 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', ACCOUNT_ENC_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
const CSV_UPLOAD_MAX_MB = Math.max(50, Number(process.env.CSV_UPLOAD_MAX_MB || 1024)); // default 1GB

const CSV_UPLOAD_DIR = path.join(__dirname, 'csv_temp');
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
const MEMO_ATTACH_DIR = path.join(__dirname, 'memo_attachments');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(CSV_UPLOAD_DIR)) fs.mkdirSync(CSV_UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
if (!fs.existsSync(MEMO_ATTACH_DIR)) fs.mkdirSync(MEMO_ATTACH_DIR, { recursive: true });

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

// 업로드된 이미지를 실제 표시 크기에 맞게 리사이즈+압축 (원본 그대로 저장하면 몇 MB짜리가 그대로 서빙돼서
// 카드 아이콘/배경처럼 작게 쓰이는 곳에서도 무거운 파일을 통째로 내려받게 됨 - 홈 화면처럼 카드가 많은 페이지에서 특히 버벅임)
const IMAGE_MAX_WIDTH = 1600;
const IMAGE_QUALITY = 78;
async function compressImageFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return; // svg/gif는 그대로 둠 (gif는 압축하면 애니메이션 깨짐)
  try {
    // sharp(filePath)로 바로 열면 이 환경에서 jpeg가 간헐적으로 open 에러가 나서 버퍼로 먼저 읽어서 넘김
    const inputBuffer = fs.readFileSync(filePath);
    const before = inputBuffer.length;
    const img = sharp(inputBuffer, { failOn: 'none' });
    const meta = await img.metadata();
    let pipeline = img;
    if (meta.width && meta.width > IMAGE_MAX_WIDTH) {
      pipeline = pipeline.resize({ width: IMAGE_MAX_WIDTH, withoutEnlargement: true });
    }
    let outBuffer;
    if (ext === '.png') outBuffer = await pipeline.png({ quality: IMAGE_QUALITY, compressionLevel: 9 }).toBuffer();
    else if (ext === '.webp') outBuffer = await pipeline.webp({ quality: IMAGE_QUALITY }).toBuffer();
    else outBuffer = await pipeline.jpeg({ quality: IMAGE_QUALITY, mozjpeg: true }).toBuffer();
    if (outBuffer.length < before) fs.writeFileSync(filePath, outBuffer);
  } catch (e) {
    console.error('compressImageFile', filePath, e.message); // 압축 실패해도 원본 업로드 자체는 그대로 살려둠
  }
}

const downloadStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DOWNLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`);
  },
});
const downloadUpload = multer({ storage: downloadStorage, limits: { fileSize: 500 * 1024 * 1024 } });

// 메모 첨부파일용 multer - 다운로드 센터보다 훨씬 작은 용량 제한 (메모에 딸린 부속 자료용이라 대용량은 다운로드 센터로 유도)
const MEMO_ATTACH_MAX_SIZE = 20 * 1024 * 1024; // 파일당 20MB
const MEMO_ATTACH_MAX_COUNT = 10; // 한 번의 요청(=한 번의 첨부 액션)당 최대 개수
const memoAttachStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, MEMO_ATTACH_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 9)}${ext}`);
  },
});
const memoAttachUpload = multer({ storage: memoAttachStorage, limits: { fileSize: MEMO_ATTACH_MAX_SIZE, files: MEMO_ATTACH_MAX_COUNT } });

app.use(cors());
app.use(express.json());

function sanitizeActivityDetails(body) {
  if (!body || typeof body !== 'object') return null;
  const blockedKeys = new Set(['password', 'newPassword', 'token', 'content', 'note']);
  const safe = {};
  for (const [key, value] of Object.entries(body)) {
    if (blockedKeys.has(key)) continue;
    if (Array.isArray(value)) safe[key] = value.slice(0, 20);
    else if (typeof value === 'string') safe[key] = value.slice(0, 200);
    else if (typeof value !== 'object') safe[key] = value;
  }
  return Object.keys(safe).length ? safe : null;
}

app.use('/api', (req, res, next) => {
  const startedAt = Date.now();
  res.on('finish', () => {
    const userId = req.user?.id || null;
    const username = req.user?.username || (req.path.startsWith('/auth/') ? String(req.body?.username || '').slice(0, 50) || null : null);
    const pathValue = String(req.originalUrl || req.url).slice(0, 500);
    const action = `${req.method} ${String(req.path || '').slice(0, 90)}`;
    const details = sanitizeActivityDetails(req.body);
    const duration = Date.now() - startedAt;
    console.log(`[ACTIVITY] user=${username || 'anonymous'} method=${req.method} path=${pathValue} status=${res.statusCode} duration=${duration}ms`);
    query(
      `INSERT INTO activity_logs (user_id, username, method, path, action, status_code, ip_address, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, username, req.method, pathValue, action, res.statusCode, req.ip || req.socket?.remoteAddress || null, details ? JSON.stringify(details) : null]
    ).catch(error => console.error('[ACTIVITY] 로그 저장 실패:', error.message));
  });
  next();
});
// 업로드 파일명은 타임스탬프+랜덤이라 같은 이름이 재사용될 일이 없음 -> 브라우저가 오래 캐싱해도 안전
// (캐싱 헤더가 없으면 페이지 새로고침마다 이미 받은 이미지를 또 요청해서 체감 로딩이 느려짐)
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }));
// 메모 본문에 인라인으로 삽입된 이미지(<img src>)는 인증 헤더를 못 실어보내므로 /uploads와 동일하게
// 추측 불가능한 파일명에 의존해 공개로 서빙. 다운로드 버튼 등 접근제어가 필요한 경로는 /api/memo-attachments/:id/file 사용.
app.use('/memo-uploads', express.static(MEMO_ATTACH_DIR, { maxAge: '30d', immutable: true }));

// ----- 정적 파일 배신 -----
app.use('/fonts', express.static(path.join(__dirname, 'fonts'), { maxAge: '7d' }));
app.use('/icons', express.static(path.join(__dirname, 'icons'), { maxAge: '7d' }));

// React 빌드 서빙 (dist-client/) - index.html은 배포될 때마다 내용이 바뀌므로 캐싱하면 안 되고,
// assets/*.js·css는 Vite가 파일명에 해시를 붙여서 만들기 때문에 내용이 바뀌면 파일명도 바뀜 -> 길게 캐싱해도 안전
const CLIENT_DIST = path.join(__dirname, 'dist-client');
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST, {
    maxAge: '1y',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  }));
}

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
    const rows = await query('SELECT role FROM users WHERE id = ?', [req.user.id]);
    if (!rows || !rows[0] || rows[0].role !== 'admin') {
      return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
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
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Elinko/1.0)' },
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
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '이미지 파일이 없습니다.' });
    await compressImageFile(req.file.path);
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
      'INSERT INTO users (username, password, name, department, can_explorer) VALUES (?, ?, ?, ?, 0)',
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
      user: { id: userId, username: String(username).trim(), name: String(name).trim(), department: department || null, role: 'user', can_explorer: 0 },
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
      user: { id: user.id, username: user.username, name: user.name, department: user.department, role: user.role || 'user', can_explorer: user.can_explorer ?? 1 },
    });
  } catch (e) {
    console.error('POST /api/auth/login', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    const rows = await query('SELECT id, username, name, department, role, can_explorer FROM users WHERE id = ?', [req.user.id]);
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
    const updated = await query('SELECT id, username, name, department, role, can_explorer FROM users WHERE id = ?', [req.user.id]);
    res.json(updated[0]);
  } catch (e) {
    console.error('PUT /api/auth/me', e);
    res.status(500).json({ error: e.message });
  }
});

// 비밀번호 재설정 요청 (로그인 불필요) - 아이디+이름이 일치하면 접수, 아니어도 동일한 응답을 줘서 계정 존재 여부가 드러나지 않게 함
app.post('/api/auth/request-password-reset', async (req, res) => {
  try {
    const { username, name } = req.body;
    if (!username || !name) {
      return res.status(400).json({ error: '아이디와 이름을 입력해 주세요.' });
    }
    const rows = await query(
      'SELECT id FROM users WHERE username = ? AND name = ?',
      [String(username).trim(), String(name).trim()]
    );
    if (rows && rows.length > 0) {
      const userId = rows[0].id;
      const pending = await query(
        "SELECT id FROM password_reset_requests WHERE user_id = ? AND status = 'pending'",
        [userId]
      );
      if (!pending || pending.length === 0) {
        await query(
          'INSERT INTO password_reset_requests (user_id, username, name) VALUES (?, ?, ?)',
          [userId, String(username).trim(), String(name).trim()]
        );
      }
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('POST /api/auth/request-password-reset', e);
    res.status(500).json({ error: e.message });
  }
});

// ----- 카테고리 API -----
app.get('/api/share-targets', authenticate, async (req, res) => {
  try {
    const rows = await query(
      'SELECT id, name, username, department FROM users WHERE id <> ? ORDER BY name, username',
      [req.user.id]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/categories', authenticate, async (req, res) => {
  try {
    const rows = await query(
      `SELECT c.*, u.name AS shared_by_name,
              (SELECT COUNT(*) FROM links l WHERE l.category_id = c.id AND (l.user_id = ? OR c.is_shared = 1)) AS link_count
       FROM categories c
       LEFT JOIN users u ON u.id = c.user_id
       WHERE c.user_id = ?
          OR (c.is_shared = 1 AND (
                c.share_scope = 'all'
                OR EXISTS (SELECT 1 FROM category_shares cs WHERE cs.category_id = c.id AND cs.user_id = ?)
              ))
       ORDER BY c.sort_order, c.id`,
      [req.user.id, req.user.id, req.user.id]
    );
    const ownedShares = await query(
      `SELECT cs.category_id, cs.user_id
       FROM category_shares cs
       JOIN categories c ON c.id = cs.category_id
       WHERE c.user_id = ?`,
      [req.user.id]
    );
    const shareIdsByCategory = new Map();
    for (const row of ownedShares) {
      if (!shareIdsByCategory.has(row.category_id)) shareIdsByCategory.set(row.category_id, []);
      shareIdsByCategory.get(row.category_id).push(row.user_id);
    }
    // is_shared이고 내 것이 아닌 경우에만 shared_by_name 노출
    const result = rows.map((r) => ({
      ...r,
      is_shared: !!r.is_shared,
      shared_by_name: (r.is_shared && r.user_id !== req.user.id) ? r.shared_by_name : null,
      is_mine: r.user_id === req.user.id,
      share_scope: r.share_scope || 'all',
      shared_user_ids: r.user_id === req.user.id ? (shareIdsByCategory.get(r.id) || []) : [],
      link_count: Number(r.link_count ?? 0),
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

const MAX_CATEGORY_DEPTH = 3; // 대메뉴(1) > 중메뉴(2) > 소메뉴(3)

// 한 유저의 카테고리 트리를 parent_id 기준으로 다시 훑어서 depth 컬럼을 실제 트리 구조에 맞게 보정
// (같은 트랜잭션의 conn으로 읽어야 방금 UPDATE한 parent_id가 반영된 상태로 보임)
async function recalcCategoryDepths(conn, userId) {
  const [rows] = await conn.execute('SELECT id, parent_id, depth FROM categories WHERE user_id = ?', [userId]);
  const byId = new Map(rows.map(r => [r.id, r]));
  const correctDepth = new Map();
  function resolve(id, guard) {
    if (correctDepth.has(id)) return correctDepth.get(id);
    const row = byId.get(id);
    if (!row) return 1;
    if (guard.has(id)) return 1; // 순환 방어
    guard.add(id);
    const d = (row.parent_id && byId.has(row.parent_id)) ? resolve(row.parent_id, guard) + 1 : 1;
    correctDepth.set(id, d);
    return d;
  }
  for (const row of rows) resolve(row.id, new Set());
  for (const row of rows) {
    const d = correctDepth.get(row.id) ?? 1;
    if (d !== row.depth) {
      await conn.execute('UPDATE categories SET depth = ? WHERE id = ?', [d, row.id]);
    }
  }
}

// id가 candidateParentId의 조상(자기 자신 포함)인지 확인 - 순환 참조 방지용
async function isAncestorOf(id, candidateParentId, userId) {
  const rows = await query('SELECT id, parent_id FROM categories WHERE user_id = ?', [userId]);
  const byId = new Map(rows.map(r => [r.id, r]));
  let cur = candidateParentId;
  const seen = new Set();
  while (cur != null) {
    if (cur === id) return true;
    if (seen.has(cur)) break;
    seen.add(cur);
    cur = byId.get(cur)?.parent_id ?? null;
  }
  return false;
}

app.post('/api/categories', authenticate, async (req, res) => {
  try {
    const { name, sort_order = 0, is_shared = false, share_scope = 'all', shared_user_ids = [], parent_id = null } = req.body;
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: '카테고리 이름이 필요합니다.' });
    }
    const scope = share_scope === 'selected' ? 'selected' : 'all';
    const targetIds = [...new Set((Array.isArray(shared_user_ids) ? shared_user_ids : []).map(Number))]
      .filter(id => Number.isInteger(id) && id > 0 && id !== req.user.id);
    if (is_shared && scope === 'selected' && targetIds.length === 0) {
      return res.status(400).json({ error: '공유할 사용자를 한 명 이상 선택해 주세요.' });
    }

    let depth = 1;
    let parentIdVal = null;
    if (parent_id !== null && parent_id !== undefined && parent_id !== '') {
      const parentRows = await query('SELECT id, user_id, depth FROM categories WHERE id = ?', [Number(parent_id)]);
      if (!parentRows || parentRows.length === 0) return res.status(400).json({ error: '상위 카테고리를 찾을 수 없습니다.' });
      if (parentRows[0].user_id !== req.user.id) return res.status(403).json({ error: '상위 카테고리에 대한 권한이 없습니다.' });
      if (parentRows[0].depth >= MAX_CATEGORY_DEPTH) return res.status(400).json({ error: `하위 카테고리는 최대 ${MAX_CATEGORY_DEPTH}단계(대/중/소메뉴)까지만 만들 수 있습니다.` });
      depth = parentRows[0].depth + 1;
      parentIdVal = parentRows[0].id;
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [r] = await conn.execute(
        'INSERT INTO categories (name, sort_order, user_id, is_shared, share_scope, parent_id, depth) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [name.trim(), sort_order, req.user.id, is_shared ? 1 : 0, scope, parentIdVal, depth]
      );
      if (is_shared && scope === 'selected') {
        for (const userId of targetIds) {
          await conn.execute(
            'INSERT INTO category_shares (category_id, user_id) SELECT ?, id FROM users WHERE id = ? AND id <> ?',
            [r.insertId, userId, req.user.id]
          );
        }
      }
      await conn.commit();
      res.status(201).json({ id: r.insertId, name: name.trim(), sort_order, user_id: req.user.id, is_shared: !!is_shared, share_scope: scope, shared_user_ids: targetIds, parent_id: parentIdVal, depth });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error('POST /api/categories', e);
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/categories/:id', authenticate, async (req, res) => {
  try {
    const { name, sort_order, is_shared, share_scope, shared_user_ids, parent_id } = req.body;
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'id가 필요합니다.' });
    const cats = await query('SELECT * FROM categories WHERE id = ?', [id]);
    if (!cats || cats.length === 0) return res.status(404).json({ error: '카테고리를 찾을 수 없습니다.' });
    if (cats[0].user_id !== req.user.id) return res.status(403).json({ error: '권한이 없습니다.' });
    const nameVal = typeof name === 'string' ? name.trim() : null;
    const orderVal = typeof sort_order === 'number' ? sort_order : null;
    const sharedVal = is_shared !== undefined ? (is_shared ? 1 : 0) : null;
    const scopeVal = share_scope !== undefined ? (share_scope === 'selected' ? 'selected' : 'all') : null;
    const targetIds = [...new Set((Array.isArray(shared_user_ids) ? shared_user_ids : []).map(Number))]
      .filter(userId => Number.isInteger(userId) && userId > 0 && userId !== req.user.id);
    const effectiveShared = is_shared !== undefined ? !!is_shared : !!cats[0].is_shared;
    const effectiveScope = scopeVal || cats[0].share_scope || 'all';
    if (effectiveShared && effectiveScope === 'selected' && shared_user_ids !== undefined && targetIds.length === 0) {
      return res.status(400).json({ error: '공유할 사용자를 한 명 이상 선택해 주세요.' });
    }

    let parentUpdate = undefined; // undefined면 변경 안 함
    let depthVal = null;
    if (parent_id !== undefined) {
      if (parent_id === null || parent_id === '') {
        parentUpdate = null;
        depthVal = 1;
      } else {
        const newParentId = Number(parent_id);
        if (newParentId === id) return res.status(400).json({ error: '자기 자신을 상위 카테고리로 지정할 수 없습니다.' });
        const parentRows = await query('SELECT id, user_id, depth FROM categories WHERE id = ?', [newParentId]);
        if (!parentRows || parentRows.length === 0) return res.status(400).json({ error: '상위 카테고리를 찾을 수 없습니다.' });
        if (parentRows[0].user_id !== req.user.id) return res.status(403).json({ error: '상위 카테고리에 대한 권한이 없습니다.' });
        if (parentRows[0].depth >= MAX_CATEGORY_DEPTH) return res.status(400).json({ error: `하위 카테고리는 최대 ${MAX_CATEGORY_DEPTH}단계(대/중/소메뉴)까지만 만들 수 있습니다.` });
        const cyclic = await isAncestorOf(id, newParentId, req.user.id);
        if (cyclic) return res.status(400).json({ error: '하위 카테고리를 상위로 지정할 수 없습니다.' });
        parentUpdate = newParentId;
        depthVal = parentRows[0].depth + 1;
      }
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute(
        'UPDATE categories SET name = COALESCE(?, name), sort_order = COALESCE(?, sort_order), is_shared = COALESCE(?, is_shared), share_scope = COALESCE(?, share_scope), parent_id = IF(? , ?, parent_id), depth = COALESCE(?, depth) WHERE id = ?',
        [nameVal, orderVal, sharedVal, scopeVal, parent_id !== undefined ? 1 : 0, parentUpdate, depthVal, id]
      );
      if (is_shared === false || effectiveScope === 'all') {
        await conn.execute('DELETE FROM category_shares WHERE category_id = ?', [id]);
      } else if (shared_user_ids !== undefined) {
        await conn.execute('DELETE FROM category_shares WHERE category_id = ?', [id]);
        for (const userId of targetIds) {
          await conn.execute(
            'INSERT INTO category_shares (category_id, user_id) SELECT ?, id FROM users WHERE id = ? AND id <> ?',
            [id, userId, req.user.id]
          );
        }
      }
      if (parent_id !== undefined) {
        await recalcCategoryDepths(conn, req.user.id);
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

// 유저가 해당 링크에 접근 가능한지 확인 (소유 or 공유 카테고리)
async function linkAccessCheck(linkId, userId) {
  const rows = await query(
    `SELECT l.id, l.user_id AS link_owner, c.user_id AS cat_owner
     FROM links l
     JOIN categories c ON c.id = l.category_id
     WHERE l.id = ? AND (
       l.user_id = ?
       OR (c.is_shared = 1 AND (
         c.share_scope = 'all'
         OR EXISTS (SELECT 1 FROM category_shares cs WHERE cs.category_id = c.id AND cs.user_id = ?)
       ))
     )`,
    [linkId, userId, userId]
  );
  return rows[0] || null;
}

// 공유는 "같이 보기" 전용 - 링크 생성/수정/삭제/순서변경/계정정보 추가 등 쓰기 작업은
// 링크가 속한 카테고리의 소유자만 가능 (공유받은 사람은 조회만)
async function linkOwnerCheck(linkId, userId) {
  const rows = await query(
    `SELECT l.* FROM links l JOIN categories c ON c.id = l.category_id
     WHERE l.id = ? AND c.user_id = ?`,
    [linkId, userId]
  );
  return rows[0] || null;
}

// 카테고리를 클릭하면 그 카테고리 자체 + 모든 하위(뎁스 상관없이 재귀) 카테고리에 속한 링크가 다 나와야 함
// (대메뉴 클릭 시 중메뉴/소메뉴 링크까지 전부 보이는 게 맞는 동작)
async function getCategoryWithDescendantIds(categoryId) {
  const all = await query('SELECT id, parent_id FROM categories');
  const byParent = new Map();
  for (const c of all) {
    const list = byParent.get(c.parent_id) || [];
    list.push(c.id);
    byParent.set(c.parent_id, list);
  }
  const startId = Number(categoryId);
  const result = [startId];
  const queue = [startId];
  while (queue.length) {
    const cur = queue.shift();
    for (const childId of (byParent.get(cur) || [])) {
      result.push(childId);
      queue.push(childId);
    }
  }
  return result;
}

app.get('/api/links', authenticate, async (req, res) => {
  try {
    const categoryId = req.query.category_id;
    // 본인 링크 OR 공유 카테고리에 속한 링크 모두 반환
    let sql = `SELECT l.*, c.name AS category_name,
                      EXISTS (SELECT 1 FROM link_favorites lf WHERE lf.link_id = l.id AND lf.user_id = ?) AS is_favorite
               FROM links l
               JOIN categories c ON l.category_id = c.id
               WHERE (l.user_id = ? OR (
                 c.is_shared = 1 AND (
                   c.share_scope = 'all'
                   OR EXISTS (SELECT 1 FROM category_shares cs WHERE cs.category_id = c.id AND cs.user_id = ?)
                 )
               ))`;
    const params = [req.user.id, req.user.id, req.user.id];
    if (categoryId) {
      const ids = await getCategoryWithDescendantIds(categoryId);
      sql += ` AND l.category_id IN (${ids.map(() => '?').join(',')})`;
      params.push(...ids);
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
        // 공유는 조회 전용 - 순서 변경은 카테고리 소유자만
        await conn.execute(
          `UPDATE links l
           JOIN categories c ON c.id = l.category_id
           SET l.sort_order = ?
           WHERE l.id = ? AND c.user_id = ?`,
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

app.put('/api/links/:id/favorite', authenticate, async (req, res) => {
  try {
    const linkId = Number(req.params.id);
    const favorite = !!req.body.favorite;
    if (!Number.isInteger(linkId) || linkId <= 0) {
      return res.status(400).json({ error: '유효한 링크 ID가 필요합니다.' });
    }
    const accessible = await query(
      `SELECT l.id
       FROM links l
       JOIN categories c ON c.id = l.category_id
       WHERE l.id = ? AND (
         l.user_id = ? OR (c.is_shared = 1 AND (
           c.share_scope = 'all'
           OR EXISTS (SELECT 1 FROM category_shares cs WHERE cs.category_id = c.id AND cs.user_id = ?)
         ))
       )`,
      [linkId, req.user.id, req.user.id]
    );
    if (!accessible.length) return res.status(404).json({ error: '접근할 수 없는 링크입니다.' });

    if (favorite) {
      await query('INSERT IGNORE INTO link_favorites (user_id, link_id) VALUES (?, ?)', [req.user.id, linkId]);
    } else {
      await query('DELETE FROM link_favorites WHERE user_id = ? AND link_id = ?', [req.user.id, linkId]);
    }
    res.json({ ok: true, is_favorite: favorite });
  } catch (e) {
    console.error('PUT /api/links/:id/favorite', e);
    res.status(500).json({ error: e.message || '즐겨찾기 변경에 실패했습니다.' });
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
      `SELECT l.*, c.name AS category_name, c.user_id AS category_owner_id
       FROM links l JOIN categories c ON l.category_id = c.id
       WHERE l.id = ? AND (
         l.user_id = ?
         OR (c.is_shared = 1 AND (
           c.share_scope = 'all'
           OR EXISTS (SELECT 1 FROM category_shares cs WHERE cs.category_id = c.id AND cs.user_id = ?)
         ))
       )`,
      [req.params.id, req.user.id, req.user.id]
    );
    if (!rows || rows.length === 0) return res.status(404).json({ error: '링크를 찾을 수 없습니다.' });
    const row = rows[0];
    // 공유는 조회 전용 - 카테고리 소유자만 수정/삭제/계정정보 관리 가능 (팝업창 등에서 UI 분기용)
    const is_owner = row.category_owner_id === req.user.id;
    delete row.category_owner_id;
    res.json({ ...row, is_owner });
  } catch (e) {
    console.error('GET /api/links/:id', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/links', authenticate, async (req, res) => {
  try {
    const { category_id, url, site_name, site_image, description, note, sort_order = 0, bg_color, bg_image } = req.body;
    const urlTrim = url && String(url).trim();
    if (!urlTrim) return res.status(400).json({ error: 'URL을 입력해 주세요.' });
    // 공유는 조회 전용 - 링크 추가는 카테고리 소유자만
    const cats = await query('SELECT * FROM categories WHERE id = ? AND user_id = ?', [category_id, req.user.id]);
    if (!cats || cats.length === 0) return res.status(403).json({ error: '접근할 수 없는 카테고리입니다.' });
    const existing = await query('SELECT id FROM links WHERE url = ? AND category_id = ?', [urlTrim, category_id]);
    if (existing && existing.length > 0) {
      return res.status(409).json({ error: '이미 같은 카테고리에 동일한 주소의 링크가 있습니다.' });
    }
    const logo = site_image && String(site_image).trim() ? String(site_image).trim() : null;
    const noteVal = note && String(note).trim() ? String(note).trim() : null;
    const bgColorVal = bg_color && String(bg_color).trim() ? String(bg_color).trim() : null;
    const bgImageVal = bg_image && String(bg_image).trim() ? String(bg_image).trim() : null;
    const r = await query(
      'INSERT INTO links (category_id, url, site_name, site_image, description, note, sort_order, user_id, bg_color, bg_image) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [category_id, urlTrim, site_name, logo, description || null, noteVal, sort_order, req.user.id, bgColorVal, bgImageVal]
    );
    const id = r && r.insertId != null ? r.insertId : r;
    res.status(201).json({
      id, category_id, url: urlTrim, site_name, site_image: logo,
      description: description || null, note: noteVal, sort_order, user_id: req.user.id, bg_color: bgColorVal, bg_image: bgImageVal,
    });
  } catch (e) {
    console.error('POST /api/links', e);
    res.status(500).json({ error: e.message || '저장 중 오류가 났습니다.' });
  }
});

app.put('/api/links/:id', authenticate, async (req, res) => {
  try {
    const { category_id, url, site_name, site_image, description, note, sort_order, bg_color, bg_image } = req.body;
    const id = req.params.id;
    // 공유는 조회 전용 - 링크 수정은 카테고리 소유자만
    const linkRows = await query('SELECT * FROM links WHERE id = ?', [id]);
    if (!linkRows || linkRows.length === 0) return res.status(404).json({ error: '해당 링크가 없거나 권한이 없습니다.' });
    const owned = await linkOwnerCheck(id, req.user.id);
    if (!owned) return res.status(403).json({ error: '수정 권한이 없습니다. (공유는 조회만 가능합니다)' });
    if (category_id) {
      const cats = await query('SELECT * FROM categories WHERE id = ? AND user_id = ?', [category_id, req.user.id]);
      if (!cats || cats.length === 0) return res.status(403).json({ error: '접근할 수 없는 카테고리입니다.' });
    }
    const urlToSave = url !== undefined && url !== null ? String(url).trim() : undefined;
    if (urlToSave !== undefined) {
      const targetCatId = category_id || linkRows[0].category_id;
      const existing = await query('SELECT id FROM links WHERE url = ? AND id != ? AND category_id = ?', [urlToSave, id, targetCatId]);
      if (existing && existing.length > 0) {
        return res.status(409).json({ error: '이미 같은 카테고리에 동일한 주소의 링크가 있습니다.' });
      }
    }
    const logo = site_image === undefined || site_image === null ? null : (String(site_image).trim() || null);
    // note도 bg_color/bg_image/site_image/description과 마찬가지로 COALESCE를 쓰면 "지우기"(null 전송)와
    // "안 건드림"(필드 자체를 안 보냄)을 구분 못 해서 직접 대입으로 처리 - 프론트가 매 저장마다 값을 항상 보내야 함
    const noteVal = note === undefined ? null : (String(note || '').trim() || null);
    const bgColorVal = bg_color !== undefined ? (String(bg_color || '').trim() || null) : null;
    const bgImageVal = bg_image !== undefined ? (String(bg_image || '').trim() || null) : null;
    const v = (x) => (x === undefined ? null : x);
    const [result] = await pool.execute(
      `UPDATE links SET
        category_id = COALESCE(?, category_id),
        url = COALESCE(?, url),
        site_name = COALESCE(?, site_name),
        site_image = ?,
        description = ?,
        note = ?,
        sort_order = COALESCE(?, sort_order),
        bg_color = ?,
        bg_image = ?
      WHERE id = ?`,
      [v(category_id), v(urlToSave), v(site_name), logo, v(description), noteVal, v(sort_order), bgColorVal, bgImageVal, id]
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
    // 공유는 조회 전용 - 링크 삭제는 카테고리 소유자만
    const owned = await linkOwnerCheck(req.params.id, req.user.id);
    if (!owned) return res.status(403).json({ error: '삭제 권한이 없습니다. (공유는 조회만 가능합니다)' });
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

// ----- 링크 계정정보(사이트당 여러 개, 공유/비공유) API -----

app.get('/api/links/:id/accounts', authenticate, async (req, res) => {
  try {
    const access = await linkAccessCheck(req.params.id, req.user.id);
    if (!access) return res.status(404).json({ error: '해당 링크가 없거나 권한이 없습니다.' });
    const rows = await query(
      `SELECT a.id, a.link_id, a.name, a.is_shared, a.user_id, u.name AS created_by_name, a.created_at
       FROM link_accounts a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.link_id = ?
       ORDER BY a.sort_order, a.id`,
      [req.params.id]
    );
    // 공유 계정은 목록에서 바로 아이디/비번도 내려줌 (열람 절차 불필요)
    const result = await Promise.all(rows.map(async r => {
      if (!r.is_shared) return { ...r, is_shared: false };
      const full = await query('SELECT username, password_enc FROM link_accounts WHERE id = ?', [r.id]);
      return {
        ...r, is_shared: true,
        username: full[0]?.username ?? null,
        password: full[0] ? decryptSecret(full[0].password_enc) : null,
      };
    }));
    res.json(result);
  } catch (e) {
    console.error('GET /api/links/:id/accounts', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/links/:id/accounts', authenticate, async (req, res) => {
  try {
    // 공유는 조회 전용 - 계정정보 추가는 카테고리 소유자만
    const owned = await linkOwnerCheck(req.params.id, req.user.id);
    if (!owned) return res.status(403).json({ error: '계정정보 추가 권한이 없습니다. (공유는 조회만 가능합니다)' });
    const { name, username, password, is_shared, view_password } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: '계정 이름을 입력해 주세요.' });
    if (!username || !String(username).trim()) return res.status(400).json({ error: '아이디를 입력해 주세요.' });
    if (!password) return res.status(400).json({ error: '비밀번호를 입력해 주세요.' });
    const shared = !!is_shared;
    if (!shared && (!view_password || String(view_password).length < 4)) {
      return res.status(400).json({ error: '열람 비밀번호는 4자 이상이어야 합니다.' });
    }
    const viewHash = shared ? null : await bcrypt.hash(String(view_password), BCRYPT_ROUNDS);
    const r = await query(
      'INSERT INTO link_accounts (link_id, name, username, password_enc, is_shared, view_password_hash, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.params.id, String(name).trim(), String(username).trim(), encryptSecret(password), shared ? 1 : 0, viewHash, req.user.id]
    );
    res.status(201).json({ id: r.insertId, name: String(name).trim(), is_shared: shared });
  } catch (e) {
    console.error('POST /api/links/:id/accounts', e);
    res.status(500).json({ error: e.message });
  }
});

async function accountEditCheck(accountId, userId) {
  const rows = await query('SELECT * FROM link_accounts WHERE id = ?', [accountId]);
  if (!rows || rows.length === 0) return null;
  const account = rows[0];
  if (account.user_id === userId) return account;
  const userRows = await query('SELECT role FROM users WHERE id = ?', [userId]);
  if (userRows[0]?.role === 'admin') return account;
  return null;
}

app.put('/api/link-accounts/:id', authenticate, async (req, res) => {
  try {
    const account = await accountEditCheck(req.params.id, req.user.id);
    if (!account) return res.status(404).json({ error: '해당 계정을 찾을 수 없거나 수정 권한이 없습니다.' });
    const { name, username, password, is_shared, view_password } = req.body;

    const updates = [];
    const params = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(String(name).trim()); }
    if (username !== undefined) { updates.push('username = ?'); params.push(String(username).trim()); }
    if (password) { updates.push('password_enc = ?'); params.push(encryptSecret(password)); }

    let shared = !!account.is_shared;
    if (is_shared !== undefined) {
      shared = !!is_shared;
      updates.push('is_shared = ?'); params.push(shared ? 1 : 0);
      if (shared) { updates.push('view_password_hash = ?'); params.push(null); }
    }
    if (!shared && view_password) {
      if (String(view_password).length < 4) return res.status(400).json({ error: '열람 비밀번호는 4자 이상이어야 합니다.' });
      updates.push('view_password_hash = ?');
      params.push(await bcrypt.hash(String(view_password), BCRYPT_ROUNDS));
    }
    if (!shared && is_shared !== undefined && !account.view_password_hash && !view_password) {
      return res.status(400).json({ error: '비공유로 바꾸려면 열람 비밀번호를 입력해 주세요.' });
    }
    if (updates.length === 0) return res.status(400).json({ error: '변경할 내용이 없습니다.' });

    params.push(req.params.id);
    await query(`UPDATE link_accounts SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /api/link-accounts/:id', e);
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/link-accounts/:id', authenticate, async (req, res) => {
  try {
    const account = await accountEditCheck(req.params.id, req.user.id);
    if (!account) return res.status(404).json({ error: '해당 계정을 찾을 수 없거나 삭제 권한이 없습니다.' });
    await query('DELETE FROM link_accounts WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 비공유 계정 열람 - 열람 비밀번호 확인 후 아이디/비번 반환
app.post('/api/link-accounts/:id/reveal', authenticate, async (req, res) => {
  try {
    const rows = await query('SELECT * FROM link_accounts WHERE id = ?', [req.params.id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: '해당 계정을 찾을 수 없습니다.' });
    const account = rows[0];
    const access = await linkAccessCheck(account.link_id, req.user.id);
    if (!access) return res.status(404).json({ error: '해당 계정을 찾을 수 없거나 권한이 없습니다.' });

    if (!account.is_shared) {
      const { password } = req.body;
      if (!password) return res.status(400).json({ error: '열람 비밀번호를 입력해 주세요.' });
      const match = await bcrypt.compare(String(password), account.view_password_hash || '');
      // 401은 프론트에서 "세션 만료"로 처리해 강제 로그아웃되므로, 단순 오답은 403으로 구분
      if (!match) return res.status(403).json({ error: '열람 비밀번호가 올바르지 않습니다.' });
    }
    res.json({ username: account.username, password: decryptSecret(account.password_enc) });
  } catch (e) {
    console.error('POST /api/link-accounts/:id/reveal', e);
    res.status(500).json({ error: e.message });
  }
});

// ----- 작업 그룹(워크스페이스) API -----
async function getValidWorkspaceLinkIds(rawIds, userId) {
  const ids = [...new Set((Array.isArray(rawIds) ? rawIds : []).map(Number))]
    .filter(id => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const rows = await query(
    `SELECT l.id
     FROM links l
     JOIN categories c ON c.id = l.category_id
     WHERE l.id IN (${placeholders})
       AND (l.user_id = ? OR (
         c.is_shared = 1 AND (
           c.share_scope = 'all'
           OR EXISTS (SELECT 1 FROM category_shares cs WHERE cs.category_id = c.id AND cs.user_id = ?)
         )
       ))`,
    [...ids, userId, userId]
  );
  const allowed = new Set(rows.map(row => Number(row.id)));
  return ids.filter(id => allowed.has(id));
}

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
             AND (l.user_id = ? OR (
               c.is_shared = 1 AND (
                 c.share_scope = 'all'
                 OR EXISTS (SELECT 1 FROM category_shares cs WHERE cs.category_id = c.id AND cs.user_id = ?)
               )
             ))
           ORDER BY wl.sort_order, wl.link_id`,
          [w.id, req.user.id, req.user.id]
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
    const validLinkIds = await getValidWorkspaceLinkIds(link_ids, req.user.id);
    if (validLinkIds.length !== new Set((Array.isArray(link_ids) ? link_ids : []).map(Number)).size) {
      return res.status(400).json({ error: '선택한 링크 중 접근할 수 없는 링크가 있습니다. 목록을 새로고침해 주세요.' });
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [r] = await conn.execute(
        'INSERT INTO workspaces (name, sort_order, user_id) VALUES (?, ?, ?)',
        [name.trim(), sort_order, req.user.id]
      );
      for (let i = 0; i < validLinkIds.length; i++) {
        await conn.execute(
          'INSERT INTO workspace_links (workspace_id, link_id, sort_order) VALUES (?, ?, ?)',
          [r.insertId, validLinkIds[i], i]
        );
      }
      await conn.commit();
      res.status(201).json({ id: r.insertId, name: name.trim(), sort_order, links: [] });
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
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
    const validLinkIds = link_ids !== undefined ? await getValidWorkspaceLinkIds(link_ids, req.user.id) : null;
    if (validLinkIds && validLinkIds.length !== new Set((Array.isArray(link_ids) ? link_ids : []).map(Number)).size) {
      return res.status(400).json({ error: '선택한 링크 중 접근할 수 없는 링크가 있습니다. 목록을 새로고침해 주세요.' });
    }
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      if (name !== undefined && name !== null && String(name).trim()) {
        await conn.execute('UPDATE workspaces SET name = ? WHERE id = ? AND user_id = ?', [String(name).trim(), id, req.user.id]);
      }
      if (validLinkIds) {
        await conn.execute('DELETE FROM workspace_links WHERE workspace_id = ?', [id]);
        for (let i = 0; i < validLinkIds.length; i++) {
          await conn.execute(
            'INSERT INTO workspace_links (workspace_id, link_id, sort_order) VALUES (?, ?, ?)',
            [id, validLinkIds[i], i]
          );
        }
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

// ----- 메모 API -----
app.get('/api/memo-groups', authenticate, async (req, res) => {
  try {
    const rows = await query(
      `SELECT g.*, COUNT(m.id) AS memo_count
       FROM memo_groups g
       LEFT JOIN memos m ON m.group_id = g.id AND m.user_id = ?
       WHERE g.user_id = ?
       GROUP BY g.id
       ORDER BY g.sort_order, g.id`,
      [req.user.id, req.user.id]
    );
    res.json(rows.map(row => ({ ...row, memo_count: Number(row.memo_count || 0) })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/memo-groups', authenticate, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: '그룹 이름을 입력해 주세요.' });
    const orderRows = await query('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM memo_groups WHERE user_id = ?', [req.user.id]);
    const result = await query(
      'INSERT INTO memo_groups (name, sort_order, user_id) VALUES (?, ?, ?)',
      [name, Number(orderRows[0]?.next_order || 0), req.user.id]
    );
    res.status(201).json({ id: result.insertId, name });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/memo-groups/:id', authenticate, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: '그룹 이름을 입력해 주세요.' });
    const [result] = await pool.execute(
      'UPDATE memo_groups SET name = ? WHERE id = ? AND user_id = ?',
      [name, req.params.id, req.user.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: '메모 그룹을 찾을 수 없습니다.' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/memo-groups/:id', authenticate, async (req, res) => {
  try {
    const [result] = await pool.execute(
      'DELETE FROM memo_groups WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: '메모 그룹을 찾을 수 없습니다.' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 저장 전 임시 업로드(memo_id NULL) 상태였던 첨부파일을 실제 메모에 연결.
// uploaded_by=userId 조건으로 남의 첨부파일을 가로채 붙이는 걸 막고, memo_id IS NULL 조건으로 이미 다른 메모에 붙은 걸 재사용하는 것도 막음.
async function linkPendingMemoAttachments(memoId, attachmentIds, userId) {
  if (!Array.isArray(attachmentIds) || !attachmentIds.length) return;
  const ids = [...new Set(attachmentIds.map(Number).filter(Number.isInteger))];
  if (!ids.length) return;
  const placeholders = ids.map(() => '?').join(',');
  await query(
    `UPDATE memo_attachments SET memo_id = ? WHERE id IN (${placeholders}) AND uploaded_by = ? AND memo_id IS NULL`,
    [memoId, ...ids, userId]
  );
}

// 메모 삭제 시 DB 행은 FK CASCADE로 같이 지워지지만 디스크의 실제 파일은 남으므로 먼저 지워줘야 함
async function deleteMemoAttachmentFiles(memoId) {
  const rows = await query('SELECT filename FROM memo_attachments WHERE memo_id = ?', [memoId]);
  for (const row of rows) {
    const filePath = path.join(MEMO_ATTACH_DIR, row.filename);
    if (fs.existsSync(filePath)) { try { fs.unlinkSync(filePath); } catch (_) {} }
  }
}

app.get('/api/memos', authenticate, async (req, res) => {
  try {
    const groupId = Number(req.query.group_id);
    const params = [req.user.id];
    let sql = `SELECT m.*, g.name AS group_name,
                      (SELECT COUNT(*) FROM memo_attachments a WHERE a.memo_id = m.id) AS attachment_count
               FROM memos m
               JOIN memo_groups g ON g.id = m.group_id
               WHERE m.user_id = ?`;
    if (Number.isInteger(groupId) && groupId > 0) {
      sql += ' AND m.group_id = ?';
      params.push(groupId);
    }
    sql += ' ORDER BY m.updated_at DESC, m.id DESC';
    const rows = await query(sql, params);
    res.json(rows.map(row => ({ ...row, attachment_count: Number(row.attachment_count || 0) })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/memos', authenticate, async (req, res) => {
  try {
    const groupId = Number(req.body.group_id);
    const title = String(req.body.title || '').trim();
    const content = String(req.body.content || '').trim();
    if (!title) return res.status(400).json({ error: '메모 제목을 입력해 주세요.' });
    const groups = await query('SELECT id FROM memo_groups WHERE id = ? AND user_id = ?', [groupId, req.user.id]);
    if (!groups.length) return res.status(403).json({ error: '접근할 수 없는 메모 그룹입니다.' });
    const result = await query(
      'INSERT INTO memos (group_id, title, content, user_id) VALUES (?, ?, ?, ?)',
      [groupId, title, content || null, req.user.id]
    );
    await linkPendingMemoAttachments(result.insertId, req.body.attachment_ids, req.user.id);
    res.status(201).json({ id: result.insertId, group_id: groupId, title, content });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/memos/:id', authenticate, async (req, res) => {
  try {
    const groupId = Number(req.body.group_id);
    const title = String(req.body.title || '').trim();
    const content = String(req.body.content || '').trim();
    if (!title) return res.status(400).json({ error: '메모 제목을 입력해 주세요.' });
    const groups = await query('SELECT id FROM memo_groups WHERE id = ? AND user_id = ?', [groupId, req.user.id]);
    if (!groups.length) return res.status(403).json({ error: '접근할 수 없는 메모 그룹입니다.' });
    const [result] = await pool.execute(
      'UPDATE memos SET group_id = ?, title = ?, content = ? WHERE id = ? AND user_id = ?',
      [groupId, title, content || null, req.params.id, req.user.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: '메모를 찾을 수 없습니다.' });
    await linkPendingMemoAttachments(req.params.id, req.body.attachment_ids, req.user.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/memos/:id', authenticate, async (req, res) => {
  try {
    const memos = await query('SELECT id FROM memos WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!memos.length) return res.status(404).json({ error: '메모를 찾을 수 없습니다.' });
    await deleteMemoAttachmentFiles(req.params.id);
    await pool.execute('DELETE FROM memos WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── 메모 첨부파일 ──
// 파일 자체는 업로드 시점에 바로 저장하고(memo_id는 NULL), 메모를 저장할 때 attachment_ids로 연결한다.
// 그래야 "새 메모 작성 중" 드래그앤드롭/붙여넣기로 올린 파일도 메모 id가 없는 상태에서 바로 업로드 진행률을 보여줄 수 있음.
app.post('/api/memo-attachments', authenticate, (req, res, next) => {
  memoAttachUpload.array('files', MEMO_ATTACH_MAX_COUNT)(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `파일이 너무 큽니다. (파일당 최대 ${MEMO_ATTACH_MAX_SIZE / 1024 / 1024}MB)` });
      if (err.code === 'LIMIT_FILE_COUNT') return res.status(413).json({ error: `한 번에 최대 ${MEMO_ATTACH_MAX_COUNT}개까지 첨부할 수 있습니다.` });
      console.error('POST /api/memo-attachments', err);
      return res.status(500).json({ error: err.message || '업로드 실패' });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.files || !req.files.length) return res.status(400).json({ error: '첨부할 파일이 없습니다.' });

    // memo_id가 같이 왔으면(기존 메모 수정 중 첨부) 그 자리에서 바로 연결, 단 내 메모여야 함
    let memoId = null;
    if (req.body.memo_id) {
      const memos = await query('SELECT id FROM memos WHERE id = ? AND user_id = ?', [Number(req.body.memo_id), req.user.id]);
      if (memos.length) memoId = memos[0].id;
    }

    const created = [];
    for (const file of req.files) {
      if ((file.mimetype || '').startsWith('image/')) await compressImageFile(file.path);
      const finalSize = fs.existsSync(file.path) ? fs.statSync(file.path).size : file.size;
      const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      const result = await query(
        `INSERT INTO memo_attachments (memo_id, filename, original_name, file_size, file_type, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [memoId, file.filename, originalName, finalSize, file.mimetype || null, req.user.id]
      );
      created.push({ id: result.insertId, original_name: originalName, file_size: finalSize, file_type: file.mimetype || null, created_at: new Date().toISOString(), url: `/memo-uploads/${file.filename}` });
    }
    res.status(201).json({ attachments: created });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/memos/:id/attachments', authenticate, async (req, res) => {
  try {
    const memos = await query('SELECT id FROM memos WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    if (!memos.length) return res.status(404).json({ error: '메모를 찾을 수 없습니다.' });
    const rows = await query(
      'SELECT id, filename, original_name, file_size, file_type, created_at FROM memo_attachments WHERE memo_id = ? ORDER BY id',
      [req.params.id]
    );
    res.json(rows.map(r => ({ ...r, url: `/memo-uploads/${r.filename}`, filename: undefined })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

async function loadOwnedMemoAttachment(attachmentId, userId) {
  const rows = await query(
    `SELECT a.* FROM memo_attachments a
     LEFT JOIN memos m ON m.id = a.memo_id
     WHERE a.id = ? AND (a.memo_id IS NULL AND a.uploaded_by = ? OR m.user_id = ?)`,
    [attachmentId, userId, userId]
  );
  return rows[0] || null;
}

app.get('/api/memo-attachments/:id/file', authenticate, async (req, res) => {
  try {
    const att = await loadOwnedMemoAttachment(req.params.id, req.user.id);
    if (!att) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    const filePath = path.join(MEMO_ATTACH_DIR, att.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '파일이 존재하지 않습니다.' });
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(att.original_name)}`);
    res.setHeader('Content-Type', att.file_type || 'application/octet-stream');
    res.setHeader('Content-Length', att.file_size);
    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/memo-attachments/:id', authenticate, async (req, res) => {
  try {
    const att = await loadOwnedMemoAttachment(req.params.id, req.user.id);
    if (!att) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    const filePath = path.join(MEMO_ATTACH_DIR, att.filename);
    await query('DELETE FROM memo_attachments WHERE id = ?', [att.id]);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 메모 저장 없이 파일만 올려놓고 취소/이탈한 경우를 대비한 청소 - 24시간 넘은 미연결(memo_id NULL) 첨부는 정리
async function cleanupOrphanMemoAttachments() {
  try {
    const rows = await query(
      "SELECT id, filename FROM memo_attachments WHERE memo_id IS NULL AND created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)"
    );
    for (const row of rows) {
      const filePath = path.join(MEMO_ATTACH_DIR, row.filename);
      if (fs.existsSync(filePath)) { try { fs.unlinkSync(filePath); } catch (_) {} }
      await query('DELETE FROM memo_attachments WHERE id = ?', [row.id]);
    }
    if (rows.length) console.log(`[memo-attachments] 미연결 첨부파일 ${rows.length}개 정리`);
  } catch (e) {
    console.error('cleanupOrphanMemoAttachments', e.message);
  }
}
setInterval(cleanupOrphanMemoAttachments, 60 * 60 * 1000);

function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return null;
}

// ----- 관리자 API -----
app.get('/api/admin/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const rows = await query(
      'SELECT id, username, name, department, role, can_explorer, created_at FROM users ORDER BY id'
    );
    res.json(rows.map(r => ({ ...r, role: r.role || 'user', can_explorer: r.can_explorer ?? 1 })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/admin/users/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { role, name, department, can_explorer } = req.body;
    const id = Number(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: '자신의 권한은 변경할 수 없습니다.' });
    const targetRows = await query('SELECT username FROM users WHERE id = ?', [id]);
    if (!targetRows || targetRows.length === 0) return res.status(404).json({ error: '사용자를 찾을 수 없습니다.' });
    if (role === 'admin' && String(targetRows[0].username).trim().toLowerCase() === 'tdc2428') {
      return res.status(400).json({ error: 'tdc2428 계정은 일반 사용자로 유지됩니다.' });
    }
    const updates = [];
    const params = [];
    if (role !== undefined) { updates.push('role = ?'); params.push(role === 'admin' ? 'admin' : 'user'); }
    if (name !== undefined) { updates.push('name = ?'); params.push(String(name).trim()); }
    if (department !== undefined) { updates.push('department = ?'); params.push(department || null); }
    if (can_explorer !== undefined) { updates.push('can_explorer = ?'); params.push(can_explorer ? 1 : 0); }
    if (updates.length === 0) return res.status(400).json({ error: '변경할 내용이 없습니다.' });
    params.push(id);
    await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/users/:id/reset-password', authenticate, requireAdmin, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || String(newPassword).length < 4) {
      return res.status(400).json({ error: '새 비밀번호는 4자 이상이어야 합니다.' });
    }
    const hashed = await bcrypt.hash(String(newPassword), BCRYPT_ROUNDS);
    await query('UPDATE users SET password = ? WHERE id = ?', [hashed, req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/password-reset-requests', authenticate, requireAdmin, async (req, res) => {
  try {
    const rows = await query(
      `SELECT r.id, r.user_id, r.username, r.name, r.status, r.created_at, r.resolved_at,
              u.department, resolver.name AS resolved_by_name
       FROM password_reset_requests r
       LEFT JOIN users u ON u.id = r.user_id
       LEFT JOIN users resolver ON resolver.id = r.resolved_by
       ORDER BY (r.status = 'pending') DESC, r.created_at DESC
       LIMIT 200`
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/password-reset-requests/:id/approve', authenticate, requireAdmin, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || String(newPassword).length < 4) {
      return res.status(400).json({ error: '새 비밀번호는 4자 이상이어야 합니다.' });
    }
    const rows = await query('SELECT * FROM password_reset_requests WHERE id = ?', [req.params.id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: '요청을 찾을 수 없습니다.' });
    const reqRow = rows[0];
    if (reqRow.status !== 'pending') return res.status(400).json({ error: '이미 처리된 요청입니다.' });

    const hashed = await bcrypt.hash(String(newPassword), BCRYPT_ROUNDS);
    await query('UPDATE users SET password = ? WHERE id = ?', [hashed, reqRow.user_id]);
    await query(
      "UPDATE password_reset_requests SET status = 'approved', resolved_at = NOW(), resolved_by = ? WHERE id = ?",
      [req.user.id, reqRow.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/admin/password-reset-requests/:id/reject', authenticate, requireAdmin, async (req, res) => {
  try {
    const rows = await query('SELECT * FROM password_reset_requests WHERE id = ?', [req.params.id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: '요청을 찾을 수 없습니다.' });
    if (rows[0].status !== 'pending') return res.status(400).json({ error: '이미 처리된 요청입니다.' });

    await query(
      "UPDATE password_reset_requests SET status = 'rejected', resolved_at = NOW(), resolved_by = ? WHERE id = ?",
      [req.user.id, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/admin/users/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (id === req.user.id) return res.status(400).json({ error: '자신의 계정은 삭제할 수 없습니다.' });
    await query('DELETE FROM users WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/links', authenticate, requireAdmin, async (req, res) => {
  try {
    const rows = await query(
      `SELECT l.id, l.site_name, l.url, l.description, l.created_at,
              c.name AS category_name, u.name AS owner_name, u.username
       FROM links l
       LEFT JOIN categories c ON c.id = l.category_id
       LEFT JOIN users u ON u.id = l.user_id
       ORDER BY l.created_at DESC, l.id DESC`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/links/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM links WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: '링크를 찾을 수 없습니다.' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/categories', authenticate, requireAdmin, async (req, res) => {
  try {
    const rows = await query(
      `SELECT c.id, c.name, c.is_shared, c.share_scope, c.created_at,
              u.name AS owner_name, u.username, COUNT(l.id) AS item_count
       FROM categories c
       LEFT JOIN users u ON u.id = c.user_id
       LEFT JOIN links l ON l.category_id = c.id
       GROUP BY c.id
       ORDER BY c.created_at DESC, c.id DESC`
    );
    res.json(rows.map(row => ({ ...row, item_count: Number(row.item_count || 0) })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/categories/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM categories WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: '카테고리를 찾을 수 없습니다.' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/workspaces', authenticate, requireAdmin, async (req, res) => {
  try {
    const rows = await query(
      `SELECT w.id, w.name, w.created_at, u.name AS owner_name, u.username, COUNT(wl.link_id) AS item_count
       FROM workspaces w
       LEFT JOIN users u ON u.id = w.user_id
       LEFT JOIN workspace_links wl ON wl.workspace_id = w.id
       GROUP BY w.id
       ORDER BY w.created_at DESC, w.id DESC`
    );
    res.json(rows.map(row => ({ ...row, item_count: Number(row.item_count || 0) })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/workspaces/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.execute('DELETE FROM workspaces WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: '작업 그룹을 찾을 수 없습니다.' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/memos', authenticate, requireAdmin, async (req, res) => {
  try {
    const rows = await query(
      `SELECT m.id, m.title, m.content, m.created_at, m.updated_at,
              g.name AS group_name, u.name AS owner_name, u.username
       FROM memos m
       LEFT JOIN memo_groups g ON g.id = m.group_id
       LEFT JOIN users u ON u.id = m.user_id
       ORDER BY m.updated_at DESC, m.id DESC`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/memos/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await deleteMemoAttachmentFiles(req.params.id);
    const [result] = await pool.execute('DELETE FROM memos WHERE id = ?', [req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: '메모를 찾을 수 없습니다.' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/activity-logs', authenticate, requireAdmin, async (req, res) => {
  try {
    const requestedLimit = Number(req.query.limit || 300);
    const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : 300, 1000));
    const rows = await query(
      `SELECT id, user_id, username, method, path, action, status_code, ip_address, details, created_at
       FROM activity_logs
       ORDER BY created_at DESC, id DESC
       LIMIT ${limit}`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== 다운로드 센터 =====
// 카테고리
app.get('/api/download-categories', authenticate, async (req, res) => {
  try {
    const [me] = await query('SELECT role FROM users WHERE id = ?', [req.user.id]);
    const isAdmin = me?.role === 'admin';
    let rows;
    if (isAdmin) {
      rows = await query('SELECT * FROM download_categories ORDER BY sort_order, id');
    } else {
      rows = await query(
        `SELECT dc.* FROM download_categories dc
         WHERE dc.access_scope = 'all'
            OR EXISTS (SELECT 1 FROM download_category_access dca WHERE dca.category_id = dc.id AND dca.user_id = ?)
         ORDER BY dc.sort_order, dc.id`,
        [req.user.id]
      );
    }
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/download-categories', authenticate, async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: '이름을 입력해주세요.' });
  try {
    const [{ maxOrder }] = await query('SELECT COALESCE(MAX(sort_order),0) AS maxOrder FROM download_categories');
    const result = await query('INSERT INTO download_categories (name, sort_order) VALUES (?, ?)', [name.trim(), maxOrder + 1]);
    res.json({ id: result.insertId, name: name.trim(), sort_order: maxOrder + 1 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/download-categories/:id', authenticate, async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: '이름을 입력해주세요.' });
  try {
    await query('UPDATE download_categories SET name = ? WHERE id = ?', [name.trim(), req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/download-categories/:id', authenticate, async (req, res) => {
  try {
    await query('UPDATE download_files SET category_id = NULL WHERE category_id = ?', [req.params.id]);
    await query('DELETE FROM download_category_access WHERE category_id = ?', [req.params.id]);
    await query('DELETE FROM download_categories WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/download-categories/:id/access', authenticate, requireAdmin, async (req, res) => {
  try {
    const [cat] = await query('SELECT access_scope FROM download_categories WHERE id = ?', [req.params.id]);
    if (!cat) return res.status(404).json({ error: '카테고리를 찾을 수 없습니다.' });
    const access = await query('SELECT user_id FROM download_category_access WHERE category_id = ?', [req.params.id]);
    res.json({ access_scope: cat.access_scope, user_ids: access.map(r => r.user_id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/download-categories/:id/access', authenticate, requireAdmin, async (req, res) => {
  const { access_scope, user_ids } = req.body;
  const scope = access_scope === 'selected' ? 'selected' : 'all';
  try {
    await query('UPDATE download_categories SET access_scope = ? WHERE id = ?', [scope, req.params.id]);
    await query('DELETE FROM download_category_access WHERE category_id = ?', [req.params.id]);
    if (scope === 'selected' && Array.isArray(user_ids) && user_ids.length > 0) {
      for (const uid of user_ids) {
        await query('INSERT IGNORE INTO download_category_access (category_id, user_id) VALUES (?, ?)', [req.params.id, uid]);
      }
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// 파일 목록
app.get('/api/downloads', authenticate, async (req, res) => {
  try {
    const [me] = await query('SELECT role FROM users WHERE id = ?', [req.user.id]);
    const isAdmin = me?.role === 'admin';
    let rows;
    if (isAdmin) {
      rows = await query(
        `SELECT df.id, df.title, df.description, df.original_name, df.file_size, df.file_type,
                df.category_id, dc.name AS category_name, df.uploaded_by, df.created_at,
                u.name AS uploader_name
         FROM download_files df
         LEFT JOIN users u ON u.id = df.uploaded_by
         LEFT JOIN download_categories dc ON dc.id = df.category_id
         ORDER BY df.created_at DESC`
      );
    } else {
      rows = await query(
        `SELECT df.id, df.title, df.description, df.original_name, df.file_size, df.file_type,
                df.category_id, dc.name AS category_name, df.uploaded_by, df.created_at,
                u.name AS uploader_name
         FROM download_files df
         LEFT JOIN users u ON u.id = df.uploaded_by
         LEFT JOIN download_categories dc ON dc.id = df.category_id
         WHERE df.category_id IS NULL
            OR dc.access_scope = 'all'
            OR EXISTS (SELECT 1 FROM download_category_access dca WHERE dca.category_id = dc.id AND dca.user_id = ?)
         ORDER BY df.created_at DESC`,
        [req.user.id]
      );
    }
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/downloads', authenticate, downloadUpload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '파일을 선택해주세요.' });
  const { title, description, category_id } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: '제목을 입력해주세요.' });
  try {
    const catId = category_id ? Number(category_id) : null;
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const result = await query(
      `INSERT INTO download_files (title, description, filename, original_name, file_size, file_type, category_id, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [title.trim(), description?.trim() || null, req.file.filename, originalName, req.file.size, req.file.mimetype || null, catId, req.user.id]
    );
    res.json({ id: result.insertId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/downloads/:id', authenticate, async (req, res) => {
  const { title, description, category_id } = req.body;
  if (!title?.trim()) return res.status(400).json({ error: '제목을 입력해주세요.' });
  try {
    const catId = category_id ? Number(category_id) : null;
    await query(
      'UPDATE download_files SET title = ?, description = ?, category_id = ? WHERE id = ?',
      [title.trim(), description?.trim() || null, catId, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/downloads/:id/file', authenticate, async (req, res) => {
  try {
    const rows = await query('SELECT * FROM download_files WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    const file = rows[0];
    const filePath = path.join(DOWNLOAD_DIR, file.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '파일이 존재하지 않습니다.' });
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.original_name)}`);
    res.setHeader('Content-Type', file.file_type || 'application/octet-stream');
    res.setHeader('Content-Length', file.file_size);
    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/downloads/:id', authenticate, async (req, res) => {
  try {
    const rows = await query('SELECT filename FROM download_files WHERE id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    const filePath = path.join(DOWNLOAD_DIR, rows[0].filename);
    await query('DELETE FROM download_files WHERE id = ?', [req.params.id]);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

let serverStarted = false;
function startServer() {
  if (serverStarted) return;
  serverStarted = true;

  // SPA fallback - must be after all API routes
  if (fs.existsSync(CLIENT_DIST)) {
    app.get('*', (req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    const ip = getLocalIP();
    const addr = ip ? `http://${ip}:${PORT}` : `http://localhost:${PORT}`;
    console.log(`Elinko API server ${addr}`);
  });

  cleanupOrphanMemoAttachments();

  // 매주 월요일 오전 3시 자동 CSV 스캔
  cron.schedule('0 3 * * 1', async () => {
    console.log('[Scheduler] 주간 자동 스캔 시작');
    await scanFromCsv().catch(e => console.error('[Scheduler] CSV 스캔 실패:', e.message));
  });
}
initDb()
  .then(() => startServer())
  .catch((e) => {
    console.error('DB 초기화 실패:', e);
    startServer();
  });
