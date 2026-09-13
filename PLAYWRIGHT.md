# Playwright parallelism

The runner defaults to **4 workers** and `fullyParallel: true`. Independent
tests within a file can run together, as can tests from different files. Each
test still executes its own steps in order. Browser contexts isolate cookies
and IndexedDB; the restart test creates its own temporary browser profile.

Set `PLAYWRIGHT_WORKERS` to a positive integer or a percentage of logical CPUs.
It applies to both `test:e2e` and all `validate:mN` scripts. Playwright's
`--workers` CLI option takes precedence over the configured worker count.

Follow `AGENTS.md`: inspect/edit locally, verify the exact Mutagen mapping,
flush it, and run builds/tests in the matching remote checkout. For the main
checkout, after confirming `film-photo` is connected and conflict-free:

```sh
mutagen sync flush film-photo
ssh remote "cd /workspace/film_photo && PLAYWRIGHT_WORKERS=4 npm run validate:m12"
```

For an already current production build, use the test runner directly:

```sh
ssh remote "cd /workspace/film_photo && npm run test:e2e -- --workers=6"
```

Use `PLAYWRIGHT_WORKERS=1` for a serial diagnostic run. `100%` means one worker
per logical CPU, not a target of 100% CPU utilization. The inspected remote
host has 64 logical CPUs; two active Chrome software-rendering processes each
used approximately 11–12 cores. Starting 64 such browsers can oversubscribe
the CPU severely. Start with 4, then compare 5 or 6 on an otherwise idle host.
Use the shortest clean suite duration, memory use, and absence of timeouts to
choose the worker count. CPU usage falls near the end when only a few tests
remain; workers cannot subdivide a single test's sequential steps. No worker
setting guarantees sustained full CPU use.

Avoid comparing runs while another checkout is testing on the same server.
Use a distinct `PLAYWRIGHT_PORT` if another preview occupies the default 5178.
Worker/configuration changes apply to new runs, not a run already in progress.

Keep parallel tests independent: use `testInfo.outputPath()` for temporary
files and unique names for exported review evidence. M10's source captures
include the magnification group to avoid concurrent overwrites. M11's repeated
brightness setup uses native Page Up steps followed by arrow-key adjustment to
the exact target, reducing browser round trips without dropping optical checks.
Review videos,
real WebGL, existing assertions, and timeouts remain enabled/unchanged. Do not
add retries or weaken tests to disguise resource contention. Do not commit
binary review assets without explicit user authorization.
