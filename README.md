# 松鼠大战 iOS 安装包

当前版本：**1.0.5**

## 按系统版本选一个

| 你的 iOS | 点这个按钮 |
|---|---|
| **iOS 26 / 27** | **安装新版**（UIScene，构建 108，等比贴合、不默认拉伸） |
| **iOS 16–25** | **安装 legacy**（传统生命周期，构建 108） |

用 **iPhone / iPad 的 Safari** 打开：

https://charlespkuer.github.io/UC_Squirrel_Fight-ios-install/

页面只有两个主按钮，按 设置 → 通用 → 关于本机 的版本点对应那一个。

- iOS 26/27 装 legacy：会启动闪退。
- iOS 16–25 请勿装新版。

## 下载慢时的镜像

镜像只换 IPA 的下载线路，manifest 还是同一份签名包：

- iOS 26/27 官方：`manifest-ios26.xml`
- iOS 26/27 镜像：`manifest-ios26-mirror.xml`
- iOS 16–25 官方：`manifest-legacy.xml`
- iOS 16–25 镜像：`manifest-legacy-mirror.xml`

两个镜像都只换 IPA 的下载线路，IPA 走 `ghfast.top` GitHub 加速。

iOS 会校验企业签名，镜像文件被改动会被系统拒绝。

## 文件

| 包 | 适用 | 说明 |
|---|---|---|
| [squirrel_fight_1.0.5_ios_signed.ipa](squirrel_fight_1.0.5_ios_signed.ipa) | iOS 26+ | 构建 108，UIScene |
| [squirrel_fight_1.0.5_ios_legacy_signed.ipa](squirrel_fight_1.0.5_ios_legacy_signed.ipa) | iOS 16–25 | 构建 108，传统生命周期 |

- 签名：`iPhone Distribution: RAKUTEN SECURITIES,INC.`（Team `HWK767YYMF`）
- Bundle ID：`jp.co.rakuten-sec.iSPEED.Pushnotification.widgetapp.widgetkitextension`
- 描述文件到期：**2026-11-05**

## 安装要点

1. 必须用 Safari；微信 / QQ 内置浏览器会拦截 `itms-services`。
2. 只点与自己 iOS 版本对应的那个按钮。
3. 弹出「在“iTunes”中打开链接吗？」时点「打开」。
4. 提示未受信任时，去 设置 → 通用 → VPN 与设备管理 信任 `RAKUTEN SECURITIES, INC.`。

> 企业签名包与未签名 / TrollStore 包（`com.ssdz.classic`）的 Bundle ID 不同，存档容器不互通。
