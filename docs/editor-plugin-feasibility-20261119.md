# Moye 编辑器插件可行性调研

调研日期：2026-11-19。检查本地 Moye v0.0.6（`e478ce3`）及宿主官方文档、源码。本文是可行性判断，未实现或运行宿主插件。

## 结论

**可以把 Moye 的图表阅读能力做成插件。优先考虑 VS Code，其次 Obsidian；Zed 当前公开扩展接口不足以承载同样的内嵌阅读体验。** 三个平台需要各自的插件包，可以共用图表渲染与交互代码。

产品定位建议为“技术文档与图表阅读增强”：保持原文，改善布局、字体、主题和大图查看；文件管理由宿主承担。这是结合当前代码与用户阅读目标的建议。

**WSL 为必需支持场景**：插件选型和实现都要覆盖 WSL 中的文档、相对图片及文档链接，不能只证明 Windows 本地文件可读。具体入口和验收要求见文末。

现成插件已有接近方案：Obsidian 的 Clean Mermaid 值得优先试用，VS Code 的 Markdown Preview Enhanced 可通过配置调整很多效果，PlantUML Local 已提供免 Java 的离线 PlantUML。不过，本次核查尚未找到直接复现 Moye 全套风格、尤其 ELK 流程图硬拐角处理的即装即用方案。是否独立开发应按下文的效果匹配判断，不能仅以宿主支持 Webview 作为立项理由。

