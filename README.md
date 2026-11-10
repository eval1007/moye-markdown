# 墨页 Moye · Windows Markdown Reader

Windows 本地 Markdown 阅读器。打开或拖入 Markdown 文件或文件夹，阅读带目录、表格、相对图片和 Mermaid 图的文档。点击内嵌图可在独立画布中缩放、拖动和适应窗口。可按图切换 Dagre/ELK。ER 图默认适应正文宽度，可切到原始大小或放大查看。主题和最近打开的文件/文件夹路径仅保存在本机，文档始终以只读方式打开。

**[下载 Windows x64 版](https://github.com/eval1007/moye-markdown/releases/latest)** · [反馈问题或建议](https://github.com/eval1007/moye-markdown/issues)

Moye is a local Markdown reader for Windows with WSL folder browsing, Mermaid and ER diagrams, and text search.

![墨页显示 Markdown 正文和 Mermaid ER 图，示例数据为虚构内容](docs/images/er-preview.png)

## 使用

- Windows 10/11 x64，使用 WebView2 Runtime。
- 首次安装默认使用 `%LOCALAPPDATA%\Programs\Moye`，无需管理员权限，可在安装器中更改目录。重装时默认使用上次的安装目录。
- 安装后可在文件管理器用「打开方式 → Moye」打开 Markdown。系统默认关联由用户选择。
- 窗口内可用「打开文件」、Ctrl+O 或拖放。支持 UTF-8 的 `.md`、`.markdown`、`.mdown`。
- 「打开文件夹」显示左侧文件树，点击 Markdown 文件后在右侧阅读。点「WSL 路径」可选择发行版并输入 Linux 绝对路径，也可粘贴 WSL 的 Windows 网络路径。输入时列出匹配的文件夹和 Markdown 文件；可点击或用方向键配合 Enter / Tab 补全，再点「打开」。
- 相对图片和 Markdown 链接以当前文档所在目录解析，允许读取已打开的根目录内的文件；没有打开根目录时限于当前文档目录。外部链接交给默认浏览器。预览不加载远程图片。
- 阅读时用 Ctrl+F 查找当前正文，Enter / Shift+Enter 跳到下一处 / 上一处。打开文件夹后用 Ctrl+P 搜文件名或相对路径、Ctrl+Shift+F 搜 Markdown 正文，也可从文件树点击「搜索文件夹」。打开结果会展开文件树中的对应路径；正文命中会跳到相应内容块并高亮可见文字。文件夹搜索在本地执行，最多显示前 100 条结果，跳过隐藏目录和 node_modules。

## 开发与构建

用 Node.js 24 和 npm 安装锁定依赖。Windows 本机需要 Rust MSVC 工具链和 Visual Studio C++ Build Tools（见 [Tauri 构建环境](https://v2.tauri.app/start/prerequisites/)）。

```sh
npm ci
npm run tauri dev
npm run tauri build
```

`npm run dev` 也可单独检查阅读界面；浏览器模式不能读取用户所选 Markdown 的同目录图片，也没有 Windows 文件关联。用内置示例可验证图表和图片。Windows 安装包由 Tauri 生成，包含渲染依赖，无需在线图表服务。ER 图使用随应用打包的 [JetBrains Mono v2.304](https://github.com/JetBrains/JetBrainsMono/releases/tag/v2.304)（[SIL OFL 1.1](public/licenses/JetBrainsMono-OFL.txt)），中文使用系统字体。

源文件按职责分布在 `src/markdown.js`（解析）、`src/diagrams.js`（图表主题和 SVG）、`src/zoom.js`（大图）、`src/main.js`（阅读界面）和 `src-tauri/src/main.rs`（本地文件与启动请求）。

## 许可证

墨页自有代码使用 [MIT](LICENSE)。随应用分发的字体、布局引擎和其他依赖遵循[各自的许可证](THIRD_PARTY.md)。
