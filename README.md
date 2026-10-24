# 松鼠大战 iOS 安装包（暂停安装）

> **2026-10-23：企业证书已被 Apple 吊销（revoked / certificateHold）。**
> 旧包现在无法安装，也无法在已安装的设备上启动；重新信任 / 重启 / 重装同一个 IPA 都不会恢复。
> **已安装的玩家请不要删除 App**，先按 [存档救援指南](https://charlespkuer.github.io/UC_Squirrel_Fight-ios-install/rescue.html)
> 把存档取出来。删除 App 会连存档容器一起删除。

## 现在能做什么

- 已经装过旧版的玩家：打开 **文件 App → 我的 iPhone/iPad → 松鼠大战**，看有没有导出的 `.json`；
  有就先拷到 iCloud 云盘 / 电脑。没有的话用电脑从 App 容器或本地备份里取
  `Library/Application Support/com.ssdz.classic/save/progress.json`。
- 完整步骤（含 Xcode / 备份 / iMazing / 导入）：<https://charlespkuer.github.io/UC_Squirrel_Fight-ios-install/rescue.html>
- 救援脚本：[`rescue/ios-save-rescue.cjs`](rescue/ios-save-rescue.cjs)（离线、只读、不上传）。

## 旧版本信息（仅供核对，不要再用它安装）

当前版本：**1.0.5**（构建 108）。两个包都已签名，但签名证书已被吊销：

| 包 | 适用 | 说明 |
|---|---|---|
| `squirrel_fight_1.0.5_ios_signed.ipa` | iOS 26+ | 构建 108，UIScene |
| `squirrel_fight_1.0.5_ios_legacy_signed.ipa` | iOS 16–25 | 构建 108，传统生命周期 |

- 签名：`iPhone Distribution: RAKUTEN SECURITIES,INC.`（Team `HWK767YYMF`）
- Bundle ID：`jp.co.rakuten-sec.iSPEED.Pushnotification.widgetapp.widgetkitextension`
- 描述文件到期：**2026-11-05**
- 证书状态：**2026-10-23 16:05 UTC revoked（certificateHold）**

旧包本身签名完整（`codesign --verify --deep --strict` 通过），GitHub 上的 IPA 与本地构建
SHA-256 逐字节一致；问题不在打包，在 Apple 吊销了证书。

## 为什么不能靠「重装 / 重新信任」修好

- 不是「未受信任的企业级开发者」：证书本身被 Apple 置为 revoked，信任开关无效。
- 不是描述文件到期：描述文件确实会在 2026-11-05 到期，但证书在那之前已经被吊销。
- 覆盖安装同一个 IPA：新包仍然用同一张被吊销的证书，iOS 依旧拒绝。
- 删除 App 再装：会删除数据容器，存档一起没了。

## 未签名版能直接读旧存档吗

不能。未签名 IPA 的 Bundle ID 是 `com.ssdz.classic`，企业版是
`jp.co.rakuten-sec.iSPEED...`；iOS 把两者当成不同的 App，沙盒 / 存档容器互不相通。
stock iPhone 也无法直接安装未签名 IPA。只有把未签名包改成旧 Bundle ID 再覆盖安装
（TrollStore / 重新签名）才可能读到旧容器；普通玩家应走「取出 JSON → 新版本导入」。

## 文件

| 文件 | 作用 |
|---|---|
| `index.html` | 当前暂停安装页 |
| `rescue.html` | 玩家存档救援指南 |
| `rescue/ios-save-rescue.cjs` | 从 `.xcappdata` / Finder 备份 / 单文件提取存档 |
| `manifest*.xml` / `manifest.plist` | 旧 OTA 清单（已失效，仅留档） |
| `squirrel_fight_1.0.5_ios_*_signed.ipa` | 旧签名包（已失效，仅留档 / 核对） |
