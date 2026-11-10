# 墨页顶部界面调研

调研日期：2026-11-10。依据官方文档与官方界面说明；没有据截图推断工具栏像素尺寸，也没有实装对比所有平台。

## 结论

墨页面向主要阅读 Markdown 的用户。当前系统标题栏下又常驻一整行品牌、文件夹名、主题和多个打开入口，重复信息多，阅读状态下使用频率低。建议取消这条独立品牌工具条，把常驻空间交给当前文档位置、文件导航和搜索。此处是针对墨页的设计判断，不是各工具统一遵循的强制规范。

## 主流工具的做法

| 工具 | 官方资料可确认的做法 | 对墨页的参考价值 |
| --- | --- | --- |
| Typora | 打开文件/文件夹通过 File → Open；文件侧栏底部菜单可切换文件夹，Recent Locations 管理最近位置；Quick Open 用于文件定位。侧栏可切文件树、列表和目录。侧栏开关在 macOS 标题栏、Windows/Linux 状态栏，位置存在平台差异。[Quick Start](https://support.typora.io/Quick-Start/)、[File Management](https://support.typora.io/File-Management/) | 打开、切换文件夹等入口可以进入文件菜单或侧栏菜单；没有必要将每个入口常驻为大按钮。 |
| Obsidian | 桌面以可收起的侧栏、文档标签页、左侧竖向 Ribbon 和文档右上更多菜单组织功能。Quick switcher 可搜索文档，空查询显示最近文档。主题和系统/明暗外观位于 Settings → Appearance；设置可由侧栏或命令面板进入。[Workspace](https://obsidian.md/help/workspace)、[Quick switcher](https://obsidian.md/help/Plugins/Quick+switcher)、[Settings](https://obsidian.md/help/settings) | 常驻入口分为全局操作和当前文档操作，低频设置进入菜单。不能简单概括为“Obsidian 没有工具栏”；它有 Ribbon 和可配置标题栏。 |
| VS Code | 文件树在 Explorer；文档以编辑区标题上的标签页表示；Ctrl+P 定位文件、Ctrl+Shift+P 进入命令。主题从 Preferences/命令选择器进入。Windows/Linux 菜单栏可折叠或隐藏。[User Interface](https://code.visualstudio.com/docs/editing/getting-started/userinterface)、[Themes](https://code.visualstudio.com/docs/configure/themes) | 把文件和正文操作分别放在对应区域，避免将入口平铺。其 Command Center 是在自定义标题栏里整合搜索的设计，不能据此认为墨页需要再加一条搜索栏；官方历史说明见 [1.82](https://code.visualstudio.com/updates/v1_82#_command-center-now-on-by-default)。 |
| Zed | Project Panel 放文件树；Ctrl+P 按文件名/路径查找，Ctrl+Shift+P 进入命令；File → Open 和 File → Open Recent 管理项目。主题由 Theme Selector 和设置管理；标题栏可按设置显示项目、分支、用户菜单等元素。[Finding & Navigating](https://zed.dev/docs/finding-navigating)、[Windows & Projects](https://zed.dev/docs/windows-and-projects)、[Appearance](https://zed.dev/docs/appearance)、[Title Bar settings](https://zed.dev/docs/reference/all-settings#title-bar) | 顶部保留有用的上下文或集中入口，设置与打开操作不必平铺。Zed 功能和项目模型比只读阅读器复杂，不建议照搬整套布局。 |

Typora 的菜单主题入口也由官方 [About Themes](https://support.typora.io/About-Themes/) 明确说明。以上文档列出的是可靠的操作入口，不能凭文档未列出某按钮，就断言所有版本和平台都不存在该按钮。

## 墨页建议

1. 删除第二层整条品牌工具条，应用名保留在窗口标题；当前文件夹名保留在文件树顶部，避免三处重复。
2. 全局保留一个可见的“文件”菜单：打开文件、打开文件夹、WSL 路径、最近打开。主题收进“外观”子菜单，仍默认跟随系统。鼠标用户能找到入口，快捷键作为补充。
3. 阅读区顶部如需常驻一行，只显示当前文档的短路径/文件名，以及收起侧栏、查找和更多操作。没有打开文档时不制造空标题行；未打开文件夹的首页继续放明确的打开入口。
4. 文件树标题旁放搜索或切换文件夹入口；当前正文使用 Ctrl+F，文件定位使用 Ctrl+P，全文搜索使用 Ctrl+Shift+F。不要为了模仿编辑器新增多标签、Git 或 AI 工具栏。
5. Windows 可分两步实现：先移除重复工具条并整理菜单；若以后要把菜单与窗口按钮合成一层，再单独验收窗口拖动、最大化、双击、系统菜单、缩放和键盘操作。仅删除当前品牌栏并不必然要求重写原生窗口标题栏。

推荐的阅读状态：`[侧栏开关] 文件菜单 | 当前文档短路径 | [查找] [更多]`。这是功能分区草案，不是已实现效果，也不规定最终控件尺寸。
