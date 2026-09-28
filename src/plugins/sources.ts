/**
 * Sidebar sources: the built-in outline, buffers and settings, and the
 * explorer factory a site feeds its own page list into.
 */

import type { PluginContext, SidebarRow, SidebarSource } from '../types';
import { isExcluded } from './util';

// ---------------------------------------------------------------------------
// Explorer
// ---------------------------------------------------------------------------

export interface ExplorerEntry {
  /** A URL path (`/blog/my-post/`) or a full URL on this origin. */
  path: string;
  title?: string;
  /** A section with nothing under it is still a section, not a file. */
  dir?: boolean;
}

export interface ExplorerOptions {
  /** Every page, however the site knows them: a search index, a sitemap, a route table. */
  load(): ExplorerEntry[] | Promise<ExplorerEntry[]>;
  id?: string;
  label?: string;
  /** The root folder's label. Default `'/'`. */
  rootLabel?: string;
  /** The file name a leaf page shows as. Default: its last path segment. `s => s + '.md'` for a Hugo site. */
  fileName?(segment: string, entry: ExplorerEntry): string;
  /** The name a section's own page shows as inside its folder. Default `'index'`. */
  indexName?: string;
  /** The path to mark as "you are here". Default `location.pathname`. */
  current?(): string;
  order?: number;
}

interface TreeNode {
  label: string;
  path: string;
  hint?: string;
  children?: TreeNode[];
  open?: boolean;
}

function pathOf(input: string): string {
  try {
    return new URL(input, location.href).pathname;
  } catch {
    return input;
  }
}

function segmentsOf(path: string): string[] {
  return path.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
}

/**
 * Build a folder tree from a flat list of URL paths. Exported for tests.
 * Folders sort above files, a section's own page sits first in its folder,
 * and the branch you are standing in starts open.
 */
export function buildTree(entries: ExplorerEntry[], opts: Omit<ExplorerOptions, 'load'> = {}): TreeNode {
  const indexName = opts.indexName ?? 'index';
  const fileName = opts.fileName ?? ((segment: string) => segment);
  const trailing = (p: string) => (p.endsWith('/') ? p : p + '/');
  const root: TreeNode = { label: opts.rootLabel ?? '/', path: '/', open: true, children: [] };
  const dirs = new Map<string, TreeNode>([['', root]]);
  const isDir = new Set<string>();
  const seen = new Set<string>();
  const list: ExplorerEntry[] = [];

  for (const raw of entries) {
    const path = pathOf(raw.path);
    if (seen.has(path)) continue;
    seen.add(path);
    list.push({ ...raw, path });
    const segs = segmentsOf(path);
    for (let i = 0; i < segs.length - 1; i++) isDir.add('/' + segs.slice(0, i + 1).join('/'));
    if (raw.dir && segs.length) isDir.add('/' + segs.join('/'));
  }

  const dirFor = (segs: string[]): TreeNode => {
    let parent = root;
    let prefix = '';
    for (const seg of segs) {
      prefix += '/' + seg;
      let node = dirs.get(prefix);
      if (!node) {
        node = { label: seg + '/', path: trailing(prefix), open: false, children: [] };
        dirs.set(prefix, node);
        parent.children!.push(node);
      }
      parent = node;
    }
    return parent;
  };

  for (const entry of list) {
    const segs = segmentsOf(entry.path);
    const own = '/' + segs.join('/');
    let parent: TreeNode;
    let name: string;
    if (!segs.length) {
      parent = root;
      name = indexName;
    } else if (isDir.has(own)) {
      parent = dirFor(segs);
      name = indexName;
    } else {
      parent = dirFor(segs.slice(0, -1));
      name = fileName(segs[segs.length - 1] as string, entry);
    }
    const leaf: TreeNode = { label: name, path: entry.path };
    if (entry.title) leaf.hint = entry.title;
    parent.children!.push(leaf);
  }

  const sortNode = (node: TreeNode) => {
    node.children?.sort((a, b) => {
      const ad = !!a.children;
      const bd = !!b.children;
      if (ad !== bd) return ad ? -1 : 1;
      if (a.label === indexName) return -1;
      if (b.label === indexName) return 1;
      return a.label.localeCompare(b.label);
    });
    node.children?.forEach((c) => c.children && sortNode(c));
  };
  sortNode(root);

  const here = segmentsOf(opts.current ? opts.current() : location.pathname);
  let walk = '';
  for (const seg of here) {
    walk += '/' + seg;
    const node = dirs.get(walk);
    if (node) node.open = true;
  }
  return root;
}

function toRows(node: TreeNode, current: string): SidebarRow[] {
  return (node.children ?? []).map((child) => {
    const row: SidebarRow = { id: child.path + '#' + child.label, label: child.label, current: child.path === current };
    if (child.hint) row.hint = child.hint;
    if (child.children) {
      row.kind = 'dir';
      row.children = toRows(child, current);
      row.open = !!child.open;
      row.current = false;
    } else {
      row.kind = 'file';
      row.href = child.path;
    }
    return row;
  });
}

