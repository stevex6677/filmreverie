# 相机模型版本与位置索引

本表由 `python3 blender/update_model_history.py` 从 `CURRENT.json` 和不可覆盖的历史快照生成。
**继续修改模型，请打开当前 `editable_blend` 母版。** 详情 GLB、柜内 GLB 和压缩工作场景都是派生文件。
当前版本以 `CURRENT.json` 为准；不要依据文件修改时间、目录名中的 final 或文件大小选择母版。

路径前缀（均为本地目录）：

- `G` = `<master_folder>/ignored_generated`，保留母版、历史导出及工作场景。
- `A` = `<master_folder>/ignored_assets`，原始输入，只读。
- `R` = 当前 Git 工作区根目录，网页运行时文件在 `public/assets/cameras/`。
- 本次核对的 `<master_folder>` 为 `/workspace/film_photo`；其他机器由 `scripts/shared_assets.py` 解析。

表中大小使用十进制 MB；SHA-256 显示前 12 位，完整校验值在对应 JSON。
历史 JSON 的 `published_path` 是当时的网页副本位置，可能已退役；恢复时使用保留的 `G/...` 原件。

## 各相机的当前版本与历史版本

### minolta-autocord

当前记录：[autocord/CURRENT.json](autocord/CURRENT.json)。

| 用途 / 版本 | 位置 | MB | SHA-256 |
| --- | --- | ---: | --- |
| **当前可编辑母版（后续修改入口）** | `G/blender/autocord/detail_refinement/runs/20260921-front-c3/autocord-refined.blend` | 100.90 | `43f2abc72cba` |
| 当前详情版 GLB | `G/blender/autocord/runs/20260924-mobile-a/exports/minolta-autocord-detail.glb` | 3.44 | `e1b366e32dc3` |
| 当前详情版 GLB · 网页副本 | `R/public/assets/cameras/minolta-autocord-e1b366e32dc390fb6e92dbc7209bb44d3e81ab15c4240d02593a070b88d5ceee.glb` | 3.44 | `e1b366e32dc3` |
| 当前柜内轻量 GLB | `G/blender/autocord/runs/20260924-mobile-a/exports/minolta-autocord-shelf-baked-v4.glb` | 0.47 | `a2ca9ebd762b` |
| 当前柜内轻量 GLB · 网页副本 | `R/public/assets/cameras/minolta-autocord-shelf-a2ca9ebd762bdade6ef1249e2b9d7821311078489446e702dd1c0ff74a69a4a3.glb` | 0.47 | `a2ca9ebd762b` |
| 保留的全精度 GLB | `G/blender/autocord/detail_refinement/runs/20260921-front-c3/minolta-autocord.glb` | 105.71 | `50133c409360` |
| 原始输入（只读） | `A/blender/autocord/tripo/tripo_autocord.glb` | 68.28 | `a10ce046a5e9` |
| 历史网页大模型 1（保留原件） | `G/blender/autocord/browser_preview/runs/20260921T075000Z-browser-v2/minolta-autocord-browser.glb` | 20.00 | `0fd838994e57` |
| 更早的可编辑母版 | `G/blender/autocord/detail_refinement/runs/20260921-panel-bottom-b3/autocord-refined.blend` | 93.86 | `1af13c743dfe` |
| 更早的 GLB | `G/blender/autocord/detail_refinement/runs/20260921-panel-bottom-b3/minolta-autocord.glb` | 91.89 | `69c9c1edf1dd` |

元数据快照（仅列有记录的交付版本，不将实验 run 自动视为已接受版本）：

- [20260924-mobile-a](autocord/history/20260924-mobile-a.json)：母版与当前相同，未改变；详情导出 `e1b366e32dc3`。
- [before-20260924-mobile-a](autocord/history/before-20260924-mobile-a.json)：母版与当前相同，未改变；详情导出 `0fd838994e57`。

本次压缩工作目录：`G/blender/autocord/runs/20260924-mobile-a/`。其中 `scene.blend` 为压缩工作副本，
`intermediates/parent-current.json` 保存压缩前完整记录，`exports/report.json` 保存导出及候选信息。
这些工作副本不替代上表中的可编辑母版。

其余历史 run / 实验文件保留在 `G/blender/autocord/`，本索引不宣称列出全部实验。

### canon-7s

