# Moye · Markdown Preview

在 VS Code 中阅读 Markdown，沿用墨页的正文排版、Mermaid/PlantUML 配色、字体和大图查看。文件管理、搜索和编辑由 VS Code 提供。

- Mermaid 流程图和 ER 图默认 ELK，可切换 Dagre；流程图保留 Moye 的硬直角连线。
- 图表可切换原始大小、放大、滚轮缩放、拖动和适应窗口。
- PlantUML 使用随包浏览器引擎与 Viz.js，无需 Java 或图表服务器。外部 `!include` 及未打包标准库尚不支持。
- Shiki 代码高亮与复制，主题跟随 VS Code 明暗模式。
- 支持 VS Code 文件 URI，包括 Remote WSL 工作区及 Windows 打开的 WSL 共享路径；相对图片使用 VS Code 的资源加载接口。
- 文档只读；源码修改后预览更新。Ctrl+F 使用 VS Code 的 Webview 查找。
- 不加载远程图片；相对图片限于当前工作区，独立文件则限于文档目录。相对文档链接保留 WSL URI，Markdown 链接继续在 Moye 中打开。

## 使用

1. 安装 VSIX：命令面板执行 **Extensions: Install from VSIX…**，选择 `moye-preview-0.1.0.vsix`。
2. 打开 Markdown，点击编辑器右上角的预览图标，或执行 **Moye: 打开 Markdown 预览**。也可以从资源管理器右键打开。
3. 通过 **Reopen Editor With… → Moye 预览** 在当前标签页阅读。

在 WSL 中使用时，先通过 VS Code WSL 扩展打开 Linux 文件夹，将 Moye 安装到该 WSL 环境。文档、图片和相对链接都从当前工作区读取，图表在预览中离线渲染。

通过 Windows 的 `\\wsl.localhost\...` 打开文件时，如果 VS Code 的共享目录监听不可用，外部修改不会自动通知预览；点击预览标签页右上角的刷新按钮，或执行 **Moye: 刷新预览** 读取最新文件。刷新保留 VS Code 中尚未保存的编辑内容。

若希望 Markdown 默认使用 Moye，可手动配置：

```json
{
  "workbench.editorAssociations": {
    "*.md": "moye.preview"
  }
}
```

## 开发

在仓库根目录执行 `npm ci`，然后运行 `npm run package:vscode`。VSIX 输出到 `dist-vscode/`。插件与桌面版共用 `src/markdown.js`、`src/diagrams.js`、`src/plantuml.js`、`src/diagram-panel.js`、`src/zoom.js` 及阅读样式。

自有代码为 MIT，依赖与字体通知随包放在 `media/licenses/`。
