/**
 * Scanner module — discovers worktrees, pi sessions, explorations, and zellij context.
 * Reads session JSONL files lazily (first few lines only) for speed.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {execSync} from "node:child_process";

const HOME = os.homedir();
const SESSIONS_DIR = path.join(HOME, ".pi", "agent", "sessions");
const EXPLORATIONS_DIR = path.join(HOME, ".pi", "explorations");
// Configure this to your worktree root directory, or set ORBIT_TREES_DIR env var
const TREES_DIR = process.env.ORBIT_TREES_DIR || path.join(HOME, "worktrees");
const META_FILE = path.join(HOME, ".pi", "orbit", "session-meta.json");

export interface SessionInfo {
  file: string;
  sessionDir: string;
  worktree: string | null;
  cwd: string;
  timestamp: Date;
  topic: string | null;
  sessionName: string | null;
  zellijSession: string | null;
}

export interface WorktreeInfo {
  name: string;
  path: string;
  branch: string | null;
  sessionCount: number;
  mostRecent: SessionInfo | null;
}

export interface ExplorationInfo {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  tags: string[];
  optionCounts: {
    total: number;
    pending: number;
    chosen: number;
    followedUp: number;
    skipped: number;
  };
  pendingOptions: Array<{id: number; title: string; description: string}>;
}

export interface SessionMeta {
  sessionFile: string;
  zellijSession?: string;
  worktree?: string;
  branch?: string;
  cwd?: string;
  topic?: string;
  sessionName?: string;
  lastSeen: string;
  startedAt?: string;
}

export interface WorkspaceSnapshot {
  worktrees: WorktreeInfo[];
  recentSessions: SessionInfo[];
  explorations: ExplorationInfo[];
  pendingOptionCount: number;
  scannedAt: string;
}

function loadSessionMeta(): Record<string, SessionMeta> {
  try {
    if (fs.existsSync(META_FILE)) {
      return JSON.parse(fs.readFileSync(META_FILE, "utf-8"));
    }
  } catch {}
  return {};
}

function saveSessionMeta(meta: Record<string, SessionMeta>): void {
  const dir = path.dirname(META_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
}

export function recordSessionStart(
  sessionFile: string | null,
  cwd: string,
): void {
  if (!sessionFile) return;
  const meta = loadSessionMeta();
  const zellijSession = process.env.ZELLIJ_SESSION_NAME || undefined;
  const worktree = extractWorktree(cwd);

  let branch: string | undefined;
  try {
    branch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd,
      timeout: 3000,
      encoding: "utf-8",
    }).trim();
  } catch {}

  const now = new Date().toISOString();
  const existing = meta[sessionFile];

  meta[sessionFile] = {
    ...existing,
    sessionFile,
    zellijSession,
    worktree: worktree || undefined,
    branch,
    cwd,
    lastSeen: now,
    startedAt: existing?.startedAt || now,
  };
  saveSessionMeta(meta);
}

export function recordSessionEnd(
  sessionFile: string | null,
  sessionName: string | null,
  topic: string | null,
): void {
  if (!sessionFile) return;
  const meta = loadSessionMeta();
  const existing = meta[sessionFile];
  if (!existing) return;

  if (sessionName) existing.sessionName = sessionName;
  if (topic) existing.topic = topic;
  existing.lastSeen = new Date().toISOString();

  meta[sessionFile] = existing;
  saveSessionMeta(meta);
}

export function getSessionMeta(): Record<string, SessionMeta> {
  return loadSessionMeta();
}

function extractWorktree(cwdOrDir: string): string | null {
  const treesPrefix = TREES_DIR + path.sep;
  if (!cwdOrDir.startsWith(treesPrefix)) return null;
  const rest = cwdOrDir.slice(treesPrefix.length);
  const treeName = rest.split(path.sep)[0];
  return treeName || null;
}

function extractCwdFromDirName(dirName: string): string {
  const stripped = dirName.replace(/^--/, "").replace(/--$/, "");
  return "/" + stripped.replace(/-/g, "/");
}

function parseSessionFile(filePath: string, dirName: string): SessionInfo | null {
  try {
    const fileName = path.basename(filePath);
    const meta = loadSessionMeta();
    const cached = meta[fileName];

    const stat = fs.statSync(filePath);

    // Fast path: use cached annotation if we have topic/sessionName already
    if (cached?.topic || cached?.sessionName) {
      return {
        file: fileName,
        sessionDir: dirName,
        worktree: cached.worktree || extractWorktree(cached.cwd || extractCwdFromDirName(dirName)),
        cwd: cached.cwd || extractCwdFromDirName(dirName),
        timestamp: cached.startedAt ? new Date(cached.startedAt) : stat.mtime,
        topic: cached.topic || null,
        sessionName: cached.sessionName || null,
        zellijSession: cached.zellijSession || null,
      };
    }

    // Slow path: parse the JSONL file
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());

    let cwd = extractCwdFromDirName(dirName);
    let sessionName: string | null = null;
    let topic: string | null = null;
    let timestamp = stat.mtime;

    const linesToScan = Math.min(lines.length, 30);
    for (let i = 0; i < linesToScan; i++) {
      try {
        const entry = JSON.parse(lines[i]);

        if (entry.type === "session") {
          if (entry.cwd) cwd = entry.cwd;
          if (entry.timestamp) timestamp = new Date(entry.timestamp);
        }

        if (entry.type === "session_name") {
          sessionName = entry.name || null;
        }

        if (!topic && entry.type === "message" && entry.message?.role === "user") {
          const msgContent = entry.message.content;
          if (typeof msgContent === "string") {
            topic = msgContent.slice(0, 200);
          } else if (Array.isArray(msgContent)) {
            const textBlock = msgContent.find((c: {type: string}) => c.type === "text");
            if (textBlock?.text) {
              topic = textBlock.text.slice(0, 200);
            }
          }
        }

        if (topic && sessionName) break;
      } catch {}
    }

    const worktree = extractWorktree(cwd);
    const zellijSession = cached?.zellijSession || null;

    return {
      file: fileName,
      sessionDir: dirName,
      worktree,
      cwd,
      timestamp,
      topic,
      sessionName,
      zellijSession,
    };
  } catch {
    return null;
  }
}

export function scanSessions(): SessionInfo[] {
  if (!fs.existsSync(SESSIONS_DIR)) return [];

  const sessions: SessionInfo[] = [];
  const dirs = fs.readdirSync(SESSIONS_DIR);

  for (const dirName of dirs) {
    const dirPath = path.join(SESSIONS_DIR, dirName);
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) continue;

    const files = fs
      .readdirSync(dirPath)
      .filter((f) => f.endsWith(".jsonl"))
      .sort()
      .reverse();

    for (const file of files) {
      const session = parseSessionFile(path.join(dirPath, file), dirName);
      if (session) sessions.push(session);
    }
  }

  sessions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  return sessions;
}

export function scanWorktrees(sessions: SessionInfo[]): WorktreeInfo[] {
  const worktrees: WorktreeInfo[] = [];

  if (!fs.existsSync(TREES_DIR)) return worktrees;

  const treeNames = fs.readdirSync(TREES_DIR);
  for (const name of treeNames) {
    const treePath = path.join(TREES_DIR, name);
    const stat = fs.statSync(treePath);
    if (!stat.isDirectory()) continue;

    let branch: string | null = null;
    try {
      const srcPath = path.join(treePath, "src");
      if (fs.existsSync(srcPath)) {
        branch = execSync("git rev-parse --abbrev-ref HEAD", {
          cwd: srcPath,
          timeout: 3000,
          encoding: "utf-8",
        }).trim();
      }
    } catch {}

    const treeSessions = sessions.filter((s) => s.worktree === name);
    const mostRecent = treeSessions.length > 0 ? treeSessions[0] : null;

    worktrees.push({
      name,
      path: treePath,
      branch,
      sessionCount: treeSessions.length,
      mostRecent,
    });
  }

  worktrees.sort((a, b) => {
    const aTime = a.mostRecent?.timestamp.getTime() ?? 0;
    const bTime = b.mostRecent?.timestamp.getTime() ?? 0;
    return bTime - aTime;
  });

  return worktrees;
}

export function scanExplorations(): ExplorationInfo[] {
  if (!fs.existsSync(EXPLORATIONS_DIR)) return [];

  const explorations: ExplorationInfo[] = [];
  const files = fs.readdirSync(EXPLORATIONS_DIR).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    try {
      const data = JSON.parse(
        fs.readFileSync(path.join(EXPLORATIONS_DIR, file), "utf-8"),
      );

      const options = data.options || [];
      const counts = {
        total: options.length,
        pending: options.filter((o: {status: string}) => o.status === "pending").length,
        chosen: options.filter((o: {status: string}) => o.status === "chosen").length,
        followedUp: options.filter((o: {status: string}) => o.status === "followed_up").length,
        skipped: options.filter((o: {status: string}) => o.status === "skipped").length,
      };

      const pendingOptions = options
        .filter((o: {status: string}) => o.status === "pending")
        .map((o: {id: number; title: string; description: string}) => ({
          id: o.id,
          title: o.title,
          description: o.description,
        }));

      explorations.push({
        id: data.id,
        title: data.title,
        status: data.status,
        createdAt: data.createdAt,
        tags: data.tags || [],
        optionCounts: counts,
        pendingOptions,
      });
    } catch {}
  }

  return explorations;
}

export function scanWorkspace(): WorkspaceSnapshot {
  const sessions = scanSessions();
  const worktrees = scanWorktrees(sessions);
  const explorations = scanExplorations();
  const pendingOptionCount = explorations.reduce(
    (sum, e) => sum + e.optionCounts.pending,
    0,
  );

  return {
    worktrees,
    recentSessions: sessions.slice(0, 15),
    explorations: explorations.filter((e) => e.status === "active"),
    pendingOptionCount,
    scannedAt: new Date().toISOString(),
  };
}
