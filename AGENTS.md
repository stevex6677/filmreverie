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

## 2. Canonical path mappings

Antigravity and Cursor worktrees use this logical mapping:

```text
local:  <agent worktree root>/<project_name>
remote: /workspace/worktrees/<agent>/<project_name>
```

Codex adds its generated worktree ID between the agent and project names:

```text
local:  <codex worktree root>/<worktree_id>/<project_name>
remote: /workspace/worktrees/codex/<worktree_id>/<project_name>
```

Preserve every path component below `<project_name>` when translating a path.

### Main checkout

- Local: `/Users/zhangzimou/Projects/film_photo`
- Remote: `/workspace/film_photo`
- Mutagen session: `film-photo`

### Antigravity worktrees

- Local worktree root:
  `/Users/zhangzimou/.gemini/antigravity/worktrees`
- Remote worktree root: `/workspace/worktrees/antigravity`
- Mutagen session: `antigravity-worktrees`
- Example project mapping:
  `/Users/zhangzimou/.gemini/antigravity/worktrees/film_photo` maps to
  `/workspace/worktrees/antigravity/film_photo`.

### Cursor worktrees

- Local worktree root: `/Users/zhangzimou/.cursor/worktrees`
- Remote worktree root: `/workspace/worktrees/cursor`
- Mutagen session: `cursor-worktrees`
- Example project mapping:
  `/Users/zhangzimou/.cursor/worktrees/film_photo` maps to
  `/workspace/worktrees/cursor/film_photo`.

### Codex worktrees

- Codex creates a generated root for each worktree group at
  `/Users/zhangzimou/.codex/worktrees/<worktree_id>`.
- Map each generated root separately to
  `/workspace/worktrees/codex/<worktree_id>`.
- Example project mapping:
  `/Users/zhangzimou/.codex/worktrees/<worktree_id>/film_photo` maps to
  `/workspace/worktrees/codex/<worktree_id>/film_photo`.
- Name each session `codex-worktrees-<worktree_id>`. The currently configured
  example is `codex-worktrees-4d63`.
- When Codex creates a new `<worktree_id>`, check `mutagen sync list --long`. If
  its root is not mapped, report that a new per-root session is required before
  running remote commands.

## 3. Run commands remotely

- Run builds, tests, package-manager commands, scripts, development servers, and
  application runtimes on the remote server through `ssh remote "<command>"`.
- Remote execution is the default. If the user explicitly requests starting the
  app locally, local application startup is allowed and must follow the same
  Tailscale access rules below. Keep builds, tests, and heavy tooling remote.
- Before a remote command that depends on local edits, flush the exact Mutagen
  session for the active checkout. Examples:

  ```bash
  mutagen sync flush film-photo
  mutagen sync flush antigravity-worktrees
  mutagen sync flush cursor-worktrees
  mutagen sync flush codex-worktrees-<worktree_id>
  ```

- Verify session endpoints, status, and conflicts with
  `mutagen sync list --long`. Never guess a session name or remote path.
- If the matching session is absent, disconnected, or conflicted, do not run
  tests against another remote checkout. Set up or repair synchronization first.
- Change to the mapped remote repository before running a command. For example:

  ```bash
  ssh remote "cd /workspace/worktrees/codex/<worktree_id>/film_photo && <command>"
  ```

### App startup and Web Access (Vast.ai)

- Run application dev servers inside the remote container (e.g. `npm run dev` or `npm run preview`).
- Expose app ports on-demand via SSH port forwarding only when needed (e.g. when you or the user wants to preview or test the web application):
  ```bash
  ssh -N -L <port>:127.0.0.1:<port> remote
  ```
- Glances system and GPU monitoring is forwarded to `http://localhost:61209` via `LocalForward 61209 127.0.0.1:61208` in `~/.ssh/config`. Terminal TUI is available via `ssh -t remote glances`.
- Always provide a clickable localhost URL after starting the dev server and establishing on-demand forwarding (e.g. `http://localhost:5173` or `http://localhost:5178`).
- When sharing app preview links, also provide the MacBook Tailscale link (for example `http://macbook:5178`) so the user can open it on an iPhone or iPad. This is an explicit user preference. Verify the current MacBook hostname and IP with `tailscale status --json`; do not assume a localhost-only tunnel is reachable from other devices.
- For phone/iPad access, retain the SSH localhost tunnel and expose it to the tailnet with `tailscale serve --bg --http=<port> http://127.0.0.1:<port>`. Inspect `tailscale serve status` before changing an existing mapping; preserve unrelated services. Verify an HTTP response through the shared hostname. Devices must be connected to the same Tailscale network. The Vite host allowlist must include the verified hostname; use `FILM_PHOTO_ALLOWED_HOSTS` for different names. Do not use Funnel or expose the app publicly.

## 4. Keep Git local

- Run every Git operation on the local Mac, including status, diff, branch,
  commit, and worktree commands.
- Never run Git through SSH. The remote synchronized checkout may not contain
  `.git` metadata.
- Preserve unrelated user changes and do not discard or overwrite them.
- Do not add or commit binary files (such as `.blend`, `.glb`, `.jpg`, `.png`, media,
  or 3D models) to Git unless explicitly asked by the user.

## 5. Dependencies and generated data

- Install dependencies only on the remote server and in the remote checkout that
  corresponds to the active local checkout.
- Mutagen ignores `.git`, `node_modules`, `.DS_Store`, `__pycache__`, and
  `.pytest_cache` in agent worktree sessions.
- Do not rely on local dependency or generated-data state when validating remote
  behavior.

## 6. Blender tasks

- Use the Blender MCP for Blender-related work.
- Save durable Blender files, exports and renders directly under the main checkout's `ignored_generated/blender/`; keep source media read-only under its `ignored_assets/`. See `SHARED_ASSETS.md` and `shared-assets.json`.
- Do not track Blender binary files or generated binary assets in Git unless
  explicitly asked. Group each model and its references under its own directory,
  such as `blender/mamiya_universal/`.

## Shared asset workflow

- Read `SHARED_ASSETS.md` before using or generating media. Both shared folders use the existing `film-photo` sync session; do not create overlapping routes.
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
5. Run the relevant checks in the mapped remote checkout.
6. Review the local Git diff and summarize the files changed and checks run.
