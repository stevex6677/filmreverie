"""Maintain the camera version index; requires retained local authoring storage.

python3 blender/update_model_history.py --capture-mobile-history  # backfill
python3 blender/update_model_history.py                         # refresh
python3 blender/update_model_history.py --check                  # verify only
"""
import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / 'scripts'))
from shared_assets import asset_path, generated_path

INDEX = REPO / 'blender/MODEL_HISTORY.md'


def archive_snapshot(directory, record, label, *, check_only=False):
    """Append an immutable metadata snapshot; never overwrite different history."""
    if not re.fullmatch(r'[A-Za-z0-9_-]+', label):
        raise ValueError(f'Invalid history label: {label}')
    target = directory / 'history' / f'{label}.json'
    if target.exists():
        if json.loads(target.read_text()) != record:
            raise ValueError(f'History already exists with different contents: {target}')
        return target
    if check_only:
        return target
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(record, indent=2, ensure_ascii=False) + '\n')
    return target


def render_index():
    verified = {}

    def row(label, item, root='G'):
        path = item['path']
        file = {'G': generated_path, 'A': asset_path, 'R': lambda p: REPO / p}[root](path)
        if file not in verified:
            with file.open('rb') as stream:
                verified[file] = (file.stat().st_size, hashlib.file_digest(stream, 'sha256').hexdigest())
        size, digest = verified[file]
        if digest != item['sha256'] or ('bytes' in item and size != item['bytes']):
            raise ValueError(f'History checksum/size mismatch: {file}')
        return f'| {label} | `{root}/{path}` | {size / 1_000_000:.2f} | `{digest[:12]}` |'

    lines = [
        '# 相机模型版本与位置索引', '',
        '本表由 `python3 blender/update_model_history.py` 从 `CURRENT.json` 和不可覆盖的历史快照生成。',
        '**继续修改模型，请打开当前 `editable_blend` 母版。** 详情 GLB、柜内 GLB 和压缩工作场景都是派生文件。',
        '当前版本以 `CURRENT.json` 为准；不要依据文件修改时间、目录名中的 final 或文件大小选择母版。', '',
        '路径前缀（均为本地目录）：', '',
        '- `G` = `<master_folder>/ignored_generated`，保留母版、历史导出及工作场景。',
        '- `A` = `<master_folder>/ignored_assets`，原始输入，只读。',
        '- `R` = 当前 Git 工作区根目录，网页运行时文件在 `public/assets/cameras/`。',
        '- 本次核对的 `<master_folder>` 为 `/workspace/film_photo`；其他机器由 `scripts/shared_assets.py` 解析。', '',
        '表中大小使用十进制 MB；SHA-256 显示前 12 位，完整校验值在对应 JSON。',
        '历史 JSON 的 `published_path` 是当时的网页副本位置，可能已退役；恢复时使用保留的 `G/...` 原件。', '',
        '## 各相机的当前版本与历史版本', '',
    ]
    for current_file in sorted((REPO / 'blender').glob('*/CURRENT.json')):
        current = json.loads(current_file.read_text())
        folder = current_file.parent.name
        lines += [f'### {current["model_id"]}', '',
                  f'当前记录：[{folder}/CURRENT.json]({folder}/CURRENT.json)。', '',
                  '| 用途 / 版本 | 位置 | MB | SHA-256 |',
                  '| --- | --- | ---: | --- |']
        for key, label in [('editable_blend', '**当前可编辑母版（后续修改入口）**'),
                           ('browser_glb', '当前详情版 GLB'), ('shelf_glb', '当前柜内轻量 GLB'),
                           ('full_detail_glb', '保留的全精度 GLB')]:
            if key not in current:
                continue
            item = current[key]
            lines.append(row(label, item))
            if key in ('browser_glb', 'shelf_glb'):
                lines.append(row(label + ' · 网页副本', {**item, 'path': item['published_path']}, 'R'))
        if 'source' in current:
            lines.append(row('原始输入（只读）', current['source'], 'A'))
        for index, item in enumerate(current.get('browser_history', []), 1):
            lines.append(row(f'历史网页大模型 {index}（保留原件）', item))
        older = current.get('previous_delivery', {})
        for key, label in [('editable_blend', '更早的可编辑母版'), ('browser_glb', '更早的 GLB')]:
            if key in older:
                lines.append(row(label, older[key]))
        parent = current.get('parent_master') or current.get('continuation', {}).get('parent_editable_blend')
        if parent:
            lines.append(row('当前母版的上一版', parent))
        lines += ['', '元数据快照（仅列有记录的交付版本，不将实验 run 自动视为已接受版本）：', '']
        snapshots = sorted((current_file.parent / 'history').glob('*.json'))
        for snapshot in snapshots:
            record = json.loads(snapshot.read_text())
            if record['model_id'] != current['model_id']:
                raise ValueError(f'History belongs to another model: {snapshot}')
            # Independently verify every snapshot's primary model files.
            for key in ['editable_blend', 'browser_glb', 'shelf_glb', 'full_detail_glb']:
                if key in record:
                    row(key, record[key])
            master = record['editable_blend']['path']
            same = '与当前相同，未改变' if master == current['editable_blend']['path'] else f'`G/{master}`'
            lines.append(f'- [{snapshot.stem}]({folder}/history/{snapshot.name})：母版{same}；详情导出 `{record["browser_glb"]["sha256"][:12]}`。')
        if not snapshots:
            lines.append('- 暂无独立历史快照；请查看当前记录中的父版本信息。')
        if current.get('mobile_delivery'):
            run = current['mobile_delivery']['run']
            lines += ['', f'本次压缩工作目录：`G/{run}/`。其中 `scene.blend` 为压缩工作副本，',
                      '`intermediates/parent-current.json` 保存压缩前完整记录，`exports/report.json` 保存导出及候选信息。',
                      '这些工作副本不替代上表中的可编辑母版。']
        lines += ['', f'其余历史 run / 实验文件保留在 `G/blender/{folder}/`，本索引不宣称列出全部实验。', '']
    lines += ['## 以后如何修改、发布或恢复', '',
              '1. 先读对应 `CURRENT.json`，打开 `editable_blend.path` 指定的母版，通过 Blender CLI 修改。',
              '2. 新建唯一 run，保留原母版和旧导出；不要覆盖历史路径或历史 JSON。',
              '3. 替换 CURRENT 前，将旧记录存入 `<model>/history/before-<new-run>.json`；发布后保存 `<new-run>.json`。',
              '4. 同时更新 CURRENT、网页 GLB 和 `standalone/model-viewer/models.json`，再运行本索引脚本。',
              '5. `package_mobile_derivatives.py` 自动执行快照归档和索引更新；其他发布脚本需按上述流程补齐。',
              '6. 恢复旧版本时，从历史快照选择母版与 `G/...` GLB，核对完整 SHA-256，再创建新的交付；不要直接覆盖旧记录。', '',
              '核对路径、大小、校验值及索引是否过期：', '',
              '```sh', 'python3 blender/update_model_history.py --check', '```', '',
              '此检查需要本地作者文件；普通网页构建不依赖它。Git 保存元数据和网页副本，',
              '`ignored_generated` / `ignored_assets` 中的大文件仍需单独备份。', '']
    return '\n'.join(lines)


def write_index():
    INDEX.write_text(render_index())


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--capture-mobile-history', action='store_true')
    args = parser.parse_args()
    if args.check and args.capture_mobile_history:
        parser.error('--check is read-only; do not combine it with capture')
    if args.capture_mobile_history:
        for current_file in sorted((REPO / 'blender').glob('*/CURRENT.json')):
            current = json.loads(current_file.read_text())
            run = current['mobile_delivery']['run']
            parent = json.loads(generated_path(run + '/intermediates/parent-current.json').read_text())
            if parent['model_id'] != current['model_id'] or parent['browser_glb'] not in current['browser_history']:
                raise ValueError(f'Unrecognized parent snapshot: {current_file}')
            archive_snapshot(current_file.parent, parent, 'before-' + Path(run).name)
            archive_snapshot(current_file.parent, current, Path(run).name)
    rendered = render_index()
    if args.check:
        if INDEX.read_text() != rendered:
            raise SystemExit('Model history index is stale; run the script without --check.')
        print('Model history paths, sizes, SHA-256 and index verified.')
    else:
        INDEX.write_text(rendered)
        print('Updated blender/MODEL_HISTORY.md; model files were read only.')
