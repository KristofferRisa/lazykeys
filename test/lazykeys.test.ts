import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMAND_EVENT, createLazyKeys, explorer, memoryAdapter, type LazyKeys, type LazyKeysOptions } from '../src/index';

let lk: LazyKeys | null = null;

function make(opts: LazyKeysOptions = {}): LazyKeys {
  lk = createLazyKeys({ storage: memoryAdapter(), ...opts });
  return lk;
}

function press(key: string, mods: KeyboardEventInit = {}, target: EventTarget = document.body): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, composed: true, ...mods });
  target.dispatchEvent(e);
  return e;
}

function type(keys: string): void {
  for (const k of keys) press(k === ' ' ? ' ' : k);
}

beforeEach(() => {
  document.body.innerHTML = `
    <main>
      <h1>Title</h1>
      <h2 id="a">First</h2><p>Alpha beta gamma. Beta again.</p>
      <h2 id="b">Second</h2><p>More beta text.</p>
      <a href="/x">Link x</a>
      <input id="field" type="text">
    </main>`;
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  lk?.destroy();
  lk = null;
  document.documentElement.className = '';
  vi.useRealTimers();
});

describe('createLazyKeys', () => {
  it('starts enabled by default and exposes the API', () => {
    const k = make();
    expect(k.isEnabled()).toBe(true);
    expect(document.documentElement.classList.contains('lk-on')).toBe(true);
    for (const fn of ['enable', 'disable', 'toggle', 'isEnabled', 'destroy', 'map', 'command', 'notify', 'on']) {
      expect(typeof (k as unknown as Record<string, unknown>)[fn]).toBe('function');
    }
  });

  it('respects enabled: false and persists enable()/disable()', () => {
    const storage = memoryAdapter();
    const k = make({ enabled: false, storage });
    expect(k.isEnabled()).toBe(false);
    k.enable();
    expect(k.isEnabled()).toBe(true);
    expect(storage.get('enabled')).toBe(true);
    k.disable();
    expect(storage.get('enabled')).toBeUndefined(); // back to the default: not written
    k.toggle();
    expect(k.isEnabled()).toBe(true);
  });

  it('dispatches lazykeys:command and the consumer event with the kdev:vim detail shape', () => {
    const k = make({ eventName: 'kdev:vim' });
    const seen: unknown[] = [];
    const extra: unknown[] = [];
    document.addEventListener(COMMAND_EVENT, (e) => seen.push((e as CustomEvent).detail));
    document.addEventListener('kdev:vim', (e) => extra.push((e as CustomEvent).detail));
    press('g');
    press('g');
    k.exec('nohlsearch');
    expect(seen).toEqual([{ seq: 'g g', count: 1 }, { ex: 'nohlsearch', line: 'nohlsearch' }]);
    expect(extra).toEqual(seen);
  });

  it('reports the leader token in seq, as practice checklists expect', () => {
    make({ eventName: 'kdev:vim' });
    const seen: string[] = [];
    document.addEventListener('kdev:vim', (e) => seen.push((e as CustomEvent).detail.seq));
    press(' ');
    press('e');
    expect(seen).toEqual(['<leader> e']);
  });

  it('prevents default only for keys it takes', () => {
    make();
    expect(press('j').defaultPrevented).toBe(true);
    expect(press('x').defaultPrevented).toBe(false);
    expect(press('f', { ctrlKey: true }).defaultPrevented).toBe(false); // C-f passthrough
    expect(press('k', { metaKey: true }).defaultPrevented).toBe(false);
  });

  it('never acts while the caret is in a field, and Escape leaves it', () => {
    const k = make();
    const field = document.getElementById('field') as HTMLInputElement;
    field.focus();
    const e = press('j', {}, field);
    expect(e.defaultPrevented).toBe(false);
    expect(k.mode()).toBe('insert');
    press('Escape', {}, field);
    expect(k.mode()).toBe('normal');
  });

  it('passthrough keys pass only at the start of a sequence', () => {
    const run = vi.fn();
    const top = vi.fn();
    const k = make({ passthrough: ['`', 'C-f'], keys: { '<leader> `': run, '`': top, 'g C-f': run } });
    expect(press('`').defaultPrevented).toBe(false); // the page's terminal keeps it
    expect(top).not.toHaveBeenCalled();
    expect(press(' ').defaultPrevented).toBe(true);
    expect(press('`').defaultPrevented).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    press('g');
    expect(press('f', { ctrlKey: true }).defaultPrevented).toBe(true);
    expect(run).toHaveBeenCalledTimes(2);
    press('5');
    expect(press('f', { ctrlKey: true }).defaultPrevented).toBe(false); // a count alone is not a sequence yet
    expect(k.dispatcher.busy).toBe(false);
  });

  it('yields to consumer guards', () => {
    let open = true;
    const k = make({ yieldTo: [() => open] });
    expect(press('j').defaultPrevented).toBe(false);
    expect(k.ownsKeys()).toBe(false);
    open = false;
    expect(press('j').defaultPrevented).toBe(true);
    const off = k.yieldTo(() => true);
    expect(press('j').defaultPrevented).toBe(false);
    off();
    expect(k.ownsKeys()).toBe(true);
  });

  it('does nothing while disabled', () => {
    const k = make();
    k.disable();
    expect(press('j').defaultPrevented).toBe(false);
  });

  it('maps and unmaps at runtime', () => {
    const k = make();
    const run = vi.fn();
    const off = k.map('<leader> x', run, 'Do x');
    press(' ');
    press('x');
    expect(run).toHaveBeenCalledTimes(1);
    expect(k.keymap.get('<leader> x')?.desc).toBe('Do x');
    off();
    press(' ');
    press('x');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('adds ex commands and resolves them by prefix', () => {
    const k = make();
    const run = vi.fn();
    k.command({ name: 'deploy', desc: 'Ship it', run });
    expect(k.exec('depl now')).toBe(true);
    expect(run).toHaveBeenCalledWith(['now'], { line: 'depl now', bang: false });
    expect(k.exec('nonsense')).toBe(false);
  });

  it(':set changes settings', () => {
    const k = make();
    k.exec('set scroll=120 nohlsearch leader=,');
    expect(k.settings.get('scroll')).toBe(120);
    expect(k.settings.get('hlsearch')).toBe(false);
    expect(k.leader()).toBe(',');
    const run = vi.fn();
    k.map('<leader> z', run);
    press(',');
    press('z');
    expect(run).toHaveBeenCalled();
  });

  it('counts reach bindings: 5j scrolls five steps', () => {
    const k = make();
    const by = vi.spyOn(k.scroll, 'by');
    press('5');
    press('j');
    expect(by).toHaveBeenCalledWith(72 * 5);
  });

  it('scrolls with behavior instant, never auto', () => {
    const k = make();
    const spy = vi.spyOn(window, 'scrollBy');
    press('j');
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'instant' }));
  });

  it('lets plugins replace and disable built-ins', () => {
    const k = make({
      disable: ['zen', 'yank'],
      plugins: [{ name: 'help', commands: [{ name: 'help', desc: 'mine', run: () => {} }] }],
    });
    const names = k.plugins().map((p) => p.name);
    expect(names).not.toContain('zen');
    expect(names).not.toContain('yank');
    expect(k.keymap.get('y y')).toBeUndefined();
    expect(k.keymap.get('?')).toBeUndefined(); // the replaced help had no keys
    expect(k.commands.get('help')?.desc).toBe('mine');
  });

  it('loads plugin settings, keys, commands, segments and sources, with setup and cleanup', () => {
    const cleanup = vi.fn();
    const k = make({
      plugins: [
        {
          name: 'site',
          settings: [{ key: 'mood', option: 'mood', type: 'enum', values: ['calm', 'loud'], default: 'calm' }],
          keys: { '<leader> g': '+git', '<leader> g g': { desc: 'Repo', run: () => {} } },
          commands: [{ name: 'mood', run: () => {} }],
          statusline: [{ id: 'mood', order: 80, render: ({ lk: l }) => String(l.settings.get('mood')) }],
          sources: [{ id: 'things', label: 'Things', rows: () => [{ label: 'one' }] }],
          setup: () => cleanup,
        },
      ],
      defaults: { mood: 'loud' },
    });
    expect(k.settings.get('mood')).toBe('loud');
    expect(k.keymap.children('<leader> g').map((r) => r.label)).toEqual(['Repo']);
    expect(k.exec('mood')).toBe(true);
    k.destroy();
    expect(cleanup).toHaveBeenCalled();
  });

  it('register() adds a plugin later and returns its removal', () => {
    const k = make();
    const off = k.register({ name: 'late', keys: { 'g x': () => {} } });
    expect(k.keymap.get('g x')).toBeDefined();
    off();
    expect(k.keymap.get('g x')).toBeUndefined();
  });

  it('translates every string it shows', () => {
    vi.useFakeTimers();
    const k = make({ messages: { 'mode.normal': 'NORMAL-NB', 'key.explorer': 'Utforsker' } });
    vi.advanceTimersByTime(20);
    expect(document.querySelector('.lk-seg--mode')?.textContent).toBe('NORMAL-NB');
    expect(k.keymap.get('<leader> e')?.desc).toBe('Utforsker');
  });

  it('notify() logs, and emits', () => {
    const k = make();
    const seen: string[] = [];
    k.on('message', (m) => seen.push(m.message));
    k.notify('hello', 'warn');
    expect(seen).toEqual(['hello']);
    expect(k.messages().at(-1)).toMatchObject({ message: 'hello', level: 'warn' });
    expect(document.querySelector('.lk-toast')?.textContent).toContain('hello');
    expect(document.querySelector('.lk-notify')?.getAttribute('aria-live')).toBe('polite');
  });

  it('destroy() removes its elements and its listener', () => {
    const k = make();
    k.notify('x');
    expect(document.querySelector('[data-lazykeys]')).not.toBeNull();
    k.destroy();
    lk = null;
    expect(document.querySelector('[data-lazykeys]')).toBeNull();
    expect(press('j').defaultPrevented).toBe(false);
    expect(document.documentElement.classList.contains('lk-on')).toBe(false);
  });

  it('navigate() is overridable', () => {
    const navigate = vi.fn();
    const k = make({ navigate });
    k.navigate('/somewhere', { newTab: true });
    expect(navigate).toHaveBeenCalledWith('/somewhere', { newTab: true });
  });
});