/** A neo-tree-style explorer over the site's pages. */
export function explorer(options: ExplorerOptions): SidebarSource {
  let cache: Promise<TreeNode> | null = null;
  return {
    id: options.id ?? 'explorer',
    label: options.label ?? '',
    icon: 'folder',
    order: options.order ?? 10,
    rows() {
      if (!cache) {
        cache = Promise.resolve()
          .then(() => options.load())
          .catch(() => [] as ExplorerEntry[])
          .then((entries) => {
            const current = options.current ? options.current() : location.pathname;
            const all = entries.slice();
            // Whatever page this is, it is in the tree, so "you are here" has
            // something to highlight.
            if (!all.some((e) => pathOf(e.path) === current)) all.push({ path: current, title: document.title });
            return buildTree(all, options);
          });
      }
      const current = options.current ? options.current() : location.pathname;
      return cache.then((root) => [
        { id: '/#root', label: root.label, kind: 'dir', open: true, children: toRows(root, current) } as SidebarRow,
      ]);
    },
    reload() {
      cache = null;
    },
  };
}

// ---------------------------------------------------------------------------
// Outline — the headings of the page you are on, as document symbols
// ---------------------------------------------------------------------------

export function outlineSource(ctx: PluginContext): SidebarSource {
  return {
    id: 'outline',
    label: ctx.t('source.outline'),
    icon: 'list',
    order: 20,
    rows() {
      const heads = Array.from(ctx.options.root().querySelectorAll<HTMLElement>(ctx.options.headings)).filter(
        (el) => !isExcluded(el, ctx.options.exclude) && el.getClientRects().length > 0,
      );
      const levels = heads.map((el) => (/^H([1-6])$/.test(el.tagName) ? parseInt(el.tagName.slice(1), 10) : 2));
      const min = levels.length ? Math.min(...levels) : 1;
      return heads.map((el, i) => ({
        id: 'h' + i,
        kind: 'symbol' as const,
        icon: 'hash',
        depth: (levels[i] as number) - min,
        label: (el.textContent ?? '').replace(/\s*[¶#§]\s*$/, '').trim(),
        hint: el.tagName.toLowerCase(),
        onSelect() {
          ctx.lk.scroll.to(ctx.lk.scroll.offsetOf(el) - 16);
        },
      }));
    },
  };
}

// ---------------------------------------------------------------------------
// Buffers — every page visited this session, most recent first
// ---------------------------------------------------------------------------

interface Buffer {
  path: string;
  title: string;
}

const BUFFERS = 'buffers';

export function recordBuffer(ctx: PluginContext): void {
  const path = location.pathname + location.search;
  const list = ctx.session.get<Buffer[]>(BUFFERS, []).filter((b) => b && b.path !== path);
  list.unshift({ path, title: ctx.options.title() });
  ctx.session.set(BUFFERS, list.slice(0, 25));
}

export function buffersSource(ctx: PluginContext): SidebarSource {
  return {
    id: 'buffers',
    label: ctx.t('source.buffers'),
    icon: 'layers',
    order: 30,
    rows() {
      const here = location.pathname + location.search;
      return ctx.session.get<Buffer[]>(BUFFERS, []).map((b) => ({
        id: b.path,
        kind: 'file' as const,
        label: b.path,
        hint: b.title,
        href: b.path,
        current: b.path === here,
      }));
    },
  };
}

// ---------------------------------------------------------------------------
// Settings — the schema, close enough to flip without leaving the page
// ---------------------------------------------------------------------------

export function settingsSource(ctx: PluginContext): SidebarSource {
  const { settings, t, lk } = ctx;
  return {
    id: 'settings',
    label: t('source.settings'),
    icon: 'gear',
    order: 40,
    rows() {
      const out: SidebarRow[] = [];
      let group: string | undefined;
      for (const row of settings.schema()) {
        if (row.hidden) continue;
        if (row.group !== group) {
          group = row.group;
          if (group) out.push({ kind: 'header', label: group });
        }
        const value = settings.get(row.key);
        const requires = row.requires ? settings.row(row.requires) : null;
        const cycle = (dir: 1 | -1) => {
          const now = settings.get(row.key);
          if (row.type === 'boolean') settings.set(row.key, !now);
          else if (row.type === 'enum' && row.values?.length) {
            const at = row.values.indexOf(String(now));
            settings.set(row.key, row.values[(at + dir + row.values.length) % row.values.length]);
          } else if (row.type === 'number') settings.set(row.key, Number(now) + (row.step ?? 1) * dir);
          else lk.echo(t('sidebar.textSetting', { label: row.label ?? row.key, option: row.option ?? row.key }), 'warn');
        };
        const item: SidebarRow = {
          id: 'setting:' + row.key,
          kind: 'option',
          icon: 'gear',
          depth: group ? 1 : 0,
          label: row.label ?? row.key,
          dormant: !!(requires && !settings.get(requires.key)),
          onCycle: cycle,
          onSelect: () => cycle(1),
        };
        if (row.type === 'boolean') item.toggled = !!value;
        else item.value = String(value);
        if (row.help) item.hint = row.help;
        out.push(item);
      }
      return out;
    },
  };
}
