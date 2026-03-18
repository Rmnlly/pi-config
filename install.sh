#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PI_AGENT_DIR="$HOME/.pi/agent"

echo "Installing pi-config from $SCRIPT_DIR"
echo "Target: $PI_AGENT_DIR"
echo ""

# Ensure base directories exist
mkdir -p "$PI_AGENT_DIR/extensions"
mkdir -p "$PI_AGENT_DIR/skills"
mkdir -p "$PI_AGENT_DIR/agents"

# --- Extensions ---
echo "📦 Extensions:"

# Multi-file extensions (directories)
for ext_dir in "$SCRIPT_DIR"/extensions/*/; do
  name=$(basename "$ext_dir")
  target="$PI_AGENT_DIR/extensions/$name"
  if [ -L "$target" ]; then
    echo "  ↻ $name (updating symlink)"
    rm "$target"
  elif [ -d "$target" ]; then
    echo "  ⚠️  $name exists as directory — skipping (remove manually to install)"
    continue
  fi
  ln -s "$ext_dir" "$target"
  echo "  ✓ $name"
done

# Single-file extensions
for ext_file in "$SCRIPT_DIR"/extensions/*.ts; do
  [ -f "$ext_file" ] || continue
  name=$(basename "$ext_file")
  target="$PI_AGENT_DIR/extensions/$name"
  if [ -L "$target" ]; then
    rm "$target"
  elif [ -f "$target" ]; then
    echo "  ⚠️  $name exists — skipping (remove manually to install)"
    continue
  fi
  ln -s "$ext_file" "$target"
  echo "  ✓ $name"
done

# --- Skills ---
echo ""
echo "🧠 Skills:"
for skill_dir in "$SCRIPT_DIR"/skills/*/; do
  name=$(basename "$skill_dir")
  target="$PI_AGENT_DIR/skills/$name"
  if [ -L "$target" ]; then
    echo "  ↻ $name (updating symlink)"
    rm "$target"
  elif [ -d "$target" ]; then
    echo "  ⚠️  $name exists as directory — skipping (remove manually to install)"
    continue
  fi
  ln -s "$skill_dir" "$target"
  echo "  ✓ $name"
done

# --- Agents ---
echo ""
echo "🤖 Agents:"
for agent_file in "$SCRIPT_DIR"/agents/*.md; do
  [ -f "$agent_file" ] || continue
  name=$(basename "$agent_file")
  target="$PI_AGENT_DIR/agents/$name"
  if [ -L "$target" ]; then
    rm "$target"
  elif [ -f "$target" ]; then
    echo "  ⚠️  $name exists — skipping (remove manually to install)"
    continue
  fi
  ln -s "$agent_file" "$target"
  echo "  ✓ $name"
done

echo ""
echo "✅ Done! Restart pi to pick up changes."
echo ""
echo "⚠️  Remember to configure:"
echo "   - LOGSEQ_PATH in skills/logseq-notes/SKILL.md and skills/learnings/SKILL.md"
echo "   - ORBIT_TREES_DIR env var (or edit extensions/orbit/scanner.ts)"
