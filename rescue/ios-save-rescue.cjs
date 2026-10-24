#!/usr/bin/env node
/* ============================================================
 * 松鼠大战 iOS 存档救援（离线，只读，不上传）
 *
 * 背景：企业签名证书被 Apple 吊销后，App 还在手机上、但打不开；
 * 存档还在 App 沙盒的
 *   Library/Application Support/com.ssdz.classic/save/progress.json
 * 里。这个脚本从 Xcode 导出的 .xcappdata 容器、Finder/iTunes 备份、
 * 或一个直接的 .json 里把存档找出来，生成可直接导入的
 * 「松鼠大战存档-救援-*.json」。
 *
 * 用法：
 *   node ios-save-rescue.cjs --container ~/Desktop/松鼠大战.xcappdata
 *   node ios-save-rescue.cjs --backup ~/Library/Application\ Support/MobileSync/Backup/<UDID>
 *   node ios-save-rescue.cjs --file ~/Desktop/progress.json
 *   node ios-save-rescue.cjs --scan ~/Desktop
 *
 * 可选：--out <目录>   输出目录（默认 ./ios-save-rescue-<时间>）
 *       --deep         额外扫描 WKWebView 的 localStorage（文件存档丢失时）
 *
 * 不依赖第三方包；备份模式优先用 Node 22.5+ 的 node:sqlite，
 * 没有就退回系统 sqlite3 命令。容器/单文件模式不需要 SQLite。
 * ============================================================ */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const SCRIPT_VERSION = '1.0.0';
const ENTERPRISE_ID = 'jp.co.rakuten-sec.iSPEED.Pushnotification.widgetapp.widgetkitextension';
const UNSIGNED_ID = 'com.ssdz.classic';
const SAVE_KEY = 'ssdz_save_v1';
const SAVE_DIR_REL = path.join('Library', 'Application Support', UNSIGNED_ID, 'save');
const MAX_SAVE_BYTES = 4 * 1024 * 1024;
const MAX_SCAN_FILES = 20000;

const ARGS = process.argv.slice(2);
const has = (name) => ARGS.includes(name);
const argValue = (name, fallback) => {
  const i = ARGS.indexOf(name);
  return i >= 0 && i + 1 < ARGS.length ? ARGS[i + 1] : fallback;
};

function fail(msg) {
  console.error('\n[x] ' + msg);
  process.exit(1);
}
function info(msg) { console.log('— ' + msg); }
function ok(msg) { console.log('✓ ' + msg); }
function warn(msg) { console.log('! ' + msg); }

function usage() {
  console.log(`松鼠大战 iOS 存档救援 v${SCRIPT_VERSION}

用法（四选一）：
  node ios-save-rescue.cjs --container <Xcode 导出的 .xcappdata 或容器目录>
  node ios-save-rescue.cjs --backup <Finder/iTunes 备份目录>
  node ios-save-rescue.cjs --file <progress.json>

可选：
  --out <目录>   输出目录（默认 ./ios-save-rescue-<时间>）
  --deep         额外扫描 WKWebView localStorage（文件存档丢失时）
  --scan <目录>  在目录里自动找 .xcappdata / 备份 / .json
  --help         显示本帮助

说明：
  · 只读本地文件，不联网、不上传；输出目录里是纯 JSON。
  · 企业版存档在 App 沙盒里，路径是
    Library/Application Support/com.ssdz.classic/save/progress.json
  · 不要删除手机上的旧 App，删除会连存档一起删除。
`);
}

function fmtBytes(n) {
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}
function fmtTime(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const d = new Date(n);
  const p = (x) => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' +
    p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}
function safeName(raw, max) {
  const s = String(raw == null ? '' : raw).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  return (s || '无名').slice(0, max || 24);
}
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function isObj(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function stableUnique(arr) {
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const key = x && x.absPath ? path.resolve(x.absPath) : JSON.stringify(x);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(x);
  }
  return out;
}
function relDisplay(base, abs) {
  try {
    const r = path.relative(base, abs);
    return r && !r.startsWith('..') ? r : abs;
  } catch (e) { return abs; }
}

/* ---------------- 存档校验 / 统计 ---------------- */

