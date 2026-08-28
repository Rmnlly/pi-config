/**
 * Zellij Attention Extension — marks this pane's Zellij tab when pi finishes.
 *
 * When pi settles (done generating, nothing queued), the tab containing this
 * pane gets a ✅ appended to its name via the zellij-attention plugin, so you
 * can see at a glance which tab is ready for you. Focusing the tab clears it.
 *
 * Pairs with:
 *   ~/.config/zellij/plugins/zellij-attention.wasm  (loaded via load_plugins)
 *   ~/.claude/hooks/zellij-attention-notify.sh      (same idea for Claude Code)
 *
 * Why `agent_settled` and not `agent_end`: `agent_end` fires after every
 * low-level run, and pi may still auto-retry, auto-compact, or process queued
 * follow-ups afterwards. `agent_settled` fires once, when pi will not continue
 * on its own — which is exactly "ready for you".
 *
 * No-ops safely outside Zellij (plain terminal, SSH, CI) and never throws:
 * a cosmetic notification must not be able to disturb a session.
 */

import type {ExtensionAPI} from '@earendil-works/pi-coding-agent';

/** "completed" -> ✅ ; "waiting" -> ⏳ (both understood by the plugin). */
const EVENT_TYPE = 'completed';

/** Zellij's CliPipe can stall ~1s; keep the ceiling low so pi never waits. */
const PIPE_TIMEOUT_MS = 3000;

/**
 * Bare numeric pane id, or null when we're not in a usable Zellij pane.
 * Zellij exports ZELLIJ_PANE_ID as a bare integer on 0.44, but has used a
 * "terminal_<n>" form elsewhere — tolerate both.
 */
function resolvePaneId(): string | null {
  if (!process.env.ZELLIJ) return null;
  const raw = process.env.ZELLIJ_PANE_ID;
  if (!raw) return null;
  const id = raw.includes('_') ? raw.slice(raw.lastIndexOf('_') + 1) : raw;
  return /^\d+$/.test(id) ? id : null;
}

export default function (pi: ExtensionAPI) {
  pi.on('agent_settled', async () => {
    const paneId = resolvePaneId();
    if (!paneId) return;

    try {
      // Must be --name (broadcast). --plugin spawns a second plugin instance
      // instead of reaching the one already loaded via load_plugins.
      await pi.exec(
        'zellij',
        ['pipe', '--name', `zellij-attention::${EVENT_TYPE}::${paneId}`],
        {
          timeout: PIPE_TIMEOUT_MS,
        },
      );
    } catch {
      // zellij missing, pipe timed out, session gone — all non-fatal.
    }
  });
}
