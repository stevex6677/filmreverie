# Project Rules: film_photo (Local/Remote Worktree Workflow)

These instructions apply to the repository root and all descendants. The local
Mac filesystem is the source of truth. The remote Linux server is used to run
the application and its tooling.

> [!CAUTION]
> **CRITICAL EXECUTION CONSTRAINT: NEVER RUN BUILDS, TESTS, OR RUNTIMES LOCALLY ON MAC.**
> The local Mac is strictly for file editing and Git. It does NOT have the dependencies,
> Playwright browser binaries, or GPU environment to execute code.
>
> - ❌ **FORBIDDEN (Never run directly in run_command):**
>   `npm test`, `npm run build`, `npm install`, `pytest`, `python ...`, `node ...`
> - ✅ **REQUIRED (Must prefix with remote_exec run):**
>   `remote_exec run npm test`, `remote_exec run pytest`, `remote_exec run npm run build`
>
> **LOCAL COMMAND WHITELIST (The ONLY commands permitted without remote_exec run):**
> 1. `git ...` (all git operations)
> 2. `remote_exec ...` (`setup`, `run`, `status`, `asset`, `stop`)
> 3. SSH port forwarding tunnels (`ssh -N -L ...`) and `tailscale serve ...`
> 4. Local app startup ONLY when the user explicitly says "start the app locally".

## Existing reusable tools: check before implementing

- For **Mamiya model continuation or latest .blend / GLB / renders**, first read
  [blender/mamiya_universal/CURRENT.json](blender/mamiya_universal/CURRENT.json).
  It is the authoritative current-delivery record; older revision READMEs and
  file modification times do not select the current version. After each new
  delivery, update its paths, checksums, source/export relationship and state;
  update the viewer catalog when its GLB changes, verify both agree, and commit
  the records. For new models, create an equivalent per-model `CURRENT.json`
  and link it from the repository README.
- For **3D model previews, GLB viewers, drag-to-rotate model pages, or iPad model
  viewing**, first read [standalone/model-viewer/README.md](standalone/model-viewer/README.md).
  The reusable viewer already exists in `standalone/model-viewer/`; use it for
  new models instead of creating another one-off page.
- Add models to [standalone/model-viewer/models.json](standalone/model-viewer/models.json).
  Each model has a stable `/?model=<id>` link. Configure labels, orientation and
  initial views there; keep special material adjustments in opt-in `profiles/`.
- Keep this viewer independent of the existing Web App unless the user asks for
  integration. Follow the module README for deployment and validation, and
  [SHARED_ASSETS.md](SHARED_ASSETS.md) for GLB/texture storage. Commit code and
  configuration; leave generated model binaries in the shared ignored directory.
- Before changing a running viewer, inspect its actual service working directory
  and port. A new agent worktree is not automatically the deployed checkout.
  Preserve existing model entries and links when adding a model.
- Repository entry points are listed in [README.md](README.md). Other branches
  and worktrees must include the relevant commits to discover these tools;
  Git does not distribute the ignored model binaries.

## 1. Read and edit files locally

- Perform all file discovery, inspection, creation, and editing on the local Mac.
- Never edit repository files through SSH. Mutagen synchronizes local changes
  one-way to the remote server (local Mac -> remote). Remote modifications are
  not synced back to the local Mac.
- Resolve the active local repository root with `git rev-parse --show-toplevel`.
  Do not assume that a task is using the main checkout.
- If the user supplies a remote path, map it to its local counterpart before
  reading or editing it. Do not inspect the remote copy unless the user
  explicitly asks for a remote-state diagnostic.

## 2. Per-checkout remote setup

All worktree setup, one-way Mutagen sync (local Mac -> remote), and remote path mapping are managed by
[`remote_exec`](/Users/zhangzimou/Projects/tools/remote_exec/README.md).
The executable lives in `~/Projects/tools/remote_exec/remote_exec` (accessible via PATH
as `remote_exec` or `~/.local/bin/remote_exec`).

```bash
remote_exec setup
```

- Run `remote_exec setup` once per checkout (pass `--no-install` to skip remote dependency install).
- Use `remote_exec status` to inspect sync health and `remote_exec stop` before retiring a worktree.
- Read [`remote_exec` README](/Users/zhangzimou/Projects/tools/remote_exec/README.md) for full options and multi-agent worktree mappings.

## 3. Run commands remotely

- **MANDATORY**: All builds, tests, package-manager operations (`npm`, `pip`), test
  runners (`playwright`, `pytest`), and script executions MUST run remotely through
  `remote_exec run`:

  ```bash
  remote_exec run <command>
  ```

  Examples:
  ```bash
  remote_exec run npm test
  remote_exec run pytest -v --maxfail=1
  remote_exec run -e PLAYWRIGHT_WORKERS=4 npm run validate:m12
  remote_exec run --no-flush nvidia-smi
  ```

- `remote_exec run` automatically flushes local edits before execution, preserves working
  subdirectories remotely, keeps long runs alive, and recovers dead SSH sockets safely.
  Refer to [`remote_exec` README](/Users/zhangzimou/Projects/tools/remote_exec/README.md)
  for details. **Agents MUST NOT run destructive commands like `rm -f ~/.ssh/sockets/*`**.
