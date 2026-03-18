/**
 * Orbit Extension — Bird's-eye view of all your pi sessions, worktrees, and explorations.
 *
 * Commands:
 *   /orbit — Interactive TUI dashboard
 *   /tasks — Quick view of all tasks
 *
 * Tools:
 *   workspace_scan — Scan workspace state (worktrees, sessions, explorations)
 *   task — Manage prioritized tasks linked to worktrees and explorations
 *
 * Events:
 *   session_start — Records zellij session + worktree metadata for fast lookup
 */

import type {ExtensionAPI} from "@mariozechner/pi-coding-agent";
import {Text} from "@mariozechner/pi-tui";
import {Type} from "@sinclair/typebox";
import {StringEnum} from "@mariozechner/pi-ai";
import {
  scanWorkspace,
  recordSessionStart,
  recordSessionEnd,
  scanSessions,
  scanWorktrees,
  scanExplorations,
  type WorkspaceSnapshot,
} from "./scanner";
import {OrbitComponent} from "./ui";
import {
  addTask,
  listTasks,
  updateTask,
  getTask,
  deleteTask,
  formatTask,
  formatTaskList,
  type Priority,
  type TaskStatus,
} from "./tasks";

function buildStatusLine(): string {
  const activeTasks = listTasks({status: ["todo", "in_progress", "blocked"]});
  const inProgress = activeTasks.filter((t) => t.status === "in_progress");
  const p0Tasks = activeTasks.filter((t) => t.priority === "P0");

  const parts: string[] = [];

  if (inProgress.length > 0) {
    parts.push(`▶ ${inProgress[0].title}`);
  } else if (p0Tasks.length > 0) {
    parts.push(`🔴 ${p0Tasks[0].title}`);
  }

  if (activeTasks.length > 0) {
    parts.push(`📋 ${activeTasks.length} tasks`);
  }

  return parts.length > 0 ? parts.join("  ·  ") : "";
}

