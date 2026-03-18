/**
 * TUI components for the /orbit overlay.
 */

import type {Theme} from "@mariozechner/pi-coding-agent";
import {matchesKey, truncateToWidth} from "@mariozechner/pi-tui";
import type {WorkspaceSnapshot, WorktreeInfo, SessionInfo, ExplorationInfo} from "./scanner";
import {listTasks, type Task, type Priority, type TaskStatus} from "./tasks";
import {openSession, canNavigate, type OpenMode} from "./navigator";

type Tab = "overview" | "sessions" | "tasks" | "explorations";

function timeAgo(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

function truncTopic(topic: string | null, maxLen: number): string {
  if (!topic) return "(no topic)";
  const oneLine = topic.replace(/\n/g, " ").trim();
  if (oneLine.length <= maxLen) return oneLine;
  return oneLine.slice(0, maxLen - 1) + "…";
}

export class OrbitComponent {
  private snapshot: WorkspaceSnapshot;
  private activeTasks: Task[];
  private theme: Theme;
  private onClose: () => void;
  private activeTab: Tab = "overview";
  private tabs: Tab[] = ["overview", "sessions", "tasks", "explorations"];
  private cachedWidth?: number;
  private cachedLines?: string[];
  private sessionCursor: number = 0;
  private statusMessage: string | null = null;
  private statusTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(snapshot: WorkspaceSnapshot, theme: Theme, onClose: () => void) {
    this.snapshot = snapshot;
    this.activeTasks = listTasks({status: ["todo", "in_progress", "blocked"]});
    this.theme = theme;
    this.onClose = onClose;
  }

  private showStatus(msg: string): void {
    this.statusMessage = msg;
    if (this.statusTimeout) clearTimeout(this.statusTimeout);
    this.statusTimeout = setTimeout(() => {
      this.statusMessage = null;
      this.invalidate();
    }, 3000);
    this.invalidate();
  }

  private getSelectedSession(): SessionInfo | null {
    const sessions = this.snapshot.recentSessions;
    if (sessions.length === 0) return null;
    return sessions[this.sessionCursor] || null;
  }

  private openSelectedSession(mode: OpenMode): void {
    const session = this.getSelectedSession();
    if (!session) {
      this.showStatus("No session selected");
      return;
    }
    if (!canNavigate()) {
      this.showStatus("Not inside zellij — cannot open panes");
      return;
    }
    const result = openSession(session, mode);
    if (result.ok) {
      const modeLabel = mode === "view" ? "view (read-only)" : mode;
      this.showStatus(`Opened ${modeLabel}: ${session.sessionName || session.topic?.slice(0, 50) || "session"}`);
    } else {
      this.showStatus(result.error || "Failed to open session");
    }
  }

  handleInput(data: string): void {
    if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c") || matchesKey(data, "q")) {
      this.onClose();
      return;
    }
    if (matchesKey(data, "tab") || matchesKey(data, "l") || matchesKey(data, "right")) {
      const idx = this.tabs.indexOf(this.activeTab);
      this.activeTab = this.tabs[(idx + 1) % this.tabs.length];
      this.invalidate();
      return;
    }
    if (matchesKey(data, "shift+tab") || matchesKey(data, "h") || matchesKey(data, "left")) {
      const idx = this.tabs.indexOf(this.activeTab);
      this.activeTab = this.tabs[(idx - 1 + this.tabs.length) % this.tabs.length];
      this.invalidate();
      return;
    }

    // Session-specific keybindings (active on sessions tab)
    if (this.activeTab === "sessions") {
      const sessionCount = this.snapshot.recentSessions.length;

      if ((matchesKey(data, "j") || matchesKey(data, "down")) && sessionCount > 0) {
        this.sessionCursor = Math.min(this.sessionCursor + 1, sessionCount - 1);
        this.invalidate();
        return;
      }
      if ((matchesKey(data, "k") || matchesKey(data, "up")) && sessionCount > 0) {
        this.sessionCursor = Math.max(this.sessionCursor - 1, 0);
        this.invalidate();
        return;
      }
      if (matchesKey(data, "return")) {
        this.openSelectedSession("floating");
        return;
      }
      if (matchesKey(data, "s")) {
        this.openSelectedSession("split");
        return;
      }
      if (matchesKey(data, "i")) {
        this.openSelectedSession("in-place");
        return;
      }
      if (matchesKey(data, "v")) {
        this.openSelectedSession("view");
        return;
      }
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const lines: string[] = [];
    const th = this.theme;

    lines.push("");
    lines.push(this.renderHeader(width));
    lines.push(this.renderTabs(width));
    lines.push("");

    switch (this.activeTab) {
      case "overview":
        lines.push(...this.renderOverview(width));
        break;
      case "sessions":
        lines.push(...this.renderSessions(width));
        break;
      case "tasks":
        lines.push(...this.renderTasks(width));
        break;
      case "explorations":
        lines.push(...this.renderExplorations(width));
        break;
    }

    lines.push("");

    // Status message (temporary feedback)
    if (this.statusMessage) {
      lines.push(
        truncateToWidth(`  ${th.fg("success", "→ " + this.statusMessage)}`, width),
      );
    }

    // Context-sensitive help
    if (this.activeTab === "sessions" && this.snapshot.recentSessions.length > 0) {
      lines.push(
        truncateToWidth(
          `  ${th.fg("dim", "j/k: select  Enter: floating  s: split  i: in-place  v: view (read-only)")}`,
          width,
        ),
      );
      lines.push(
        truncateToWidth(
          `  ${th.fg("dim", "Tab/←→: switch views  q/Esc: close")}`,
          width,
        ),
      );
    } else {
      lines.push(
        truncateToWidth(
          `  ${th.fg("dim", "Tab/←→: switch views  q/Esc: close")}`,
          width,
        ),
      );
    }
    lines.push("");

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  private renderHeader(width: number): string {
    const th = this.theme;
    const title = th.fg("accent", " 🛰️  Orbit ");
    const line =
      th.fg("borderMuted", "─".repeat(3)) +
      title +
      th.fg("borderMuted", "─".repeat(Math.max(0, width - 16)));
    return truncateToWidth(line, width);
  }

  private renderTabs(width: number): string {
    const th = this.theme;
    const tabLabels: Record<Tab, string> = {
      overview: "Overview",
      sessions: "Sessions",
      tasks: "Tasks",
      explorations: "Explorations",
    };

    const parts = this.tabs.map((tab) => {
      if (tab === this.activeTab) {
        return th.fg("accent", ` [${tabLabels[tab]}] `);
      }
      return th.fg("dim", `  ${tabLabels[tab]}  `);
    });

    return truncateToWidth("  " + parts.join(th.fg("borderMuted", "│")), width);
  }

  private renderOverview(width: number): string[] {
    const lines: string[] = [];
    const th = this.theme;
    const snap = this.snapshot;

    // Worktrees summary
    const activeWorktrees = snap.worktrees.filter((w) => w.sessionCount > 0);
    lines.push(
      truncateToWidth(
        `  ${th.fg("warning", `🌳 Worktrees`)} ${th.fg("dim", `(${activeWorktrees.length} active of ${snap.worktrees.length})`)}`,
        width,
      ),
    );

    const treesToShow = activeWorktrees.slice(0, 6);
    for (const tree of treesToShow) {
      const branchInfo = tree.branch ? th.fg("muted", ` (${tree.branch})`) : "";
      const sessionInfo = th.fg("dim", `${tree.sessionCount} sessions`);
      const recentInfo = tree.mostRecent
        ? th.fg("dim", `, ${timeAgo(tree.mostRecent.timestamp)}`)
        : "";
      lines.push(
        truncateToWidth(
          `    ${th.fg("accent", tree.name)}${branchInfo} — ${sessionInfo}${recentInfo}`,
          width,
        ),
      );
    }
    if (activeWorktrees.length > 6) {
      lines.push(
        truncateToWidth(
          `    ${th.fg("dim", `... ${activeWorktrees.length - 6} more`)}`,
          width,
        ),
      );
    }

    lines.push("");

    // Tasks summary
    if (this.activeTasks.length > 0) {
      lines.push(
        truncateToWidth(
          `  ${th.fg("warning", "📋 Tasks")} ${th.fg("dim", `(${this.activeTasks.length} active)`)}`,
          width,
        ),
      );
      const topTasks = this.activeTasks.slice(0, 3);
      for (const task of topTasks) {
        const priColors: Record<Priority, string> = {P0: "error", P1: "warning", P2: "muted", P3: "dim"};
        const statusIcons: Record<TaskStatus, string> = {
          todo: "○", in_progress: "▶", blocked: "⛔", done: "✓", dropped: "✗",
        };
        const icon = statusIcons[task.status];
        const pri = th.fg(priColors[task.priority] as any, task.priority);
        const title = th.fg("text", task.title);
        const treePart = task.worktree ? th.fg("dim", ` [${task.worktree}]`) : "";
        lines.push(
          truncateToWidth(`    ${icon} ${pri} ${title}${treePart}`, width),
        );
      }
      if (this.activeTasks.length > 3) {
        lines.push(
          truncateToWidth(
            `    ${th.fg("dim", `... ${this.activeTasks.length - 3} more`)}`,
            width,
          ),
        );
      }
      lines.push("");
    }

    // Recent sessions
    lines.push(
      truncateToWidth(`  ${th.fg("warning", "💬 Recent Sessions")}`, width),
    );

    const sessionsToShow = snap.recentSessions.slice(0, 5);
    for (const session of sessionsToShow) {
      const treePart = session.worktree
        ? th.fg("accent", `[${session.worktree}]`)
        : th.fg("dim", "[~]");
      const topicPart = session.sessionName
        ? th.fg("text", session.sessionName)
        : th.fg("muted", truncTopic(session.topic, Math.max(40, width - 40)));
      const timePart = th.fg("dim", timeAgo(session.timestamp));
      const zellijPart = session.zellijSession
        ? th.fg("dim", ` 🖥️ ${session.zellijSession}`)
        : "";

      lines.push(
        truncateToWidth(
          `    ${treePart} ${topicPart} — ${timePart}${zellijPart}`,
          width,
        ),
      );
    }

    lines.push("");

    // Explorations
    const activeExps = snap.explorations;
    if (activeExps.length > 0) {
      lines.push(
        truncateToWidth(
          `  ${th.fg("warning", "🔬 Active Explorations")} ${th.fg("dim", `(${activeExps.length})`)}`,
          width,
        ),
      );

      for (const exp of activeExps.slice(0, 4)) {
        const counts = exp.optionCounts;
        const statusParts: string[] = [];
        if (counts.chosen > 0) statusParts.push(`${counts.chosen} chosen`);
        if (counts.pending > 0) statusParts.push(`${counts.pending} pending`);
        if (counts.followedUp > 0) statusParts.push(`${counts.followedUp} followed up`);

        lines.push(
          truncateToWidth(
            `    ${th.fg("accent", exp.id)} ${th.fg("text", exp.title)}`,
            width,
          ),
        );
        lines.push(
          truncateToWidth(
            `      ${th.fg("muted", statusParts.join(", "))}`,
            width,
          ),
        );
      }

      if (snap.pendingOptionCount > 0) {
        lines.push("");
        lines.push(
          truncateToWidth(
            `  ${th.fg("success", `💡 ${snap.pendingOptionCount} pending option(s) to follow up on`)}`,
            width,
          ),
        );
      }
    } else {
      lines.push(
        truncateToWidth(
          `  ${th.fg("dim", "🔬 No active explorations")}`,
          width,
        ),
      );
    }

    return lines;
  }

  private renderSessions(width: number): string[] {
    const lines: string[] = [];
    const th = this.theme;
    const sessions = this.snapshot.recentSessions;

    lines.push(
      truncateToWidth(
        `  ${th.fg("warning", `💬 Sessions`)} ${th.fg("dim", `(${sessions.length})`)}`,
        width,
      ),
    );
    lines.push("");

    if (sessions.length === 0) {
      lines.push(
        truncateToWidth(
          `  ${th.fg("dim", "No sessions found")}`,
          width,
        ),
      );
      return lines;
    }

    // Clamp cursor
    if (this.sessionCursor >= sessions.length) {
      this.sessionCursor = sessions.length - 1;
    }

    for (let idx = 0; idx < sessions.length; idx++) {
      const session = sessions[idx];
      const isSelected = idx === this.sessionCursor;

      const cursor = isSelected ? th.fg("accent", "▸ ") : "  ";
      const treePart = session.worktree
        ? th.fg("accent", `[${session.worktree}]`)
        : th.fg("dim", "[~]");
      const topicPart = session.sessionName
        ? (isSelected ? th.fg("text", th.bold(session.sessionName)) : th.fg("text", session.sessionName))
        : (isSelected
            ? th.fg("text", th.bold(truncTopic(session.topic, Math.max(30, width - 50))))
            : th.fg("muted", truncTopic(session.topic, Math.max(30, width - 50))));
      const timePart = th.fg("dim", timeAgo(session.timestamp));
      const zellijPart = session.zellijSession
        ? th.fg("dim", ` 🖥️ ${session.zellijSession}`)
        : "";

      lines.push(
        truncateToWidth(
          `  ${cursor}${treePart} ${topicPart} — ${timePart}${zellijPart}`,
          width,
        ),
      );

      // Show extra detail for selected session
      if (isSelected) {
        lines.push(
          truncateToWidth(
            `       ${th.fg("dim", `cwd: ${session.cwd}`)}`,
            width,
          ),
        );
        lines.push(
          truncateToWidth(
            `       ${th.fg("dim", `file: ${session.file}`)}`,
            width,
          ),
        );
      }
    }

    return lines;
  }

  private renderTasks(width: number): string[] {
    const lines: string[] = [];
    const th = this.theme;

    const allTasks = listTasks();
    const active = allTasks.filter((t) => t.status !== "done" && t.status !== "dropped");
    const completed = allTasks.filter((t) => t.status === "done");

    lines.push(
      truncateToWidth(
        `  ${th.fg("warning", "📋 Tasks")} ${th.fg("dim", `(${active.length} active, ${completed.length} done)`)}`,
        width,
      ),
    );
    lines.push("");

    if (active.length === 0 && completed.length === 0) {
      lines.push(
        truncateToWidth(
          `  ${th.fg("dim", "No tasks yet. Ask me to add some, or use the task tool.")}`,
          width,
        ),
      );
      return lines;
    }

    const priColors: Record<Priority, string> = {P0: "error", P1: "warning", P2: "muted", P3: "dim"};
    const statusIcons: Record<TaskStatus, string> = {
      todo: "○", in_progress: "▶", blocked: "⛔", done: "✓", dropped: "✗",
    };

    if (active.length > 0) {
      for (const task of active) {
        const icon = statusIcons[task.status];
        const pri = th.fg(priColors[task.priority] as any, task.priority);
        const id = th.fg("accent", `#${task.id}`);
        const title = th.fg("text", task.title);
        const treePart = task.worktree ? th.fg("dim", ` [${task.worktree}]`) : "";
        const expPart = task.explorationId ? th.fg("dim", ` exp:${task.explorationId}`) : "";

        lines.push(
          truncateToWidth(`  ${icon} ${pri} ${id} ${title}${treePart}${expPart}`, width),
        );
        if (task.notes) {
          lines.push(
            truncateToWidth(`      ${th.fg("dim", task.notes)}`, width),
          );
        }
      }
    }

    if (completed.length > 0) {
      lines.push("");
      lines.push(
        truncateToWidth(`  ${th.fg("success", `Done (${completed.length}):`)}`, width),
      );
      for (const task of completed.slice(0, 5)) {
        const id = th.fg("dim", `#${task.id}`);
        const title = th.fg("dim", task.title);
        lines.push(truncateToWidth(`    ✓ ${id} ${title}`, width));
      }
      if (completed.length > 5) {
        lines.push(
          truncateToWidth(
            `    ${th.fg("dim", `... ${completed.length - 5} more`)}`,
            width,
          ),
        );
      }
    }

    return lines;
  }

  private renderExplorations(width: number): string[] {
    const lines: string[] = [];
    const th = this.theme;
    const exps = this.snapshot.explorations;

    lines.push(
      truncateToWidth(
        `  ${th.fg("warning", "🔬 Active Explorations")} ${th.fg("dim", `(${exps.length})`)}`,
        width,
      ),
    );
    lines.push("");

    if (exps.length === 0) {
      lines.push(
        truncateToWidth(
          `  ${th.fg("dim", "No active explorations. Create one with the exploration_tracker tool.")}`,
          width,
        ),
      );
      return lines;
    }

    for (const exp of exps) {
      const counts = exp.optionCounts;
      lines.push(
        truncateToWidth(
          `  ${th.fg("accent", exp.id)} ${th.fg("text", th.bold(exp.title))}`,
          width,
        ),
      );
      if (exp.tags.length > 0) {
        lines.push(
          truncateToWidth(
            `    ${th.fg("dim", exp.tags.map((t) => `#${t}`).join(" "))}`,
            width,
          ),
        );
      }
      lines.push(
        truncateToWidth(
          `    ${th.fg("muted", `${counts.total} options: ${counts.chosen} chosen, ${counts.pending} pending, ${counts.followedUp} followed up, ${counts.skipped} skipped`)}`,
          width,
        ),
      );

      if (exp.pendingOptions.length > 0) {
        lines.push(
          truncateToWidth(
            `    ${th.fg("success", "Pending:")}`,
            width,
          ),
        );
        for (const opt of exp.pendingOptions) {
          lines.push(
            truncateToWidth(
              `      ${th.fg("dim", "⏳")} #${opt.id} ${th.fg("muted", opt.title)}`,
              width,
            ),
          );
        }
      }
      lines.push("");
    }

    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}
