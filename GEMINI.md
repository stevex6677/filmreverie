# Project Rules: film_photo (Local-Remote Hybrid)

## 1. File I/O (Read / Write / Edit) -> LOCAL MAC
- All file reads, inspections, and code modifications MUST be performed on the local Mac filesystem.
- Do NOT edit files over SSH directly.
- **Path Resolution & Mapping**: When provided with a path, first check if it is a remote server path or local path. Remote paths often look like `/root/worktrees_antigravity/film_photo/...` or `worktrees_antigravity/film_photo/...` (or `/root/projects/...`). If it is a remote server path, always map it to the corresponding local path before reading. Never read remote server files directly unless explicitly asked for or for special reasons.
- Mutagen automatically synchronizes changes bi-directionally between local and remote in real time.

## 2. Command Execution -> REMOTE SERVER
- All build commands, tests, scripts, and runtime executions MUST run on the remote server via SSH:
  ```bash
  ssh remote "<command>"
  ```
- Do not run application runtimes or heavy build tools locally.
- **Pre-execution Sync Flush**: Before running commands on the remote server that rely on recent local edits, always flush Mutagen synchronization to ensure the remote filesystem is up to date:
  ```bash
  mutagen sync flush film-photo             # For main workspace
  mutagen sync flush antigravity-worktrees  # For worktrees
  # Or flush all: mutagen sync flush -a
  ```
  Run `mutagen sync list` if you need to check sync health or verify zero conflicts (`Status: Watching for changes`).
- **Git is LOCAL ONLY**: `.git` does NOT exist on the remote server. NEVER run `git` commands on the remote server. All git operations (`git status`, `git commit`, etc.) must be executed locally on the Mac.

## 3. Path Mapping & Worktrees
When executing commands on the remote server or resolving file paths, map between local and remote equivalents:

- **Main Workspace**:
  - Local: `/Users/zhangzimou/Projects/film_photo`
  - Remote: `/root/projects/film_photo`
  - *Example*: `ssh remote "cd /root/projects/film_photo && <command>"`

- **Antigravity Worktrees**:
  - Local: `~/.gemini/antigravity/worktrees/film_photo/<task_name>` (`/Users/zhangzimou/.gemini/antigravity/worktrees/film_photo/<task_name>`)
  - Remote: `/root/worktrees_antigravity/film_photo/<task_name>` (or `worktrees_antigravity/film_photo/<task_name>`)
  - *Example*: `ssh remote "cd /root/worktrees_antigravity/film_photo/<task_name> && <command>"`

## 4. Dependencies & Sync Exclusions
- `.git`, `node_modules`, and OS caches are excluded from file synchronization.
- Always install packages on the remote server (e.g. `ssh remote "cd <remote_path> && npm install"`).

## 5. Blender Tasks & MCP
- Use the Blender MCP (`blender`) for all Blender-related tasks.
- Files should be saved to the `blender` folder in the current directory (`./blender`).
- Files under the `blender` folder should be excluded by git.
