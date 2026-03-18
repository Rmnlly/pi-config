/**
 * Multi-Choice Tool — lets the LLM present multiple options and the user picks one.
 * Optionally allows typing a custom answer (when allowCustom is true).
 * Escape cancels.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Editor, type EditorTheme, Key, matchesKey, Text, truncateToWidth } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

interface OptionDef {
  label: string;
  description?: string;
}

interface MultiChoiceDetails {
  question: string;
  options: string[];
  answer: string | null;
  wasCustom: boolean;
  cancelled: boolean;
}

const OptionSchema = Type.Object({
  label: Type.String({ description: "Display label for the option" }),
  description: Type.Optional(Type.String({ description: "Optional description shown below the label" })),
});

const MultiChoiceParams = Type.Object({
  question: Type.String({ description: "The question or prompt to show the user" }),
  options: Type.Array(OptionSchema, {
    description: "The choices to present",
    minItems: 1,
  }),
  allowCustom: Type.Optional(
    Type.Boolean({
      description: "Show a 'Type your own…' option so the user can enter free-form text (default: false)",
    }),
  ),
});

export default function multiChoice(pi: ExtensionAPI) {
  pi.registerTool({
    name: "multi_choice",
    label: "Multi Choice",
    description:
      "Present the user with a set of options and let them pick one. " +
      "Optionally allows the user to type a custom answer. " +
      "Use when you need user input to decide between alternatives.",
    promptGuidelines: [
      "Use multi_choice when you need the user to pick from a set of options rather than asking them to type a response.",
      "Set allowCustom: true when the user might want to provide an answer not in the list.",
    ],
    parameters: MultiChoiceParams,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (!ctx.hasUI) {
        return errorResult("Error: UI not available (running in non-interactive mode)", params);
      }
      if (params.options.length === 0) {
        return errorResult("Error: No options provided", params);
      }

      const allowCustom = params.allowCustom === true;

      type DisplayOption = OptionDef & { isCustom?: boolean };
      const displayOptions: DisplayOption[] = [
        ...params.options,
        ...(allowCustom ? [{ label: "Type your own…", isCustom: true }] : []),
      ];

      const result = await ctx.ui.custom<MultiChoiceDetails>((tui, theme, _kb, done) => {
        let cursor = 0;
        let editMode = false;
        let cachedLines: string[] | undefined;

        const editorTheme: EditorTheme = {
          borderColor: (s) => theme.fg("accent", s),
          selectList: {
            selectedPrefix: (t) => theme.fg("accent", t),
            selectedText: (t) => theme.fg("accent", t),
            description: (t) => theme.fg("muted", t),
            scrollInfo: (t) => theme.fg("dim", t),
            noMatch: (t) => theme.fg("warning", t),
          },
        };
        const editor = new Editor(tui, editorTheme);

        editor.onSubmit = (value) => {
          const trimmed = value.trim();
          if (trimmed) {
            done(makeResult(null, trimmed));
          } else {
            editMode = false;
            editor.setText("");
            refresh();
          }
        };

        function makeResult(answer: string | null, customValue?: string): MultiChoiceDetails {
          return {
            question: params.question,
            options: params.options.map((o) => o.label),
            answer: customValue ?? answer,
            wasCustom: !!customValue,
            cancelled: answer === null && !customValue,
          };
        }

        function refresh() {
          cachedLines = undefined;
          tui.requestRender();
        }

        function handleInput(data: string) {
          if (editMode) {
            if (matchesKey(data, Key.escape)) {
              editMode = false;
              editor.setText("");
              refresh();
              return;
            }
            editor.handleInput(data);
            refresh();
            return;
          }

          if (matchesKey(data, Key.up)) {
            cursor = Math.max(0, cursor - 1);
            refresh();
            return;
          }
          if (matchesKey(data, Key.down)) {
            cursor = Math.min(displayOptions.length - 1, cursor + 1);
            refresh();
            return;
          }

          if (matchesKey(data, Key.enter)) {
            const opt = displayOptions[cursor];
            if (opt.isCustom) {
              editMode = true;
              refresh();
            } else {
              done({ ...makeResult(opt.label), cancelled: false });
            }
            return;
          }

          if (matchesKey(data, Key.escape)) {
            done({ ...makeResult(null), cancelled: true });
          }
        }

        function render(width: number): string[] {
          if (cachedLines) return cachedLines;

          const lines: string[] = [];
          const add = (s: string) => lines.push(truncateToWidth(s, width));

          add(theme.fg("accent", "─".repeat(width)));
          add(theme.fg("text", ` ${params.question}`));
          lines.push("");

          for (let i = 0; i < displayOptions.length; i++) {
            const opt = displayOptions[i];
            const isCursor = i === cursor;
            const isCustom = opt.isCustom === true;
            const prefix = isCursor ? theme.fg("accent", "> ") : "  ";
            const num = `${i + 1}. `;

            let label: string;
            if (isCustom && editMode) {
              label = theme.fg("accent", `${num}${opt.label} ✎`);
            } else if (isCursor) {
              label = theme.fg("accent", `${num}${opt.label}`);
            } else {
              label = theme.fg("text", `${num}${opt.label}`);
            }

            add(prefix + label);

            if (opt.description) {
              add(`     ${theme.fg("muted", opt.description)}`);
            }
          }

          if (editMode) {
            lines.push("");
            add(theme.fg("muted", " Your answer:"));
            for (const line of editor.render(width - 2)) {
              add(` ${line}`);
            }
          }

          lines.push("");
          if (editMode) {
            add(theme.fg("dim", " Enter to submit • Esc to go back"));
          } else {
            add(theme.fg("dim", " ↑↓ navigate • Enter to select • Esc cancel"));
          }
          add(theme.fg("accent", "─".repeat(width)));

          cachedLines = lines;
          return lines;
        }

        return {
          render,
          invalidate: () => { cachedLines = undefined; },
          handleInput,
        };
      });

      if (result.cancelled) {
        return {
          content: [{ type: "text", text: "User cancelled the selection." }],
          details: result,
        };
      }

      if (result.wasCustom) {
        return {
          content: [{ type: "text", text: `User typed a custom answer: ${result.answer}` }],
          details: result,
        };
      }

      const idx = result.options.indexOf(result.answer!) + 1;
      return {
        content: [{ type: "text", text: `User selected: ${idx}. ${result.answer}` }],
        details: result,
      };
    },

    renderCall(args, theme) {
      let text = theme.fg("toolTitle", theme.bold("multi_choice "));
      text += theme.fg("text", args.question as string);

      const opts = Array.isArray(args.options) ? (args.options as OptionDef[]) : [];
      if (opts.length) {
        const numbered = opts.map((o, i) => `${i + 1}. ${o.label}`);
        if (args.allowCustom) numbered.push(`${opts.length + 1}. Type your own…`);
        text += `\n${theme.fg("dim", `  ${numbered.join("  •  ")}`)}`;
      }

      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const details = result.details as MultiChoiceDetails | undefined;
      if (!details) {
        const text = result.content[0];
        return new Text(text?.type === "text" ? text.text : "", 0, 0);
      }

      if (details.cancelled) {
        return new Text(theme.fg("warning", "Cancelled"), 0, 0);
      }

      if (details.wasCustom) {
        return new Text(
          theme.fg("success", "✓ ") + theme.fg("muted", "(custom) ") + theme.fg("accent", details.answer!),
          0, 0,
        );
      }

      const idx = details.options.indexOf(details.answer!) + 1;
      const display = idx > 0 ? `${idx}. ${details.answer}` : details.answer!;
      return new Text(theme.fg("success", "✓ ") + theme.fg("accent", display), 0, 0);
    },
  });
}

function errorResult(message: string, params: { question: string; options: OptionDef[] }) {
  return {
    content: [{ type: "text", text: message }],
    details: {
      question: params.question,
      options: params.options.map((o) => o.label),
      answer: null,
      wasCustom: false,
      cancelled: true,
    } as MultiChoiceDetails,
  };
}
