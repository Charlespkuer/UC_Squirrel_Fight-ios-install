#!/usr/bin/env node
/* ============================================================
 * web-src/build-web.cjs —— 从游戏源码重建安装仓库里的网页版 / PWA
 *
 * 用法（在 UC_Squirrel_Fight-ios-install 仓库根目录）：
 *   node web-src/build-web.cjs --game "/path/to/Squirrel Fight"
 *   node web-src/build-web.cjs --game "../Squirrel Fight" --out web
 *
 * 做什么：
 *   1. 复制游戏源码的 scripts/index.html → web/index.html，注入 PWA meta / web mode / pwa.js；
 *   2. 复制 css/js/images/audio（跳过 images/_reference、.DS_Store）；
 *   3. 把 web-src/web-mode.patch 打到复制出来的 js/main.js / classic-ui.js / state.js 上
 *      （补丁只加“静态网页存档”分支，不碰游戏玩法）；
 *   4. 复制 manifest.webmanifest / sw.js / pwa.js / icons；
 *   5. 复制 version.json 到 web/ 与 web/scripts/，并把核心文件清单/版本注入 sw.js。
 *
 * 产出 web/ 是纯静态站点，由本仓库的 GitHub Pages 直接托管。
 * 无第三方依赖；Node 18+、git（应用补丁用）。
 * ============================================================ */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const PWA = __dirname;
const ARGS = process.argv.slice(2);
const argValue = (name, fallback) => {
  const i = ARGS.indexOf(name);
  return i >= 0 && i + 1 < ARGS.length ? ARGS[i + 1] : fallback;
};
const has = (name) => ARGS.includes(name);
const GAME = path.resolve(argValue('--game', process.cwd()));
const OUT = path.resolve(argValue('--out', path.join(PWA, '..', 'web')));

function fail(msg) { console.error('\n[x] ' + msg); process.exit(1); }
function info(msg) { console.log('— ' + msg); }
function ok(msg) { console.log('✓ ' + msg); }
function usage() {
  console.log(`松鼠大战网页版 / PWA 重建（安装仓库）

用法：
  node web-src/build-web.cjs --game "/path/to/Squirrel Fight" [--out web]

参数：
  --game <目录>  游戏源码目录（含 scripts/index.html、css/、js/、images/、audio/）
  --out <目录>   输出目录，默认本仓库的 web/
`);
}

function isIgnored(src) {
  const base = path.basename(src);
  if (base === '.DS_Store' || base === 'Thumbs.db' || base === 'desktop.ini') return true;
  if (base === 'node_modules' || base === '.git' || base === '__pycache__') return true;
  const rel = path.relative(GAME, src).split(path.sep);
  if (rel.includes('_reference')) return true;
  return false;
}
function copyTree(from, to) {
  if (!fs.existsSync(from)) fail('缺少目录：' + from);
  fs.cpSync(from, to, { recursive: true, filter: (src) => !isIgnored(src) });
}
function walk(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const ent of fs.readdirSync(cur, { withFileTypes: true })) {
      const p = path.join(cur, ent.name);
      if (ent.isDirectory()) stack.push(p);
      else if (ent.isFile() && p.toLowerCase().endsWith(ext)) out.push(p);
    }
  }
  return out.sort();
}
function toUrl(abs) {
  return './' + path.relative(OUT, abs).split(path.sep).join('/');
}
function readVersion() {
  const file = path.join(GAME, 'scripts', 'version.json');
  if (!fs.existsSync(file)) return { version: 'dev' };
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8'));
    return v && typeof v === 'object' ? v : { version: 'dev' };
  } catch (e) { return { version: 'dev' }; }
}
function writeIndex() {
  const src = path.join(GAME, 'scripts', 'index.html');
  if (!fs.existsSync(src)) fail('找不到游戏入口：' + src);
  let html = fs.readFileSync(src, 'utf8');
  if (!html.includes('</head>')) fail('scripts/index.html 里找不到 </head>');
  if (!html.includes('</body>')) fail('scripts/index.html 里找不到 </body>');

  const head = [
    '<link rel="manifest" href="manifest.webmanifest">',
    '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">',
    '<meta name="theme-color" content="#173b2a">',
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
    '<meta name="apple-mobile-web-app-title" content="松鼠大战">',
    '<script>window.__SSDZ_WEB_MODE__=true;</script>',
  ].join('\n');
  html = html.replace('</head>', head + '\n</head>');
  html = html.replace('</body>', '<script src="js/pwa.js" defer></script>\n</body>');
  fs.writeFileSync(path.join(OUT, 'index.html'), html, 'utf8');
}
function applyWebModePatch() {
  const patch = path.join(PWA, 'web-mode.patch');
  if (!fs.existsSync(patch)) fail('找不到 web-src/web-mode.patch');
  const mainJs = path.join(OUT, 'js', 'main.js');
  if (fs.existsSync(mainJs) && fs.readFileSync(mainJs, 'utf8').includes('isStaticWebMode')) {
    info('游戏源码里已经有 web mode，跳过补丁');
    return;
  }
  const r = spawnSync('git', ['apply', '-p1', patch], { cwd: OUT, encoding: 'utf8' });
  if (r.error) fail('执行 git apply 失败：' + r.error.message);
  if (r.status !== 0) fail('web-mode.patch 打不上：\n' + (r.stderr || r.stdout || '').trim() +
    '\n请确认 --game 指向的是未打 web mode 补丁的游戏源码。');
  ok('web-mode 补丁已应用');
}
function writeServiceWorker(core, version) {
  let sw = fs.readFileSync(path.join(PWA, 'sw.js'), 'utf8');
  sw = sw.split('__SW_VERSION__').join(version);
  sw = sw.split('__CORE_ASSETS__').join(JSON.stringify(core, null, 2));
  if (sw.includes('__SW_VERSION__') || sw.includes('__CORE_ASSETS__')) {
    fail('Service Worker 模板里还有未替换的占位符。');
  }
  fs.writeFileSync(path.join(OUT, 'sw.js'), sw, 'utf8');
}
function dirSize(dir) {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const ent of fs.readdirSync(cur, { withFileTypes: true })) {
      const p = path.join(cur, ent.name);
      if (ent.isSymbolicLink()) continue;
      if (ent.isDirectory()) stack.push(p);
      else if (ent.isFile()) total += fs.statSync(p).size;
    }
  }
  return total;
}

