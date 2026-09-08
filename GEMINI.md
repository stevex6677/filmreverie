# Project Rules: film_photo (Local-Remote Hybrid)

## 1. File I/O (Read / Write / Edit) -> LOCAL MAC
- All file reads, inspections, and code modifications MUST be performed on the local Mac filesystem.
- Do NOT edit files over SSH directly.
- Mutagen automatically synchronizes changes bi-directionally between local and remote in real time.

## 2. Command Execution -> REMOTE SERVER
- All build commands, tests, scripts, and runtime executions MUST run on the remote server via SSH:
  ```bash
  ssh 209.151.144.140 "<command>"
  ```
- Do not run application runtimes or heavy build tools locally.
- **Git is LOCAL ONLY**: `.git` does NOT exist on the remote server. NEVER run `git` commands on the remote server. All git operations (`git status`, `git commit`, etc.) must be executed locally on the Mac.

## 3. Path Mapping & Worktrees
When executing commands on the remote server, map the current working directory to its remote equivalent:

- **Main Workspace**:
  - Local: `/Users/zhangzimou/Projects/film_photo`
  - Remote: `/root/projects/film_photo`
  - *Example*: `ssh 209.151.144.140 "cd /root/projects/film_photo && <command>"`

- **Antigravity Worktrees**:
  - Local: `~/.gemini/antigravity/worktrees/film_photo/<task_name>`
  - Remote: `/root/worktrees_antigravity/film_photo/<task_name>`
  - *Example*: `ssh 209.151.144.140 "cd /root/worktrees_antigravity/film_photo/<task_name> && <command>"`

## 4. Dependencies & Sync Exclusions
- `.git`, `node_modules`, and OS caches are excluded from file synchronization.
- Always install packages on the remote server (e.g. `ssh 209.151.144.140 "cd <remote_path> && npm install"`).
