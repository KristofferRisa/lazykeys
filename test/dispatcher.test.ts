import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Dispatcher } from '../src/core/dispatcher';
import { Keymap, type KeyContext } from '../src/core/keymap';

function setup(leader = 'Space', timeout = 250) {
  const keymap = new Keymap();
  const calls: Array<{ seq: string } & Omit<KeyContext, 'seq' | 'event'>> = [];
  const record = (ctx: KeyContext) => {
    const call: { seq: string; count: number; hasCount: boolean; arg?: string } = {
      seq: ctx.seq,
      count: ctx.count,
      hasCount: ctx.hasCount,
    };
    if (ctx.arg !== undefined) call.arg = ctx.arg;
    calls.push(call);
  };
  for (const seq of ['j', 'g g', 'G', '%', '<leader> e', '<leader> f f', 'y y']) keymap.set(seq, record);
  keymap.set('m', { arg: '{a-z}', run: record });
  const d = new Dispatcher({ keymap, leader: () => leader, timeoutlen: () => timeout });
  const feed = (...keys: string[]) => keys.map((k) => d.feed(k));
  return { keymap, d, calls, feed, record };
}

describe('Dispatcher', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs a single-key binding at once', () => {
    const { feed, calls } = setup();
    expect(feed('j')).toEqual([true]);
    expect(calls).toEqual([{ seq: 'j', count: 1, hasCount: false }]);
  });

  it('waits on a prefix and runs the full sequence', () => {
    const { feed, calls, d } = setup();
    feed('g');
    expect(calls).toHaveLength(0);
    expect(d.state.keys).toEqual(['g']);
    feed('g');
    expect(calls).toEqual([{ seq: 'g g', count: 1, hasCount: false }]);
    expect(d.busy).toBe(false);
  });

  it('a pure prefix never times out', () => {
    const { feed, calls, d } = setup();
    feed('g');
    vi.advanceTimersByTime(10_000);
    expect(d.state.keys).toEqual(['g']);
    feed('g');
    expect(calls).toHaveLength(1);
  });

  it('collects counts: 5j, 40%, 12G', () => {
    const { feed, calls } = setup();
    feed('5', 'j');
    feed('4', '0', '%');
    feed('1', '2', 'G');
    expect(calls).toEqual([
      { seq: 'j', count: 5, hasCount: true },
      { seq: '%', count: 40, hasCount: true },
      { seq: 'G', count: 12, hasCount: true },
    ]);
  });

  it('a bare 0 is not a count', () => {
    const { feed, calls, d } = setup();
    expect(feed('0')).toEqual([false]);
    expect(d.state.count).toBe('');
    feed('j');
    expect(calls[0]).toMatchObject({ count: 1, hasCount: false });
  });

  it('carries a count through a multi-key sequence', () => {
    const { feed, calls } = setup();
    feed('3', 'g', 'g');
    expect(calls).toEqual([{ seq: 'g g', count: 3, hasCount: true }]);
  });

  it('turns the configured leader into <leader> at the start only', () => {
    const { feed, calls } = setup(',');
    feed(',', 'e');
    expect(calls).toEqual([{ seq: '<leader> e', count: 1, hasCount: false }]);
    // Space is not the leader when the leader is a comma.
    expect(feed('Space')).toEqual([false]);
  });

  it('accepts <leader> fed directly (which-key clicks, lk.feed)', () => {
    const { feed, calls } = setup();
    feed('<leader>', 'f', 'f');
    expect(calls[0]?.seq).toBe('<leader> f f');
  });

  it('an unknown key ends the sequence and is left to the page', () => {
    const { feed, calls, d } = setup();
    expect(feed('g', 'x')).toEqual([true, false]);
    expect(d.busy).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('Escape drops whatever is pending', () => {
    const { feed, d } = setup();
    feed('3', '<leader>', 'f');
    expect(d.busy).toBe(true);
    expect(d.feed('Escape')).toBe(true);
    expect(d.busy).toBe(false);
    expect(d.feed('Escape')).toBe(false);
  });

  it('bindings with arg take the next key, whatever it is', () => {
    const { feed, calls } = setup();
    feed('m', 'a');
    feed('m', 'j');
    expect(calls).toEqual([
      { seq: 'm', count: 1, hasCount: false, arg: 'a' },
      { seq: 'm', count: 1, hasCount: false, arg: 'j' },
    ]);
  });

  it('an ambiguous sequence runs after timeoutlen', () => {
    const { keymap, feed, calls, record } = setup('Space', 300);
    keymap.set('y', record); // 'y' is now a binding and the prefix of 'y y'
    feed('y');
    expect(calls).toHaveLength(0);
    vi.advanceTimersByTime(299);
    expect(calls).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual([{ seq: 'y', count: 1, hasCount: false }]);
  });

  it('an ambiguous sequence continues when the next key extends it', () => {
    const { keymap, feed, calls, record } = setup();
    keymap.set('y', record);
    feed('y', 'y');
    vi.advanceTimersByTime(1000);
    expect(calls).toEqual([{ seq: 'y y', count: 1, hasCount: false }]);
  });

  it('an ambiguous sequence runs the shorter binding, then feeds the key afresh', () => {
    const { keymap, feed, calls, record } = setup();
    keymap.set('y', record);
    feed('y', 'j');
    expect(calls.map((c) => c.seq)).toEqual(['y', 'j']);
  });

  it('reports pending state and runs', () => {
    const keymap = new Keymap();
    keymap.set('g g', () => {});
    const pending: string[][] = [];
    const ran: string[] = [];
    const d = new Dispatcher({
      keymap,
      leader: () => 'Space',
      timeoutlen: () => 0,
      onPending: (s) => pending.push(s.keys),
      onRun: (e) => ran.push(e.seq),
    });
    d.feed('g');
    d.feed('g');
    expect(pending).toEqual([['g'], []]);
    expect(ran).toEqual(['g g']);
  });

  it('a throwing binding reports and does not wedge the dispatcher', () => {
    const keymap = new Keymap();
    keymap.set('x', () => {
      throw new Error('boom');
    });
    const errors: unknown[] = [];
    const d = new Dispatcher({ keymap, leader: () => 'Space', timeoutlen: () => 0, onError: (e) => errors.push(e) });
    expect(d.feed('x')).toBe(true);
    expect(errors).toHaveLength(1);
    expect(d.busy).toBe(false);
  });
});
