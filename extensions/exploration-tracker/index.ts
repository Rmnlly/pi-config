/**
 * Exploration Tracker Extension
 *
 * Tracks discovery sessions where multiple options are explored,
 * one is chosen, and the rest are stored for future follow-up.
 *
 * Persists explorations to ~/.pi/explorations/ as JSON files so they
 * survive across sessions. Also stores snapshots in session entries
 * for branch-aware state.
 *
 * Tools:
 *   - exploration_tracker: Create, list, view, update explorations
 *
 * Commands:
 *   - /explorations: Interactive viewer for all explorations
 */

import {StringEnum} from '@mariozechner/pi-ai';
import type {
  ExtensionAPI,
  ExtensionContext,
  Theme,
} from '@mariozechner/pi-coding-agent';
import {Text, truncateToWidth, matchesKey} from '@mariozechner/pi-tui';
import {Type, type Static} from '@sinclair/typebox';
import * as fs from 'node:fs';
import * as path from 'node:path';

const EXPLORATIONS_DIR = path.join(
  process.env.HOME || '~',
  '.pi',
  'explorations',
);

type OptionStatus = 'pending' | 'chosen' | 'followed_up' | 'skipped';

interface ExplorationOption {
  id: number;
  title: string;
  description: string;
  impact?: string;
  effort?: string;
  status: OptionStatus;
  chosenAt?: string;
  followedUpAt?: string;
  implementationNotes?: string;
  outcome?: string;
}

interface Exploration {
  id: string;
  title: string;
  context: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'completed' | 'archived';
  options: ExplorationOption[];
  tags?: string[];
}

function ensureDir() {
  if (!fs.existsSync(EXPLORATIONS_DIR)) {
    fs.mkdirSync(EXPLORATIONS_DIR, {recursive: true});
  }
}

function generateId(): string {
  const now = new Date();
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).slice(2, 6);
  return `exp-${datePart}-${rand}`;
}

function loadAll(): Exploration[] {
  ensureDir();
  const files = fs
    .readdirSync(EXPLORATIONS_DIR)
    .filter((f) => f.endsWith('.json'));
  return files
    .map((f) => {
      try {
        return JSON.parse(
          fs.readFileSync(path.join(EXPLORATIONS_DIR, f), 'utf-8'),
        ) as Exploration;
      } catch {
        return null;
      }
    })
    .filter(Boolean) as Exploration[];
}

function loadOne(id: string): Exploration | null {
  const filePath = path.join(EXPLORATIONS_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Exploration;
  } catch {
    return null;
  }
}

function save(exploration: Exploration): void {
  ensureDir();
  exploration.updatedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(EXPLORATIONS_DIR, `${exploration.id}.json`),
    JSON.stringify(exploration, null, 2),
  );
}

function formatOption(opt: ExplorationOption): string {
  const statusIcon =
    opt.status === 'chosen'
      ? '✅'
      : opt.status === 'followed_up'
        ? '🔄'
        : opt.status === 'skipped'
          ? '⏭️'
          : '⏳';
  let text = `${statusIcon} #${opt.id}: ${opt.title}`;
  text += `\n   ${opt.description}`;
  if (opt.impact) text += `\n   Impact: ${opt.impact}`;
  if (opt.effort) text += `\n   Effort: ${opt.effort}`;
  if (opt.status === 'chosen' && opt.chosenAt)
    text += `\n   Chosen: ${opt.chosenAt}`;
  if (opt.status === 'followed_up' && opt.followedUpAt)
    text += `\n   Followed up: ${opt.followedUpAt}`;
  if (opt.implementationNotes)
    text += `\n   Notes: ${opt.implementationNotes}`;
  if (opt.outcome) text += `\n   Outcome: ${opt.outcome}`;
  return text;
}

