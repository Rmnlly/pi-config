/**
 * Caffeinate Extension — keeps your Mac awake while ANY pi session is running.
 *
 * Toggle with the `/caffeinate` command.
 * Uses macOS `caffeinate -i -d` under the hood:
 *   -i  prevents idle sleep
 *   -d  prevents display sleep (also keeps wired network alive)
 *
 * State is global across all pi sessions via a lock file at
 * ~/.pi/agent/caffeinate.state.json. Only one session "owns" the
 * caffeinate process at a time. When that session exits, another
 * session picks it up if caffeinate is still desired.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const STATE_FILE = join(homedir(), ".pi", "agent", "caffeinate.state.json");

interface CaffeinateState {
  enabled: boolean;
  ownerPid: number | null;
}

function readState(): CaffeinateState {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, "utf-8"));
    }
  } catch {}
  return { enabled: false, ownerPid: null };
}

function writeState(state: CaffeinateState) {
  try {
    const dir = join(homedir(), ".pi", "agent");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error("Failed to write caffeinate state:", err);
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export default function (pi: ExtensionAPI) {
  let caffeinateProc: ChildProcess | null = null;
  const myPid = process.pid;

  function startCaffeinateProcess() {
    if (caffeinateProc) return true;

    try {
      const proc = spawn("caffeinate", ["-i", "-d"], {
        stdio: "ignore",
        detached: false,
      });

      proc.on("error", (error) => {
        console.error("Caffeinate process error:", error);
        caffeinateProc = null;
      });

      proc.on("exit", () => {
        caffeinateProc = null;
      });

      caffeinateProc = proc;
      return true;
    } catch (error) {
      console.error("Failed to start caffeinate:", error);
      caffeinateProc = null;
      return false;
    }
  }

  function stopCaffeinateProcess() {
    if (!caffeinateProc) return;
    try {
      caffeinateProc.kill();
    } catch {}
    caffeinateProc = null;
  }

  function claimOwnership() {
    const state = readState();
    if (!state.enabled) return;

    const ownerAlive = state.ownerPid !== null && isProcessAlive(state.ownerPid);
    if (ownerAlive && state.ownerPid !== myPid) return;

    if (startCaffeinateProcess()) {
      writeState({ enabled: true, ownerPid: myPid });
    }
  }

  function releaseOwnership() {
    stopCaffeinateProcess();
    const state = readState();
    if (state.ownerPid === myPid) {
      writeState({ ...state, ownerPid: null });
    }
  }

  pi.on("session_start", async (_event, ctx) => {
    const state = readState();
    if (state.enabled) {
      claimOwnership();
      if (caffeinateProc) {
        ctx.ui.setStatus("caffeinate", "☕ awake");
      } else {
        ctx.ui.setStatus("caffeinate", "☕ awake (other session)");
      }
    }
  });

  pi.registerCommand("caffeinate", {
    description: "Toggle keep-awake (prevents your Mac from sleeping) — shared across all pi sessions",
    handler: async (_args, ctx) => {
      const state = readState();

      if (state.enabled) {
        writeState({ enabled: false, ownerPid: null });
        stopCaffeinateProcess();
        ctx.ui.setStatus("caffeinate", "");
        ctx.ui.notify("☕ Caffeinate OFF — your Mac can sleep again", "info");
      } else {
        writeState({ enabled: true, ownerPid: null });
        claimOwnership();
        if (caffeinateProc) {
          ctx.ui.setStatus("caffeinate", "☕ awake");
          ctx.ui.notify("☕ Caffeinate ON — your Mac will stay awake", "success");
        } else {
          ctx.ui.notify("Failed to start caffeinate. Are you on macOS?", "error");
        }
      }
    },
  });

  pi.on("session_shutdown", async () => {
    releaseOwnership();
  });
}
