import { describe, expect, it } from 'vitest';
import { createTranslator } from '../src/core/i18n';
import { applySet, formatOption, parseSetArg } from '../src/core/set';
import { Settings, memoryAdapter } from '../src/core/settings';

const t = createTranslator();

function settings() {
  const s = new Settings(memoryAdapter());
  s.define([
    { key: 'scroll', option: 'scroll', type: 'number', default: 72, min: 8, max: 400 },
    { key: 'hlsearch', option: 'hlsearch', type: 'boolean', default: true },
    { key: 'notify', option: 'notify', type: 'boolean', default: true },
    { key: 'cmdline', option: 'cmdline', type: 'enum', values: ['popup', 'bottom'], default: 'popup' },
    { key: 'leader', option: 'leader', type: 'enum', values: ['space', ',', '\\'], default: 'space' },
    { key: 'hintchars', option: 'hintchars', type: 'string', default: 'asdf' },
    { key: 'secret', type: 'boolean', default: false },
  ]);
  return s;
}

describe('parseSetArg', () => {
  it('reads every form', () => {
    expect(parseSetArg('hlsearch')).toEqual({ name: 'hlsearch', op: 'on' });
    expect(parseSetArg('hlsearch!')).toEqual({ name: 'hlsearch', op: 'toggle' });
    expect(parseSetArg('scroll?')).toEqual({ name: 'scroll', op: 'ask' });
    expect(parseSetArg('scroll=120')).toEqual({ name: 'scroll', op: 'assign', value: '120' });
    expect(parseSetArg('scroll:120')).toEqual({ name: 'scroll', op: 'assign', value: '120' });
    expect(parseSetArg('leader=,')).toEqual({ name: 'leader', op: 'assign', value: ',' });
  });
});

describe('applySet', () => {
  it('turns booleans on and off', () => {
    const s = settings();
    expect(applySet(s, ['nohlsearch'], t)[0]).toMatchObject({ ok: true, message: 'nohlsearch', changed: true });
    expect(s.get('hlsearch')).toBe(false);
    applySet(s, ['hlsearch'], t);
    expect(s.get('hlsearch')).toBe(true);
  });

  it('flips with ! and inv', () => {
    const s = settings();
    applySet(s, ['hlsearch!'], t);
    expect(s.get('hlsearch')).toBe(false);
    applySet(s, ['invhlsearch'], t);
    expect(s.get('hlsearch')).toBe(true);
  });

  it('does not read notify as no + tify', () => {
    const s = settings();
    applySet(s, ['nonotify'], t);
    expect(s.get('notify')).toBe(false);
    applySet(s, ['notify'], t);
    expect(s.get('notify')).toBe(true);
  });

  it('asks with ?', () => {
    const s = settings();
    expect(applySet(s, ['scroll?'], t)[0]).toEqual({ ok: true, message: 'scroll=72' });
    expect(applySet(s, ['hlsearch?'], t)[0]).toEqual({ ok: true, message: 'hlsearch' });
  });

  it('a bare non-boolean shows its value', () => {
    expect(applySet(settings(), ['scroll'], t)[0]).toEqual({ ok: true, message: 'scroll=72' });
  });

  it('assigns numbers, clamped to the row', () => {
    const s = settings();
    applySet(s, ['scroll=120'], t);
    expect(s.get('scroll')).toBe(120);
    applySet(s, ['scroll=9999'], t);
    expect(s.get('scroll')).toBe(400);
  });

  it('assigns enums and strings', () => {
    const s = settings();
    applySet(s, ['leader=,', 'cmdline=bottom', 'hintchars=jkl'], t);
    expect(s.get('leader')).toBe(',');
    expect(s.get('cmdline')).toBe('bottom');
    expect(s.get('hintchars')).toBe('jkl');
  });

  it('assigns booleans with =', () => {
    const s = settings();
    applySet(s, ['hlsearch=0'], t);
    expect(s.get('hlsearch')).toBe(false);
    applySet(s, ['hlsearch=on'], t);
    expect(s.get('hlsearch')).toBe(true);
  });

  it('rejects what vim rejects, and leaves the value alone', () => {
    const s = settings();
    expect(applySet(s, ['nope'], t)[0]?.message).toMatch(/^E518/);
    expect(applySet(s, ['secret'], t)[0]?.message).toMatch(/^E518/);
    expect(applySet(s, ['scroll=abc'], t)[0]?.message).toMatch(/^E521/);
    expect(applySet(s, ['cmdline=middle'], t)[0]?.message).toMatch(/one of popup, bottom/);
    expect(applySet(s, ['scroll!'], t)[0]?.message).toMatch(/^E474/);
    expect(applySet(s, ['noscroll'], t)[0]?.message).toMatch(/^E474/);
    expect(s.get('scroll')).toBe(72);
    expect(s.get('cmdline')).toBe('popup');
  });

  it('applies several arguments in order', () => {
    const s = settings();
    const results = applySet(s, ['scroll=100', 'nohlsearch'], t);
    expect(results.map((r) => r.ok)).toEqual([true, true]);
    expect(s.get('scroll')).toBe(100);
    expect(s.get('hlsearch')).toBe(false);
  });

  it('formats options the way vim prints them', () => {
    const s = settings();
    expect(formatOption(s.row('hlsearch')!, false)).toBe('nohlsearch');
    expect(formatOption(s.row('hlsearch')!, true)).toBe('  hlsearch');
    expect(formatOption(s.row('scroll')!, 72)).toBe('  scroll=72');
  });
});
