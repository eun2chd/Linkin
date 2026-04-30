const fs = require('fs');
const path = require('path');
const { query, pool } = require('./db');

const SCAN_ROOT = 'Z:\\';
const CSV_PATH = path.join(__dirname, 'planningList.csv');

let scanRunning = false;
let lastScanResult = null;

// ─── CSV 파싱 ────────────────────────────────────────────────
function parseCsvLine(line) {
  const cols = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) { cols.push(cur); cur = ''; continue; }
    cur += ch;
  }
  cols.push(cur);
  return cols;
}

function parseKoreanDateTime(str) {
  if (!str) return null;
  try {
    const cleaned = str.trim().replace('오전', 'AM').replace('오후', 'PM');
    const m = cleaned.match(/(\d{4})-(\d{2})-(\d{2})\s+(AM|PM)\s+(\d+):(\d{2}):(\d{2})/);
    if (!m) return null;
    let [, yr, mo, dy, ampm, hr, mn, sc] = m;
    hr = parseInt(hr);
    if (ampm === 'AM' && hr === 12) hr = 0;
    if (ampm === 'PM' && hr !== 12) hr += 12;
    return new Date(yr, mo - 1, dy, hr, mn, sc);
  } catch { return null; }
}

// ─── UPSERT 핵심 로직 ────────────────────────────────────────
// scan_seq: 이번 스캔의 고유 번호. 스캔 후 이 번호가 없는 항목은 삭제됨.

async function getScanSeq() {
  // file_nodes 테이블에 scan_seq 컬럼이 없으면 추가
  try {
    await query('ALTER TABLE file_nodes ADD COLUMN scan_seq INT DEFAULT 0');
  } catch (_) {} // 이미 있으면 무시
  const rows = await query('SELECT MAX(scan_seq) as max_seq FROM file_nodes');
  return ((rows[0].max_seq) || 0) + 1;
}

// full_path 기준으로 upsert 후 해당 id 반환
async function upsertNode({ parentId, rootId, name, fullPath, isFolder, size, modified, scanSeq }) {
  const r = await query(
    `INSERT INTO file_nodes (parent_id, root_id, name, full_path, is_folder, size, modified, scan_seq)
     VALUES (?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       parent_id = VALUES(parent_id),
       root_id = COALESCE(VALUES(root_id), root_id),
       name = VALUES(name),
       is_folder = VALUES(is_folder),
       size = VALUES(size),
       modified = VALUES(modified),
       scan_seq = VALUES(scan_seq),
       id = LAST_INSERT_ID(id)`,
    [parentId, rootId ?? null, name, fullPath, isFolder ? 1 : 0, size ?? null, modified ?? null, scanSeq]
  );
  const id = r.insertId;
  if (parentId == null && isFolder) {
    await query('UPDATE file_nodes SET root_id = ? WHERE id = ? AND (root_id IS NULL OR root_id = 0)', [id, id]);
  }
  return id;
}

