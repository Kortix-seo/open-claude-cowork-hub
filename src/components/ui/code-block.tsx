'use client';

/**
 * The handbook's exhibit plate: a hairline-framed figure with a mono caption bar (the artifact's
 * `file` at left, its `source` linked at right), a Kode Mono body, and the copy control when the
 * artifact carries `copyText`. My own element structure — no title-bar card from the starter.
 * Shell lines keep the normal ink (no `$` prompt games), comments and flags read at the caption
 * ink, diff rows take the two earned status hues.
 */
import { CheckIcon, CopyIcon } from '@phosphor-icons/react/dist/ssr';
import { useCallback, useState, type CSSProperties, type ReactNode } from 'react';
import type { Artifact } from '@/config/types';
import { cn, linkProps } from '@/lib/utils';

type Tok = { t: string; c?: TokClass };
type TokClass = 'comment' | 'string' | 'key' | 'punct' | 'flag' | 'ok' | 'ink' | 'cap';

function tokenizeYaml(line: string): Tok[] {
  if (/^\s*#/.test(line)) return [{ t: line, c: 'comment' }];
  const m = /^(\s*(?:-\s+)?)([\w.-]+)(:)(.*)$/.exec(line);
  if (!m) return [{ t: line, c: 'ink' }];
  const [, indent, key, colon, rest] = m;
  const out: Tok[] = [{ t: indent ?? '', c: 'cap' }, { t: key ?? '', c: 'key' }, { t: colon ?? '', c: 'cap' }];
  const hash = rest!.search(/\s#/);
  const value = hash >= 0 ? rest!.slice(0, hash) : rest!;
  if (value) out.push({ t: value, c: 'ink' });
  if (hash >= 0) out.push({ t: rest!.slice(hash), c: 'comment' });
  return out;
}

function tokenizeSh(line: string): Tok[] {
  if (/^\s*#/.test(line)) return [{ t: line, c: 'comment' }];
  if (/^\s*[✓]/.test(line)) return [{ t: line, c: 'ok' }];
  const out: Tok[] = [];
  const re = /("[^"]*"|'[^']*')|(\s+)|(--?[\w-]+)|(#.*$)|([^\s]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const [raw, str, space, flag, comment] = m;
    if (str) out.push({ t: raw, c: 'ink' });
    else if (space) out.push({ t: raw });
    else if (flag) out.push({ t: raw, c: 'flag' });
    else if (comment) out.push({ t: raw, c: 'comment' });
    else out.push({ t: raw, c: 'ink' });
  }
  return out;
}

const TOKENIZERS = { yaml: tokenizeYaml, sh: tokenizeSh } as const;

const TOKEN_CLASS: Record<TokClass, string> = {
  comment: 'text-cap',
  string: 'text-ink',
  key: 'text-strong font-medium',
  punct: 'text-cap',
  flag: 'text-flag',
  ok: 'text-kortix-green',
  ink: 'text-ink',
  cap: 'text-cap',
};

const INK = { ink: 'text-ink', cap: 'text-cap' } as const;
void INK;

/**
 * How a plate's lines are laid out. A plate never scrolls sideways at a phone width: the reader
 * gets every character in the one column.
 *  - `flow`: prose-like lines (a manifest, a shell transcript, a paragraph). Each line wraps at its
 *    spaces and hangs at its own indent, so a continuation of an indented line never falls back to
 *    column 0 and reads as a new top-level entry.
 *  - `tree`: a directory listing whose entries carry an aligned description. Its columns cannot
 *    survive a 390px column, so below 640px each entry is re-presented as a path row and a
 *    description row, the same way the comparison bands stack.
 *  - `table`: a printed table (`NAME / SIZE / PROCESSOR`). Below 640px its rows become labelled
 *    label-above-value pairs.
 */
type Presentation =
  | { kind: 'flow' }
  | { kind: 'tree'; rows: { path: string; desc: string }[] }
  | { kind: 'table'; head: string[]; rows: string[][] };

/** A line's fields, split on the runs of spaces that draw a column gap. */
function fields(line: string): string[] {
  return line.trim().split(/ {2,}/);
}

/** The line's leading spaces, counted in characters (the plate sets the hang in `ch`). */
function leadingSpaces(line: string): number {
  return /^ */.exec(line)![0].length;
}

function presentationOf(artifact: Artifact): Presentation {
  if (artifact.lang !== 'text' || artifact.lines.length < 2) return { kind: 'flow' };
  const [first, ...rest] = artifact.lines as [string, ...string[]];
  const trimmed = first.trim();

  /* A file tree: a root line ending in `/` and every entry split into path + description. */
  if (trimmed.endsWith('/') && fields(trimmed).length === 1) {
    const entries = rest.map(fields);
    if (entries.every((row) => row.length === 2 && row[0] !== '' && row[1] !== '')) {
      return {
        kind: 'tree',
        rows: [
          { path: trimmed, desc: '' },
          ...entries.map(([path, desc]) => ({ path: path!, desc: desc! })),
        ],
      };
    }
  }

  /* A printed table: a header row of three or more fields that every row repeats. */
  const head = fields(first);
  if (head.length >= 3) {
    const rows = rest.map(fields);
    if (rows.every((row) => row.length === head.length)) return { kind: 'table', head, rows };
  }

  return { kind: 'flow' };
}

function CodeLine({ line, lang }: { line: string; lang: Artifact['lang'] }): ReactNode {
  if (line === '') return ' ';
  if (lang === 'diff') {
    const sign = line[0] === '+' ? '+' : line[0] === '-' ? '-' : ' ';
    return (
      <span className={cn('-mx-4 flex gap-2 px-4 sm:-mx-5 sm:px-5', sign === '+' && 'bg-ok-row', sign === '-' && 'bg-no-row')}>
        <span aria-hidden className={cn('w-2 shrink-0 select-none', sign === '+' ? 'text-kortix-green' : sign === '-' ? 'text-kortix-red' : 'text-terminal-cap')}>
          {sign}
        </span>
        <span className="text-ink">{line.slice(1)}</span>
      </span>
    );
  }
  const toks = lang === 'yaml' ? TOKENIZERS.yaml(line) : lang === 'sh' ? TOKENIZERS.sh(line) : [{ t: line, c: 'ink' as const }];
  return toks.map((tok, j) => (
    <span key={j} className={tok.c ? TOKEN_CLASS[tok.c] : undefined}>
      {tok.t}
    </span>
  ));
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    });
  }, [text]);
  return (
    <button
      type="button"
      onClick={copy}
      data-js-only
      className="text-terminal-cap hover:text-ink border-terminal-row ml-auto flex min-h-11 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors duration-fast"
    >
      {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
      <span className="w-12 text-left">{copied ? 'Copied' : label}</span>
    </button>
  );
}

