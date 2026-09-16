#!/usr/bin/env bash
# Durable cumulative review run; source and Git operations remain local.
set -uo pipefail
task_output="${1:?Supply a unique shared generated output directory}"
mkdir -p "$task_output"
export PLAYWRIGHT_PORT="${PLAYWRIGHT_PORT:-5199}"
export PLAYWRIGHT_WORKERS="${PLAYWRIGHT_WORKERS:-1}"
# The shared container has a thread limit; bound native compiler/Mesa pools too.
export RAYON_NUM_THREADS="${RAYON_NUM_THREADS:-2}"
export LP_NUM_THREADS="${LP_NUM_THREADS:-4}"
export PLAYWRIGHT_VIDEO=off
export PLAYWRIGHT_OUTPUT_DIR="$task_output/tests"
export REVIEW_ARTIFACTS_DIR="$task_output/regressions"
export M9_CANDIDATE_DIR="$task_output/m9"
export M9_M10_CANDIDATE_DIR="$task_output/m9-m10"
export M10_CANDIDATE_DIR="$task_output/m10"
export M11_CANDIDATE_DIR="$task_output/m11"
export M12_CANDIDATE_DIR="$task_output/m12"
export M12_PANEL_CANDIDATE_DIR="$task_output/m12-panel"
export M13_CANDIDATE_DIR="$task_output/m13"
export M14_CANDIDATE_DIR="$task_output/m14"
export FREE_ROLLS_ARTIFACTS_DIR="$task_output/free-rolls"
npm run validate:m19 2>&1 | tee "$task_output/gate.log"
task_exit=${PIPESTATUS[0]}
printf '%s\n' "$task_exit" > "$task_output/exit-code"
exit "$task_exit"