function maxLevelOf(save) {
  let lv = Math.max(0, num(save && save.level));
  if (isObj(save && save.__dualOther)) lv = Math.max(lv, num(save.__dualOther.level));
  if (isObj(save && save.__dualSaves)) {
    for (const slot of Object.values(save.__dualSaves)) {
      if (isObj(slot)) lv = Math.max(lv, num(slot.level));
    }
  }
  return lv;
}
function maxRebornOf(save) {
  let rb = Math.max(0, num(save && save.reborn));
  if (isObj(save && save.__dualOther)) rb = Math.max(rb, num(save.__dualOther.reborn));
  if (isObj(save && save.__dualSaves)) {
    for (const slot of Object.values(save.__dualSaves)) {
      if (isObj(slot)) rb = Math.max(rb, num(slot.reborn));
    }
  }
  return rb;
}
function maxAllWinsOf(save) {
  let n = Math.max(0, num(save && save.allWins));
  if (isObj(save && save.__dualOther)) n = Math.max(n, num(save.__dualOther.allWins));
  if (isObj(save && save.__dualSaves)) {
    for (const slot of Object.values(save.__dualSaves)) {
      if (isObj(slot)) n = Math.max(n, num(slot.allWins));
    }
  }
  return n;
}
function hasStages(save) {
  if (isObj(save && save.stages) && Object.keys(save.stages).length) return true;
  if (isObj(save && save.__dualOther) && isObj(save.__dualOther.stages) && Object.keys(save.__dualOther.stages).length) return true;
  if (isObj(save && save.__dualSaves)) {
    for (const slot of Object.values(save.__dualSaves)) {
      if (isObj(slot) && isObj(slot.stages) && Object.keys(slot.stages).length) return true;
    }
  }
  return false;
}
function isFresh(save) {
  return maxLevelOf(save) <= 1 && maxRebornOf(save) === 0 && maxAllWinsOf(save) === 0 && !hasStages(save);
}
/** 与游戏「系统 → 导入存档」的校验口径对齐；返回空字符串表示可导入。 */
function saveError(save) {
  if (!isObj(save)) return '不是 JSON 对象';
  if (typeof save.name !== 'string' || !save.name.trim()) return '缺少角色名 name';
  if (!Number.isFinite(Number(save.level))) return '缺少等级 level';
  if (!Array.isArray(save.weapons)) return '缺少武器数组 weapons';
  if (!Array.isArray(save.skills)) return '缺少技能数组 skills';
  if (!isObj(save.props)) return '缺少道具对象 props';
  const raw = JSON.stringify(save);
  if (raw.length > MAX_SAVE_BYTES) return '超过 4 MB 上限';
  return '';
}

/* ---------------- 候选存档 ---------------- */

function addCandidate(state, raw, meta) {
  const text = String(raw == null ? '' : raw).replace(/^\uFEFF/, '');
  let save = null;
  let parseError = '';
  try { save = JSON.parse(text); } catch (e) { parseError = String(e && e.message || e); }
  const err = parseError ? ('JSON 解析失败：' + parseError) : saveError(save);
  const c = {
    source: meta.source,
    kind: meta.kind || 'unknown',
    label: meta.label || meta.kind || '存档',
    absPath: meta.absPath || '',
    mtime: num(meta.mtime),
    size: Buffer.byteLength(text, 'utf8'),
    text,
    save,
    parseError,
    error: err,
    valid: !err,
    level: save ? maxLevelOf(save) : 0,
    reborn: save ? maxRebornOf(save) : 0,
    wins: save ? maxAllWinsOf(save) : 0,
    fresh: save ? isFresh(save) : false,
    savedAt: num(save && save.savedAt) || num(meta.mtime),
    name: save && typeof save.name === 'string' ? save.name : '',
  };
  state.push(c);
  return c;
}

/* ---------------- 容器目录 ---------------- */

function listFiles(root, filter, maxDepth) {
  const out = [];
  const stack = [{ dir: root, depth: 0 }];
  let seen = 0;
  while (stack.length) {
    const cur = stack.pop();
    if (cur.depth > (maxDepth || 16)) continue;
    let entries;
    try { entries = fs.readdirSync(cur.dir, { withFileTypes: true }); } catch (e) { continue; }
    for (const ent of entries) {
      const p = path.join(cur.dir, ent.name);
      if (ent.isSymbolicLink()) continue;
      if (ent.isDirectory()) {
        if (ent.name === '.git' || ent.name === 'node_modules' || ent.name === 'tmp') continue;
        stack.push({ dir: p, depth: cur.depth + 1 });
        continue;
      }
      if (!ent.isFile()) continue;
      if (++seen > MAX_SCAN_FILES) return out;
      if (filter(p, ent.name)) out.push(p);
    }
  }
  return out;
}