describe('surfaces', () => {
  it('which-key answers the leader at once, from the keymap', () => {
    make();
    press(' ');
    const panel = document.querySelector('.lk-wk');
    expect(panel).not.toBeNull();
    expect(panel?.querySelector('.lk-wk-seq')?.textContent).toBe('<leader>');
    const groups = Array.from(document.querySelectorAll('.lk-wk-row.is-group .lk-wk-label')).map((n) => n.textContent);
    expect(groups).toContain('+ui/toggle');
    press('u');
    expect(document.querySelector('.lk-wk-seq')?.textContent).toBe('<leader>u');
    press('Escape');
    expect(document.querySelector('.lk-wk')).toBeNull();
  });

  it('which-key waits timeoutlen for other prefixes', () => {
    vi.useFakeTimers();
    make();
    press('g');
    expect(document.querySelector('.lk-wk')).toBeNull();
    vi.advanceTimersByTime(260);
    expect(document.querySelector('.lk-wk')).not.toBeNull();
  });

  it(': opens the command line; Tab completes; Enter runs', () => {
    const k = make();
    press(':');
    const line = document.querySelector('.lk-cmdline') as HTMLElement;
    const input = line.querySelector('input') as HTMLInputElement;
    expect(line.hidden).toBe(false);
    expect(line.getAttribute('data-shape')).toBe('popup');
    expect(k.mode()).toBe('cmdline');
    input.value = 'he';
    input.dispatchEvent(new Event('input'));
    press('Tab', {}, input);
    expect(input.value).toBe('help');
    press('Enter', {}, input);
    expect(line.hidden).toBe(true);
    const float = document.querySelector('.lk-float');
    expect(float?.getAttribute('role')).toBe('dialog');
    expect(float?.getAttribute('aria-modal')).toBe('true');
    expect(float?.querySelectorAll('kbd').length).toBeGreaterThan(20);
    press('q');
    expect(document.querySelector('.lk-float')).toBeNull();
  });

  it(':set cmdline=bottom moves the line', () => {
    const k = make();
    k.exec('set cmdline=bottom');
    press(':');
    expect(document.querySelector('.lk-cmdline')?.getAttribute('data-shape')).toBe('bottom');
  });

  it('command history is walked with the arrows', () => {
    const k = make();
    press(':');
    let input = document.querySelector('.lk-cmdline input') as HTMLInputElement;
    input.value = 'set scroll=90';
    press('Enter', {}, input);
    expect(k.settings.get('scroll')).toBe(90);
    press(':');
    input = document.querySelector('.lk-cmdline input') as HTMLInputElement;
    press('ArrowUp', {}, input);
    expect(input.value).toBe('set scroll=90');
    press('Escape', {}, input);
  });

  it('/ finds without touching the DOM', () => {
    const k = make();
    const before = document.querySelector('main')!.innerHTML;
    press('/');
    const input = document.querySelector('.lk-cmdline input') as HTMLInputElement;
    input.value = 'beta';
    input.dispatchEvent(new Event('input'));
    expect(document.querySelector('.lk-cmdline-hint')?.textContent).toBe('3 matches');
    press('Enter', {}, input);
    expect(document.querySelector('main')!.innerHTML).toBe(before);
    const find = k.use<{ count(): number; pattern(): string }>('find');
    expect(find?.count()).toBe(3);
    expect(find?.pattern()).toBe('beta');
  });

  it('smartcase: an uppercase letter means case matters', () => {
    const k = make();
    const find = k.use<{ preview(t: string): number }>('find')!;
    expect(find.preview('beta')).toBe(3);
    expect(find.preview('Beta')).toBe(1);
  });

  it('the sidebar opens on a source and owns the keyboard until q', () => {
    const k = make({
      plugins: [
        {
          name: 'site',
          sources: [explorer({ load: () => [{ path: '/blog/one/', title: 'One' }, { path: '/about/' }] })],
        },
      ],
    });
    k.exec('outline');
    const sb = document.querySelector('.lk-sb') as HTMLElement;
    expect(sb.classList.contains('is-open')).toBe(true);
    const labels = Array.from(sb.querySelectorAll('.lk-sb-label')).map((n) => n.textContent);
    expect(labels).toEqual(['Title', 'First', 'Second']);
    const tabs = Array.from(sb.querySelectorAll('[role="tab"]')).map((n) => n.textContent);
    expect(tabs).toEqual(['Explorer', 'Outline', 'Buffers', 'Settings']);
    expect(press('j').defaultPrevented).toBe(true);
    expect(sb.querySelector('.is-selected .lk-sb-label')?.textContent).toBe('First');
    press('q');
    expect(sb.classList.contains('is-open')).toBe(false);
  });

  it('the outline drops permalink anchors, never the heading text', () => {
    document.querySelector('main')!.innerHTML = `
      <h2 id="c">Learning C#</h2>
      <h2 id="d">Sections §<a hidden class="anchor" aria-hidden="true" href="#d">#</a></h2>
      <h2 id="e">Docs <a class="headerlink" href="#e">¶</a></h2>
      <h2 id="f">Custom <span class="pin">🔗</span></h2>`;
    const k = make();
    k.exec('outline');
    const labels = Array.from(document.querySelectorAll('.lk-sb-label')).map((n) => n.textContent);
    expect(labels).toEqual(['Learning C#', 'Sections §', 'Docs', 'Custom 🔗']);
    expect(document.querySelectorAll('main a').length).toBe(2); // the page is untouched
    k.destroy();
    lk = null;
    make({ headingIgnore: '.pin' }).exec('outline');
    expect(Array.from(document.querySelectorAll('.lk-sb-label')).at(-1)?.textContent).toBe('Custom');
  });

  it('the settings source flips a switch', () => {
    const k = make();
    k.exec('options');
    const rows = Array.from(document.querySelectorAll('.lk-sb-row'));
    const hl = rows.findIndex((r) => r.textContent?.includes('Highlight search'));
    expect(hl).toBeGreaterThan(-1);
    for (let i = 0; i < hl; i++) press('j');
    press('Enter');
    expect(k.settings.get('hlsearch')).toBe(false);
  });

  it('marks take a letter and report it', () => {
    const k = make();
    press('m');
    press('a');
    expect(k.messages().at(-1)?.message).toBe('mark a set');
    press("'");
    press('q');
    expect(k.messages().at(-1)?.message).toBe('mark q is not set');
  });

  it(':checkhealth, :Lazy and :messages open floats', () => {
    const k = make();
    k.exec('checkhealth');
    expect(document.querySelectorAll('.lk-health li').length).toBeGreaterThan(5);
    k.exec('Lazy');
    expect(document.querySelectorAll('.lk-lazy li').length).toBe(k.plugins().length);
    k.exec('messages');
    expect(document.querySelector('.lk-float--messages')).not.toBeNull();
  });

  it('the status line follows the setting', () => {
    vi.useFakeTimers();
    const k = make();
    vi.advanceTimersByTime(20);
    expect(document.querySelector('.lk-status')).not.toBeNull();
    k.exec('set nostatusline');
    vi.advanceTimersByTime(20);
    expect(document.querySelector('.lk-status')).toBeNull();
  });
});