export default function (pi: ExtensionAPI) {
  function refreshStatus(ctx: {ui: {setStatus: (id: string, text: string | undefined) => void}}) {
    const status = buildStatusLine();
    ctx.ui.setStatus("orbit", status || undefined);
  }

  // Record session metadata on start for zellij/worktree tracking
  pi.on("session_start", async (_event, ctx) => {
    const sessionFile = ctx.sessionManager.getSessionFile();
    recordSessionStart(sessionFile, ctx.cwd);
    refreshStatus(ctx);
  });

  // Refresh status after task tool calls
  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName === "task") {
      refreshStatus(ctx);
    }
  });

  // Capture session annotation on shutdown for fast future lookups
  pi.on("session_shutdown", async (_event, ctx) => {
    const sessionFile = ctx.sessionManager.getSessionFile();
    const sessionName = pi.getSessionName() || null;

    // Extract topic from first user message in the branch
    let topic: string | null = null;
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type !== "message") continue;
      const msg = entry.message;
      if (msg.role !== "user") continue;
      const content = msg.content;
      if (typeof content === "string") {
        topic = content.slice(0, 200);
      } else if (Array.isArray(content)) {
        const textBlock = content.find((c: {type: string}) => c.type === "text");
        if (textBlock && "text" in textBlock) {
          topic = (textBlock as {type: string; text: string}).text.slice(0, 200);
        }
      }
      break;
    }

    recordSessionEnd(sessionFile, sessionName, topic);
  });

  // /orbit command — TUI overlay
  pi.registerCommand("orbit", {
    description: "Bird's-eye view of sessions, worktrees, and explorations",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("/orbit requires interactive mode", "error");
        return;
      }

      const snapshot = scanWorkspace();

      await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
        return new OrbitComponent(snapshot, theme, () => done());
      });
    },
  });

  // workspace_scan tool — for the LLM
  pi.registerTool({
    name: "workspace_scan",
    label: "Workspace Scan",
    description:
      "Scan the workspace to see all worktrees, recent pi sessions, and active explorations. Use when the user asks about their current work, sessions, or what they have going on.",
    promptSnippet:
      "Scan worktrees, pi sessions, and explorations for a bird's-eye view of current work",
    promptGuidelines: [
      "Use workspace_scan when the user asks 'what do I have going on?', 'what sessions are open?', or similar questions about their current work state.",
      "The scan returns worktrees with branches, recent sessions with topics, and active explorations with pending options.",
    ],
    parameters: Type.Object({
      focus: Type.Optional(
        StringEnum(["all", "worktrees", "sessions", "explorations"] as const),
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const focus = params.focus || "all";

      if (focus === "all") {
        const snapshot = scanWorkspace();
        return {
          content: [{type: "text" as const, text: formatSnapshot(snapshot)}],
          details: {snapshot},
        };
      }

      if (focus === "worktrees") {
        const sessions = scanSessions();
        const worktrees = scanWorktrees(sessions);
        const text = worktrees
          .map((w) => {
            const branch = w.branch ? ` (${w.branch})` : "";
            const recent = w.mostRecent
              ? ` — last: ${w.mostRecent.timestamp.toISOString()}`
              : "";
            return `${w.name}${branch}: ${w.sessionCount} sessions${recent}`;
          })
          .join("\n");
        return {
          content: [{type: "text" as const, text: `Worktrees:\n${text}`}],
          details: {worktrees},
        };
      }

      if (focus === "sessions") {
        const sessions = scanSessions().slice(0, 20);
        const text = sessions
          .map((s) => {
            const tree = s.worktree ? `[${s.worktree}]` : "[~]";
            const topic = s.sessionName || s.topic?.slice(0, 100) || "(no topic)";
            const zellij = s.zellijSession ? ` (zellij: ${s.zellijSession})` : "";
            return `${tree} ${topic} — ${s.timestamp.toISOString()}${zellij}`;
          })
          .join("\n");
        return {
          content: [{type: "text" as const, text: `Recent sessions:\n${text}`}],
          details: {sessions},
        };
      }

      if (focus === "explorations") {
        const explorations = scanExplorations().filter((e) => e.status === "active");
        const text = explorations
          .map((e) => {
            const counts = e.optionCounts;
            let line = `${e.id}: ${e.title} (${counts.chosen} chosen, ${counts.pending} pending)`;
            if (e.pendingOptions.length > 0) {
              line += "\n  Pending:";
              for (const opt of e.pendingOptions) {
                line += `\n    #${opt.id}: ${opt.title}`;
              }
            }
            return line;
          })
          .join("\n\n");
        return {
          content: [
            {
              type: "text" as const,
              text: explorations.length > 0
                ? `Active explorations:\n${text}`
                : "No active explorations.",
            },
          ],
          details: {explorations},
        };
      }

      return {
        content: [{type: "text" as const, text: `Unknown focus: ${focus}`}],
        details: {error: true},
      };
    },

    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("workspace_scan "));
      if (args.focus) {
        text += theme.fg("muted", args.focus);
      } else {
        text += theme.fg("muted", "all");
      }
      return new Text(text, 0, 0);
    },

    renderResult(result, {expanded}, theme) {
      const details = result.details as Record<string, unknown> | undefined;
      if (details?.error) {
        const text = result.content[0];
        return new Text(
          theme.fg("error", text?.type === "text" ? text.text : "Error"),
          0,
          0,
        );
      }

      if (!expanded) {
        const snapshot = details?.snapshot as WorkspaceSnapshot | undefined;
        if (snapshot) {
          const parts: string[] = [];
          const activeWorktrees = snapshot.worktrees.filter((w) => w.sessionCount > 0);
          parts.push(`${activeWorktrees.length} worktrees`);
          parts.push(`${snapshot.recentSessions.length} sessions`);
          parts.push(`${snapshot.explorations.length} explorations`);
          if (snapshot.pendingOptionCount > 0) {
            parts.push(`${snapshot.pendingOptionCount} pending options`);
          }
          return new Text(
            theme.fg("success", "🛰️ ") + theme.fg("muted", parts.join(" · ")),
            0,
            0,
          );
        }

        const text = result.content[0];
        const firstLine = (text?.type === "text" ? text.text : "").split("\n")[0];
        return new Text(theme.fg("success", "🛰️ ") + firstLine, 0, 0);
      }

      const text = result.content[0];
      return new Text(text?.type === "text" ? text.text : "", 0, 0);
    },
  });

  // task tool — for the LLM to manage tasks
  pi.registerTool({
    name: "task",
    label: "Task",
    description:
      "Manage prioritized tasks. Actions: add (create task), list (view tasks with optional filters), update (change status/priority/notes), complete (mark done), delete (remove task). Tasks have priorities P0-P3 and can be linked to worktrees and explorations.",
    promptSnippet:
      "Manage prioritized tasks linked to worktrees and explorations",
    promptGuidelines: [
      "Use the task tool when the user mentions work they need to do, want to track, or asks about their tasks.",
      "When creating tasks, infer priority from urgency: P0 = critical/blocking, P1 = important/soon, P2 = normal, P3 = nice-to-have.",
      "Link tasks to the current worktree when relevant. Link to explorations when a task comes from an exploration option.",
      "Use 'list' with status filter to show active tasks (todo, in_progress) vs completed ones.",
    ],
    parameters: Type.Object({
      action: StringEnum(["add", "list", "update", "complete", "delete"] as const),
      title: Type.Optional(Type.String({description: "Task title (for add)"})),
      id: Type.Optional(Type.Number({description: "Task ID (for update/complete/delete)"})),
      priority: Type.Optional(
        StringEnum(["P0", "P1", "P2", "P3"] as const),
      ),
      status: Type.Optional(
        StringEnum(["todo", "in_progress", "blocked", "done", "dropped"] as const),
      ),
      worktree: Type.Optional(Type.String({description: "Linked worktree name"})),
      exploration_id: Type.Optional(Type.String({description: "Linked exploration ID"})),
      notes: Type.Optional(Type.String({description: "Task notes"})),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      switch (params.action) {
        case "add": {
          if (!params.title) {
            return {
              content: [{type: "text" as const, text: "Error: title required for add"}],
              details: {error: true},
            };
          }
          const task = addTask({
            title: params.title,
            priority: params.priority as Priority | undefined,
            worktree: params.worktree,
            explorationId: params.exploration_id,
            notes: params.notes,
          });
          return {
            content: [
              {type: "text" as const, text: `Created task #${task.id}:\n${formatTask(task)}`},
            ],
            details: {action: "add", task},
          };
        }

        case "list": {
          const statusFilter = params.status
            ? (params.status as TaskStatus)
            : undefined;
          const tasks = listTasks({
            status: statusFilter,
            priority: params.priority as Priority | undefined,
            worktree: params.worktree,
          });
          return {
            content: [{type: "text" as const, text: formatTaskList(tasks)}],
            details: {action: "list", count: tasks.length, tasks},
          };
        }

        case "update": {
          if (params.id === undefined) {
            return {
              content: [{type: "text" as const, text: "Error: id required for update"}],
              details: {error: true},
            };
          }
          const updates: Record<string, unknown> = {};
          if (params.title !== undefined) updates.title = params.title;
          if (params.priority !== undefined) updates.priority = params.priority;
          if (params.status !== undefined) updates.status = params.status;
          if (params.worktree !== undefined) updates.worktree = params.worktree;
          if (params.exploration_id !== undefined) updates.explorationId = params.exploration_id;
          if (params.notes !== undefined) updates.notes = params.notes;

          const task = updateTask(params.id, updates);
          if (!task) {
            return {
              content: [{type: "text" as const, text: `Task #${params.id} not found`}],
              details: {error: true},
            };
          }
          return {
            content: [{type: "text" as const, text: `Updated task #${task.id}:\n${formatTask(task)}`}],
            details: {action: "update", task},
          };
        }

        case "complete": {
          if (params.id === undefined) {
            return {
              content: [{type: "text" as const, text: "Error: id required for complete"}],
              details: {error: true},
            };
          }
          const task = updateTask(params.id, {status: "done"});
          if (!task) {
            return {
              content: [{type: "text" as const, text: `Task #${params.id} not found`}],
              details: {error: true},
            };
          }
          return {
            content: [{type: "text" as const, text: `Completed task #${task.id}:\n${formatTask(task)}`}],
            details: {action: "complete", task},
          };
        }

        case "delete": {
          if (params.id === undefined) {
            return {
              content: [{type: "text" as const, text: "Error: id required for delete"}],
              details: {error: true},
            };
          }
          const existed = deleteTask(params.id);
          return {
            content: [
              {
                type: "text" as const,
                text: existed ? `Deleted task #${params.id}` : `Task #${params.id} not found`,
              },
            ],
            details: {action: "delete", id: params.id, existed},
          };
        }

        default:
          return {
            content: [{type: "text" as const, text: `Unknown action: ${params.action}`}],
            details: {error: true},
          };
      }
    },

    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("task ")) + theme.fg("muted", args.action);
      if (args.title) text += ` ${theme.fg("accent", `"${args.title}"`)}`;
      if (args.id !== undefined) text += ` ${theme.fg("accent", `#${args.id}`)}`;
      if (args.priority) text += ` ${theme.fg("warning", args.priority)}`;
      if (args.status) text += ` ${theme.fg("dim", args.status)}`;
      return new Text(text, 0, 0);
    },

    renderResult(result, {expanded}, theme) {
      const details = result.details as Record<string, unknown> | undefined;
      if (details?.error) {
        const text = result.content[0];
        return new Text(
          theme.fg("error", text?.type === "text" ? text.text : "Error"),
          0,
          0,
        );
      }

      if (!expanded) {
        const text = result.content[0];
        const firstLine = (text?.type === "text" ? text.text : "").split("\n")[0];
        return new Text(theme.fg("success", "✓ ") + firstLine, 0, 0);
      }

      const text = result.content[0];
      return new Text(text?.type === "text" ? text.text : "", 0, 0);
    },
  });

  // /tasks command — quick task list
  pi.registerCommand("tasks", {
    description: "View all active tasks",
    handler: async (_args, ctx) => {
      const tasks = listTasks({status: ["todo", "in_progress", "blocked"]});
      if (tasks.length === 0) {
        ctx.ui.notify("No active tasks. Use /task add <title> to create one.", "info");
        return;
      }
      ctx.ui.notify(`${tasks.length} active task(s):\n${formatTaskList(tasks)}`, "info");
    },
  });

  // /task command — direct task management without LLM
  pi.registerCommand("task", {
    description: "Manage tasks: /task add <title> | /task done <id> | /task drop <id> | /task list [all]",
    getArgumentCompletions: (prefix: string) => {
      const subcommands = ["add", "done", "drop", "list", "start", "block", "reopen"];
      const items = subcommands
        .filter((s) => s.startsWith(prefix))
        .map((s) => ({value: s, label: s}));
      return items.length > 0 ? items : null;
    },
    handler: async (args, ctx) => {
      if (!args || !args.trim()) {
        const tasks = listTasks({status: ["todo", "in_progress", "blocked"]});
        if (tasks.length === 0) {
          ctx.ui.notify("No active tasks. Use /task add <title> to create one.", "info");
        } else {
          ctx.ui.notify(`${tasks.length} active task(s):\n${formatTaskList(tasks)}`, "info");
        }
        return;
      }

      const parts = args.trim().split(/\s+/);
      const subcommand = parts[0].toLowerCase();
      const rest = parts.slice(1).join(" ");

      switch (subcommand) {
        case "add": {
          if (!rest) {
            ctx.ui.notify("Usage: /task add <title> [p0|p1|p2|p3]", "error");
            return;
          }
          // Check if last word is a priority
          const words = rest.split(/\s+/);
          const lastWord = words[words.length - 1].toLowerCase();
          let priority: Priority = "P2";
          let title = rest;
          if (["p0", "p1", "p2", "p3"].includes(lastWord)) {
            priority = lastWord.toUpperCase() as Priority;
            title = words.slice(0, -1).join(" ");
          }
          if (!title) {
            ctx.ui.notify("Usage: /task add <title> [p0|p1|p2|p3]", "error");
            return;
          }
          const task = addTask({title, priority});
          ctx.ui.notify(`Created: ${formatTask(task)}`, "success");
          refreshStatus(ctx);
          return;
        }

        case "done": {
          const id = parseInt(rest, 10);
          if (isNaN(id)) {
            ctx.ui.notify("Usage: /task done <id>", "error");
            return;
          }
          const task = updateTask(id, {status: "done"});
          if (!task) {
            ctx.ui.notify(`Task #${id} not found`, "error");
            return;
          }
          ctx.ui.notify(`Completed: ${formatTask(task)}`, "success");
          refreshStatus(ctx);
          return;
        }

        case "drop": {
          const id = parseInt(rest, 10);
          if (isNaN(id)) {
            ctx.ui.notify("Usage: /task drop <id>", "error");
            return;
          }
          const task = updateTask(id, {status: "dropped"});
          if (!task) {
            ctx.ui.notify(`Task #${id} not found`, "error");
            return;
          }
          ctx.ui.notify(`Dropped: ${formatTask(task)}`, "success");
          refreshStatus(ctx);
          return;
        }

        case "start": {
          const id = parseInt(rest, 10);
          if (isNaN(id)) {
            ctx.ui.notify("Usage: /task start <id>", "error");
            return;
          }
          const task = updateTask(id, {status: "in_progress"});
          if (!task) {
            ctx.ui.notify(`Task #${id} not found`, "error");
            return;
          }
          ctx.ui.notify(`Started: ${formatTask(task)}`, "success");
          refreshStatus(ctx);
          return;
        }

        case "block": {
          const id = parseInt(rest, 10);
          if (isNaN(id)) {
            ctx.ui.notify("Usage: /task block <id>", "error");
            return;
          }
          const task = updateTask(id, {status: "blocked"});
          if (!task) {
            ctx.ui.notify(`Task #${id} not found`, "error");
            return;
          }
          ctx.ui.notify(`Blocked: ${formatTask(task)}`, "success");
          refreshStatus(ctx);
          return;
        }

        case "reopen": {
          const id = parseInt(rest, 10);
          if (isNaN(id)) {
            ctx.ui.notify("Usage: /task reopen <id>", "error");
            return;
          }
          const task = updateTask(id, {status: "todo"});
          if (!task) {
            ctx.ui.notify(`Task #${id} not found`, "error");
            return;
          }
          ctx.ui.notify(`Reopened: ${formatTask(task)}`, "success");
          refreshStatus(ctx);
          return;
        }

        case "rm":
        case "delete": {
          const id = parseInt(rest, 10);
          if (isNaN(id)) {
            ctx.ui.notify("Usage: /task rm <id>", "error");
            return;
          }
          const existed = deleteTask(id);
          if (!existed) {
            ctx.ui.notify(`Task #${id} not found`, "error");
            return;
          }
          ctx.ui.notify(`Deleted task #${id}`, "success");
          refreshStatus(ctx);
          return;
        }

        case "list": {
          const showAll = rest.toLowerCase() === "all";
          const tasks = showAll
            ? listTasks()
            : listTasks({status: ["todo", "in_progress", "blocked"]});
          if (tasks.length === 0) {
            ctx.ui.notify(showAll ? "No tasks at all." : "No active tasks.", "info");
          } else {
            ctx.ui.notify(`${tasks.length} task(s):\n${formatTaskList(tasks)}`, "info");
          }
          return;
        }

        default:
          ctx.ui.notify(
            "Unknown subcommand. Usage:\n  /task add <title> [p0-p3]\n  /task done|drop|start|block|reopen|rm <id>\n  /task list [all]",
            "error",
          );
      }
    },
  });

}