function collectFromContainer(root, state, deep) {
  const files = listFiles(root, (p, name) => /\.json$/i.test(name), 18);
  for (const file of files) {
    const base = path.basename(file);
    const low = file.split(path.sep).join('/').toLowerCase();
    if (/(^|\/)documents\//.test(low) && /\.json$/i.test(base)) {
      let raw;
      try { raw = fs.readFileSync(file, 'utf8'); } catch (e) { continue; }
      const st = safeStat(file);
      addCandidate(state, raw, { source: 'container', kind: 'export', label: 'Documents/' + base, absPath: file, mtime: st.mtimeMs });
      continue;
    }
    if (/(^|\/)save\/progress(\.[a-z0-9_-]+)?\.json$/i.test(low)) {
      let raw;
      try { raw = fs.readFileSync(file, 'utf8'); } catch (e) { continue; }
      const st = safeStat(file);
      const kind = /progress\.bak\.json$/i.test(base) ? 'backup'
        : /progress\.corrupt\.json$/i.test(base) ? 'corrupt'
          : /progress\.json$/i.test(base) ? 'main' : 'save';
      addCandidate(state, raw, { source: 'container', kind, label: relDisplay(root, file), absPath: file, mtime: st.mtimeMs });
    }
  }
  if (deep) collectFromLocalStorage(root, state);
}

function safeStat(file) {
  try { return fs.statSync(file); } catch (e) { return { mtimeMs: 0, size: 0 }; }
}

/* ---------------- WKWebView localStorage（可选） ---------------- */

function decodeStoredValue(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  const buf = Buffer.isBuffer(value) ? value : Buffer.from(value);
  if (!buf.length) return '';
  const tries = [];
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) tries.push(buf.subarray(2).toString('utf16le'));
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    const swapped = Buffer.from(buf.subarray(2));
    for (let i = 0; i + 1 < swapped.length; i += 2) { const t = swapped[i]; swapped[i] = swapped[i + 1]; swapped[i + 1] = t; }
    tries.push(swapped.toString('utf16le'));
  }
  tries.push(buf.toString('utf8'));
  tries.push(buf.toString('utf16le'));
  for (const text of tries) {
    const cleaned = text.replace(/^\uFEFF/, '').replace(/\u0000/g, '').trim();
    if (!cleaned) continue;
    const a = cleaned.indexOf('{');
    const b = cleaned.lastIndexOf('}');
    const candidate = a >= 0 && b > a ? cleaned.slice(a, b + 1) : cleaned;
    try { JSON.parse(candidate); return candidate; } catch (e) { /* next */ }
  }
  return '';
}

function collectFromLocalStorage(root, state) {
  const dbs = listFiles(root, (p, name) => /\.(sqlite|db|localstorage)$/i.test(name), 18)
    .filter((p) => /webkit|website|localstorage/i.test(p));
  for (const db of dbs) {
    for (const table of ['LocalStorage', 'ItemTable']) {
      const rows = sqliteRows(db, `SELECT key, value FROM ${table} WHERE key LIKE 'ssdz_%save_v1' LIMIT 5`);
      for (const row of rows) {
        const value = decodeStoredValue(row.value);
        if (!value) continue;
        const st = safeStat(db);
        const c = addCandidate(state, value, { source: 'localStorage', kind: 'localStorage', label: 'WKWebView localStorage ' + path.basename(db), absPath: db, mtime: st.mtimeMs });
        if (c.valid) info('在 ' + path.basename(db) + ' 里找到 localStorage 兜底存档（' + c.level + ' 级）');
      }
    }
  }
}

/* ---------------- SQLite 读取 ---------------- */

