# Project Rules: film_photo (Local/Remote Worktree Workflow)

These instructions apply to the repository root and all descendants. The local
Mac filesystem is the source of truth. The remote Linux server is used to run
the application and its tooling.

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
remote: /root/worktrees/<agent>/<project_name>
```

Codex adds its generated worktree ID between the agent and project names:

```text
local:  <codex worktree root>/<worktree_id>/<project_name>
remote: /root/worktrees/codex/<worktree_id>/<project_name>
```

Preserve every path component below `<project_name>` when translating a path.

### Main checkout

- Local: `/Users/zhangzimou/Projects/film_photo`
- Remote: `/root/projects/film_photo`
- Mutagen session: `film-photo`

### Antigravity worktrees

- Local worktree root:
  `/Users/zhangzimou/.gemini/antigravity/worktrees`
- Remote worktree root: `/root/worktrees/antigravity`
- Mutagen session: `antigravity-worktrees`
- Example project mapping:
  `/Users/zhangzimou/.gemini/antigravity/worktrees/film_photo` maps to
  `/root/worktrees/antigravity/film_photo`.

### Cursor worktrees

- Local worktree root: `/Users/zhangzimou/.cursor/worktrees`
- Remote worktree root: `/root/worktrees/cursor`
- Mutagen session: `cursor-worktrees`
- Example project mapping:
  `/Users/zhangzimou/.cursor/worktrees/film_photo` maps to
  `/root/worktrees/cursor/film_photo`.

### Codex worktrees

- Codex creates a generated root for each worktree group at
  `/Users/zhangzimou/.codex/worktrees/<worktree_id>`.
- Map each generated root separately to
  `/root/worktrees/codex/<worktree_id>`.
- Example project mapping:
  `/Users/zhangzimou/.codex/worktrees/<worktree_id>/film_photo` maps to
  `/root/worktrees/codex/<worktree_id>/film_photo`.
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
  ssh remote "cd /root/worktrees/codex/<worktree_id>/film_photo && <command>"
  ```

### App startup and Tailscale access

- Expose apps directly through Tailscale on the machine running them, whether
  that is the remote server or an explicitly requested local Mac. Do not create
  SSH port forwards for app access. SSH is still used to run remote commands.
- Discover the running machine's actual Tailscale IP and DNS name from its
  Tailscale status; do not assume an SSH alias is a resolvable Tailscale hostname.
- Bind the app explicitly to that machine's Tailscale IP (for example, pass
  `--host <tailscale-ip>` to Vite). Do not bind to `0.0.0.0`, `::`, a public IP,
  or a Wi-Fi/LAN IP. Loopback-only binding is insufficient for access from other
  Tailscale devices. Do not open the app port to the public internet.
- Access remains subject to Tailscale access rules and the host firewall. If a
  firewall adjustment is necessary, restrict it to Tailscale traffic for the app
  port. If Tailscale is unavailable, report the blocker instead of falling back
  to public/LAN exposure or an SSH tunnel.
- After startup, verify the listening address and an HTTP response through the
  Tailscale address. For a remote app, also check access from the local Mac over
  Tailscale; checking only server-local loopback is not sufficient.
- Always provide a clickable, usable URL after starting the app, including its
  actual port. Prefer a verified Tailscale DNS URL and include the Tailscale IP
  URL as a fallback. State any access limitation or failed check explicitly;
  clients must be connected to Tailscale and permitted by its access rules.

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
- Keep scripts in the active worktree and run them from its mapped remote checkout. Shared media resolves to `/root/projects/film_photo` remotely.
- Use unique output run folders; do not overwrite another worktree's output or the original source assets.
- Git commits contain scripts and manifests, not ignored binary files. Local checksum/copy/move operations are allowed for asset management; application runtimes and tests remain remote except for explicitly requested local app startup under section 3.

## 7. Verification checklist

Before reporting an implementation complete:

1. Confirm the active local checkout and which agent owns its worktree layout.
2. Translate it using the canonical mapping above.
3. Confirm the matching Mutagen session is connected and has no conflict.
4. Flush that session.
5. Run the relevant checks in the mapped remote checkout.
6. Review the local Git diff and summarize the files changed and checks run.
