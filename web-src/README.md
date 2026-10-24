# 网页版 / PWA 源文件

`web/` 是本仓库 GitHub Pages 直接托管的静态站点；这个目录是它的源文件和重建脚本。

## 重建

```bash
# 在 UC_Squirrel_Fight-ios-install 仓库根目录
node web-src/build-web.cjs --game "/path/to/Squirrel Fight"
# 或输出到临时目录先检查
node web-src/build-web.cjs --game "../Squirrel Fight" --out /tmp/ssdz-web
```

脚本会：

1. 复制游戏源码的 `scripts/index.html`、`css/`、`js/`、`images/`、`audio/`（跳过 `images/_reference`）；
2. 在复制出来的 `js/main.js` / `classic-ui.js` / `state.js` 上应用 `web-mode.patch`
   （只加“静态网页存档”分支，不碰主仓源码）；
3. 注入 PWA meta、`window.__SSDZ_WEB_MODE__`、`js/pwa.js`；
4. 复制 `manifest.webmanifest` / `sw.js` / `pwa.js` / `icons`；
5. 复制 `scripts/version.json` 到 `web/` 和 `web/scripts/`；
6. 把核心文件清单和本次构建版本注入 `sw.js`。

## 文件

| 文件 | 作用 |
|---|---|
| `manifest.webmanifest` | PWA 清单（`display: standalone`、图标、主题色） |
| `sw.js` | Service Worker（首页/JS/CSS 预缓存，图片/音频运行时缓存） |
| `pwa.js` | 注册 SW、标记 `window.__SSDZ_WEB_MODE__` |
| `web-mode.patch` | 游戏源码的网页存档补丁（main / classic-ui / state） |
| `icons/` | 192 / 512 / apple-touch-icon |
| `build-web.cjs` | 重建脚本 |

## 注意

- **先添加到主屏幕，再导入存档**：iOS 主屏幕 Web App 和 Safari 的 localStorage 是两个容器。
- **origin 固定**：`https://charlespkuer.github.io/UC_Squirrel_Fight-ios-install/web/`；
  换域名/换路径会让玩家旧 localStorage 对不上，只能导出再导入。
- 主屏幕 Web App 豁免 ITP 的 7 天清理；Safari 标签页仍受影响。两者都建议定期「存档导出」。
- 不在 `web/` 里直接改代码；改游戏源码后重新跑构建脚本。
