/**
 * Post-Edit Type Check Extension — automatically runs tsc after editing .ts/.tsx files.
 *
 * Hooks into tool_result (for edit/write) and turn_end to debounce and run
 * the appropriate type checker for the current project.
 *
 * Walks up the directory tree to find tsconfig.json and uses pnpm or npx
 * accordingly. Shows status/widget in the TUI with results.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export default function (pi: ExtensionAPI) {
  const EDIT_TOOLS = new Set(["edit", "write"]);
  let pendingCheck = false;
  let lastCheckTime = 0;
  const DEBOUNCE_MS = 3000;

  function detectTypeCheckCommand(cwd: string): string | null {
    // Walk up from cwd looking for a tsconfig.json
    let dir = cwd;
    while (dir !== "/") {
      if (existsSync(resolve(dir, "tsconfig.json"))) {
        // Check for pnpm (prefer over npx)
        const hasPnpm = existsSync(resolve(dir, "pnpm-lock.yaml"));
        const runner = hasPnpm ? "pnpm exec tsc" : "npx tsc";
        return `cd ${dir} && ${runner} --noEmit --pretty 2>&1 | tail -30`;
      }
      dir = resolve(dir, "..");
    }

    return null;
  }

  pi.on("tool_result", async (event, _ctx) => {
    if (!EDIT_TOOLS.has(event.toolName)) return;
    if (event.isError) return;

    const path = (event.input as { path?: string })?.path ?? "";
    if (!path.match(/\.(ts|tsx)$/)) return;

    pendingCheck = true;
  });

  pi.on("turn_end", async (_event, ctx) => {
    if (!pendingCheck) return;
    pendingCheck = false;

    const now = Date.now();
    if (now - lastCheckTime < DEBOUNCE_MS) return;
    lastCheckTime = now;

    const cmd = detectTypeCheckCommand(ctx.cwd);
    if (!cmd) return;

    ctx.ui.setStatus("typecheck", "⏳ Running type check...");

    try {
      const result = await pi.exec("bash", ["-c", cmd], { timeout: 120000 });
      const output = (result.stdout + result.stderr).trim();

      if (result.code === 0) {
        ctx.ui.setStatus("typecheck", "✅ Types OK");
        setTimeout(() => ctx.ui.setStatus("typecheck", ""), 5000);
      } else {
        const lines = output.split("\n").slice(0, 15);
        ctx.ui.setWidget("typecheck", ["❌ Type errors:", ...lines]);
        ctx.ui.setStatus("typecheck", "❌ Type errors found");
      }
    } catch {
      ctx.ui.setStatus("typecheck", "⚠️ Type check failed");
      setTimeout(() => ctx.ui.setStatus("typecheck", ""), 5000);
    }
  });
}
