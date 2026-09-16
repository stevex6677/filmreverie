# film_photo

胶片照片 Web App，以及相机模型和共享素材相关工具。

## 开始工作前

Agent 请先阅读 [AGENTS.md](AGENTS.md)：文件在本地工作区编辑，代码通过 Mutagen
同步。默认在对应远程工作区运行应用和检查；用户明确要求本地启动时，应用必须
运行在本地 Mac。Git 操作始终在本地完成。

## Local startup and iPad/iPhone access

When the user says **"start the app locally"**, start the application process on
the **Mac**, in the active local checkout. A localhost link forwarding to a remote
server does not count as local startup. Necessary local dependencies and startup
preparation are allowed; builds and tests remain remote unless separately requested.

For local startup, expose the Mac app directly through Tailscale Serve. For remote
startup, expose its SSH localhost tunnel through Tailscale Serve. Follow
[AGENTS.md](AGENTS.md) for port/hostname checks and setup.

After either kind of startup, verify and share **both** links using the actual port:

- This Mac: `http://localhost:<port>`
- iPad/iPhone: `http://macbook:<port>` (or the verified Mac Tailscale hostname)

State whether the app runs locally or remotely. The iPad/iPhone must be connected
to the same Tailscale network.

## 已有能力与文档入口

| 要做的事情 | 先看这里 |
| --- | --- |
| 保存胶卷展示架、包装图片与素材准备 | [胶卷包装模块](public/assets/film-packaging/README.md) |
| 查 Mamiya 最新可编辑 .blend、GLB、渲染和继续工作状态 | [当前模型状态](blender/mamiya_universal/CURRENT.json) |
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

## Playwright video recording

Routine tests default to `PLAYWRIGHT_VIDEO=off`; screenshots and pixel/interaction
assertions still run. Existing optional video exports are produced only when
recording is enabled. Enable recording for selected motion reviews or debugging:

```sh
# Run in the mapped remote checkout after flushing its Mutagen session.
# Use the normal artifact/output directory overrides for the current run.
PLAYWRIGHT_VIDEO=on npm run test:e2e -- m16-table-view --project=mobile-chrome
```

The only supported values are `off` (default) and `on`. Keep video scoped to the
tests being reviewed; inspect it before claiming a motion review. Old recordings
remain historical artifacts and do not indicate that a new run recorded video.

## Roll sizes and capacity

Choose **35mm** or **120** when creating a roll. 35mm starts with a 36 × 24 mm
frame; 120 starts in **Free** mode. The optional frame-size selector offers the
existing 120 presets (6×4.5, 6×6, 6×7, 6×9). Fixed sizes crop to fill the frame,
with crop positioning in Review. Free keeps each rotated image's full aspect
ratio at a shared height: 24 mm for 35mm and 56 mm for 120.

Capacity starts with a nominal usable span, excluding leaders: **1,404 mm for
35mm** (36 × 39 mm advances) and **728 mm for 120**. Both receive **25% extra
allowance** for special cases, giving hard limits of **1,755 mm** (45 standard
35mm frames) and **910 mm** for 120 (for example, 15 frames at 6×6). The meter
shows a nonblocking notice beyond the nominal span; 40 standard 35mm images
can be saved without an override. These are application limits, not claims about
physical film length. Each image
uses its frame width plus 3 mm of spacing. Free width is height × oriented
aspect ratio. The live meter updates after size changes, rotation, and removal;
overfull drafts remain editable, but cannot be saved. Storage validates the same
limit atomically. Existing rolls without a sizing field retain their fixed format
and remain readable, including older overfull rolls; saving an overfull edit
requires reducing its length.

Free rolls wrap into strips by length (230 mm image span), keeping each image
whole. A wider single image gets its own strip. The complete layout scales to
fit the light table, with camera space reserved for controls. Navigation, crop
previews, rebate apertures and loupe hit testing use each frame's actual width.
The import processing guard is derived from the maximum number of 3 mm advances,
so the old 72-image cap no longer rejects valid narrow-image rolls. File-size
and memory safeguards still apply.

## Saved-roll shelf

Click/tap the cabinet, or choose **Rolls**, to approach the 4×4 shelf. Each colored
block holds one saved roll: a 35mm cartridge with its single-roll box, or a 120 package, beside a wood-framed
cover photo. Covers follow the saved crop and rotation. Gray packages remain
inactive placeholders. Click/tap a saved block to edit its roll. The editor keeps roll details on
the left, frames at the upper right, and crop/rotation/cover/order controls below.
On phones these sections stack. Hover (or focus and press Arrow Down) for a
preview card with **Open on light table**, **Edit roll**, and **Delete roll**. **New roll** opens the photograph importer. **Trash** shows
deleted rolls on the shelf with Restore; deletion also offers Undo. Additional
pages accommodate more than 16 saved rolls. Back to room/Escape restores the room view.
Dragging over the cabinet in room mode moves the view, just like dragging the room.
Dragging in shelf mode smoothly returns to the room; clicking a saved roll still opens its editor.
Shelf entry and exit animate for about 0.42 seconds. Navigation stays available
during the flight: drag to return/look around or choose another destination immediately.

Film, cartridges, cartons and frames share a fixed millimeter scale. Packages
have identical dimensions in saved and gray blocks; compact compartments fit
the 143×115.3 mm picture frame, with a 2 mm wood edge and a narrow mat. Film no longer shrinks with roll
length. Carton dimensions are documented nominal envelopes; see the
[dimension audit](public/assets/film-packaging/README.md#physical-scale-and-dimension-audit-2026-09-16).
The photo opening is 105.3 mm tall, one-third taller than a 120 carton;
wide covers fit within the opening while preserving their saved crop.
Compartments measure 310×135×85 mm. Film packages and cover frames all turn
10° in the same direction, with spacing based on their rotated footprints.
All 35mm cartons use a compact single-roll envelope; Portra 160/400 use authored
single-roll artwork adaptations.

The five-photo example is saved once in slot 01. Existing rolls shift one slot
when it is first added; their photographs and timestamps are preserved. Editing
or deleting the example persists across reloads. There is no separate archive
grid or built-in-example button. All records and photographs stay in this browser.

Real packaging photographs cover all five supported Kodak stocks in 35mm and
120. See the [packaging manifest and preparation instructions](public/assets/film-packaging/README.md)
and [M18 review record](artifacts/m18-candidates/REVIEW.md) for sources and validation.
