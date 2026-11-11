# 墨页 Markdown 代码渲染调研

调研日期：2026-11-11。依据当前仓库与上游官方文档、源码；下文保留选型依据，接入结果与验收边界见文末。

## 结论

建议优先采用 **Shiki**，保留现有 markdown-it，使用 GitHub 浅色/深色主题。它使用 TextMate 语法与主题，与 VS Code 的语法着色体系一致，适合墨页技术文档阅读的目标。[Shiki 简介](https://shiki.style/guide/)、[双主题示例](https://shiki.style/guide/dual-themes)

如果更看重最少改动、同步调用和较简单的资源管理，**highlight.js** 是合适备选；**Prism** 的现成工具栏插件更丰富；**Expressive Code** 适合需要完整编辑器/终端边框、标记和折叠的文档站，当前墨页仅为改善代码可读性引入它，集成面偏大。这是结合墨页现状的取舍，不是对所有产品的统一排名。

## 当前问题

`src/markdown.js` 创建 MarkdownIt 时没有配置 `highlight`，普通代码围栏直接交给默认 renderer；`src/style.css` 只设置代码字体、底色、圆角和边框。因此截图中的关键字、字符串、函数名没有语法颜色，主要原因是尚未接入高亮器。

当前代码字号为正文的 `.88em`，正文为 15px，即 13.2px；代码行高继承正文的 1.72。可在实际对照中尝试 14px、1.6 行高，配合更中性的代码底色。字号、行高和配色是视觉建议，不能仅凭截图认定为唯一正确值。

## 候选比较

| 方案 | 实际能力 | 墨页接入与取舍 |
| --- | --- | --- |
| Shiki | TextMate 语法、编辑器主题；支持同一份 HTML 携带明暗两套 token 颜色；有官方 markdown-it 插件。[简介](https://shiki.style/guide/)、[双主题](https://shiki.style/guide/dual-themes)、[markdown-it 集成](https://shiki.style/packages/markdown-it) | 推荐用于效果优先的阅读体验。初始化通常异步，加载完成后 `codeToHtml` 可同步调用；细粒度导入语法、主题，避免主入口把全部异步资源加入产物。[同步使用](https://shiki.style/guide/sync-usage)、[打包说明](https://shiki.style/guide/bundles) |
| highlight.js | 提供明确语言高亮和自动检测，可导入 core 或 common，再注册所需语法；颜色由 CSS 主题控制。[使用说明](https://highlightjs.readthedocs.io/en/latest/readme.html)、[API](https://highlightjs.readthedocs.io/en/latest/api.html) | 最少改动备选：在 markdown-it 的 `highlight` 回调中返回 token HTML，由原 renderer 保留外围标签。按围栏语言执行，不建议默认自动检测；查到语法再高亮，未知语言正常显示文本。明暗主题需由墨页 CSS 选择器管理。 |
| Prism | 正则语法、CSS token 样式；提供语言标签、行号、复制等插件，复制插件依赖 Toolbar。[官方介绍](https://prismjs.com/)、[复制插件](https://prismjs.com/plugins/copy-to-clipboard/)、[语言标签](https://prismjs.com/plugins/show-language/)、[行号](https://prismjs.com/plugins/line-numbers/) | 适合明确需要现成代码块交互的场景。接入同步高亮本身较直接；语言依赖与插件加载顺序需要管理。官方明确其正则语法有边界失败情况，不能把它视为完整语言解析器。[限制](https://prismjs.com/#limitations) |
| Expressive Code | 提供 VS Code 主题、编辑器/终端框、复制、标记、可选折叠；有 Astro、rehype 等集成。[官网](https://expressive-code.com/)、[安装](https://expressive-code.com/installation/) | 可参考其代码块外观。它有可独立使用的 core API，但 `render()` 异步，调用方还需加入返回的样式及插件脚本；与当前同步 markdown-it 阅读流程相比，接入面更大。[Core API](https://expressive-code.com/reference/core-api/) |

三种高亮库都能把 npm 模块和所选资源随应用打包；墨页实现时应使用本地依赖，避免代码渲染依赖 CDN。不能用上游宣传的核心包大小直接推断墨页安装包增量；实际增量取决于语法、主题、引擎、压缩和构建结果。

## 推荐的显示效果

可直接打开[离线交互对照预览](code-highlighting-preview.html)：使用截图所在文档的 JavaScript、SQL、JSON 原文，同时显示当前无高亮、Shiki、highlight.js 和 Prism；可切换浅色/深色主题。预览版本为 Shiki 4.6.0、highlight.js 11.12.0、Prism 1.30.0，依赖只装在临时目录，未改项目依赖。代码块外框和复制按钮是预览页自己实现的统一外观，不代表三种库内置这些交互。

1. **主题跟随应用**：浅色用 `github-light`，深色用 `github-dark`，也可在预览中比较默认系列或 Vitesse。Shiki 的内置主题可查看官方效果列表。[主题预览](https://shiki.style/themes)
2. **代码易读优先**：关键字、字符串、函数、数字分色；等宽字体、适度留白、横向滚动，保留缩进与原文内容。无需为简单阅读额外加编辑器、执行按钮或复杂装饰。
3. **轻量代码块头部可选**：语言名称和复制按钮有明确用途；行号暂不作为默认要求。复制应只复制原始代码。Shiki 主要负责着色，外围交互由墨页负责；若采用 Prism，可复用其对应插件。
4. **明暗切换不重新解析正文**：使用 Shiki 双主题 CSS 变量，选择器对接已有 `:root[data-theme="dark"]`。可以配置 `defaultColor: false` 后由 CSS 统一选择颜色，避免在内联颜色上反复覆盖。[双主题](https://shiki.style/guide/dual-themes)

以上是墨页显示建议，主题“更好看”仍应以同一份 JavaScript、SQL、JSON、Shell 的实际预览判断，不能仅凭库介绍下结论。

## 接入时必须保留的现有行为

- **图表分流**：`mermaid`、`plantuml` 继续走现有 figure 渲染，普通语法高亮不接管这两个围栏。无需替换整套 Markdown 解析器。
- **源行定位**：当前 token 的 `data-source-line`、`data-source-end` 被文件夹搜索跳转使用。官方 Shiki markdown-it 插件设置 `options.highlight` 并返回完整 `<pre>`。[插件源码](https://github.com/shikijs/shiki/blob/main/packages/markdown-it/src/core.ts) 本地对现有 markdown-it 15.0.3 的最小实验确认：这种返回值会跳过默认外围标签拼装，token 上这两个属性不会自动出现在输出中。实现应显式把属性传给高亮后的节点，并验收搜索跳转。
- **正文查找**：`src/document-find.js` 已支持跨内联节点匹配，正常 token span 应可复用。若添加工具栏，应排除语言名、按钮等辅助文字，避免 Ctrl+F 产生与正文无关的命中；仍需浏览器验证跨多个高亮 span 的匹配。
- **未知语言**：按已加载语法和别名选择高亮；无语言、`text` 或不支持的围栏保持原文显示，不让一块代码阻止整篇文档打开。Shiki 的 `text` 可跳过着色，`txt`、`plain` 是其别名。[语言说明](https://shiki.style/languages) highlight.js 的 `getLanguage()` 可识别已注册语法和别名。[API](https://highlightjs.readthedocs.io/en/latest/api.html)
- **离线与内容边界**：保留 `html: false`，代码内容仍由渲染器转义。语法、主题和引擎资源随 Vite 构建打包。现有 Tauri CSP 允许内联样式和 WASM，但该配置不是安装版运行成功的证据。

Shiki 的 JavaScript 引擎免去 Oniguruma WASM，官方建议浏览器场景考虑它；它的语法兼容性和运行环境能力仍需核对。Oniguruma 是默认引擎，提供更完整的兼容性。墨页可先测 JavaScript 引擎，再依据目标 WebView2 与常用语法决定是否采用 Oniguruma，不必仅为截图中的 JavaScript 提前固定引擎。[引擎说明](https://shiki.style/guide/regex-engines)

## 验证边界

本次完成官方资料核对、现有渲染与主题/搜索代码检查，以及 markdown-it 完整 `<pre>` 返回值丢失 token 属性的最小实验。独立 Chrome 预览确认三种候选生成着色 span，JavaScript、SQL、JSON 的可见代码内容一致，语言切换正常；浅色/深色截图已人工查看，Shiki token 与背景随主题切换；页面未请求外部资源，未捕获脚本错误。复制结果尚未确认，一次脚本触发的剪贴板写入等待导致 CDP 超时，不能据按钮存在认定复制验收通过。

这些检查仅针对独立预览。尚未证明任一候选已经在墨页 Windows 安装版中工作，也未测量产物增量、长文高亮耗时、安装版离线启动、正文查找或图表混排回归。

## 实施结果（2026-11-11）

已接入 Shiki 4.6.0 的 JavaScript 正则引擎、GitHub Light/Dark 双主题和 21 种常用语法，使用细粒度导入。只有普通代码围栏会触发高亮模块加载，构建生成的独立块为 1,341.75 kB，gzip 191.92 kB；明暗切换通过 CSS 完成。代码块提供语言标签、复制按钮和状态提示，未知语言保留 Markdown 默认转义输出。异步渲染完成后再次检查打开请求序号，防止较早的文档覆盖较新的选择。

验证：5 项 Node 测试通过，覆盖原有图表逻辑和新增的别名、源码行、转义、未知语言、图表混排；21 种语法分别试渲染通过，Vite 生产构建通过。在独立 Chrome 中打开截图对应的原始文档，确认 JavaScript/SQL/JSON 高亮、主题切换及 4 张图表显示，正文查找可跨多个着色 span 命中，并排除工具栏文字。复制按钮的剪贴板写入参数与代码原文一致，观察到成功状态；没有以自动化剪贴板读取证明系统剪贴板内容。页面没有外部资源请求。另确认内置阅读示例中高亮和纯文本块均正常显示。

产品构建截图：[浅色](images/code-highlighting-light.png)、[深色](images/code-highlighting-dark.png)。此次未构建或验收 Windows 安装包，完整文件夹搜索到代码块的跳转和长文性能仍需在桌面版验证。