- When the user says "start the app locally" (or equivalent), you MUST start
  the application process on the local Mac in the active checkout. A remote
  server exposed through localhost/SSH does not satisfy this request. This
  explicit instruction overrides the remote startup default; do not silently
  fall back to remote execution. Necessary local startup preparation is allowed.
  Keep builds, tests, and other heavy tooling remote via `remote_exec run`.

### App startup and Web Access (local Mac or Vast.ai)

- For default/remote startup, run the application inside the remote container
  (e.g. `npm run dev` or `npm run preview`). For explicitly requested local
  startup, run the dev server on the Mac (e.g. `npm run dev`). Verify the local
  process and working directory, and check port ownership so an existing SSH
  tunnel is not mistaken for the requested local app. If a port is occupied,
  use another available port and share its actual URLs; preserve unrelated services.
- For remote startup only, expose app ports on-demand via SSH port forwarding:
  ```bash
  ssh -N -L <port>:127.0.0.1:<port> remote
  ```
- The custom GPU Dashboard is forwarded to `http://localhost:61209` via the background tunnel on `Host gpu-dashboard` (`LocalForward 61209 127.0.0.1:61208`). Real-time GPU & process metrics are accessible at `http://localhost:61209`.
- Always provide both a clickable localhost URL and a verified phone/iPad URL
  after either local or remote startup (e.g. `http://localhost:5178` and
  `http://macbook:5178`). State where the application process is running.
- When sharing app preview links, also provide the MacBook Tailscale link (for example `http://macbook:5178`) so the user can open it on an iPhone or iPad. This is an explicit user preference. Verify the current MacBook hostname and IP with `tailscale status --json`; do not assume a localhost-only tunnel is reachable from other devices.
- For phone/iPad access, use `tailscale serve --bg --http=<port> http://127.0.0.1:<port>`.
  For local startup, its target is the local Mac app directly; no SSH tunnel is
  needed. For remote startup, its target is the SSH localhost tunnel. Inspect
  `tailscale serve status` before changing a mapping; preserve unrelated services.
  Verify HTTP responses through both localhost and the shared hostname. Devices
  must be connected to the same Tailscale network. The Vite host allowlist must
  include the verified hostname; use `FILM_PHOTO_ALLOWED_HOSTS` for different names.
  Do not use Funnel or expose the app publicly.

## 4. Keep Git local

- Run every Git operation on the local Mac, including status, diff, branch,
  commit, and worktree commands.
- Never run Git through SSH. The remote synchronized checkout may not contain
  `.git` metadata.
- Preserve unrelated user changes and do not discard or overwrite them.
- Do not add or commit binary files (such as `.blend`, `.glb`, `.jpg`, `.png`, media,
  videos, `.heic`, camera photos, or 3D models) or test review snapshots (`artifacts/`)
  to Git unless explicitly asked by the user.

## 5. Dependencies and generated data

- Install dependencies in the corresponding remote checkout by default. An
  explicit local app startup request also permits installing the dependencies
  needed to start that app in the active local checkout.
- Mutagen ignores `.git`, `node_modules`, `.DS_Store`, `__pycache__`,
  `.pytest_cache`, `artifacts/`, `test-results/`, `playwright-report/`, heavy
  video recordings (`.mp4`, `.webm`), camera `.heic` photos, and Blender renders
  in agent worktree and main checkout sessions.
- Do not rely on local dependency or generated-data state when validating remote
  behavior.

## 6. Blender tasks

- Use the Blender MCP for Blender-related work.
- Save durable Blender files, exports and renders directly under the main checkout's `ignored_generated/blender/`; keep source media read-only under its `ignored_assets/`. See `SHARED_ASSETS.md` and `shared-assets.json`.
- Do not track Blender binary files or generated binary assets in Git unless
  explicitly asked. Group each model and its references under its own directory,
  such as `blender/mamiya_universal/`.

## Shared asset workflow

- Read `SHARED_ASSETS.md` before using or generating media. Both shared folders
  are excluded from source sync.
- Transfer shared assets via `remote_exec asset ensure <path>` (upload) and
  `remote_exec asset fetch <path>` (download). Pass `--checksum` for SHA-256
  verification. See [`remote_exec` README](/Users/zhangzimou/Projects/tools/remote_exec/README.md).
- Keep scripts in the active worktree and run them via `remote_exec run`. Shared
  media resolves to `/workspace/film_photo` remotely.
- Use unique output run folders; do not overwrite another worktree's output or the original source assets.
- Git commits contain scripts and manifests, not ignored binary files. Local checksum/copy/move operations are allowed for asset management; application runtimes and tests remain remote except for explicitly requested local app startup under section 3.

## 7. Verification checklist

- Playwright video recording is off by default. Keep routine checks focused on
  assertions and screenshots. Set `PLAYWRIGHT_VIDEO=on` only for selected
  interaction reviews or diagnostic runs; see the README for usage.
- If video is enabled for a motion review, inspect the recording and report
  what was observed. Saving a video alone is not evidence of a motion review.
  If available tools cannot inspect it, disclose that limitation and use
  screenshots and interaction assertions without claiming video review.

Before reporting an implementation complete:

1. Confirm active checkout and verify sync health with `remote_exec status`.
2. Run relevant checks using `remote_exec run <command>`.
3. Review local Git diff and summarize files changed and checks run.
