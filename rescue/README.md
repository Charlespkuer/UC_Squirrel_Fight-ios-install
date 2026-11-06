# iOS 存档救援脚本

离线、只读、不上传。用于从下面三种来源里找出松鼠大战的 `progress.json`：

- Xcode「Download Container」导出的 `.xcappdata` / 容器目录；
- Finder / iTunes / Apple Devices 的本地备份目录（含 `Manifest.db`）；
- 一个直接的 `.json`（例如以前从游戏里导出的存档）。

## 环境

- Node.js **22.5+**（备份模式用 `node:sqlite`；更老的 Node 会退回系统 `sqlite3` 命令）。
- 容器 / 单文件模式不需要 SQLite。

## 用法

```bash
node ios-save-rescue.cjs --container ~/Downloads/松鼠大战.xcappdata
node ios-save-rescue.cjs --backup "$HOME/Library/Application Support/MobileSync/Backup/<UDID>"
node ios-save-rescue.cjs --file ~/Downloads/progress.json
node ios-save-rescue.cjs --scan ~/Desktop
```

可选：

```bash
--out <目录>   指定输出目录（默认 ./ios-save-rescue-<时间>）
--deep         额外扫描 WKWebView localStorage（progress.json 丢失时）
--help         帮助
```

## 输出

- `松鼠大战存档-救援-<时间>.json`：推荐存档，直接拿去游戏里「系统 → 导入存档」。
- `NN-候选-...json`：所有能解析的候选档（主档 / 备份档 / Documents 导出 / localStorage），
  推荐的不对就逐个试。
- `救援报告.txt` / `救援报告.json`：角色名、等级、转生、存档时间、来源路径。

## 注意

- **不要删除手机上的旧 App**；删除会连存档容器一起删除。
- 加密的本地备份读不了：请在 Finder/iTunes 里关闭「加密本地备份」后重新备份，
  或用 iMazing 输入备份密码导出 App 数据。
- 备份包含整台手机的数据；脚本只读游戏存档，输出只有游戏 JSON。不要把整份备份发到公开群。
- 如果扫描不到，先确认路径是 `.xcappdata` 里的 `AppData`，或备份里确实有
  `Library/Application Support/com.ssdz.classic/save/progress.json`。
