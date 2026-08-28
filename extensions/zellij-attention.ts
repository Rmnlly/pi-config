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
 * Skips the mark when a client is already focused on pi's pane. Without that
 * check, the tab you're actively working in gets re-marked every single turn,
 * and the plugin only strips the icon once focus *leaves* the pane — so it
 * reads as a permanently stuck ✅. The signal only means something when
 * you're somewhere else.
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

/**
 * Pane ids currently focused by connected clients, parsed from
 * `zellij action list-clients`:
 *
 *   CLIENT_ID ZELLIJ_PANE_ID RUNNING_COMMAND
 *   1         terminal_0     pi
 *
 * The command is intermittently unreliable — measured ~2 in 12 calls returning
 * zero bytes. The two "no rows" cases are distinguishable, which matters:
 *
 *   0 bytes, no header  -> zellij didn't answer; UNKNOWN, worth retrying
 *   header, no rows     -> genuinely no clients attached; nobody is looking
 *
 * Returns null only when genuinely unknown after retries.
 */
async function focusedTerminalPanes(
  pi: ExtensionAPI,
): Promise<Set<string> | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      // Healthy calls answer in milliseconds; a short timeout keeps a wedged
      // zellij from stalling the turn.
      const r = await pi.exec('zellij', ['action', 'list-clients'], {
        timeout: 1000,
      });
      if (r.code === 0 && r.stdout && r.stdout.trim().length > 0) {
        const ids = new Set<string>();
        for (const line of r.stdout.split('\n')) {
          const m = line.match(/^\s*\d+\s+terminal_(\d+)\s/);
          if (m) ids.add(m[1]);
        }
        return ids;
      }
    } catch {
      // fall through to retry
    }
    await new Promise((res) => setTimeout(res, 150));
  }
  return null;
}

export default function (pi: ExtensionAPI) {
  pi.on('agent_settled', async () => {
    const paneId = resolvePaneId();
    if (!paneId) return;

    // Skip if you're looking right at it. Also skip when focus is genuinely
    // unknown: marking a focused pane makes the plugin orphan the icon — it
    // clears its own state on focus but refuses to strip the tab name, so the
    // ✅ survives switching away and only a detach/reattach clears it. A missed
    // notification is recoverable; an orphaned icon is not.
    const focused = await focusedTerminalPanes(pi);
    if (focused === null) return;
    if (focused?.has(paneId)) return;

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
