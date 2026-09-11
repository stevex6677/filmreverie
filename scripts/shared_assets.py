"""Shared media paths; no Git required on the synchronized remote checkout."""
import json
import os
import platform
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

REPO = Path(__file__).resolve().parents[1]
CONFIG = json.loads((REPO / 'shared-assets.json').read_text())


def shared_root():
    configured = os.environ.get('FILM_PHOTO_SHARED_ROOT') or CONFIG['main_checkout'].get(platform.system())
    if not configured:
        raise RuntimeError('Set FILM_PHOTO_SHARED_ROOT to the main checkout on this machine')
    root = Path(configured).expanduser().resolve()
    if not root.is_dir():
        raise FileNotFoundError(f'Shared main checkout is unavailable: {root}')
    return root


def asset_path(relative):
    return shared_root() / CONFIG['assets_directory'] / relative


def generated_path(relative):
    return shared_root() / CONFIG['generated_directory'] / relative


def output_dir(group, current_blend=None):
    """Builders get unique runs; render/export follow a saved shared master.

    Set FILM_PHOTO_OUTPUT_DIR to continue a particular run explicitly.
    Outputs outside ignored_generated are rejected to prevent accidental writes
    into source assets or disposable worktrees.
    """
    root = generated_path('').resolve()
    explicit = os.environ.get('FILM_PHOTO_OUTPUT_DIR')
    if explicit:
        output = Path(explicit).expanduser().resolve()
    elif current_blend:
        output = Path(current_blend).resolve().parent
    else:
        run = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid4().hex[:8]
        output = root / group / 'runs' / run
    if output == root or not output.is_relative_to(root):
        raise ValueError(f'Output must be a subfolder of {root}: {output}')
    output.mkdir(parents=True, exist_ok=True)
    return output
