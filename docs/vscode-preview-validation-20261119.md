# Moye VS Code 预览插件实施与验收

日期：2026-11-19。插件版本：0.1.0。包名：`eval1007.moye-preview`。

## 交付

Moye 在 VS Code 中仅提供 Markdown 阅读预览、Mermaid/PlantUML 图表和大图查看。文件树、搜索、编辑与保存沿用宿主。通过可选 CustomTextEditorProvider 接入，可从编辑器标题、资源管理器、命令面板或 Reopen Editor With 打开。

插件与桌面版共用 Markdown、Shiki、图表渲染、字体、样式和缩放；新增 `src/diagram-panel.js` 统一图表工具栏、布局选择与 SVG 生命周期。图表引擎原有配色、ELK 硬拐角处理和 PlantUML 样式未改变。

构建：`npm run package:vscode`。VSIX 为 `dist-vscode/moye-preview-0.1.0.vsix`，3,641,167 字节，109 个文件。运行依赖随包分发，未打包 Tauri，也无需 Java/图表服务器。GitHub 发布使用独立标签 `vscode-v0.1.0`，不替换桌面版的 Latest 发布；本次未发布 VS Code Marketplace。

## 验证结果

环境为 Windows VS Code 1.145.0、WSL Ubuntu、Node.js 24.20.0；使用任务专用 user-data-dir 和 extensions-dir。Remote WSL 使用真正的远程扩展宿主；Windows 共享路径以 `file://wsl.localhost/Ubuntu/...` 打开。测试样本来自仓库 `samples/reading-demo.md`，另添加中文/空格路径、相对链接与错误图表。

| 验证项 | 结果与证据范围 |
| --- | --- |
| Remote WSL 初始阅读 | 中文/空格目录下的正文、流程图、时序图、PlantUML、ER 图及相对 SVG 图片均正常；4 张图和图片的 `naturalWidth` 均大于零。 |
| Remote WSL 自动更新 | 在 Linux 侧改写文档后，预览出现新增段落；在 VS Code 编辑器中输入未保存内容后，预览同步出现该内容。 |
| 相对文档与标题链接 | 从预览点击中文 Markdown 链接，目标文档在 Moye 中打开；URI 保留远程/共享 authority。片段定位亦有边界测试。 |
| 主题和布局 | 预览跟随 VS Code 从浅色切换深色；流程图切换 Dagre 后重新显示，无图表错误。 |
| 大图与复制 | VS Code 内放大打开图表画布，缩放比例随按钮变化；关闭后返回正文。代码复制经宿主剪贴板 API 返回成功并显示“已复制”；未另行读回系统剪贴板。 |
| 错误图表 | 添加非法 Mermaid 源码后显示独立错误，原有 4 张图仍成功，后续正文可读。 |
| Windows 共享路径安装包 | 将 VSIX 解包注册到隔离的 Windows 本地扩展目录，运行实际包内容；读取 WSL 文件、4 张图和相对图片成功，手动刷新后出现 Linux 侧新增内容。 |
| 桌面版共用代码回归 | `npm run build` 通过；Chrome 打开最终浏览器构建的内置示例，4 张图加载成功，无页面错误，大图正常。未重新构建 Windows NSIS。 |
| 边界测试 | `node --test tests/*.test.js` 共 8 项通过：包括已有布局/硬拐角/高亮，以及 Remote WSL 和 UNC URI、目录穿越与命令链接拒绝、刷新保留未保存内容、旧读取/关闭后的结果失效。 |

## 已确认限制

- Windows 直接访问 WSL UNC 目录时，本机 VS Code 文件监听报告 `EISDIR` / `Failed to read changes (EUNKNOWN)`，Linux 侧外部修改未自动通知。插件提供显式刷新，以磁盘最新内容更新；文档存在未保存编辑时优先显示编辑内容。推荐 Remote WSL 主入口，其自动更新已经通过实测。没有加入轮询或重试。
- 以 UNC 路径加载开发目录并在运行中重新构建时，本次环境出现 Webview 资源重复内容导致的模块解析错误；实际包改从 Windows 本地扩展目录运行后未复现。Windows 开发调试宜使用本地打包结果，或使用 Remote WSL 加载源代码。
- PlantUML 的外部 include 与未打包标准库仍受现有 Moye 引擎配置限制。
- 本次未逐项验收 Ctrl+F、所有图种、触控手势或多发行版；未证明所有历史 VS Code 版本均兼容。

## 本次保护逻辑的依据

Webview 消息和链接是输入边界，限制可触发的动作、链接协议和目录范围；异步版本校验用于阻止快速编辑或关闭后，旧图表/磁盘读取覆盖当前预览。单图错误继续按既有逻辑展示错误与原文。未增加通用重试、缓存、轮询或额外开关。

使用说明见[插件 README](../extensions/vscode/README.md)。
