# 松鼠大战 iOS 安装包（1.1.9 · 未签名 IPA + 网页版）

> **2026-10-23：RAKUTEN 企业证书已被 Apple 吊销（revoked / certificateHold），不再提供 OTA 直装。**
> 现在发布 **1.1.9 未签名 IPA**（构建 1111），可用 TrollStore 或 Sideloadly / AltStore / 爱思助手
> 自签安装；网页版 / PWA 也已同步到 1.1.9。
> **已安装旧企业版的玩家请不要删除 App**，先按
> [存档救援指南](https://charlespkuer.github.io/UC_Squirrel_Fight-ios-install/rescue.html)
> 把存档取出来。删除 App 会连存档容器一起删除。

## 1.1.9 更新内容

- 从 Windows 端拉取最新文件：素材退役与图标 SVG 化（`images` 140.5→97.8 MB）、经典二级页页脚换原版 3362 矢量键、状态页武技格恢复等比悬停、装备页补 `tags-status` 加载。
- 已在 **iOS 27.1 模拟器（iPhone Duo，横屏）** 安装从 Windows 拉取后重打的 1.1.9 构建，实测启动、系统页 `v1.1.9`、连续切后台/回前台背景保持、无尽塔战报滚动与底部按钮固定、随机挑战战斗正常开打。

## 1.1.9 未签名 IPA（推荐 TrollStore / 自签）

| 包 | 适用 | 版本 / 构建 |
|---|---|---|
| [`squirrel_fight_1.1.9_ios_unsigned.ipa`](squirrel_fight_1.1.9_ios_unsigned.ipa) | iOS 26+（UIScene） | 1.1.9 / 1111 |
| [`squirrel_fight_1.1.9_ios_legacy_unsigned.ipa`](squirrel_fight_1.1.9_ios_legacy_unsigned.ipa) | iOS 15.4–25（传统生命周期） | 1.1.9 / 1111 |

- Bundle ID：`com.ssdz.classic`；未签名；最低 iOS 15.4；iPhone + iPad；仅横屏。
- 包内、文件名、安装页与游戏内版本均为 **1.1.9**，构建号 **1111**。
- **1.1.8.2 / 1.1.8 / 1.1.6 / 1.1.5 / 1.1.4.1 / 1.1.3 / 1.1.2 / 1.1.1 / 1.1.0.1 用户**：旧包构建号 1110 / 1108 / 1107 / 1106 / 1105 / 1104 / 1103 / 1102 / 1101，新包 **1111**；
  沿用同一 Bundle ID 和同一签名身份覆盖安装，不会提示降版本。升级前建议先在「系统 → 导出存档」备份。
- **1.0.5 企业版用户**：企业包 Bundle ID 是 `jp.co.rakuten-sec.iSPEED...`，与未签名包
  `com.ssdz.classic` 不是同一个 App，存档容器不互通；必须按救援指南取出 JSON 后导入新版本。
- 未签名 IPA **不能**从 Safari 直接 OTA 安装；需要用 TrollStore 或电脑侧载工具。
  免费 Apple ID 自签 7 天有效，到期重签，不需要开发者账号。
- SHA-256：
  - modern：`cf6763f5216343c5efa1a849d697a3892784c8f3dc7fed41fa73593aa2fef9be`
  - legacy：`a2a551f081be4cd1313f53439963dcb2ac89aaef30540e2a026ae4edf3fd196b`

## 网页版 / PWA（不用证书）

**<https://charlespkuer.github.io/UC_Squirrel_Fight-ios-install/web/>**

- 当前网页版版本：**1.1.9**（由主仓当前源码重建）。
- iPhone / iPad 用 **Safari** 打开 → 分享 → **添加到主屏幕**；先安装，再从游戏里
  「系统 → 导入存档」导入救援 JSON。
- 主屏幕 Web App 和 Safari 标签页的存储是**两个容器**；先玩过 Safari 的话先在那边导出，再切过去导入。
- 主屏幕 Web App 豁免 ITP 的 7 天清理；Safari 标签页仍受影响。两者都建议定期「存档导出」。
- 这是本仓库 `web/` 下的静态站点，由 GitHub Pages 直接托管；`web-src/` 里是 PWA 源文件和重建脚本：
  ```bash
  node web-src/build-web.cjs --game "/path/to/Squirrel Fight"
  ```
  它会复制游戏源码、应用 `web-src/web-mode.patch`、生成 `web/`（含 manifest / sw / icons）。

## 存档救援

- 已经装过旧版的玩家：打开 **文件 App → 我的 iPhone/iPad → 松鼠大战**，看有没有导出的 `.json`；
  有就先拷到 iCloud 云盘 / 电脑。没有的话用电脑从 App 容器或本地备份里取
  `Library/Application Support/com.ssdz.classic/save/progress.json`。
- 完整步骤（含 Xcode / 备份 / iMazing / 导入）：
  <https://charlespkuer.github.io/UC_Squirrel_Fight-ios-install/rescue.html>
- 救援脚本：[`rescue/ios-save-rescue.cjs`](rescue/ios-save-rescue.cjs)（离线、只读、不上传）。

## 旧版本信息（已从本仓库撤下，仅供核对）

旧 1.0.5 签名包（构建 108，UIScene / 传统生命周期各一个）已从本仓库撤下，不再提供下载。

- 签名：`iPhone Distribution: RAKUTEN SECURITIES,INC.`（Team `HWK767YYMF`）
- Bundle ID：`jp.co.rakuten-sec.iSPEED.Pushnotification.widgetapp.widgetkitextension`
- 描述文件到期：**2026-11-05**
- 证书状态：**2026-10-23 16:05 UTC revoked（certificateHold）**

## 为什么不能靠「重装 / 重新信任」修好

- 不是「未受信任的企业级开发者」：证书本身被 Apple 置为 revoked，信任开关无效。
- 不是描述文件到期：描述文件确实会在 2026-11-05 到期，但证书在那之前已经被吊销。
- 覆盖安装同一个 IPA：新包仍然用同一张被吊销的证书，iOS 依旧拒绝。
- 删除 App 再装：会删除数据容器，存档一起没了。

## 文件

| 文件 | 作用 |
|---|---|
| `index.html` | 1.1.9 安装 / 下载页 |
| `squirrel_fight_1.1.9_ios_unsigned.ipa` | iOS 26+ 未签名包（构建 1111） |
| `squirrel_fight_1.1.9_ios_legacy_unsigned.ipa` | iOS 15.4–25 未签名包（构建 1111） |
| `web/` | 网页版 / PWA 静态站点（1.1.9，本仓库 Pages 托管） |
| `web-src/` | PWA 源文件、web-mode.patch、重建脚本 |
| `rescue.html` | 玩家存档救援指南 |
| `rescue/ios-save-rescue.cjs` | 从 `.xcappdata` / Finder 备份 / 单文件提取存档 |
