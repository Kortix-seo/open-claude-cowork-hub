'use client';

/**
 * The handbook's exhibit plate: a hairline-framed figure with a mono caption bar (the artifact's
 * `file` at left, its `source` linked at right), a Kode Mono body, and the copy control when the
 * artifact carries `copyText`. My own element structure — no title-bar card from the starter.
 * Shell lines keep the normal ink (no `$` prompt games), comments and flags read at the caption
 * ink, diff rows take the two earned status hues.
 */
import { CheckIcon, CopyIcon } from '@phosphor-icons/react/dist/ssr';
import { useCallback, useState, type ReactNode } from 'react';
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
 * A plate whose lines carry internal runs of spaces is a printed table or a file tree: its columns
 * are the information, so it must not reflow and runs to the plate's own horizontal scroller
 * (`whitespace-pre`). Every other plate wraps at its spaces — never inside a token, so a long
 * address stays whole — and any token wider than the plate scrolls.
 */
function preservesLines(artifact: Artifact): boolean {
  /* One line with a double space is ordinary spacing (a shell comment sits two spaces after a
     command); columns show up as several such lines. */
  return artifact.lines.filter((line) => /\S {2,}\S/.test(line)).length >= 2;
}

/**
 * A plate whose first line is a column header and whose rows all split into that many fields is a
 * printed table (`NAME / SIZE / PROCESSOR`). At the one-column width its aligned rows cannot fit,
 * so below 640px the same lines are re-presented as labelled rows: identical characters, planted
 * label above value, no scroller and no clipped cell.
 */
function columnTable(artifact: Artifact): { head: string[]; rows: string[][] } | null {
  if (artifact.lang !== 'text' || artifact.lines.length < 2) return null;
  const split = (line: string) => line.trim().split(/ {2,}/);
  const head = split(artifact.lines[0]!);
  if (head.length < 3) return null;
  const rows = artifact.lines.slice(1).map(split);
  return rows.every((row) => row.length === head.length) ? { head, rows } : null;
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
  const preserve = preservesLines(artifact);
  const table = columnTable(artifact);
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
          table && 'hidden sm:block',
        )}
      >
        <pre className={cn('font-mono leading-relaxed', size === 'hero' ? 'text-xs sm:text-sm' : 'text-xs')}>
          <code>
            {artifact.lines.map((line, i) => (
              <span
                key={i}
                className={cn(
                  'block whitespace-pre-wrap [overflow-wrap:anywhere]',
                  preserve && 'sm:whitespace-pre sm:[overflow-wrap:normal]',
                )}
              >
                <CodeLine line={line} lang={artifact.lang} />
              </span>
            ))}
          </code>
        </pre>
      </div>
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
          /* The address wraps inside the plate's own column: a plate never scrolls sideways,
             and no character of the source URL is clipped. */
          <div className="border-terminal-row border-t px-4 py-1 text-xs">
            <a {...linkProps({ href: artifact.source })} className="text-cap hover:text-ink flex min-h-11 min-w-0 items-center gap-1.5">
              <span className="shrink-0 whitespace-nowrap">Source:</span>{' '}
              <span className="font-mono min-w-0 [word-break:break-all]">{artifact.source}</span>
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