describe('sidebar sources by id', () => {
  const tabs = () => Array.from(document.querySelectorAll('.lk-sb [role="tab"]')).map((n) => n.textContent);
  const labels = () => Array.from(document.querySelectorAll('.lk-sb .lk-sb-label')).map((n) => n.textContent);

  it('a source with an existing id replaces it, in its place, and comes back on removal', () => {
    const k = make();
    const off = k.register({
      name: 'site',
      sources: [{ id: 'buffers', label: 'Recent', order: 30, rows: () => [{ label: 'mine' }] }],
    });
    k.exec('buffers');
    expect(tabs()).toEqual(['Outline', 'Recent', 'Settings']);
    expect(labels()).toEqual(['mine']);
    k.use<{ close(): void }>('sidebar')?.close();
    off();
    k.exec('buffers');
    expect(tabs()).toEqual(['Outline', 'Buffers', 'Settings']);
  });

  it('`{ id: false }` removes a source, from a plugin or from options', () => {
    const k = make({ sources: { settings: false } });
    k.exec('outline');
    expect(tabs()).toEqual(['Outline', 'Buffers']);
    const off = k.register({ name: 'site', sources: { outline: false, things: { id: 'ignored', label: 'Things', rows: () => [] } } });
    k.use<{ refresh(): void }>('sidebar')?.refresh();
    expect(tabs()).toEqual(['Buffers', 'Things']);
    off();
    k.use<{ refresh(): void }>('sidebar')?.refresh();
    expect(tabs()).toEqual(['Outline', 'Buffers']);
  });

  it('lk.source() adds, replaces and hides, and returns the removal', () => {
    const k = make();
    const hide = k.source('settings', false);
    const add = k.source('explorer', explorer({ load: () => [{ path: '/a/' }] }));
    k.exec('outline');
    expect(tabs()).toEqual(['Explorer', 'Outline', 'Buffers']);
    hide();
    add();
    k.use<{ refresh(): void }>('sidebar')?.refresh();
    expect(tabs()).toEqual(['Outline', 'Buffers', 'Settings']);
  });
});

