/**
 * Task tracker — prioritized tasks linked to worktrees and explorations.
 * Persists to ~/.pi/orbit/tasks.json, shared across all pi sessions.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const HOME = os.homedir();
const TASKS_FILE = path.join(HOME, ".pi", "orbit", "tasks.json");

export type Priority = "P0" | "P1" | "P2" | "P3";
export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "dropped";

export interface Task {
  id: number;
  title: string;
  priority: Priority;
  status: TaskStatus;
  worktree: string | null;
  explorationId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

interface TaskStore {
  nextId: number;
  tasks: Task[];
}

function ensureDir(): void {
  const dir = path.dirname(TASKS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true});
}

function load(): TaskStore {
  ensureDir();
  try {
    if (fs.existsSync(TASKS_FILE)) {
      return JSON.parse(fs.readFileSync(TASKS_FILE, "utf-8"));
    }
  } catch {}
  return {nextId: 1, tasks: []};
}

function save(store: TaskStore): void {
  ensureDir();
  fs.writeFileSync(TASKS_FILE, JSON.stringify(store, null, 2));
}

export function addTask(params: {
  title: string;
  priority?: Priority;
  worktree?: string | null;
  explorationId?: string | null;
  notes?: string | null;
}): Task {
  const store = load();
  const now = new Date().toISOString();
  const task: Task = {
    id: store.nextId++,
    title: params.title,
    priority: params.priority || "P2",
    status: "todo",
    worktree: params.worktree || null,
    explorationId: params.explorationId || null,
    notes: params.notes || null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  store.tasks.push(task);
  save(store);
  return task;
}

export function listTasks(filter?: {
  status?: TaskStatus | TaskStatus[];
  priority?: Priority;
  worktree?: string;
}): Task[] {
  const store = load();
  let tasks = store.tasks;

  if (filter?.status) {
    const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
    tasks = tasks.filter((t) => statuses.includes(t.status));
  }
  if (filter?.priority) {
    tasks = tasks.filter((t) => t.priority === filter.priority);
  }
  if (filter?.worktree) {
    tasks = tasks.filter((t) => t.worktree === filter.worktree);
  }

  tasks.sort((a, b) => {
    const priorityOrder: Record<Priority, number> = {P0: 0, P1: 1, P2: 2, P3: 3};
    const statusOrder: Record<TaskStatus, number> = {
      in_progress: 0,
      todo: 1,
      blocked: 2,
      done: 3,
      dropped: 4,
    };

    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
    if (statusDiff !== 0) return statusDiff;

    const priDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priDiff !== 0) return priDiff;

    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return tasks;
}

export function updateTask(
  id: number,
  updates: {
    title?: string;
    priority?: Priority;
    status?: TaskStatus;
    worktree?: string | null;
    explorationId?: string | null;
    notes?: string | null;
  },
): Task | null {
  const store = load();
  const task = store.tasks.find((t) => t.id === id);
  if (!task) return null;

  const now = new Date().toISOString();
  if (updates.title !== undefined) task.title = updates.title;
  if (updates.priority !== undefined) task.priority = updates.priority;
  if (updates.status !== undefined) {
    task.status = updates.status;
    if (updates.status === "done" || updates.status === "dropped") {
      task.completedAt = now;
    } else {
      task.completedAt = null;
    }
  }
  if (updates.worktree !== undefined) task.worktree = updates.worktree;
  if (updates.explorationId !== undefined) task.explorationId = updates.explorationId;
  if (updates.notes !== undefined) task.notes = updates.notes;
  task.updatedAt = now;

  save(store);
  return task;
}

export function getTask(id: number): Task | null {
  const store = load();
  return store.tasks.find((t) => t.id === id) || null;
}

export function deleteTask(id: number): boolean {
  const store = load();
  const idx = store.tasks.findIndex((t) => t.id === id);
  if (idx === -1) return false;
  store.tasks.splice(idx, 1);
  save(store);
  return true;
}

export function formatTask(task: Task): string {
  const statusIcons: Record<TaskStatus, string> = {
    todo: "○",
    in_progress: "▶",
    blocked: "⛔",
    done: "✓",
    dropped: "✗",
  };
  const icon = statusIcons[task.status];
  let text = `${icon} [${task.priority}] #${task.id}: ${task.title}`;
  text += ` (${task.status})`;
  if (task.worktree) text += ` — tree: ${task.worktree}`;
  if (task.explorationId) text += ` — exp: ${task.explorationId}`;
  if (task.notes) text += `\n   Notes: ${task.notes}`;
  return text;
}

export function formatTaskList(tasks: Task[]): string {
  if (tasks.length === 0) return "No tasks found.";
  return tasks.map(formatTask).join("\n");
}
