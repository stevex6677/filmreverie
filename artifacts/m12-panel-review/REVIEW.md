# Uniform light-table background correction

The strip-shaped gray patch was a hard-coded five-frame contact-shadow mask in `createPanelMaterial`, based on `DEFAULT_LAYOUT`. It remained painted at the table origin when M12 displayed a different roll layout.

Removed that mask, the panel gradient/frost variation, and its obsolete size uniforms. The diffuser now emits uniform neutral light using the existing dimmer response. The decorative CSS vignette now applies only in room view, so it cannot darken the inspection background. Film, stock conversion, and loupe transfer functions are unchanged.

Validation: production build and all 138 integration tests passed. Four targeted Chrome/WebGL tests passed (1.1 minutes): two new multi-strip background checks for 135/120, the existing M10 ordered transmission/dimmer check, and the positive 30% loupe check at 1.5×/2.5×. The complete 45-test suite was not repeated for this focused correction. Exact output: `validation.log`.

New pixel checks cover negative/positive modes at 30% and 100% brightness. Every sampled exposed patch had the same neutral RGB value: 141 at 30%, 245 at 100%, under the existing display conversion. Measurements and captures are beside this file. Originals and committed historical evidence were not modified. The initial 135 test pressed the dimmer before roll setup settled; the final test waits for setup and explicitly verifies the range input value before capture.

Run remotely after flushing `codex-worktrees-41ad`:

```sh
npm run build
npm run test:integration
REVIEW_ARTIFACTS_DIR=artifacts/m12-panel-review/regressions M10_CANDIDATE_DIR=artifacts/m12-panel-review/lighting PLAYWRIGHT_PORT=5197 npx playwright test tests/e2e/m12-panel-background.spec.ts tests/e2e/m10-light-transmission.spec.ts --grep 'phantom strip|ordered transmission|positive 30% at 1.5'
```

[Preview](http://127.0.0.1:5193/?mode=inspect). Reload to load the corrected build. Changes await human review and are not yet committed.