let sqliteWarned = false;
function loadNodeSqlite() {
  try { return require('node:sqlite'); } catch (e) { return null; }
}
function sqliteRows(dbPath, sql) {
  const nodeSqlite = loadNodeSqlite();
  if (nodeSqlite && nodeSqlite.DatabaseSync) {
    let db = null;
    try {
      db = new nodeSqlite.DatabaseSync(dbPath, { readOnly: true });
      return db.prepare(sql).all();
    } catch (e) {
      // 有些旧库不允许 readOnly 打开，退回默认模式（仍然只读 SQL）
      try {
        db = new nodeSqlite.DatabaseSync(dbPath);
        return db.prepare(sql).all();
      } catch (e2) {
        return [];
      }
    } finally {
      try { if (db) db.close(); } catch (e) {}
    }
  }
  const r = spawnSync('sqlite3', ['-json', dbPath, sql], { encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    if (!sqliteWarned) {
      sqliteWarned = true;
      warn('读 SQLite 需要 Node 22.5+（node:sqlite）或系统 sqlite3；当前都不可用。容器模式仍可用。');
    }
    return [];
  }
  try {
    const parsed = JSON.parse(r.stdout || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) { return []; }
}

/* ---------------- Finder / iTunes 备份 ---------------- */

function readManifestIsEncrypted(backupDir) {
  const plist = path.join(backupDir, 'Manifest.plist');
  if (!fs.existsSync(plist)) return null;
  const r = spawnSync('plutil', ['-convert', 'json', '-o', '-', plist], { encoding: 'utf8' });
  if (r.status === 0) {
    try {
      const info = JSON.parse(r.stdout || '{}');
      return info.IsEncrypted === true ? true : (info.IsEncrypted === false ? false : null);
    } catch (e) { return null; }
  }
  // 非 macOS：二进制 plist 里 IsEncrypted 后紧跟 true/false 标记；做一个保守判断
  try {
    const buf = fs.readFileSync(plist);
    const idx = buf.indexOf(Buffer.from('IsEncrypted'));
    if (idx < 0) return null;
    const tail = buf.subarray(idx + 'IsEncrypted'.length, idx + 'IsEncrypted'.length + 8);
    // binary plist: 0x09 = true, 0x08 = false，通常紧跟在 key 的结束字节后
    for (const b of tail) {
      if (b === 0x09) return true;
      if (b === 0x08) return false;
    }
  } catch (e) {}
  return null;
}

function collectFromBackup(backupDir, state) {
  const manifest = path.join(backupDir, 'Manifest.db');
  if (!fs.existsSync(manifest)) fail('这个目录里没有 Manifest.db，不像 Finder/iTunes 备份：' + backupDir);
  const encrypted = readManifestIsEncrypted(backupDir);
  if (encrypted === true) {
    warn('这是「加密本地备份」：Manifest.db 能读，但存档文件内容被加密，脚本解不开。');
    warn('请在 Finder/iTunes 里关闭「加密本地备份」后重新备份一次；或用 iMazing 输入备份密码导出 App 数据。');
  }
  const rows = sqliteRows(manifest,
    "SELECT fileID, domain, relativePath, flags FROM Files " +
    "WHERE (relativePath LIKE '%save/progress%.json' OR relativePath LIKE 'Documents/%.json' " +
    "OR relativePath LIKE '%com.ssdz.classic/save/%') " +
    "AND domain LIKE 'AppDomain-%' LIMIT 300");
  if (!rows.length) {
    warn('备份里没找到存档记录。确认备份包含这台手机，且 App 没有被删除。');
    return;
  }
  for (const row of rows) {
    const fileID = String(row.fileID || '');
    const relative = String(row.relativePath || '');
    if (!fileID || !relative) continue;
    if (Number(row.flags) === 2) continue; // 目录
    const relPosix = relative.split(path.sep).join('/');
    const base = path.posix.basename(relPosix);
    const isExport = /(^|\/)Documents\//.test(relPosix) && /\.json$/i.test(base);
    const isSave = /(^|\/)save\/progress(\.[a-z0-9_-]+)?\.json$/i.test(relPosix);
    if (!isExport && !isSave) continue;
    const candidates = [
      path.join(backupDir, fileID.slice(0, 2), fileID),
      path.join(backupDir, fileID),
    ];
    const file = candidates.find((p) => fs.existsSync(p));
    if (!file) continue;
    let raw = '';
    try { raw = fs.readFileSync(file, 'utf8'); } catch (e) { continue; }
    const st = safeStat(file);
    const kind = /progress\.bak\.json$/i.test(base) ? 'backup'
      : /progress\.corrupt\.json$/i.test(base) ? 'corrupt'
        : /progress\.json$/i.test(base) ? 'main' : (isExport ? 'export' : 'save');
    addCandidate(state, raw, { source: 'backup', kind, label: relative, absPath: file, mtime: st.mtimeMs });
  }
}

/* ---------------- 扫描目录 ---------------- */

function looksLikeBackup(dir) {
  return fs.existsSync(path.join(dir, 'Manifest.db')) && fs.existsSync(path.join(dir, 'Manifest.plist'));
}
function looksLikeXcappdata(dir) {
  try {
    const names = fs.readdirSync(dir);
    return names.includes('AppData') || names.some((n) => /\.app$/i.test(n));
  } catch (e) { return false; }
}
function findInputs(root, maxDepth) {
  const found = { containers: [], backups: [], json: [] };
  const stack = [{ dir: root, depth: 0 }];
  while (stack.length) {
    const cur = stack.pop();
    if (cur.depth > (maxDepth || 5)) continue;
    if (looksLikeBackup(cur.dir)) { found.backups.push(cur.dir); continue; }
    if (looksLikeXcappdata(cur.dir)) { found.containers.push(cur.dir); continue; }
    let entries;
    try { entries = fs.readdirSync(cur.dir, { withFileTypes: true }); } catch (e) { continue; }
    for (const ent of entries) {
      const p = path.join(cur.dir, ent.name);
      if (ent.isSymbolicLink()) continue;
      // 跳过本工具自己的输出目录，避免 --scan 把上一轮的候选又扫一遍
      if (ent.isDirectory() && /^(ios-save-rescue|救援报告)/.test(ent.name)) continue;
      if (ent.isFile() && /\.json$/i.test(ent.name)) {
        if (/^(救援报告|松鼠大战存档-救援-)/.test(ent.name)) continue;
        found.json.push(p);
        continue;
      }
      if (ent.isDirectory()) stack.push({ dir: p, depth: cur.depth + 1 });
    }
  }
  return found;
}

/* ---------------- 排序 / 输出 ---------------- */

function pickBest(candidates) {
  const valid = candidates.filter((c) => c.valid);
  if (!valid.length) return null;
  const nonFresh = valid.filter((c) => !c.fresh);
  const pool = nonFresh.length ? nonFresh : valid;
  const kindRank = { main: 0, backup: 1, export: 2, save: 3, corrupt: 4, localStorage: 5 };
  return pool.slice().sort((a, b) => {
    if (b.savedAt !== a.savedAt) return b.savedAt - a.savedAt;
    if (b.reborn !== a.reborn) return b.reborn - a.reborn;
    if (b.level !== a.level) return b.level - a.level;
    return (kindRank[a.kind] || 9) - (kindRank[b.kind] || 9);
  })[0];
}

function outputDirFor() {
  const explicit = argValue('--out', '');
  if (explicit) return path.resolve(explicit);
  const stamp = new Date();
  const p = (x) => String(x).padStart(2, '0');
  const name = 'ios-save-rescue-' + stamp.getFullYear() + p(stamp.getMonth() + 1) + p(stamp.getDate()) +
    '-' + p(stamp.getHours()) + p(stamp.getMinutes()) + p(stamp.getSeconds());
  return path.resolve(name);
}

function writeOutputs(candidates, best, inputLabel, deep) {
  const outDir = outputDirFor();
  fs.mkdirSync(outDir, { recursive: true });
  const valid = candidates.filter((c) => c.valid);
  const rows = [];
  let idx = 0;
  for (const c of candidates) {
    idx++;
    const tag = c.valid ? (c === best ? '推荐' : '候选') : '不可用';
    const base = [
      String(idx).padStart(2, '0'),
      tag,
      c.kind,
      c.name ? safeName(c.name, 16) : '无名',
      'L' + c.level,
      c.reborn ? 'R' + c.reborn : '',
    ].filter(Boolean).join('-');
    let file = '';
    if (c.valid && c.text) {
      file = path.join(outDir, base + '.json');
      let n = 1;
      while (fs.existsSync(file)) { file = path.join(outDir, base + '-' + (++n) + '.json'); }
      // 原样写出（不重新序列化，避免任何格式/精度变化）；只去掉 BOM。
      fs.writeFileSync(file, c.text.replace(/^\uFEFF/, ''), 'utf8');
    }
    rows.push({ ...c, outFile: file, recommended: c === best });
  }

  let recommendedFile = '';
  if (best) {
    const stamp = new Date();
    const p = (x) => String(x).padStart(2, '0');
    const nice = '松鼠大战存档-救援-' + stamp.getFullYear() + '-' + p(stamp.getMonth() + 1) + '-' + p(stamp.getDate()) +
      '-' + p(stamp.getHours()) + p(stamp.getMinutes()) + '.json';
    recommendedFile = path.join(outDir, nice);
    let n = 1;
    while (fs.existsSync(recommendedFile)) {
      recommendedFile = path.join(outDir, nice.replace(/\.json$/, '') + '-' + (++n) + '.json');
    }
    fs.writeFileSync(recommendedFile, best.text.replace(/^\uFEFF/, ''), 'utf8');
  }

  const report = {
    tool: 'ios-save-rescue',
    version: SCRIPT_VERSION,
    createdAt: new Date().toISOString(),
    input: inputLabel,
    deep: !!deep,
    recommended: best ? {
      label: best.label, kind: best.kind, level: best.level, reborn: best.reborn,
      name: best.name, savedAt: best.savedAt, file: recommendedFile,
    } : null,
    candidates: rows.map((r) => ({
      label: r.label, kind: r.kind, source: r.source, valid: r.valid, error: r.error,
      name: r.name, level: r.level, reborn: r.reborn, wins: r.wins, fresh: r.fresh,
      savedAt: r.savedAt, savedAtText: fmtTime(r.savedAt), size: r.size, mtime: r.mtime,
      outFile: r.outFile, recommended: r.recommended,
    })),
  };
  const reportJson = path.join(outDir, '救援报告.json');
  fs.writeFileSync(reportJson, JSON.stringify(report, null, 2), 'utf8');

  const lines = [];
  lines.push('松鼠大战 iOS 存档救援报告');
  lines.push('生成时间：' + fmtTime(Date.now()));
  lines.push('扫描：' + inputLabel);
  lines.push('找到可用存档：' + valid.length + ' 份' + (candidates.length !== valid.length ? '（另有 ' + (candidates.length - valid.length) + ' 份不可用）' : ''));
  lines.push('');
  if (valid.length) {
    lines.push('  #  类型          角色            等级  转生  存档时间             来源');
    rows.filter((r) => r.valid).forEach((r, i) => {
      lines.push('  ' + String(i + 1).padEnd(3) +
        String(r.kind).padEnd(13) +
        String(r.name || '无名').slice(0, 14).padEnd(15) +
        String(r.level).padStart(4) + '  ' +
        String(r.reborn).padStart(3) + '  ' +
        fmtTime(r.savedAt).padEnd(20) + r.label);
    });
    lines.push('');
    lines.push('推荐：' + (best ? (best.kind + ' / ' + (best.name || '无名') + ' / ' + best.level + ' 级 / ' + fmtTime(best.savedAt)) : '—'));
    lines.push('推荐文件：' + recommendedFile);
    lines.push('');
    lines.push('下一步：');
    lines.push('  1. 把推荐文件（或其它候选 .json）通过 AirDrop /「文件」App 放到新游戏的 Documents：');
    lines.push('     「文件」App → 我的 iPhone/iPad → 松鼠大战 → 粘贴。');
    lines.push('  2. 打开新游戏 → 系统 → 导入存档 → 存档列表 → 选这份 .json。');
    lines.push('  3. 导入前先在游戏里点一次「导出存档」，给当前档留个备份。');
    lines.push('');
    lines.push('如果推荐的不是你要的进度：输出目录里每份候选都保留了 .json，逐个导入试；');
    lines.push('导入前先导出当前档，导入失败/不对可以在「导入存档」里再换一份。');
  } else {
    lines.push('没有找到可导入的存档。请检查：');
    lines.push('  · 容器路径是否指到了 .xcappdata 里的 AppData（不是 .app）；');
    lines.push('  · 备份是否包含这台手机、App 是否还在（删除 App 会删除存档）；');
    lines.push('  · 如果只有 progress.corrupt.json，主档可能已损坏，试试 progress.bak.json；');
    lines.push('  · 加密备份无法直接读，请关闭加密后重新备份，或用 iMazing 导出。');
  }
  lines.push('');
  lines.push('隐私提醒：存档里有角色名和进度，不要发到公开群；只发给自己或开发者。');
  const reportTxt = path.join(outDir, '救援报告.txt');
  fs.writeFileSync(reportTxt, lines.join('\n') + '\n', 'utf8');

  console.log('');
  console.log(lines.join('\n'));
  console.log('');
  ok('输出目录：' + outDir);
  console.log('  推荐存档：' + (recommendedFile || '—'));
  console.log('  报告：    ' + reportTxt);
  return { outDir, recommendedFile, reportJson, reportTxt, validCount: valid.length };
}

/* ---------------- 主流程 ---------------- */

function main() {
  if (!ARGS.length || has('--help') || has('-h')) { usage(); return; }
  const deep = has('--deep');
  const container = argValue('--container', '');
  const backup = argValue('--backup', '');
  const file = argValue('--file', '');
  const scan = argValue('--scan', '');
  if (!container && !backup && !file && !scan) fail('缺少参数：--container / --backup / --file / --scan（--help 看用法）');
  if (container && backup) fail('--container 和 --backup 只能二选一');

  console.log('松鼠大战 iOS 存档救援 v' + SCRIPT_VERSION);
  const state = [];
  const inputs = [];
  let inputLabel = '';

  if (file) {
    const abs = path.resolve(file);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) fail('找不到文件：' + abs);
    const st = safeStat(abs);
    addCandidate(state, fs.readFileSync(abs, 'utf8'), { source: 'file', kind: 'file', label: path.basename(abs), absPath: abs, mtime: st.mtimeMs });
    inputs.push(abs);
    inputLabel = abs;
  } else if (container) {
    let abs = path.resolve(container);
    if (!fs.existsSync(abs)) fail('找不到容器：' + abs);
    let tmpDir = '';
    if (fs.statSync(abs).isFile() && /\.zip$/i.test(abs)) {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssdz-rescue-zip-'));
      const r = spawnSync('unzip', ['-q', abs, '-d', tmpDir], { encoding: 'utf8' });
      if (r.error || r.status !== 0) fail('解压失败：' + (r.stderr || r.error && r.error.message || 'unzip 不可用'));
      abs = tmpDir;
    }
    if (!fs.statSync(abs).isDirectory()) fail('--container 需要目录（.xcappdata）或 .zip：' + abs);
    info('扫描容器：' + abs);
    collectFromContainer(abs, state, deep);
    inputs.push(abs);
    inputLabel = abs;
    if (tmpDir) { try { fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 3 }); } catch (e) {} }
  } else if (backup) {
    const abs = path.resolve(backup);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) fail('找不到备份目录：' + abs);
    info('扫描 Finder/iTunes 备份：' + abs);
    collectFromBackup(abs, state, deep);
    inputs.push(abs);
    inputLabel = abs;
  } else if (scan) {
    const abs = path.resolve(scan);
    if (!fs.existsSync(abs)) fail('找不到目录：' + abs);
    info('在目录里找 .xcappdata / 备份 / .json：' + abs);
    const found = findInputs(abs, 6);
    if (!found.containers.length && !found.backups.length && !found.json.length) {
      fail('没找到 .xcappdata、备份目录或 .json：' + abs);
    }
    for (const dir of found.containers) {
      info('容器：' + dir);
      collectFromContainer(dir, state, deep);
    }
    for (const dir of found.backups) {
      info('备份：' + dir);
      collectFromBackup(dir, state, deep);
    }
    for (const f of found.json) {
      const st = safeStat(f);
      addCandidate(state, fs.readFileSync(f, 'utf8'), { source: 'file', kind: 'file', label: path.basename(f), absPath: f, mtime: st.mtimeMs });
    }
    inputLabel = abs;
  }

  const unique = stableUnique(state);
  if (!unique.length) {
    console.log('');
    warn('没有找到任何 progress.json / Documents/*.json。');
    warn('请确认路径；如果 App 已被删除，沙盒也随之删除，脚本无能为力。');
    process.exitCode = 1;
    return;
  }
  const valid = unique.filter((c) => c.valid);
  console.log('');
  info('候选文件：' + unique.length + '，可导入：' + valid.length);
  if (!valid.length) {
    const result = writeOutputs(unique, null, inputLabel, deep);
    process.exitCode = 1;
    return result;
  }
  const best = pickBest(unique);
  writeOutputs(unique, best, inputLabel, deep);
}

try { main(); } catch (e) {
  console.error('\n[x] ' + (e && e.stack || e));
  process.exit(1);
}