/**
 * The exhibit plate. `caption` names the artifact (mono); `source` links where it was taken from.
 * Dark plates for code: the handbook's figures sit on the terminal ink.
 */
export function CodeBlock({
  artifact,
  size = 'default',
  className,
  footer,
}: {
  artifact: Artifact;
  size?: 'default' | 'hero';
  className?: string;
  footer?: ReactNode;
}) {
  const view = presentationOf(artifact);
  const table = view.kind === 'table' ? view : null;
  const tree = view.kind === 'tree' ? view : null;
  const columns = view.kind !== 'flow';
  return (
    <figure className={cn('border-terminal-row bg-terminal-surface flex min-w-0 flex-col overflow-hidden rounded-lg border', className)}>
      {artifact.file ? (
        <figcaption className="border-terminal-row bg-terminal-caption flex min-h-11 items-center gap-3 border-b px-4 py-1">
          <span className="text-cap min-w-0 truncate text-xs">{artifact.file}</span>
          {artifact.copyText ? <CopyButton text={artifact.copyText} /> : null}
        </figcaption>
      ) : null}
      <div
        className={cn(
          'min-h-0 flex-1 px-4 py-3.5 sm:px-5 sm:py-4',
          size === 'hero' && 'sm:py-5',
          /* A tree or a table keeps its aligned columns on a wide screen only. Below 640px it is
             re-presented as stacked rows (next block), never as a sideways scroller. */
          columns && 'hidden sm:block',
          columns && 'kx-plate-scroll overflow-x-auto',
        )}
        tabIndex={columns ? 0 : undefined}
      >
        <pre className={cn('font-mono leading-relaxed', size === 'hero' ? 'text-xs sm:text-sm' : 'text-xs')}>
          <code>
            {artifact.lines.map((line, i) => {
              const hang = leadingSpaces(line);
              /* The indent becomes the line's own margin, so it starts in the same column and a
                 wrap continues there. Trailing spaces would hang past the edge at a soft wrap and
                 are invisible anyway; the plate keeps no whitespace it cannot show. */
              const text = line.slice(hang).replace(/[ \t]+$/, '');
              return (
                <span
                  key={i}
                  className={cn(
                    'kx-plate-line block whitespace-pre-wrap [overflow-wrap:anywhere]',
                    /* Aligned plates on a wide screen: the columns are the information. */
                    columns && 'w-max min-w-full whitespace-pre [overflow-wrap:normal]',
                  )}
                  /* A wrapped line hangs at the indent it started from, so its continuation can
                     never sit at column 0 and read as a new top-level entry. */
                  style={{ '--plate-hang': `${hang}ch` } as CSSProperties}
                >
                  <CodeLine line={text} lang={artifact.lang} />
                </span>
              );
            })}
          </code>
        </pre>
      </div>
      {tree ? (
        /* Path row, then description row, per entry: the comparison band's stack, in the plate. */
        <ol className="divide-terminal-row sm:hidden divide-y">
          {tree.rows.map((row, r) => (
            <li key={r} className="px-4 py-2 first:pt-3.5 last:pb-3.5">
              <span className="text-ink block font-mono text-xs [overflow-wrap:anywhere]">{row.path}</span>
              {row.desc ? (
                <span className="text-cap mt-0.5 block text-xs leading-relaxed [overflow-wrap:anywhere]">
                  {row.desc}
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      {table ? (
        <div className="min-h-0 flex-1 space-y-3 px-4 py-3.5 sm:hidden">
          {table.rows.map((row, r) => (
            <dl key={r} className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-0.5">
              {row.map((value, i) => (
                <div key={i} className="contents">
                  <dt className="text-cap text-xs break-words">{table.head[i]}</dt>
                  <dd className="text-ink min-w-0 font-mono text-xs [overflow-wrap:anywhere]">{value}</dd>
                </div>
              ))}
            </dl>
          ))}
        </div>
      ) : null}
      {footer ??
        (artifact.source ? (
          /* The address wraps inside the plate's own column: on a phone the label takes its own
             row and the whole URL sits under it as one block, broken at a slash when it must be
             broken, never scrolled and never clipped. */
          <div className="border-terminal-row border-t px-4 py-1 text-xs">
            <a
              {...linkProps({ href: artifact.source })}
              className="text-cap hover:text-ink flex min-h-11 min-w-0 items-center gap-1.5 max-sm:flex-col max-sm:items-start max-sm:gap-0 max-sm:py-1"
            >
              <span className="shrink-0 whitespace-nowrap">Source:</span>{' '}
              <span className="font-mono min-w-0 [overflow-wrap:anywhere] [word-break:normal] max-sm:w-full">
                {artifact.source}
              </span>
            </a>
          </div>
        ) : null)}
    </figure>
  );
}

/** Text-only excerpt card: the handbook's quoted lines, no caption bar. */
export function ExcerptCard({ artifact, className }: { artifact: Artifact; className?: string }) {
  return (
    <figure className={cn('border-terminal-row bg-terminal-surface flex min-w-0 flex-col overflow-hidden rounded-lg border px-4 py-3.5 sm:px-5 sm:py-4', className)}>
      <pre className="text-cap font-mono text-xs leading-relaxed">
        <code>
          {artifact.lines.map((line, i) => (
            <span key={i} className="block whitespace-pre-wrap">
              {line}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  );
}
