# 通用 3D 模型预览器

独立于现有 Web App。支持鼠标与 iPad 触控旋转、双指缩放/平移、视角预设、
自动旋转和模型切换。新增模型只修改配置，不需要复制网页。

当前入口：<http://remote.tail2b1388.ts.net:4180/>

Mamiya 固定链接：<http://remote.tail2b1388.ts.net:4180/?model=mamiya-universal>

访问设备需连接同一获准的 Tailscale 网络。

## 添加新模型

1. 准备包含贴图的标准 GLB，放进共享 `ignored_generated/` 下的独立目录。
2. 在 `models.json` 的 `models` 数组增加一项，`asset` 相对于资源根目录。
3. 同步代码和资源，重启预览服务，访问 `/?model=你的模型ID`。

例如保留现有 Mamiya 条目，并增加：

```json
{
  "id": "new-sculpture",
  "title": "新雕塑",
  "subtitle": "第一版",
  "asset": "blender/new-sculpture/runs/your-run/model.glb"
}
```

`defaultModel` 决定首页打开哪个模型。配置多个模型后自动显示切换菜单。
每个模型链接可独立收藏，刷新后仍打开同一模型。

必要字段只有 `id`、`title`、`asset`。可选字段：

| 字段 | 用途 |
| --- | --- |
| `titleAccent`, `subtitle`, `eyebrow`, `edition`, `caption`, `captionDetail` | 展示文字 |
| `rotation` | XYZ 欧拉旋转，单位弧度；默认 `[0,0,0]` |
| `camera.home/front/rear/side` | 视角方向向量；模型自动居中并统一显示尺寸 |
| `camera.distance`, `camera.portraitDistance` | 横屏/竖屏初始距离，范围 1.15–9 |
| `exposure` | 曝光，默认 1.15 |
| `profile` | 默认 `default`，保留 GLB 自带材质、UV 和法线 |

Mamiya 专属法线和镀膜调整放在 `profiles/mamiya.js`，由配置显式启用。
通用渲染器不根据相机名称修改其他模型。扩展 profile 时需在 `catalog.mjs`
及 `server.mjs` 的白名单注册；普通模型无需专属 profile。

## 目录职责

- `models.json`：模型清单、文案、默认视角。
- `catalog.mjs`：配置校验、资源路径、公开配置。
- `index.html`、`style.css`：通用界面和平板布局。
- `viewer.js`：加载、自动居中、灯光、视角、鼠标/触控交互。
- `profiles/`：可选模型适配，默认不改材质。
- `server.mjs`：私有服务、模型路由、Range、缓存。
- `deploy/`：systemd 部署模板与生成器。
- `tests/`、`verify.mjs`：配置、复用和浏览器验证。

代码、配置、锁文件、文档纳入 Git；GLB、贴图、截图、依赖目录不纳入 Git。
此目录可复制到其他项目，只需配置 `MODEL_ASSET_ROOT` 和模型清单。

## 启动与部署

在实际运行机器上执行；本仓库遵循本地编辑、Mutagen 同步、远程运行的规则。

```sh
cd standalone/model-viewer
npm ci
PREVIEW_HOST=<实际Tailscale-IP> PREVIEW_PORT=4180 npm start
```

- `PREVIEW_HOST`：必填，仅绑定实际 Tailscale IPv4。
- `PREVIEW_PORT`：默认 4180。
- `MODEL_CONFIG`：可选清单绝对路径，默认本目录 `models.json`。
- `MODEL_ASSET_ROOT`：GLB 资源根目录。省略时从本仓库的 `shared-assets.json`
  读取当前平台主工作区的 `ignored_generated/`。
- `FILM_PHOTO_SHARED_ROOT`：本仓库共享目录的可选覆盖值。

生成使用当前部署路径的 systemd 服务：

```sh
PREVIEW_HOST=<实际Tailscale-IP> node deploy/service.mjs > /tmp/model-viewer.service
sudo install -m 644 /tmp/model-viewer.service /etc/systemd/system/model-viewer.service
sudo systemctl daemon-reload
sudo systemctl enable --now model-viewer.service
```

当前部署保留 `mamiya-preview.service` 服务名称，但工作目录已切换为
`standalone/model-viewer`，已有 4180 链接不变。修改配置后执行
`systemctl restart mamiya-preview.service`。服务开机启动，不依赖 Mac 或 SSH；
部署工作区与共享资源目录必须保留。

仅暴露公开配置、选定 GLB 与网页依赖，不暴露服务器文件路径或整个目录。
GLB 支持 Range 与 ETag。目前支持标准 GLB，未配置 Draco/Meshopt 解码器。
实时效果与 Blender Cycles 渲染可能不同，原始编辑模型保持独立。

## 验证

```sh
npm test
# 当前 Ubuntu 26 服务器使用 Playwright 兼容平台标记：
PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 npx playwright install chromium
PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 npm run test:reuse
PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 npm run test:browser
npm run inspect -- mamiya-universal
```

配置测试覆盖多模型、重复 ID、缺失资源、非法路径、符号链接越界。
复用测试生成非相机 GLB，验证默认模式、模型切换、固定链接刷新。
浏览器测试检查 Mamiya 的鼠标、平板触控、双指缩放、视角和布局。
截图与报告写入共享 `ignored_generated/model-viewer/qa/` 唯一目录。
平板测试使用 Chromium 触控模拟，不等同于 iPad 真机 Safari 验证。

在其他部署机器运行浏览器测试时，设置 `PREVIEW_URL=http://实际Tailscale-IP:端口`。
复用测试在同一个私有 IP 上启动临时端口，结束后自动关闭。
