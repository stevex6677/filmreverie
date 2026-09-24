# Playwright parallelism

The runner defaults to **1 worker** for local laptop capacity and retains
`fullyParallel: true`. Raising the worker count allows independent tests within
a file and across files to run together. Each test still executes its own steps
in order. Browser contexts isolate cookies and IndexedDB; the restart test
creates its own temporary browser profile.

Set `PLAYWRIGHT_WORKERS` to a positive integer or a percentage of logical CPUs.
It applies to both `test:e2e` and all `validate:mN` scripts. Playwright's
`--workers` CLI option takes precedence over the configured worker count.

Run locally in the active checkout, using the supported Node version from the
README. Install project dependencies with `npm ci`. The configured browser
projects use Google Chrome and Playwright WebKit:

```sh
npx playwright install chrome webkit
```

If Chrome is already installed, only the WebKit browser download is needed.
On Linux, install required OS browser libraries too (`npx playwright install --with-deps webkit`).
When other worktrees use different Playwright versions, set
`PLAYWRIGHT_SKIP_BROWSER_GC=1` while installing to preserve their cached browsers.
No remote setup, source sync or SSH tunnel is required.

Build and run a cumulative gate locally:

```sh
PLAYWRIGHT_WORKERS=1 npm run validate:m12
```

For an already current production build, use the test runner directly:

```sh
npm run test:e2e -- --workers=1
```

Use `PLAYWRIGHT_WORKERS=1` for a serial diagnostic run. `100%` means one worker
per logical CPU, not a target of 100% CPU utilization. Chrome's software WebGL
renderer uses multiple CPU threads per worker. On a laptop, start with one
worker; increase only when local CPU, memory and process capacity allow it.
Use the shortest clean suite duration, memory use, and absence of timeouts to
choose the worker count. CPU usage falls near the end when only a few tests
remain; workers cannot subdivide a single test's sequential steps. No worker
setting guarantees sustained full CPU use.

Avoid comparing runs while another checkout is testing on the same machine.
Use a distinct `PLAYWRIGHT_PORT` if another preview occupies the default 5178.
Worker/configuration changes apply to new runs, not a run already in progress.

Keep parallel tests independent: use `testInfo.outputPath()` for temporary
files and unique names for exported review evidence. M10's source captures
include the magnification group to avoid concurrent overwrites. M11's repeated
brightness setup uses native Page Up steps followed by arrow-key adjustment to
the exact target, reducing browser round trips without dropping optical checks.
Routine video recording is off; enable it for selected interaction reviews with
`PLAYWRIGHT_VIDEO=on` and inspect the result before claiming motion review.
Keep real WebGL, existing assertions and timeouts intact. Do not add retries or
weaken tests to disguise resource contention. Review captures stay ignored;
this does not apply to required tracked runtime images and GLBs.
