# Project Rules: film_photo (Local/Remote Worktree Workflow)

These instructions apply to the repository root and all descendants. The local
Mac filesystem is the source of truth. The remote Linux server is used to run
the application and its tooling.

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
- Never edit repository files through SSH. Mutagen synchronizes local changes to
  the remote server.
- Resolve the active local repository root with `git rev-parse --show-toplevel`.
  Do not assume that a task is using the main checkout.
- If the user supplies a remote path, map it to its local counterpart before
  reading or editing it. Do not inspect the remote copy unless the user
  explicitly asks for a remote-state diagnostic.

## 2. Per-checkout remote setup

Use the general, local-only setup tool documented in
[remote-setup README](/Users/zhangzimou/Projects/tools/remote_setup/README.md):

```bash
/Users/zhangzimou/Projects/tools/remote_setup/remote-setup setup
```

Invoke it from the active checkout (or pass `-C <checkout>` before the command).
The executable lives in `~/Projects/tools/remote_setup/`, outside this repository;
its location does not determine the target project. Running this infrastructure
tool locally is required and is an exception to the remote runtime default.

- Every active checkout gets its own **two-way-safe** Mutagen session. Never
  create a provider-wide or project-wide session covering multiple worktrees.
- Discover the repository root with Git. Preserve the full relative suffix:
  - Main: `/Users/zhangzimou/Projects/film_photo` → `/workspace/film_photo`.
  - Orca: `~/orca/workspaces/<project>/<worktree>` →
    `/workspace/worktrees/orca/<project>/<worktree>`.
  - Antigravity: `~/.gemini/antigravity/worktrees/<suffix>` →
    `/workspace/worktrees/antigravity/<suffix>`.
  - Cursor: `~/.cursor/worktrees/<suffix>` →
    `/workspace/worktrees/cursor/<suffix>`.
  - Codex: `~/.codex/worktrees/<id>/<project>` →
    `/workspace/worktrees/codex/<id>/<project>`.
- Obtain the exact session name and endpoints from `setup`/`status`; do not guess.
- New source files sync before Git staging. Git metadata, dependencies, caches,
  local setup state, and shared media directories are excluded. Tracked source
  files receive inclusion exceptions. Rerun setup after changing ignore policy.
- Remote tooling may modify source/lockfiles; two-way-safe returns those changes
  to the Mac for review. Continue to perform manual edits and all Git work locally.
- An active overlapping legacy session blocks setup. Account for its sibling
  worktrees, flush it if connected, pause it, and initialize the needed checkouts
  individually before terminating the parent. Never resume a parent over children.
- Run `stop` before retiring a worktree or switching its SSH alias to a fresh
  instance; then run `setup` for each checkout needed on the new instance.
- Setup and asset commands may perform bounded remote infrastructure checks,
  existence checks, and checksums. Read/edit repository source locally as before.

## 3. Run commands remotely

- By default, run builds, tests, package-manager commands, scripts, development
  servers, and application runtimes remotely through `ssh remote "<command>"`.
- When the user says "start the app locally" (or equivalent), you MUST start
  the application process on the local Mac in the active checkout. A remote
  server exposed through localhost/SSH does not satisfy this request. This
  explicit instruction overrides the remote startup default; do not silently
  fall back to remote execution. Necessary local startup preparation is allowed.
  Keep builds, tests, and other heavy tooling remote unless separately requested.
- Before a remote command that depends on local edits, flush this checkout:

  ```bash
  /Users/zhangzimou/Projects/tools/remote_setup/remote-setup flush
  ```

- Verify session endpoints, status, and conflicts with
  `mutagen sync list --long`. Never guess a session name or remote path.
- If the matching session is absent, disconnected, or conflicted, do not run
  tests against another remote checkout. Set up or repair synchronization first.
- Change to the mapped remote repository before running a command. For example:

  ```bash
  ssh remote "cd /workspace/worktrees/codex/<worktree_id>/film_photo && <command>"
  ssh remote "cd /workspace/worktrees/orca/film_photo/<worktree_name> && <command>"
  ```

### SSH Connection Multiplexing (ControlMaster)

To minimize connection overhead when executing remote commands across agents and worktrees:
- `Host remote` and `Host vast` in `~/.ssh/config` use OpenSSH `ControlMaster` (`ControlMaster auto`, `ControlPath ~/.ssh/sockets/%r@%h:%p`, `ControlPersist 10m`).
- Local socket directory `~/.ssh/sockets` is maintained on the Mac.
- **Stale Socket Recovery:** If an `ssh remote` command hangs or fails with `Control socket connect(...): Connection refused` (e.g. after laptop sleep or Vast.ai instance reboot), agents MUST clear stale sockets before retrying:
  ```bash
  ssh -O exit remote 2>/dev/null || rm -f ~/.ssh/sockets/*
  ```

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
  are excluded from source sync. Use `remote-setup asset ensure <path>` for needed
  input files and `remote-setup asset fetch <path>` for durable generated outputs.
  Paths include `ignored_assets/` or `ignored_generated/` and resolve against the
  main checkout, never the current worktree. Do not add asset sync sessions.
- Keep scripts in the active worktree and run them from its mapped remote checkout. Shared media resolves to `/workspace/film_photo` remotely.
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

1. Confirm the active local checkout and which agent owns its worktree layout.
2. Translate it using the canonical mapping above.
3. Confirm the matching Mutagen session is connected and has no conflict.
4. Flush that session.
5. If remote SSH fails or hangs with socket errors, clear stale master sockets (`ssh -O exit remote 2>/dev/null || rm -f ~/.ssh/sockets/*`).
6. Run the relevant checks in the mapped remote checkout.
7. Review the local Git diff and summarize the files changed and checks run.
