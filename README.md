# film_photo

胶片照片 Web App，以及相机模型和共享素材相关工具。

## 开始工作前

Agent 请先阅读 [AGENTS.md](AGENTS.md)：文件在本地工作区编辑，代码通过 Mutagen
同步，应用和检查在对应远程工作区运行，Git 操作始终在本地完成。

## 已有能力与文档入口

| 要做的事情 | 先看这里 |
| --- | --- |
| 浏览器查看 3D 模型、GLB 旋转预览、iPad 远程看模型 | [通用模型预览器](standalone/model-viewer/README.md) |
| 给预览器增加模型、标题或默认视角 | [模型配置清单](standalone/model-viewer/models.json) |
| 查找或保存照片、Blender 文件、GLB、贴图和渲染图 | [共享资源工作流](SHARED_ASSETS.md) |
| 本地/远程路径、Tailscale 服务、Git 与 Blender 操作规则 | [Agent 项目指引](AGENTS.md) |

## 通用模型预览器

`standalone/model-viewer/` 是可复用的独立模块，**后续模型预览优先复用这里**。
它支持模型切换、固定链接、鼠标/触控旋转、双指缩放和平移，并独立于现有 Web App。

新增模型时，将标准 GLB 放入共享生成资源目录，在 `models.json` 增加配置项，
同步并更新部署服务，然后使用 `/?model=<id>` 访问。完整字段、启动方式、
部署模板及测试命令见[模块 README](standalone/model-viewer/README.md)。
通用逻辑保留模型自带材质；特殊模型的材质适配放入显式启用的 `profiles/`。

交接给另一个 agent 时，可以直接写：

> 先读根目录 AGENTS.md 和 standalone/model-viewer/README.md，复用现有通用预览器，
> 把新模型加入 models.json，保留已有模型链接，不接入现有 Web App。

代码和这些文档已纳入 Git；其他分支或工作区需要包含相关提交。模型二进制资源
不随 Git 克隆分发，需要按 [SHARED_ASSETS.md](SHARED_ASSETS.md) 使用共享目录。