function formatExploration(exp: Exploration): string {
  let text = `📋 ${exp.title} [${exp.id}]\n`;
  text += `Status: ${exp.status} | Created: ${exp.createdAt.slice(0, 10)}\n`;
  if (exp.tags?.length) text += `Tags: ${exp.tags.join(', ')}\n`;
  text += `Context: ${exp.context}\n\n`;
  text += `Options:\n`;
  for (const opt of exp.options) {
    text += `\n${formatOption(opt)}\n`;
  }
  const pending = exp.options.filter((o) => o.status === 'pending');
  if (pending.length > 0) {
    text += `\n💡 ${pending.length} option(s) available for follow-up`;
  }
  return text;
}

const ExplorationParams = Type.Object({
  action: StringEnum([
    'create',
    'list',
    'view',
    'choose',
    'follow_up',
    'add_notes',
    'skip',
    'archive',
    'list_pending',
  ] as const),
  title: Type.Optional(
    Type.String({description: 'Exploration title (for create)'}),
  ),
  context: Type.Optional(
    Type.String({
      description: 'Background context for the exploration (for create)',
    }),
  ),
  options: Type.Optional(
    Type.Array(
      Type.Object({
        title: Type.String(),
        description: Type.String(),
        impact: Type.Optional(Type.String()),
        effort: Type.Optional(Type.String()),
      }),
      {description: 'Options to add (for create)'},
    ),
  ),
  tags: Type.Optional(
    Type.Array(Type.String(), {description: 'Tags for categorization'}),
  ),
  exploration_id: Type.Optional(
    Type.String({description: 'Exploration ID (for view/choose/follow_up/add_notes/skip/archive)'}),
  ),
  option_id: Type.Optional(
    Type.Number({
      description: 'Option number (for choose/follow_up/add_notes/skip)',
    }),
  ),
  notes: Type.Optional(
    Type.String({
      description:
        'Implementation notes or outcome description (for add_notes)',
    }),
  ),
  outcome: Type.Optional(
    Type.String({description: 'Outcome summary (for add_notes)'}),
  ),
});

type ExplorationInput = Static<typeof ExplorationParams>;

class ExplorationListComponent {
  private explorations: Exploration[];
  private theme: Theme;
  private onClose: () => void;
  private selectedIndex: number = 0;
  private cachedWidth?: number;
  private cachedLines?: string[];

  constructor(
    explorations: Exploration[],
    theme: Theme,
    onClose: () => void,
  ) {
    this.explorations = explorations;
    this.theme = theme;
    this.onClose = onClose;
  }

  handleInput(data: string): void {
    if (matchesKey(data, 'escape') || matchesKey(data, 'ctrl+c')) {
      this.onClose();
    }
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) {
      return this.cachedLines;
    }

    const lines: string[] = [];
    const th = this.theme;

    lines.push('');
    const title = th.fg('accent', ' Explorations ');
    const headerLine =
      th.fg('borderMuted', '─'.repeat(3)) +
      title +
      th.fg('borderMuted', '─'.repeat(Math.max(0, width - 18)));
    lines.push(truncateToWidth(headerLine, width));
    lines.push('');

    if (this.explorations.length === 0) {
      lines.push(
        truncateToWidth(
          `  ${th.fg('dim', 'No explorations yet. Start a discovery session!')}`,
          width,
        ),
      );
    } else {
      const active = this.explorations.filter((e) => e.status === 'active');
      const completed = this.explorations.filter(
        (e) => e.status === 'completed',
      );
      const archived = this.explorations.filter(
        (e) => e.status === 'archived',
      );

      if (active.length > 0) {
        lines.push(
          truncateToWidth(
            `  ${th.fg('warning', `Active (${active.length}):`)}`,
            width,
          ),
        );
        for (const exp of active) {
          const pending = exp.options.filter(
            (o) => o.status === 'pending',
          ).length;
          const chosen = exp.options.filter(
            (o) => o.status === 'chosen',
          ).length;
          lines.push(
            truncateToWidth(
              `    ${th.fg('accent', exp.id)} ${th.fg('text', exp.title)}`,
              width,
            ),
          );
          lines.push(
            truncateToWidth(
              `      ${th.fg('muted', `${chosen} chosen, ${pending} pending`)} ${th.fg('dim', `| ${exp.createdAt.slice(0, 10)}`)}`,
              width,
            ),
          );
        }
        lines.push('');
      }

      if (completed.length > 0) {
        lines.push(
          truncateToWidth(
            `  ${th.fg('success', `Completed (${completed.length}):`)}`,
            width,
          ),
        );
        for (const exp of completed) {
          lines.push(
            truncateToWidth(
              `    ${th.fg('dim', exp.id)} ${th.fg('muted', exp.title)}`,
              width,
            ),
          );
        }
        lines.push('');
      }

      if (archived.length > 0) {
        lines.push(
          truncateToWidth(
            `  ${th.fg('dim', `Archived (${archived.length}):`)}`,
            width,
          ),
        );
        for (const exp of archived) {
          lines.push(
            truncateToWidth(
              `    ${th.fg('dim', `${exp.id} ${exp.title}`)}`,
              width,
            ),
          );
        }
        lines.push('');
      }
    }