describe('the enabled setting', () => {
  it('is :set lazy by default, so :set nolazy turns LazyKeys off', () => {
    const k = make();
    expect(k.settings.row('lazy')?.key).toBe('enabled');
    expect(k.exec('set nolazy')).toBe(true);
    expect(k.isEnabled()).toBe(false);
    k.settings.set('enabled', true);
    expect(k.isEnabled()).toBe(true);
    expect(k.complete('set nola').map((c) => c.value)).toContain('set nolazy');
  });

  it('takes another name, or none', () => {
    const k = make({ enabledOption: 'vim' });
    k.exec('set novim');
    expect(k.isEnabled()).toBe(false);
    k.destroy();
    const j = make({ enabledOption: false });
    expect(j.settings.row('enabled')?.option).toBeUndefined();
    j.exec('set nolazy');
    expect(j.isEnabled()).toBe(true);
  });

  it('shows in the settings source', () => {
    make({ messages: { 'setting.enabled': 'Tastaturlaget' } });
    lk!.exec('options');
    const labels = Array.from(document.querySelectorAll('.lk-sb-label')).map((n) => n.textContent);
    expect(labels[0]).toBe('Tastaturlaget');
  });
});

describe('setting labels from messages', () => {
  it('name and explain rows without a label, including redefined built-ins', () => {
    const k = make({
      messages: {
        'setting.mood.label': 'Stemning',
        'setting.mood.help': 'Hvordan siden føles.',
        'setting.enabled': 'Tastaturlaget',
        'setting.enabled.help': 'Hele laget.',
      },
      plugins: [
        {
          name: 'site',
          settings: [
            { key: 'mood', option: 'mood', type: 'enum', values: ['calm', 'loud'], default: 'calm' },
            { key: 'enabled', option: 'lazy', type: 'boolean', default: true },
            { key: 'own', option: 'own', type: 'boolean', default: true, label: 'Mine' },
          ],
        },
      ],
    });
    k.exec('options');
    const rows = Array.from(document.querySelectorAll('.lk-sb-row'));
    const label = (r: Element) => r.querySelector('.lk-sb-label')?.textContent;
    const mood = rows.find((r) => label(r) === 'Stemning');
    expect(mood?.getAttribute('title')).toBe('Hvordan siden føles.');
    const on = rows.find((r) => label(r) === 'Tastaturlaget');
    expect(on?.getAttribute('title')).toBe('Hele laget.');
    expect(rows.some((r) => label(r) === 'Mine')).toBe(true);
    expect(k.complete('set moo').find((c) => c.value === 'set mood')?.hint).toBe('Stemning');
  });
});