当前记录：[canon7s/CURRENT.json](canon7s/CURRENT.json)。

| 用途 / 版本 | 位置 | MB | SHA-256 |
| --- | --- | ---: | --- |
| **当前可编辑母版（后续修改入口）** | `G/blender/canon7s/bottom/runs/20260922-bottom-a/canon7s-refined.blend` | 91.43 | `ae80cacbab5b` |
| 当前详情版 GLB | `G/blender/canon7s/runs/20260924-mobile-a/exports/canon-7s-detail.glb` | 3.58 | `339b7bd857a4` |
| 当前详情版 GLB · 网页副本 | `R/public/assets/cameras/canon-7s-339b7bd857a470d339d4d391187bd88dd5e3dcb2f2ece02dfd95f42420647cf1.glb` | 3.58 | `339b7bd857a4` |
| 当前柜内轻量 GLB | `G/blender/canon7s/runs/20260924-mobile-a/exports/canon-7s-shelf-baked-v2.glb` | 0.44 | `4c2c6e7007bb` |
| 当前柜内轻量 GLB · 网页副本 | `R/public/assets/cameras/canon-7s-shelf-4c2c6e7007bbbee7066a71d26db68cf9facfe546824667133b0ce57fc77c5dd0.glb` | 0.44 | `4c2c6e7007bb` |
| 保留的全精度 GLB | `G/blender/canon7s/bottom/runs/20260922-bottom-a/canon7s-refined.glb` | 94.56 | `db4055ba66f5` |
| 原始输入（只读） | `A/blender/canon7s/tripo/tripo_canon7s.glb` | 68.61 | `426aae8ecfc6` |
| 历史网页大模型 1（保留原件） | `G/blender/canon7s/bottom/runs/20260922-bottom-a/canon7s-browser.glb` | 23.70 | `46656605d7e5` |
| 当前母版的上一版 | `G/blender/canon7s/surface_smoothing/runs/20260922-surface-b/canon7s-refined.blend` | 89.68 | `a67fa8e2e46c` |

元数据快照（仅列有记录的交付版本，不将实验 run 自动视为已接受版本）：

- [20260924-mobile-a](canon7s/history/20260924-mobile-a.json)：母版与当前相同，未改变；详情导出 `339b7bd857a4`。
- [before-20260924-mobile-a](canon7s/history/before-20260924-mobile-a.json)：母版与当前相同，未改变；详情导出 `46656605d7e5`。

本次压缩工作目录：`G/blender/canon7s/runs/20260924-mobile-a/`。其中 `scene.blend` 为压缩工作副本，
`intermediates/parent-current.json` 保存压缩前完整记录，`exports/report.json` 保存导出及候选信息。
这些工作副本不替代上表中的可编辑母版。

其余历史 run / 实验文件保留在 `G/blender/canon7s/`，本索引不宣称列出全部实验。

### canon-demi-ee17

当前记录：[canon_demi_ee17/CURRENT.json](canon_demi_ee17/CURRENT.json)。

| 用途 / 版本 | 位置 | MB | SHA-256 |
| --- | --- | ---: | --- |
| **当前可编辑母版（后续修改入口）** | `G/blender/canon_demi_ee17/refinement/runs/20260923T-top2-b/canon-demi-ee17-refined.blend` | 90.36 | `83826a45f29a` |
| 当前详情版 GLB | `G/blender/canon_demi_ee17/runs/20260924-mobile-a/exports/canon-demi-ee17-detail.glb` | 4.03 | `3e048ec479b2` |
| 当前详情版 GLB · 网页副本 | `R/public/assets/cameras/canon-demi-ee17-3e048ec479b25f272f05cacc390e11ea21c0ac50a8957fad5e252d1203209ac7.glb` | 4.03 | `3e048ec479b2` |
| 当前柜内轻量 GLB | `G/blender/canon_demi_ee17/runs/20260924-mobile-a/exports/canon-demi-ee17-shelf-baked-v2.glb` | 0.45 | `6cc0eecf2485` |
| 当前柜内轻量 GLB · 网页副本 | `R/public/assets/cameras/canon-demi-ee17-shelf-6cc0eecf24851ee124da435b9a033622e3e969060c1b10b93988e8ee2ad88f89.glb` | 0.45 | `6cc0eecf2485` |
| 原始输入（只读） | `A/blender/canon_demi_ee17/tripo/ee17.glb` | 68.68 | `21679ebfe257` |
| 历史网页大模型 1（保留原件） | `G/blender/canon_demi_ee17/refinement/runs/20260923T-top2-b/canon-demi-ee17-compact.glb` | 8.28 | `fef17d78b135` |
| 更早的可编辑母版 | `G/blender/canon_demi_ee17/refinement/runs/20260923T-shoulder-compact-b/canon-demi-ee17-refined.blend` | 88.79 | `fc342f37d476` |
| 更早的 GLB | `G/blender/canon_demi_ee17/refinement/runs/20260923T-shoulder-compact-b/canon-demi-ee17-compact.glb` | 7.90 | `939021923026` |

