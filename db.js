const mysql = require('mysql2/promise');

const DB_CONNECT_TIMEOUT_MS = Number(process.env.DB_CONNECT_TIMEOUT_MS || 5000);
const DB_INIT_RETRY_COUNT = Number(process.env.DB_INIT_RETRY_COUNT || 3);
const DB_INIT_RETRY_DELAY_MS = Number(process.env.DB_INIT_RETRY_DELAY_MS || 2000);

const dbConfig = {
  host: process.env.DB_HOST || '218.235.89.145',
  port: Number(process.env.DB_PORT || 50003),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '1234',
  database: 'link',
  charset: 'utf8mb4',
  connectTimeout: DB_CONNECT_TIMEOUT_MS,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

const pool = mysql.createPool(dbConfig);

async function query(sql, params = []) {
  const [rows] = await pool.execute(sql, params);
  return rows;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createAdminConnectionWithRetry() {
  const safeUser = dbConfig.user ? `'${dbConfig.user}'` : '(empty)';
  console.log(
    `[DB] connecting to ${dbConfig.host}:${dbConfig.port} as ${safeUser} (timeout=${DB_CONNECT_TIMEOUT_MS}ms, retries=${DB_INIT_RETRY_COUNT})`
  );

  let lastError;
  for (let attempt = 1; attempt <= DB_INIT_RETRY_COUNT; attempt += 1) {
    try {
      console.log(`[DB] connect attempt ${attempt}/${DB_INIT_RETRY_COUNT}`);
      return await mysql.createConnection({
        host: dbConfig.host,
        port: dbConfig.port,
        user: dbConfig.user,
        password: dbConfig.password,
        charset: 'utf8mb4',
        connectTimeout: DB_CONNECT_TIMEOUT_MS,
      });
    } catch (error) {
      lastError = error;
      console.error(
        `[DB] connect failed (attempt ${attempt}/${DB_INIT_RETRY_COUNT}) code=${error.code || 'UNKNOWN'} message=${error.message}`
      );
      if (attempt < DB_INIT_RETRY_COUNT) {
        await sleep(DB_INIT_RETRY_DELAY_MS * attempt);
      }
    }
  }

  throw lastError;
}

async function initDb() {
  const conn = await createAdminConnectionWithRetry();
  await conn.query(`
    CREATE DATABASE IF NOT EXISTS link
    DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  await conn.query('USE link');

  // users 테이블
  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      name VARCHAR(50) NOT NULL,
      department VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // categories 테이블
  await conn.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try { await conn.query("ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'user'"); } catch (_) {}
  try { await conn.query("UPDATE users SET role = 'user' WHERE LOWER(TRIM(username)) = 'tdc2428'"); } catch (_) {}
  try {
    await conn.query(`
      UPDATE users
      SET role = 'admin'
      WHERE id = (
        SELECT min_id FROM (
          SELECT MIN(id) AS min_id FROM users WHERE LOWER(TRIM(username)) <> 'tdc2428'
        ) t
      )
      AND NOT EXISTS (
        SELECT 1 FROM (SELECT role FROM users WHERE role = 'admin') admins
      )
    `);
  } catch (_) {}
  try { await conn.query("ALTER TABLE users ADD COLUMN can_explorer TINYINT(1) NOT NULL DEFAULT 0"); } catch (_) {}
  try { await conn.query("ALTER TABLE users ALTER COLUMN can_explorer SET DEFAULT 0"); } catch (_) {}

  // 비밀번호 재설정 요청 (관리자 승인제)
  await conn.query(`
    CREATE TABLE IF NOT EXISTS password_reset_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      username VARCHAR(50) NOT NULL,
      name VARCHAR(50) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      resolved_at TIMESTAMP NULL DEFAULT NULL,
      resolved_by INT DEFAULT NULL,
      INDEX idx_prr_status (status, created_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (resolved_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  try { await conn.query('ALTER TABLE categories ADD COLUMN user_id INT DEFAULT NULL'); } catch (_) {}
  try { await conn.query('ALTER TABLE categories ADD COLUMN is_shared TINYINT(1) DEFAULT 0'); } catch (_) {}
  try { await conn.query("ALTER TABLE categories ADD COLUMN share_scope VARCHAR(20) NOT NULL DEFAULT 'all'"); } catch (_) {}
  // 카테고리 뎁스(대/중/소메뉴): parent_id로 최대 3단계 트리 구성
  try { await conn.query('ALTER TABLE categories ADD COLUMN parent_id INT DEFAULT NULL'); } catch (_) {}
  try { await conn.query('ALTER TABLE categories ADD COLUMN depth TINYINT NOT NULL DEFAULT 1'); } catch (_) {}
  try { await conn.query('ALTER TABLE categories ADD INDEX idx_categories_parent (parent_id)'); } catch (_) {}
  try { await conn.query('ALTER TABLE categories ADD CONSTRAINT fk_categories_parent FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE CASCADE'); } catch (_) {}

  await conn.query(`
    CREATE TABLE IF NOT EXISTS category_shares (
      category_id INT NOT NULL,
      user_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (category_id, user_id),
      INDEX idx_category_shares_user (user_id),
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // links 테이블
  await conn.query(`
    CREATE TABLE IF NOT EXISTS links (
      id INT AUTO_INCREMENT PRIMARY KEY,
      category_id INT NOT NULL,
      url VARCHAR(2048) NOT NULL,
      site_name VARCHAR(200) NOT NULL,
      site_image TEXT DEFAULT NULL,
      description TEXT,
      note TEXT DEFAULT NULL,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    )
  `);
  try { await conn.query('ALTER TABLE links MODIFY COLUMN site_image TEXT DEFAULT NULL'); } catch (_) {}
  try { await conn.query('ALTER TABLE links ADD COLUMN note TEXT DEFAULT NULL'); } catch (_) {}
  try { await conn.query('ALTER TABLE links ADD COLUMN user_id INT DEFAULT NULL'); } catch (_) {}
  try { await conn.query('ALTER TABLE links ADD COLUMN bg_color VARCHAR(20) DEFAULT NULL'); } catch (_) {}
  try { await conn.query('ALTER TABLE links ADD COLUMN bg_image TEXT DEFAULT NULL'); } catch (_) {}

  // 링크(사이트)당 여러 개 저장 가능한 계정 정보 - 비밀번호는 암호화 저장, 비공유 시 열람용 비밀번호 별도
  await conn.query(`
    CREATE TABLE IF NOT EXISTS link_accounts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      link_id INT NOT NULL,
      name VARCHAR(100) NOT NULL,
      username VARCHAR(255) NOT NULL,
      password_enc TEXT NOT NULL,
      is_shared TINYINT(1) NOT NULL DEFAULT 1,
      view_password_hash VARCHAR(255) DEFAULT NULL,
      user_id INT NOT NULL,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_link_accounts_link (link_id),
      FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS link_favorites (
      user_id INT NOT NULL,
      link_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, link_id),
      INDEX idx_link_favorites_link (link_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE CASCADE
    )
  `);

  // workspaces 테이블
  await conn.query(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try { await conn.query('ALTER TABLE workspaces ADD COLUMN user_id INT DEFAULT NULL'); } catch (_) {}

  await conn.query(`
    CREATE TABLE IF NOT EXISTS memo_groups (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      user_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_memo_groups_user (user_id, sort_order),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS memos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      group_id INT NOT NULL,
      title VARCHAR(200) NOT NULL,
      content TEXT,
      user_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_memos_user_group (user_id, group_id),
      FOREIGN KEY (group_id) REFERENCES memo_groups(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  // 메모 첨부파일 - memo_id가 NULL인 동안은 "저장 전 임시 업로드" 상태 (메모 저장 시점에 연결됨)
  await conn.query(`
    CREATE TABLE IF NOT EXISTS memo_attachments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      memo_id INT DEFAULT NULL,
      filename VARCHAR(500) NOT NULL,
      original_name VARCHAR(500) NOT NULL,
      file_size BIGINT NOT NULL DEFAULT 0,
      file_type VARCHAR(100) DEFAULT NULL,
      uploaded_by INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_memo_attach_memo (memo_id),
      INDEX idx_memo_attach_uploader (uploaded_by),
      FOREIGN KEY (memo_id) REFERENCES memos(id) ON DELETE CASCADE,
      FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS activity_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id INT DEFAULT NULL,
      username VARCHAR(50) DEFAULT NULL,
      method VARCHAR(10) NOT NULL,
      path VARCHAR(500) NOT NULL,
      action VARCHAR(100) NOT NULL,
      status_code INT NOT NULL,
      ip_address VARCHAR(100) DEFAULT NULL,
      details JSON DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_activity_logs_created (created_at),
      INDEX idx_activity_logs_user (user_id, created_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  // file_nodes: 계층형 파일/폴더 트리
  await conn.query(`
    CREATE TABLE IF NOT EXISTS file_nodes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      parent_id INT DEFAULT NULL,
      root_id INT DEFAULT NULL,
      name VARCHAR(500) NOT NULL,
      full_path VARCHAR(2000) NOT NULL,
      is_folder TINYINT(1) DEFAULT 0,
      size BIGINT DEFAULT NULL,
      modified DATETIME DEFAULT NULL,
      access_scope VARCHAR(20) DEFAULT 'all',
      access_department VARCHAR(100) DEFAULT NULL,
      scan_seq INT DEFAULT 0,
      scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_parent (parent_id),
      INDEX idx_root (root_id),
      INDEX idx_path (full_path(255))
    )
  `);
  try { await conn.query("ALTER TABLE file_nodes ADD COLUMN root_id INT DEFAULT NULL"); } catch (_) {}
  try { await conn.query("ALTER TABLE file_nodes ADD COLUMN access_scope VARCHAR(20) DEFAULT 'all'"); } catch (_) {}
  try { await conn.query("ALTER TABLE file_nodes ADD COLUMN access_department VARCHAR(100) DEFAULT NULL"); } catch (_) {}
  try { await conn.query("ALTER TABLE file_nodes ADD INDEX idx_root (root_id)"); } catch (_) {}
  try { await conn.query("UPDATE file_nodes SET root_id = id WHERE parent_id IS NULL AND (root_id IS NULL OR root_id = 0)"); } catch (_) {}
  // 기존 데이터의 하위 노드 root_id 보정 (권한 조인 누락 방지)
  try {
    await conn.query(`
      UPDATE file_nodes n
      JOIN file_nodes r
        ON r.parent_id IS NULL
       AND SUBSTRING_INDEX(n.full_path, '\\\\', 2) = r.full_path
      SET n.root_id = r.id
      WHERE n.root_id IS NULL OR n.root_id = 0
    `);
  } catch (_) {}

  // 루트 폴더별 허용 부서(다중) ACL
  await conn.query(`
    CREATE TABLE IF NOT EXISTS file_root_departments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      root_node_id INT NOT NULL,
      department VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_root_department (root_node_id, department),
      INDEX idx_root_node (root_node_id)
    )
  `);
  // 기존 단일 access_department 값을 ACL 테이블로 1회 이관
  try {
    await conn.query(`
      INSERT IGNORE INTO file_root_departments (root_node_id, department)
      SELECT id, access_department
      FROM file_nodes
      WHERE parent_id IS NULL
        AND access_scope = 'department'
        AND access_department IS NOT NULL
        AND access_department <> ''
    `);
  } catch (_) {}

  // 파일 즐겨찾기
  await conn.query(`
    CREATE TABLE IF NOT EXISTS file_favorites (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      node_id INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_user_node (user_id, node_id)
    )
  `);

  // 유저별 최근 열람 파일 이력
  await conn.query(`
    CREATE TABLE IF NOT EXISTS file_recent_views (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      node_id INT NOT NULL,
      view_count INT NOT NULL DEFAULT 1,
      last_viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_user_recent_node (user_id, node_id),
      INDEX idx_user_recent (user_id, last_viewed_at)
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS workspace_links (
      workspace_id INT NOT NULL,
      link_id INT NOT NULL,
      sort_order INT DEFAULT 0,
      PRIMARY KEY (workspace_id, link_id),
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE CASCADE
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS download_categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      sort_order INT DEFAULT 0,
      access_scope VARCHAR(20) NOT NULL DEFAULT 'all',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  try { await conn.query("ALTER TABLE download_categories ADD COLUMN access_scope VARCHAR(20) NOT NULL DEFAULT 'all'"); } catch (_) {}

  await conn.query(`
    CREATE TABLE IF NOT EXISTS download_category_access (
      id INT AUTO_INCREMENT PRIMARY KEY,
      category_id INT NOT NULL,
      user_id INT NOT NULL,
      UNIQUE KEY uq_dca (category_id, user_id),
      INDEX idx_dca_cat (category_id),
      INDEX idx_dca_user (user_id)
    )
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS download_files (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      description TEXT DEFAULT NULL,
      filename VARCHAR(500) NOT NULL,
      original_name VARCHAR(500) NOT NULL,
      file_size BIGINT NOT NULL DEFAULT 0,
      file_type VARCHAR(100) DEFAULT NULL,
      category_id INT DEFAULT NULL,
      uploaded_by INT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_uploaded_by (uploaded_by),
      INDEX idx_category (category_id)
    )
  `);
  try { await conn.query("ALTER TABLE download_files ADD COLUMN category_id INT DEFAULT NULL"); } catch (_) {}

  await conn.end();
  console.log('DB 초기화 완료');
}

module.exports = { pool, query, initDb };