function main() {
  if (has('--help') || has('-h')) { usage(); return; }
  if (!fs.existsSync(path.join(GAME, 'scripts', 'index.html'))) {
    fail('--game 不像游戏源码目录（找不到 scripts/index.html）：' + GAME);
  }
  for (const p of [path.join(PWA, 'manifest.webmanifest'), path.join(PWA, 'sw.js'),
    path.join(PWA, 'pwa.js'), path.join(PWA, 'icons'), path.join(PWA, 'web-mode.patch')]) {
    if (!fs.existsSync(p)) fail('缺少 web-src 资源：' + p);
  }

  console.log('松鼠大战 · 网页版 / PWA 重建（安装仓库）');
  info('游戏源码：' + GAME);
  info('输出：' + OUT);
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  info('复制 css / js / images / audio');
  copyTree(path.join(GAME, 'css'), path.join(OUT, 'css'));
  copyTree(path.join(GAME, 'js'), path.join(OUT, 'js'));
  copyTree(path.join(GAME, 'images'), path.join(OUT, 'images'));
  copyTree(path.join(GAME, 'audio'), path.join(OUT, 'audio'));

  info('写入 index.html 并应用 web mode 补丁');
  writeIndex();
  applyWebModePatch();

  const versionInfo = readVersion();
  fs.mkdirSync(path.join(OUT, 'scripts'), { recursive: true });
  const versionFile = path.join(GAME, 'scripts', 'version.json');
  if (fs.existsSync(versionFile)) {
    fs.copyFileSync(versionFile, path.join(OUT, 'version.json'));
    fs.copyFileSync(versionFile, path.join(OUT, 'scripts', 'version.json'));
  } else {
    const v = JSON.stringify(versionInfo, null, 2);
    fs.writeFileSync(path.join(OUT, 'version.json'), v, 'utf8');
    fs.writeFileSync(path.join(OUT, 'scripts', 'version.json'), v, 'utf8');
  }

  info('复制 PWA 资源');
  fs.copyFileSync(path.join(PWA, 'manifest.webmanifest'), path.join(OUT, 'manifest.webmanifest'));
  copyTree(path.join(PWA, 'icons'), path.join(OUT, 'icons'));
  fs.copyFileSync(path.join(PWA, 'pwa.js'), path.join(OUT, 'js', 'pwa.js'));

  const version = String(versionInfo.version || 'dev').replace(/[^\w.-]/g, '_') +
    '-' + String(versionInfo.commit || '').replace(/[^\w.-]/g, '_') +
    '-' + Date.now().toString(36);
  const core = [
    './',
    './index.html',
    './manifest.webmanifest',
    './version.json',
    './scripts/version.json',
    ...walk(path.join(OUT, 'css'), '.css').map(toUrl),
    ...walk(path.join(OUT, 'js'), '.js').map(toUrl),
    ...walk(path.join(OUT, 'icons'), '.png').map(toUrl),
  ];
  writeServiceWorker(core, version);

  const mb = (dirSize(OUT) / 1024 / 1024).toFixed(1) + ' MB';
  ok('网页版站点：' + OUT + '（' + mb + '）');
  console.log('  PWA：manifest.webmanifest / sw.js / icons（' + core.length + ' 个预缓存文件）');
  console.log('  版本：' + version);
  console.log('  部署：git add web && git commit && git push；GitHub Pages 会更新 /web/。');
}

try { main(); } catch (e) {
  console.error('\n[x] ' + (e && e.stack || e));
  process.exit(1);
}
