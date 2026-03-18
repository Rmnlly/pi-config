/**
 * Navigator module — opens pi sessions in zellij panes.
 * Supports floating, split, in-place, and read-only view modes.
 */

import {execSync} from "node:child_process";
import * as path from "node:path";
import * as os from "node:os";
import type {SessionInfo} from "./scanner";

const HOME = os.homedir();
const SESSIONS_DIR = path.join(HOME, ".pi", "agent", "sessions");

export type OpenMode = "floating" | "split" | "in-place" | "view";

function getSessionFilePath(session: SessionInfo): string {
  return path.join(SESSIONS_DIR, session.sessionDir, session.file);
}

function getPaneName(session: SessionInfo): string {
  const tree = session.worktree || "~";
  const topic = session.sessionName || session.topic?.slice(0, 50) || "session";
  return `pi: [${tree}] ${topic}`;
}

function isInsideZellij(): boolean {
  return process.env.ZELLIJ === "0" || !!process.env.ZELLIJ_SESSION_NAME;
}

export function canNavigate(): boolean {
  return isInsideZellij();
}

export function openSession(session: SessionInfo, mode: OpenMode): {ok: boolean; error?: string} {
  if (!isInsideZellij()) {
    return {ok: false, error: "Not running inside zellij — cannot open panes"};
  }

  const sessionPath = getSessionFilePath(session);
  const paneName = getPaneName(session);
  const cwd = session.cwd;

  try {
    switch (mode) {
      case "floating": {
        const args = [
          "action", "new-pane",
          "--floating",
          "--name", paneName,
          "--cwd", cwd,
          "--", "pi", "--session", sessionPath,
        ];
        execSync(`zellij ${args.map(shellEscape).join(" ")}`, {timeout: 5000});
        return {ok: true};
      }

      case "split": {
        const args = [
          "action", "new-pane",
          "--direction", "right",
          "--name", paneName,
          "--cwd", cwd,
          "--", "pi", "--session", sessionPath,
        ];
        execSync(`zellij ${args.map(shellEscape).join(" ")}`, {timeout: 5000});
        return {ok: true};
      }

      case "in-place": {
        const args = [
          "action", "new-pane",
          "--in-place",
          "--name", paneName,
          "--cwd", cwd,
          "--", "pi", "--session", sessionPath,
        ];
        execSync(`zellij ${args.map(shellEscape).join(" ")}`, {timeout: 5000});
        return {ok: true};
      }

      case "view": {
        const viewName = `${paneName} [view]`;
        const args = [
          "action", "new-pane",
          "--floating",
          "--name", viewName,
          "--cwd", cwd,
          "--", "pi",
          "--session", sessionPath,
          "--tools", "read,grep,find,ls",
          "--no-session",
        ];
        execSync(`zellij ${args.map(shellEscape).join(" ")}`, {timeout: 5000});
        return {ok: true};
      }

      default:
        return {ok: false, error: `Unknown mode: ${mode}`};
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {ok: false, error: `Failed to open pane: ${msg}`};
  }
}

function shellEscape(s: string): string {
  if (/^[a-zA-Z0-9_./:=,@-]+$/.test(s)) return s;
  return "'" + s.replace(/'/g, "'\\''") + "'";
}