    lines.push(
      truncateToWidth(`  ${th.fg('dim', 'Press Escape to close')}`, width),
    );
    lines.push('');

    this.cachedWidth = width;
    this.cachedLines = lines;
    return lines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'exploration_tracker',
    label: 'Exploration Tracker',
    description:
      'Track discovery sessions with multiple options. Create explorations documenting options considered, mark chosen ones, and store others for follow-up. Actions: create (new exploration with options), list (all explorations), view (one exploration), choose (mark option as chosen), follow_up (mark option as followed up later), add_notes (add implementation notes/outcome), skip (mark option as skipped), archive (archive exploration), list_pending (show all pending options across explorations).',
    promptSnippet:
      'Track exploration/discovery sessions — create explorations with options, mark choices, store follow-ups',
    promptGuidelines: [
      'Use exploration_tracker to document discovery sessions where multiple approaches are considered.',
      'When a user explores options and picks one, create an exploration with all options and mark the chosen one.',
      'When revisiting an exploration, use list_pending to find options that were not yet pursued.',
      'Always add implementation notes after completing work on a chosen or followed-up option.',
    ],
    parameters: ExplorationParams,

    async execute(
      _toolCallId,
      params: ExplorationInput,
      _signal,
      _onUpdate,
      _ctx,
    ) {
      switch (params.action) {
        case 'create': {
          if (!params.title || !params.context || !params.options?.length) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: 'Error: title, context, and options are required for create',
                },
              ],
              details: {error: true},
            };
          }
          const exploration: Exploration = {
            id: generateId(),
            title: params.title,
            context: params.context,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            status: 'active',
            options: params.options.map((opt, i) => ({
              id: i + 1,
              title: opt.title,
              description: opt.description,
              impact: opt.impact,
              effort: opt.effort,
              status: 'pending' as OptionStatus,
            })),
            tags: params.tags,
          };
          save(exploration);
          return {
            content: [
              {
                type: 'text' as const,
                text: `Created exploration ${exploration.id}: "${exploration.title}" with ${exploration.options.length} options.\n\n${formatExploration(exploration)}`,
              },
            ],
            details: {action: 'create', explorationId: exploration.id},
          };
        }

        case 'list': {
          const all = loadAll();
          if (all.length === 0) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: 'No explorations found. Use create to start one.',
                },
              ],
              details: {action: 'list', count: 0},
            };
          }
          const summary = all
            .map((e) => {
              const pending = e.options.filter(
                (o) => o.status === 'pending',
              ).length;
              const chosen = e.options.filter(
                (o) => o.status === 'chosen',
              ).length;
              const followedUp = e.options.filter(
                (o) => o.status === 'followed_up',
              ).length;
              return `[${e.status}] ${e.id}: ${e.title} (${chosen} chosen, ${followedUp} followed up, ${pending} pending)`;
            })
            .join('\n');
          return {
            content: [
              {
                type: 'text' as const,
                text: `Found ${all.length} exploration(s):\n\n${summary}`,
              },
            ],
            details: {action: 'list', count: all.length},
          };
        }

        case 'view': {
          if (!params.exploration_id) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: 'Error: exploration_id required for view',
                },
              ],
              details: {error: true},
            };
          }
          const exp = loadOne(params.exploration_id);
          if (!exp) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Exploration ${params.exploration_id} not found`,
                },
              ],
              details: {error: true},
            };
          }
          return {
            content: [{type: 'text' as const, text: formatExploration(exp)}],
            details: {
              action: 'view',
              explorationId: exp.id,
            },
          };
        }

        case 'choose': {
          if (!params.exploration_id || params.option_id === undefined) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: 'Error: exploration_id and option_id required for choose',
                },
              ],
              details: {error: true},
            };
          }
          const exp = loadOne(params.exploration_id);
          if (!exp)
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Exploration ${params.exploration_id} not found`,
                },
              ],
              details: {error: true},
            };
          const opt = exp.options.find((o) => o.id === params.option_id);
          if (!opt)
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Option #${params.option_id} not found`,
                },
              ],
              details: {error: true},
            };
          opt.status = 'chosen';
          opt.chosenAt = new Date().toISOString();
          if (params.notes) opt.implementationNotes = params.notes;
          save(exp);
          return {
            content: [
              {
                type: 'text' as const,
                text: `Marked option #${opt.id} "${opt.title}" as chosen in ${exp.id}.\n\n${formatExploration(exp)}`,
              },
            ],
            details: {
              action: 'choose',
              explorationId: exp.id,
              optionId: opt.id,
            },
          };
        }

        case 'follow_up': {
          if (!params.exploration_id || params.option_id === undefined) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: 'Error: exploration_id and option_id required for follow_up',
                },
              ],
              details: {error: true},
            };
          }
          const exp = loadOne(params.exploration_id);
          if (!exp)
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Exploration ${params.exploration_id} not found`,
                },
              ],
              details: {error: true},
            };
          const opt = exp.options.find((o) => o.id === params.option_id);
          if (!opt)
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Option #${params.option_id} not found`,
                },
              ],
              details: {error: true},
            };
          opt.status = 'followed_up';
          opt.followedUpAt = new Date().toISOString();
          if (params.notes) opt.implementationNotes = params.notes;
          save(exp);
          return {
            content: [
              {
                type: 'text' as const,
                text: `Marked option #${opt.id} "${opt.title}" as followed up in ${exp.id}.\n\n${formatExploration(exp)}`,
              },
            ],
            details: {
              action: 'follow_up',
              explorationId: exp.id,
              optionId: opt.id,
            },
          };
        }

        case 'add_notes': {
          if (!params.exploration_id || params.option_id === undefined) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: 'Error: exploration_id and option_id required for add_notes',
                },
              ],
              details: {error: true},
            };
          }
          const exp = loadOne(params.exploration_id);
          if (!exp)
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Exploration ${params.exploration_id} not found`,
                },
              ],
              details: {error: true},
            };
          const opt = exp.options.find((o) => o.id === params.option_id);
          if (!opt)
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Option #${params.option_id} not found`,
                },
              ],
              details: {error: true},
            };
          if (params.notes) opt.implementationNotes = params.notes;
          if (params.outcome) opt.outcome = params.outcome;
          save(exp);
          return {
            content: [
              {
                type: 'text' as const,
                text: `Updated notes for option #${opt.id} "${opt.title}" in ${exp.id}.\n\n${formatOption(opt)}`,
              },
            ],
            details: {
              action: 'add_notes',
              explorationId: exp.id,
              optionId: opt.id,
            },
          };
        }

        case 'skip': {
          if (!params.exploration_id || params.option_id === undefined) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: 'Error: exploration_id and option_id required for skip',
                },
              ],
              details: {error: true},
            };
          }
          const exp = loadOne(params.exploration_id);
          if (!exp)
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Exploration ${params.exploration_id} not found`,
                },
              ],
              details: {error: true},
            };
          const opt = exp.options.find((o) => o.id === params.option_id);
          if (!opt)
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Option #${params.option_id} not found`,
                },
              ],
              details: {error: true},
            };
          opt.status = 'skipped';
          if (params.notes) opt.implementationNotes = params.notes;
          save(exp);
          return {
            content: [
              {
                type: 'text' as const,
                text: `Skipped option #${opt.id} "${opt.title}" in ${exp.id}.`,
              },
            ],
            details: {
              action: 'skip',
              explorationId: exp.id,
              optionId: opt.id,
            },
          };
        }

        case 'archive': {
          if (!params.exploration_id) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: 'Error: exploration_id required for archive',
                },
              ],
              details: {error: true},
            };
          }
          const exp = loadOne(params.exploration_id);
          if (!exp)
            return {
              content: [
                {
                  type: 'text' as const,
                  text: `Exploration ${params.exploration_id} not found`,
                },
              ],
              details: {error: true},
            };
          const pending = exp.options.filter(
            (o) => o.status === 'pending',
          ).length;
          exp.status = pending === 0 ? 'completed' : 'archived';
          save(exp);
          return {
            content: [
              {
                type: 'text' as const,
                text: `${exp.status === 'completed' ? 'Completed' : 'Archived'} exploration ${exp.id}: "${exp.title}"${pending > 0 ? ` (${pending} options still pending)` : ''}`,
              },
            ],
            details: {
              action: 'archive',
              explorationId: exp.id,
              status: exp.status,
            },
          };
        }

        case 'list_pending': {
          const all = loadAll().filter((e) => e.status === 'active');
          const pendingOptions: Array<{
            explorationId: string;
            explorationTitle: string;
            option: ExplorationOption;
          }> = [];
          for (const exp of all) {
            for (const opt of exp.options) {
              if (opt.status === 'pending') {
                pendingOptions.push({
                  explorationId: exp.id,
                  explorationTitle: exp.title,
                  option: opt,
                });
              }
            }
          }
          if (pendingOptions.length === 0) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: 'No pending options across any active explorations.',
                },
              ],
              details: {action: 'list_pending', count: 0},
            };
          }
          const summary = pendingOptions
            .map(
              (p) =>
                `[${p.explorationId}] ${p.explorationTitle} → #${p.option.id}: ${p.option.title}\n   ${p.option.description}${p.option.impact ? `\n   Impact: ${p.option.impact}` : ''}${p.option.effort ? `\n   Effort: ${p.option.effort}` : ''}`,
            )
            .join('\n\n');
          return {
            content: [
              {
                type: 'text' as const,
                text: `Found ${pendingOptions.length} pending option(s) for follow-up:\n\n${summary}`,
              },
            ],
            details: {action: 'list_pending', count: pendingOptions.length},
          };
        }

        default:
          return {
            content: [
              {
                type: 'text' as const,
                text: `Unknown action: ${params.action}`,
              },
            ],
            details: {error: true},
          };
      }
    },

    renderCall(args, theme) {
      let text =
        theme.fg('toolTitle', theme.bold('exploration_tracker ')) +
        theme.fg('muted', args.action);
      if (args.title) text += ` ${theme.fg('accent', `"${args.title}"`)}`;
      if (args.exploration_id)
        text += ` ${theme.fg('dim', args.exploration_id)}`;
      if (args.option_id !== undefined)
        text += ` ${theme.fg('accent', `#${args.option_id}`)}`;
      return new Text(text, 0, 0);
    },

    renderResult(result, {expanded}, theme) {
      const details = result.details as Record<string, unknown> | undefined;
      if (details?.error) {
        const text = result.content[0];
        return new Text(
          theme.fg('error', text?.type === 'text' ? text.text : 'Error'),
          0,
          0,
        );
      }

      const action = details?.action as string;
      const text = result.content[0];
      const content = text?.type === 'text' ? text.text : '';

      if (!expanded) {
        const firstLine = content.split('\n')[0];
        return new Text(theme.fg('success', '✓ ') + firstLine, 0, 0);
      }

      return new Text(content, 0, 0);
    },
  });

  pi.registerCommand('explorations', {
    description: 'View all explorations and their status',
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify('/explorations requires interactive mode', 'error');
        return;
      }
      const all = loadAll();
      await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
        return new ExplorationListComponent(all, theme, () => done());
      });
    },
  });
}
