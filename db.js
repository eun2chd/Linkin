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

  await conn.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

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
  try {
    await conn.query('ALTER TABLE links MODIFY COLUMN site_image TEXT DEFAULT NULL');
  } catch (_) {}
  try {
    await conn.query('ALTER TABLE links ADD COLUMN note TEXT DEFAULT NULL');
  } catch (_) {}

  await conn.query(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
  await conn.end();
  console.log('DB 초기화 완료');
}

module.exports = { pool, query, initDb };