元数据快照（仅列有记录的交付版本，不将实验 run 自动视为已接受版本）：

- [20260924-mobile-a](canon_demi_ee17/history/20260924-mobile-a.json)：母版与当前相同，未改变；详情导出 `3e048ec479b2`。
- [before-20260924-mobile-a](canon_demi_ee17/history/before-20260924-mobile-a.json)：母版与当前相同，未改变；详情导出 `fef17d78b135`。

本次压缩工作目录：`G/blender/canon_demi_ee17/runs/20260924-mobile-a/`。其中 `scene.blend` 为压缩工作副本，
`intermediates/parent-current.json` 保存压缩前完整记录，`exports/report.json` 保存导出及候选信息。
这些工作副本不替代上表中的可编辑母版。

其余历史 run / 实验文件保留在 `G/blender/canon_demi_ee17/`，本索引不宣称列出全部实验。

### mamiya-universal

当前记录：[mamiya_universal/CURRENT.json](mamiya_universal/CURRENT.json)。

| 用途 / 版本 | 位置 | MB | SHA-256 |
| --- | --- | ---: | --- |
| **当前可编辑母版（后续修改入口）** | `G/blender/mamiya_universal/hybrid/v2/black_body/runs/20260912T065312Z-d80c8ba1/mamiya_universal_hybrid_v2_black_body.blend` | 205.35 | `1d285cd9dd37` |
| 当前详情版 GLB | `G/blender/mamiya_universal/runs/20260924-mobile-a/exports/mamiya-universal-detail.glb` | 3.15 | `442c8d4cb16e` |
| 当前详情版 GLB · 网页副本 | `R/public/assets/cameras/mamiya-universal-442c8d4cb16e430b042d112106ab0cbbcd88874bdb4f7bd79da2fe18338ace1d.glb` | 3.15 | `442c8d4cb16e` |
| 当前柜内轻量 GLB | `G/blender/mamiya_universal/runs/20260925-cabinet-detail-d/exports/mamiya-universal-shelf.glb` | 1.39 | `5f106d45743b` |
| 当前柜内轻量 GLB · 网页副本 | `R/public/assets/cameras/mamiya-universal-shelf-5f106d45743bd1dfca63617a40f31ba642ef14b9f698b95b6452ddb64683887d.glb` | 1.39 | `5f106d45743b` |
| 历史网页大模型 1（保留原件） | `G/blender/mamiya_universal/hybrid/v2/browser_preview/runs/20260912T073337Z-1d792c08/mamiya-black-body.glb` | 18.61 | `6d426487c0a5` |
| 历史柜内轻量模型 1（保留原件） | `G/blender/mamiya_universal/runs/20260924-mobile-a/exports/mamiya-universal-shelf-baked-final.glb` | 0.41 | `49c200d6fab8` |

元数据快照（仅列有记录的交付版本，不将实验 run 自动视为已接受版本）：

- [20260924-mobile-a](mamiya_universal/history/20260924-mobile-a.json)：母版与当前相同，未改变；详情导出 `442c8d4cb16e`。
- [20260925-cabinet-detail-d](mamiya_universal/history/20260925-cabinet-detail-d.json)：母版与当前相同，未改变；详情导出 `442c8d4cb16e`。
- [before-20260924-mobile-a](mamiya_universal/history/before-20260924-mobile-a.json)：母版与当前相同，未改变；详情导出 `6d426487c0a5`。
- [before-20260925-cabinet-detail-d](mamiya_universal/history/before-20260925-cabinet-detail-d.json)：母版与当前相同，未改变；详情导出 `442c8d4cb16e`。