describe('lk.redraw()', () => {
  it('re-renders status segments without touching the message', () => {
    vi.useFakeTimers();
    let mood = 'calm';
    const k = make({
      plugins: [{ name: 'site', statusline: [{ id: 'mood', order: 80, render: () => mood }] }],
    });
    vi.advanceTimersByTime(20);
    k.echo('3 matches');
    vi.advanceTimersByTime(20);
    expect(document.querySelector('.lk-seg--mood')?.textContent).toBe('calm');
    mood = 'loud';
    k.redraw();
    vi.advanceTimersByTime(20);
    expect(document.querySelector('.lk-seg--mood')?.textContent).toBe('loud');
    expect(document.querySelector('.lk-seg--message')?.textContent).toBe('3 matches');
  });

  it('is a no-op after destroy()', () => {
    const k = make();
    k.destroy();
    lk = null;
    expect(() => k.redraw()).not.toThrow();
  });
});

describe('SPA navigation', () => {
  it('refresh() puts the root back after a <body> swap and keeps surfaces open', () => {
    const k = make();
    k.exec('outline');
    const sb = document.querySelector('.lk-sb');
    expect(sb).not.toBeNull();
    const fresh = document.createElement('body');
    fresh.innerHTML = '<main><h2>New page</h2></main>';
    document.body.replaceWith(fresh);
    document.documentElement.className = '';
    expect(document.querySelector('.lk-sb')).toBeNull();
    k.refresh();
    expect(document.querySelector('.lk-sb')).toBe(sb);
    expect(document.documentElement.classList.contains('lk-on')).toBe(true);
    expect(document.documentElement.classList.contains('lk-sidebar-open')).toBe(true);
    expect(Array.from(document.querySelectorAll('.lk-sb-label')).map((n) => n.textContent)).toEqual(['New page']);
  });
});

describe('source hygiene', () => {
  it('never uses innerHTML, eval or injected <style>', async () => {
    const { readdirSync, readFileSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((f: string): string[] => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
      });
    for (const file of walk(join(__dirname, '../src'))) {
      const src = readFileSync(file, 'utf8');
      expect(src, file).not.toMatch(/\.innerHTML\s*=|insertAdjacentHTML|outerHTML\s*=/);
      expect(src, file).not.toMatch(/\beval\(|new Function\(/);
      expect(src, file).not.toMatch(/createElement\(['"]style['"]\)/);
      expect(src, file).not.toMatch(/setAttribute\(['"]style['"]/);
    }
  });
});
