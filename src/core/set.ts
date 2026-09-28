/**
 * `:set` — read or change a setting, the way vim spells it:
 *
 *   :set                list every option
 *   :set opt            turn a boolean on, or show a value
 *   :set noopt          turn a boolean off
 *   :set opt!           flip a boolean (also :set invopt)
 *   :set opt?           show the value
 *   :set opt=val        assign (also opt:val)
 */

import type { Settings, SettingSpec, SettingValue } from './settings';
import type { Translate } from './i18n';

export type SetOp = 'on' | 'toggle' | 'ask' | 'assign';

export interface SetArg {
  name: string;
  op: SetOp;
  value?: string;
}

/** Split one `:set` argument into a name and what to do with it. */
export function parseSetArg(arg: string): SetArg {
  const text = arg.trim();
  const eq = text.search(/[=:]/);
  if (eq > 0) {
    return { name: text.slice(0, eq), op: 'assign', value: text.slice(eq + 1) };
  }
  if (text.endsWith('?')) return { name: text.slice(0, -1), op: 'ask' };
  if (text.endsWith('!')) return { name: text.slice(0, -1), op: 'toggle' };
  return { name: text, op: 'on' };
}

/** How vim prints an option: `  scroll=72`, `  hlsearch`, `nohlsearch`. */
export function formatOption(row: SettingSpec, value: SettingValue): string {
  const name = row.option ?? row.key;
  if (row.type === 'boolean') return (value ? '  ' : 'no') + name;
  return '  ' + name + '=' + String(value);
}

export interface SetResult {
  ok: boolean;
  message: string;
  /** True when the setting was written (as opposed to read). */
  changed?: boolean;
}

/**
 * Resolve an option name the way vim does: the name itself first (so
 * `notify` is `notify`, not `no` + `tify`), then `no…` / `inv…`.
 */
export function resolveOption(
  settings: Settings,
  name: string,
): { row: SettingSpec; negated: boolean; inverted: boolean } | null {
  const direct = settings.row(name);
  if (direct?.option) return { row: direct, negated: false, inverted: false };
  if (name.startsWith('no')) {
    const row = settings.row(name.slice(2));
    if (row?.option) return { row, negated: true, inverted: false };
  }
  if (name.startsWith('inv')) {
    const row = settings.row(name.slice(3));
    if (row?.option) return { row, negated: false, inverted: true };
  }
  return null;
}

/** Apply every argument of a `:set` line. One result per argument. */
export function applySet(settings: Settings, argv: string[], t: Translate): SetResult[] {
  return argv.map((arg) => {
    const parsed = parseSetArg(arg);
    const found = resolveOption(settings, parsed.name);
    if (!found) return { ok: false, message: t('set.unknown', { name: parsed.name }) };
    const { row, negated, inverted } = found;
    const show = () => formatOption(row, settings.get(row.key)).trim();

    if (parsed.op === 'ask') return { ok: true, message: show() };

    if (parsed.op === 'assign') {
      if (negated || inverted) return { ok: false, message: t('set.invalid', { arg }) };
      const check = settings.validate(row, parsed.value ?? '');
      if (!check.ok) {
        if (check.error === 'number') return { ok: false, message: t('set.number', { arg }) };
        if (check.error === 'enum') {
          return {
            ok: false,
            message: t('set.values', { arg, values: (row.values ?? []).join(', ') }),
          };
        }
        return { ok: false, message: t('set.invalid', { arg }) };
      }
      settings.set(row.key, check.value);
      return { ok: true, message: show(), changed: true };
    }

    if (row.type !== 'boolean') {
      if (parsed.op === 'on' && !negated && !inverted) return { ok: true, message: show() };
      return { ok: false, message: t('set.invalid', { arg }) };
    }

    if (parsed.op === 'toggle' || inverted) settings.toggle(row.key);
    else settings.set(row.key, !negated);
    return { ok: true, message: show(), changed: true };
  });
}

/** Completion pool for `:set`: every option, and `no…` for the booleans. */
export function setCompletions(settings: Settings): Array<{ value: string; hint: string }> {
  const pool: Array<{ value: string; hint: string }> = [];
  for (const row of settings.schema()) {
    if (!row.option) continue;
    pool.push({ value: row.option, hint: row.label ?? row.key });
    if (row.type === 'boolean') pool.push({ value: 'no' + row.option, hint: row.label ?? row.key });
    if (row.type === 'enum') {
      for (const v of row.values ?? []) pool.push({ value: `${row.option}=${v}`, hint: row.label ?? row.key });
    }
  }
  return pool;
}