// ─── 1. CSV 임포트 (UPSERT) ──────────────────────────────────
async function scanFromCsv(csvPath = CSV_PATH) {
  if (scanRunning) throw new Error('이미 스캔 중입니다.');
  scanRunning = true;
  const start = Date.now();
  console.log('[Scanner] CSV 임포트 시작:', csvPath);

  try {
    const scanSeq = await getScanSeq();
    const raw = fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, '');
    const lines = raw.split(/\r?\n/).filter(Boolean);

    // 경로 → id 캐시
    const pathToId = new Map();

    // 헤더 스킵 후 깊이 오름차순 정렬 (부모 → 자식 순)
    const rows = lines.slice(1)
      .map(l => parseCsvLine(l))
      .filter(c => c[0] && c[0].startsWith('Z:\\'))
      .sort((a, b) => a[0].split('\\').length - b[0].split('\\').length);

    // 최상위 폴더들 (Z:\XXX) upsert
    const topFolders = new Set();
    for (const cols of rows) {
      const segs = cols[0].split('\\');
      if (segs.length >= 2) topFolders.add(segs[1]);
    }
    for (const folderName of topFolders) {
      const fp = 'Z:\\' + folderName;
      const id = await upsertNode({ parentId: null, rootId: null, name: folderName, fullPath: fp, isFolder: true, scanSeq });
      pathToId.set(fp, id);
    }

    let count = topFolders.size;
    const BATCH = 300;
    let fileBatch = [];

    const flushFiles = async () => {
      if (!fileBatch.length) return;
      const placeholders = fileBatch.map(() => '(?,?,?,?,0,?,?,?)').join(',');
      const vals = fileBatch.flatMap(b => b);
      await query(
        `INSERT INTO file_nodes (parent_id, root_id, name, full_path, is_folder, size, modified, scan_seq) VALUES ${placeholders}
         ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id), root_id=VALUES(root_id), size=VALUES(size), modified=VALUES(modified), scan_seq=VALUES(scan_seq)`,
        vals
      );
      fileBatch = [];
    };

    for (const cols of rows) {
      const fullPath = cols[0].trim();
      const name = cols[1]?.trim() || path.basename(fullPath);
      const sizeRaw = cols[2]?.trim();
      const isFolder = !sizeRaw;
      const size = sizeRaw ? parseInt(sizeRaw) || null : null;
      const modifiedObj = parseKoreanDateTime(cols[3]);
      const modified = modifiedObj ? modifiedObj.toISOString().slice(0, 19).replace('T', ' ') : null;

      const parentPath = fullPath.substring(0, fullPath.lastIndexOf('\\'));
      let parentId = pathToId.get(parentPath) || null;
      const segs = fullPath.split('\\');
      const rootPath = segs.length >= 2 ? `Z:\\${segs[1]}` : fullPath;
      const rootId = pathToId.get(rootPath) || null;

      if (!parentId && parentPath && parentPath !== 'Z:') {
        const id = await upsertNode({
          parentId: null,
          rootId,
          name: path.basename(parentPath),
          fullPath: parentPath,
          isFolder: true,
          scanSeq,
        });
        pathToId.set(parentPath, id);
        parentId = id;
      }

      if (isFolder) {
        await flushFiles();
        const id = await upsertNode({ parentId, rootId, name, fullPath, isFolder: true, scanSeq });
        pathToId.set(fullPath, id);
      } else {
        fileBatch.push([parentId, rootId, name, fullPath, size, modified, scanSeq]);
        if (fileBatch.length >= BATCH) await flushFiles();
      }
      count++;
    }
    await flushFiles();

    // 이번 스캔에 없던 항목 = 삭제된 파일/폴더 → DB에서 제거
    const deleted = await query('DELETE FROM file_nodes WHERE scan_seq < ?', [scanSeq]);
    const deletedCount = deleted.affectedRows || 0;

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    lastScanResult = { type: 'csv', count, deleted: deletedCount, elapsed, time: new Date() };
    console.log(`[Scanner] CSV 완료: ${count}개 upsert, ${deletedCount}개 삭제, ${elapsed}초`);
    return lastScanResult;
  } finally {
    scanRunning = false;
  }
}

// ─── 2. Z:\ 직접 스캔 (UPSERT) ───────────────────────────────
async function scanFromDisk(root = SCAN_ROOT) {
  if (scanRunning) throw new Error('이미 스캔 중입니다.');
  if (!fs.existsSync(root)) throw new Error(`경로에 접근할 수 없습니다: ${root}`);
  scanRunning = true;
  const start = Date.now();
  console.log('[Scanner] 디스크 스캔 시작:', root);

  try {
    const scanSeq = await getScanSeq();

    // BFS (너비 우선) — 스택 오버플로 방지
    const queue = [{ dirPath: root, parentId: null, rootId: null }];
    let count = 0;

    while (queue.length > 0) {
      const { dirPath, parentId, rootId } = queue.shift();
      let entries;
      try {
        entries = fs.readdirSync(dirPath, { withFileTypes: true });
      } catch (e) {
        console.warn('[Scanner] 접근 불가:', dirPath, e.message);
        continue;
      }

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const isFolder = entry.isDirectory();
        let size = null, modified = null;
        if (!isFolder) {
          try {
            const st = fs.statSync(fullPath);
            size = st.size;
            modified = st.mtime.toISOString().slice(0, 19).replace('T', ' ');
          } catch (_) {}
        }

        const id = await upsertNode({
          parentId, name: entry.name, fullPath,
          rootId, isFolder, size, modified, scanSeq,
        });
        count++;
        if (count % 5000 === 0) console.log(`[Scanner] 디스크 진행: ${count.toLocaleString()}개 처리`);

        if (isFolder) queue.push({ dirPath: fullPath, parentId: id, rootId: rootId || (parentId == null ? id : null) });
      }
    }

    // 이번 스캔에 없던 항목 삭제 (실제로 없어진 파일/폴더)
    const deleted = await query('DELETE FROM file_nodes WHERE scan_seq < ?', [scanSeq]);
    const deletedCount = deleted.affectedRows || 0;

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    lastScanResult = { type: 'disk', count, deleted: deletedCount, elapsed, time: new Date() };
    console.log(`[Scanner] 디스크 완료: ${count}개 upsert, ${deletedCount}개 삭제, ${elapsed}초`);
    return lastScanResult;
  } finally {
    scanRunning = false;
  }
}

function getScanStatus() {
  return { running: scanRunning, last: lastScanResult };
}

module.exports = { scanFromCsv, scanFromDisk, getScanStatus, SCAN_ROOT, CSV_PATH };
