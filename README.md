# 词栖 · 四册单词本

给 macOS 用的记单词桌面软件。阅读、听力、写作、口语各有一本单词本；可以用打字或扫描带标记的图片加入单词，之后每隔 1–2 小时提醒复习。听力和口语支持一键按顺序朗读全部单词。

单词存在 macOS 用户目录里，**不在 App 安装包内**。以后加功能、换版本或重新安装，都不会清空已有单词和复习记录。

## 在 Mac 上运行

需要 [Node.js 18+](https://nodejs.org/)（建议 20）。源码在 GitHub：[taromm/WordNest](https://github.com/taromm/WordNest)。

第一次在 Mac 上：

```bash
git clone https://github.com/taromm/WordNest.git
cd WordNest
npm install
npm start
```

如果 `git clone` / `git pull` 要登录，不要填 GitHub 网站密码（已经不能用来推拉代码）。用 [Personal Access Token](https://github.com/settings/tokens) 当密码，或在 GitHub 账号里加上这台电脑的 SSH 公钥后改用：

```bash
git clone git@github.com:taromm/WordNest.git
```

首次启动会打开「词栖」窗口，菜单栏也会留下托盘图标。关闭窗口不会退出，方便到点提醒；要退出请用托盘菜单里的「退出」，或 Dock 图标右键退出。

### 以后更新

不要再往旧的 `.app` 里逐个替换源码。在已经 clone 过的目录里：

```bash
cd WordNest
git pull
npm install
npm start
```

`git pull` 只更新程序，**不会清空单词本**。数据仍在下面「数据在哪」里写的用户目录。如果 `npm install` 没有新依赖，也可以直接 `npm start`。

### 打包成可双击的 App（可选）

```bash
npm run build:mac
```

完成后在 `dist/` 里会有 `Wordnest-1.0.0-mac-<arch>.dmg`。个人构建没有购买 Apple 签名证书时，第一次打开可到「系统设置 → 隐私与安全性」允许运行。

如果打包时报 `ERR_ELECTRON_BUILDER_CANNOT_EXECUTE`（`app-builder_arm64 process failed`），是 macOS 拦住了未签名的打包工具，在项目目录执行下面两行后再打包：

```bash
xattr -cr node_modules/app-builder-bin
chmod +x node_modules/app-builder-bin/mac/app-builder_arm64
npm run build:mac
```

仍失败时，打开「系统设置 → 隐私与安全性」，允许被拦截的 `app-builder`，然后再跑一次 `npm run build:mac`。Electron 已经下载过的话，第二次会快很多。

## 怎么用

1. 左侧切换 **阅读 / 听力 / 写作 / 口语**。
2. **打字加入**：填单词、释义、音标、例句。可点「自动查词」。快捷键 `⌘N`。
3. **扫描图片**：拍下或粘贴（`⌘V`）带标记的书页/笔记。
4. 到期后点通知、托盘图标或「复习到期单词」。快捷键 `⌘R`。
5. 听力和口语本可点 **全部发音**，按顺序朗读；可暂停、上一词、下一词。

复习时三个按钮会改下次提醒时间：

- 不认识：约 1 小时后再问
- 模糊：约 1.5 小时后再问
- 认识：从 2 小时起逐渐拉长间隔，直到暂时不必天天复习

全局提醒默认每 **90 分钟**（可在设置里改成 60–120 分钟）。只要还有到期单词，就会发 macOS 通知。

## 图片里怎么标记单词

扫描**只收荧光笔涂出来的词**，不会把红色印刷字当成重点。默认识别 **橙色荧光笔**。请在单词上涂一层颜色，而不是把字体改成彩色。

若橙色不好认，到「设置与备份」改成黄 / 绿 / 粉，然后改用那个颜色涂词。

第一次扫描需要联网下载英文识别模型（之后缓存在用户目录，可离线用）。请尽量拍清楚、避免反光。

加入单词时可填 **来源书标签**（例如「剑雅 17」），列表上方能按标签筛选。释义会优先展示雅思常考意思，并保留其他义项。

## 数据在哪，更新为什么不会丢词

| 内容 | 位置 |
| --- | --- |
| 单词与复习进度 | `~/Library/Application Support/词栖/wordnest-data.json` |
| 上一次完好备份 | 同目录 `wordnest-data.json.bak` |
| OCR 模型缓存 | 同目录 `tessdata/` |

`git pull`、重新 `npm start` 或换安装包，都只替换程序，不会写进这份用户数据。内部升级格式时也只补新字段，**不会清空四本单词本**。

建议偶尔在「设置与备份」里导出一份 JSON。导入是**合并**：同册同词保留原记录，只追加新词，不会覆盖记忆。

以后改功能时请遵守：

- 继续把数据写在 `userData`，不要写进安装目录或 asar
- `src/store.js` 的 `migrate()` 只允许补字段、加新单词本，禁止重置 `books.*.words`
- 导入必须走 `importMerge`，不要直接覆盖整个文件

## 开发

```bash
npm test
npm run check
npm run icon      # 重新生成 build/icon.png
```

界面在 `public/`，持久化在 `src/store.js`，桌面壳在 `electron-main.js`。