| 宿主 | 可行性 | 适合的产品形态 | 主要依据与限制 |
| --- | --- | --- | --- |
| VS Code | 高，推荐先做 | Markdown 预览增强，或独立的 Moye 阅读标签页 | 有 Markdown CSS、markdown-it、预览脚本扩展点，也有自定义 Webview。[Markdown 扩展 API](https://code.visualstudio.com/api/extension-guides/markdown-extension)、[Webview API](https://code.visualstudio.com/api/extension-guides/webview) |
| Obsidian | 高，需适配内置渲染 | 在现有笔记阅读视图中增强图表 | 有 Markdown post processor、代码块处理器及自定义视图；接入图表可保留宿主的链接、嵌入和正文处理。[官方开发文档](https://github.com/obsidianmd/obsidian-developer-docs/blob/main/en/Plugins/Editor/Markdown%20post%20processing.md)、[公开 API](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts) |
| Zed | 当前不适合相同形态 | 暂保留独立 Moye；内嵌方案需新的宿主接口或修改 Zed 本体 | 当前文档与 Extension trait 没有公开任意 Webview、自定义阅读视图或 Markdown renderer hook。[官方扩展能力](https://zed.dev/docs/extensions/developing-extensions)、[Extension trait](https://github.com/zed-industries/zed/blob/main/crates/extension_api/src/extension_api.rs) |

## 现有代码能复用到什么程度

当前图表核心已经使用浏览器 DOM/SVG，未直接依赖 Tauri 文件接口：

- [src/diagrams.js](../src/diagrams.js)：Mermaid 初始化、明暗配色、字体、布局参数、ELK 连线修正与 SVG 输出。
- [src/plantuml.js](../src/plantuml.js)：`@plantuml/core` 浏览器引擎、Viz 图布局和统一样式。目前仅提供已打包资源，外部 include 和未打包标准库仍有限制。
- [src/main.js](../src/main.js)：`mountDiagram` 中的布局选择、原始大小、放大入口和错误显示，可抽出为图表组件。
- [src/zoom.js](../src/zoom.js)：缩放、拖动、适应窗口；目前模块顶层绑定固定 DOM ID，需要改成宿主可创建、可销毁的组件。
- [src/markdown.js](../src/markdown.js)：可供独立阅读标签页使用；Obsidian 的正文应优先交给宿主渲染，仅接入图表处理。

[src/desktop.js](../src/desktop.js) 中的文件选择、Rust invoke、窗口、WSL 路径和系统打开行为，需要由宿主接口替换或交给宿主已有功能。插件无需带入 Windows 安装器、独立文件树和搜索实现。

上述判断说明存在可共用的代码边界，尚不能给出移植比例或证明插件内运行成功。字体资源、异步模块、Viz/WASM、SVG Blob 和宿主内容策略仍需实际打包验证。

## VS Code：两种正式接入方式

**预览增强**：用 markdown-it 扩展识别图表围栏，预览脚本负责渲染和交互，CSS 控制阅读样式。复用内置 Markdown 预览，宿主继续承担编辑与预览联动。[官方 Markdown 扩展指南](https://code.visualstudio.com/api/extension-guides/markdown-extension)

**Moye 阅读标签页**：通过 Webview 提供完整阅读内容和图表交互，文件内容、资源地址、主题与生命周期由 VS Code 扩展连接。它适合把 Moye 现有视觉效果作为独立的阅读入口，用户从命令或编辑器入口打开。[官方 Webview 指南](https://code.visualstudio.com/api/extension-guides/webview)

结合本项目阅读优先、统一图表效果的目标，建议先评估独立阅读标签页；它便于由 Moye 统一管理 Mermaid/PlantUML 渲染。若选择增强默认预览，则要验证与内置 Mermaid 处理的协作，不能假定可直接同时接管同一围栏。

当前官方指南还提供实验性的 `markdown.codeBlockEditorProviders`，用于 Markdown 编辑器中的交互代码块。其作用范围和成熟度不同于常规阅读预览，本项目暂不需要依赖该实验接口。[官方说明](https://code.visualstudio.com/api/extension-guides/markdown-extension#add-code-block-editors-experimental)

## Obsidian：保留笔记语义，只增强图表

官方 `registerMarkdownCodeBlockProcessor` 接收代码块原文、目标元素和上下文，可以接入 PlantUML；Markdown post processor 可增强阅读视图。若需要独立 Moye 阅读视图，也有 `registerView`，但正文接管会额外涉及 Obsidian 特有链接、嵌入及其他插件的处理。[公开 API 类型及注释](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts)

需要特别注意当前版本：**Obsidian 1.15 已在 2026-11-02 将内置 Mermaid 绘图切换到 Pele**，并提供主题跟随、宽度自适应和缩放拖动。`loadMermaid()` 返回的兼容接口也由 Pele 实现，SVG 类名已经不同。[官方 1.15 发布说明](https://obsidian.md/changelog/2026-11-02-desktop-v1.15.0/)

因此，仅调整宿主现有图表外观，可以先使用其公开 CSS 变量；如果必须保持 Moye 的 Mermaid、ELK 布局和输出效果，需要自行打包渲染引擎，并实测与内置处理及其他图表插件的冲突。公开 API 文档没有证明重复注册内置 `mermaid` 处理器在所有模式下均可正确替换。Reading view 与 Live Preview 也应分别验收。

## Zed：现有限制在宿主扩展接口

Zed 官方列出的扩展功能是语言、调试器、主题、图标主题、片段和 MCP。核对当前 Rust Extension trait，未发现供插件建立任意 HTML/JS 阅读面板或接管 Markdown 代码块渲染的公开接口。这是当前公开接口的判断。[官方文档](https://zed.dev/docs/extensions/developing-extensions)、[公开扩展源码](https://github.com/zed-industries/zed/blob/main/crates/extension_api/src/extension_api.rs)

Zed 自身已经有 Mermaid 渲染，其 Markdown 预览通过内部 Markdown/GPUI 组件开启 `render_mermaid_diagrams`。本体代码能创建视图，不代表同样的能力已开放给普通扩展。[官方 Markdown 预览源码](https://github.com/zed-industries/zed/blob/main/crates/markdown_preview/src/markdown_preview_view.rs)

现有名为 PlantUML、Mermaid 的 Zed 扩展提供语言语法支持；manifest 注册 grammar，不能据名称将其认定为图表预览插件。[PlantUML manifest](https://github.com/gabeins/zed-plantuml/blob/main/extension.toml)、[Mermaid manifest](https://github.com/gabeins/zed-mermaid/blob/main/extension.toml)

## 已有替代品及 Moye 的价值

- **VS Code 的 Markdown Preview Enhanced**：已经支持 Mermaid、PlantUML、滚动同步和导出，可作为现成功能与效果对照；其 PlantUML 使用服务器或本地 jar。[作者仓库说明](https://github.com/shd101wyy/vscode-markdown-preview-enhanced)
- **Obsidian PlantUML**：现有社区插件支持 PlantUML，使用在线/自建服务器或本地 jar。[作者仓库说明](https://github.com/joethei/obsidian-plantuml)
- **内置能力也在进步**：当前 VS Code 官方文档已明确内置 Mermaid 渲染和缩放拖动；Obsidian 1.15 同样增强了图表体验。因此，“支持 Mermaid”或“可以缩放”本身不足以说明 Moye 的差异。[VS Code 官方 Markdown 文档](https://code.visualstudio.com/docs/languages/markdown#mermaid-diagram-rendering)、[Obsidian 官方发布说明](https://obsidian.md/changelog/2026-11-02-desktop-v1.15.0/)

Moye 值得验证的组合是：**Mermaid 与 PlantUML 统一阅读体验、随包离线渲染且无需额外 Java/图表服务、ELK/Dagre 布局选择、清晰字体与一致主题、专注查看大图**。其中离线 PlantUML 仍受当前已打包资源范围约束。这些是本项目现有能力及定位建议，尚未通过宿主内效果对照证明优于现成插件。

## 后续决策与验证边界

建议顺序为 VS Code → Obsidian，Zed 暂作为跟踪项。共用代码只抽取现有图表渲染和交互，按平台加入必要适配；无需提前建立通用插件框架。

正式实施时，先以同一批现有 Markdown 样本对照 Moye、宿主内置预览和现成插件，确认复杂图布局、离线 PlantUML、大图阅读是否有实际收益。宿主验收需要覆盖打开文档、图表完成渲染、主题切换、布局切换、放大拖动、切换与关闭文档，以及图表错误后正文继续可读。资源加载与宿主生命周期必须在真实插件中验证。

以上为调研阶段结论。后续已按 Markdown 预览边界实现 VS Code 插件，交付与验证范围见[实施验收记录](vscode-preview-validation-20261119.md)。

## 现成插件能否复现 Moye 风格

这里按现有代码对照：流程图/ER 默认 ELK，流程图 `curve: linear`，ELK 流程图输出后额外将 path 的 `Q` 段改成 `L` 段；再配合蓝灰颜色、1px 连线和随包字体。只支持 ELK、CSS 或 Mermaid 配置，不能直接认定已经达到相同效果。[Moye 实现](../src/diagrams.js)

### 优先对照的候选

| 插件 | 已确认的能力 | 与 Moye 效果的差距 |
| --- | --- | --- |
| [Clean Mermaid / Obsidian](https://github.com/aStudyMachine/clean-mermaid) | 自带 Mermaid 12 与 ELK，ELK/Dagre 切换，主题变量 JSON、图片化显示、缩放/展开及导出 | 最接近现有产品形态；源码配置 `curve: basis`，SVG 处理没有 Moye 的 Q→L 硬拐角步骤。主题 JSON 能调整颜色等变量，但不等于移植任意渲染参数和字体嵌入。README 验收版本为 1.14.4，尚未证明 1.15 接管成功。未找到 PlantUML 围栏实现。 |
| [Markdown Preview Enhanced / VS Code](https://github.com/shd101wyy/vscode-markdown-preview-enhanced) | Markdown 阅读、Mermaid/PlantUML、自定义 `mermaidConfig`、CSS 和预览脚本 | 最适合先做配置对照；可迁移配色、字体名、布局与间距参数。本次检查的渲染代码直接写入 Mermaid SVG，没有 Moye 的硬拐角处理。其 PlantUML 路径为 jar/服务器，区别于 Moye 浏览器引擎。 |
| [Mermaid Preview / VS Code](https://github.com/Mermaid-Chart/vscode-mermaid-preview) | Markdown 内 Mermaid、本地预览、缩放和导出，源码注册 ELK | 公共设置主要是主题枚举、缩放上限等；渲染代码直接写 SVG。未发现一键复现 Moye 主题及硬角的设置，也未提供 PlantUML 一体方案的证据。 |
| [PlantUML Local / VS Code](https://github.com/kkdev92/plantuml-local) | 在内置 Markdown 预览渲染 PlantUML，随包 `@plantuml/core` 与 Viz.js，无 Java/服务器要求 | 可以直接补齐免 Java 的离线 PlantUML，说明这一能力已有现成实现；Mermaid 风格仍由其他渲染器承担。它接入的是内置预览，不能默认认为会接管 MPE 自己的预览。 |

Clean Mermaid 的关键依据：[渲染配置](https://github.com/aStudyMachine/clean-mermaid/blob/main/src/mermaid-runtime.ts)、[SVG 处理](https://github.com/aStudyMachine/clean-mermaid/blob/main/src/svg-utils.ts)、[主题变量](https://github.com/aStudyMachine/clean-mermaid/blob/main/src/themes.ts)、[版本验收范围](https://github.com/aStudyMachine/clean-mermaid/blob/main/README.md#notes--compatibility)。作者最低版本声明不能替代后续版本的实际验收。

MPE 的关键依据：[配置文档](https://github.com/shd101wyy/markdown-preview-enhanced/blob/master/docs/config.md)、[自定义 CSS](https://github.com/shd101wyy/markdown-preview-enhanced/blob/master/docs/customize-css.md)、[实际 Mermaid 渲染](https://github.com/shd101wyy/crossnote/blob/develop/src/webview/containers/preview.ts)、[用户脚本开关说明](https://github.com/shd101wyy/vscode-markdown-preview-enhanced/blob/develop/package.nls.json)。`onDidParseMarkdown` 是 Markdown→HTML 的处理钩子；Mermaid 图在 webview 内另行渲染，不能将其误认为“最终 SVG 已完成”的回调。若加入脚本处理 SVG，属于需要维护和验证的定制代码。

Mermaid Preview 的关键依据：[设置声明](https://github.com/Mermaid-Chart/vscode-mermaid-preview/blob/master/package.json)、[ELK 注册及 SVG 输出](https://github.com/Mermaid-Chart/vscode-mermaid-preview/blob/master/src/previewmarkdown/shared-mermaid/index.ts)。

### 两个容易误判的地方

1. **正交路由不等于没有圆角。** 本次读取的 Mermaid develop ELK renderer 仍有 `layoutEdge.curve = 'rounded'` 的设置；Moye 处理的是最终 SVG 中的圆角段。不能只凭配置出现 `linear` 或插件说明写着 right-angle 判断效果相同。[上游 ELK renderer](https://github.com/mermaid-js/mermaid/blob/develop/packages/mermaid/src/rendering-util/layout-algorithms/elk/render.ts)
2. **Obsidian 历史插件说明不代表当前可用。** 搜索可见 Mermaid Nixie 的“ELK、直角、间距”介绍，但作者当前 README 已声明退役，最终版本仅显示通知，不推荐使用。[作者退役说明](https://github.com/jaskaran-sethy/obsidian-mermaid-nixie)。1.15 使用的 Pele 有自己的布局，线的路径和节点位置与 Mermaid 不同，不能仅复制配置认定一致。[Pele 官方兼容说明](https://github.com/obsidianmd/pele/blob/main/website/src/content/docs/compatibility.md)

### 开发还是使用现成插件

**个人使用且可接受接近的外观**：先对照 Clean Mermaid（Obsidian）或 MPE 的配置能力（VS Code）。免 Java PlantUML 可以另评估 PlantUML Local 与 VS Code 内置预览的组合，无需为这一项开发新插件。

**要求沿用 Moye 的连线、排版、字体和 Mermaid/PlantUML 统一效果，且不逐篇修改文档**：建议复用 Moye 现有渲染核心，开发独立的宿主插件。这样直接维护自己已经调好的渲染结果。与在另一款插件中维护主题、用户脚本、上游版本和输出修正相比，这更符合当前产品目标；这是工程取舍，尚无工时实测。

**候选插件源码显示可配置，不代表实际图形已达标。** 本次已核对上述文档和关键代码，未安装候选插件，也未完成同图截图对照，因此不能承诺视觉等价；本次检索也不构成对所有市场插件的穷尽证明。

## WSL 支持要求

WSL 是选型的必要条件。VS Code 首要验收入口为 Windows 客户端通过 WSL 扩展打开 Linux 工作区，例如 `/home/.../project`；同时对照现有 Moye 从 Windows 访问 WSL 共享路径的入口，例如 `\\wsl.localhost\Ubuntu\home\...`。两者的文件访问路径不同，应分别验证。

VS Code 已提供远程工作区扩展宿主，工作区扩展可在 WSL 环境运行；Webview 仍位于客户端。文档与关联资源应通过完整资源 URI 和 VS Code 文件 API 处理，Webview 资源通过 `asWebviewUri` 转换，动态内容使用消息传递。这样可以复用宿主的 WSL 文件访问，不必移植 Moye 桌面版的发行版选择器。[官方远程扩展指南](https://code.visualstudio.com/api/advanced-topics/remote-extensions)、[官方 WSL 指南](https://code.visualstudio.com/docs/remote/wsl)

验收事件序列为：打开 WSL 工作区 → 打开 Markdown → 正文、相对图片及 Mermaid/PlantUML 完成显示 → 点击相对 Markdown 链接 → 切换主题和布局、放大拖动 → 修改文件后预览同步更新。还需覆盖中文/空格路径、关闭后重新打开，以及 Windows 本地工作区的相同行为。图表渲染依赖随插件打包，阅读期间无需另启 WSL 图表服务或安装 Java。

以上是待实现或待验证的要求。前述现成插件本次尚未在 Remote WSL 或 WSL 共享路径上实测，不能据其支持 VS Code 或本地渲染就判定满足。Obsidian 的 WSL 文件访问同样需要单独验收。