本次压缩工作目录：`G/blender/mamiya_universal/runs/20260924-mobile-a/`。其中 `scene.blend` 为压缩工作副本，
`intermediates/parent-current.json` 保存压缩前完整记录，`exports/report.json` 保存导出及候选信息。
这些工作副本不替代上表中的可编辑母版。

当前柜内模型工作目录：`G/blender/mamiya_universal/runs/20260925-cabinet-detail-d/`；详情版与母版未改变。

其余历史 run / 实验文件保留在 `G/blender/mamiya_universal/`，本索引不宣称列出全部实验。

### olympus-om1

当前记录：[olympus_om1/CURRENT.json](olympus_om1/CURRENT.json)。

| 用途 / 版本 | 位置 | MB | SHA-256 |
| --- | --- | ---: | --- |
| **当前可编辑母版（后续修改入口）** | `G/blender/olympus_om1/runs/20260924-om1-top3-final/scene.blend` | 81.79 | `5484716feb14` |
| 当前详情版 GLB | `G/blender/olympus_om1/runs/20260924-mobile-a/exports/olympus-om1-detail.glb` | 3.24 | `1a4df213549f` |
| 当前详情版 GLB · 网页副本 | `R/public/assets/cameras/olympus-om1-1a4df213549f61f15e28f9001e41cbf89e45598a120f872a0ad67fc38a6bb4f9.glb` | 3.24 | `1a4df213549f` |
| 当前柜内轻量 GLB | `G/blender/olympus_om1/runs/20260924-mobile-a/exports/olympus-om1-shelf-baked-v2.glb` | 0.45 | `162991f68aba` |
| 当前柜内轻量 GLB · 网页副本 | `R/public/assets/cameras/olympus-om1-shelf-162991f68aba5b477167856814b0b7900ee13d1af2196e7fe6d65c363eab837b.glb` | 0.45 | `162991f68aba` |
| 原始输入（只读） | `A/blender/olympus_om1/tripo/om1.glb` | 67.87 | `6be533abba34` |
| 历史网页大模型 1（保留原件） | `G/blender/olympus_om1/runs/20260924-om1-top3-final/exports/olympus-om1-compact.glb` | 6.71 | `7f34a969985e` |
| 当前母版的上一版 | `G/blender/olympus_om1/runs/20260924-om1-refinement-d/scene.blend` | 81.76 | `bc7b34c4dac1` |

元数据快照（仅列有记录的交付版本，不将实验 run 自动视为已接受版本）：

- [20260924-mobile-a](olympus_om1/history/20260924-mobile-a.json)：母版与当前相同，未改变；详情导出 `1a4df213549f`。
- [before-20260924-mobile-a](olympus_om1/history/before-20260924-mobile-a.json)：母版与当前相同，未改变；详情导出 `7f34a969985e`。

本次压缩工作目录：`G/blender/olympus_om1/runs/20260924-mobile-a/`。其中 `scene.blend` 为压缩工作副本，
`intermediates/parent-current.json` 保存压缩前完整记录，`exports/report.json` 保存导出及候选信息。
这些工作副本不替代上表中的可编辑母版。

其余历史 run / 实验文件保留在 `G/blender/olympus_om1/`，本索引不宣称列出全部实验。

## 以后如何修改、发布或恢复

1. 先读对应 `CURRENT.json`，打开 `editable_blend.path` 指定的母版，通过 Blender CLI 修改。
2. 新建唯一 run，保留原母版和旧导出；不要覆盖历史路径或历史 JSON。
3. 替换 CURRENT 前，将旧记录存入 `<model>/history/before-<new-run>.json`；发布后保存 `<new-run>.json`。
4. 同时更新 CURRENT、网页 GLB 和 `standalone/model-viewer/models.json`，再运行本索引脚本。
5. `package_mobile_derivatives.py` 自动执行快照归档和索引更新；其他发布脚本需按上述流程补齐。
6. 恢复旧版本时，从历史快照选择母版与 `G/...` GLB，核对完整 SHA-256，再创建新的交付；不要直接覆盖旧记录。

核对路径、大小、校验值及索引是否过期：

```sh
python3 blender/update_model_history.py --check
```

此检查需要本地作者文件；普通网页构建不依赖它。Git 保存元数据和网页副本，
`ignored_generated` / `ignored_assets` 中的大文件仍需单独备份。
