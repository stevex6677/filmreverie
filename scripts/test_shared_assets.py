"""Checks that parallel worktrees cannot accidentally write into source assets."""
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from shared_assets import asset_path, generated_path, output_dir


class SharedOutputTests(unittest.TestCase):
    def test_parallel_runs_and_followup_paths(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch.dict(os.environ, {'FILM_PHOTO_SHARED_ROOT': folder}, clear=True):
                first = output_dir('camera/v3')
                second = output_dir('camera/v3')
                self.assertNotEqual(first, second)
                self.assertEqual(output_dir('camera/v3', first / 'model.blend'), first)
                self.assertEqual(asset_path('source.glb'), Path(folder) / 'ignored_assets/source.glb')

    def test_reject_source_and_worktree_outputs(self):
        with tempfile.TemporaryDirectory() as folder:
            with patch.dict(os.environ, {'FILM_PHOTO_SHARED_ROOT': folder}, clear=True):
                for bad in [asset_path('camera'), Path(folder) / 'blender', generated_path('')]:
                    with patch.dict(os.environ, {'FILM_PHOTO_OUTPUT_DIR': str(bad)}):
                        with self.assertRaises(ValueError):
                            output_dir('camera')
                # A symlink inside generated must not escape into source storage.
                assets = asset_path('')
                assets.mkdir()
                generated_path('').mkdir()
                link = generated_path('escape')
                link.symlink_to(assets, target_is_directory=True)
                with patch.dict(os.environ, {'FILM_PHOTO_OUTPUT_DIR': str(link / 'run')}):
                    with self.assertRaises(ValueError):
                        output_dir('camera')


if __name__ == '__main__':
    unittest.main()