function formatSnapshot(snapshot: WorkspaceSnapshot): string {
  const parts: string[] = [];

  // Worktrees
  const activeWorktrees = snapshot.worktrees.filter((w) => w.sessionCount > 0);
  parts.push(`=== Worktrees (${activeWorktrees.length} active of ${snapshot.worktrees.length}) ===`);
  for (const w of snapshot.worktrees) {
    const branch = w.branch ? ` (${w.branch})` : "";
    const recent = w.mostRecent
      ? ` — last session: "${w.mostRecent.sessionName || w.mostRecent.topic?.slice(0, 80) || "no topic"}"`
      : "";
    parts.push(`  ${w.name}${branch}: ${w.sessionCount} sessions${recent}`);
  }

  // Recent sessions
  parts.push("");
  parts.push(`=== Recent Sessions (${snapshot.recentSessions.length}) ===`);
  for (const s of snapshot.recentSessions.slice(0, 10)) {
    const tree = s.worktree ? `[${s.worktree}]` : "[~]";
    const topic = s.sessionName || s.topic?.slice(0, 100) || "(no topic)";
    const zellij = s.zellijSession ? ` (zellij: ${s.zellijSession})` : "";
    parts.push(`  ${tree} ${topic} — ${s.timestamp.toISOString()}${zellij}`);
  }

  // Explorations
  if (snapshot.explorations.length > 0) {
    parts.push("");
    parts.push(`=== Active Explorations (${snapshot.explorations.length}) ===`);
    for (const e of snapshot.explorations) {
      const counts = e.optionCounts;
      parts.push(`  ${e.id}: ${e.title} (${counts.chosen} chosen, ${counts.pending} pending)`);
      for (const opt of e.pendingOptions) {
        parts.push(`    ⏳ #${opt.id}: ${opt.title}`);
      }
    }
    if (snapshot.pendingOptionCount > 0) {
      parts.push(`\n  💡 ${snapshot.pendingOptionCount} total pending option(s) to follow up on`);
    }
  }

  return parts.join("\n");
}
