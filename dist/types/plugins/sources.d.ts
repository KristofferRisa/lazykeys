/**
 * Sidebar sources: the built-in outline, buffers and settings, and the
 * explorer factory a site feeds its own page list into.
 */
import type { PluginContext, SidebarSource } from '../types';
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
/**
 * Build a folder tree from a flat list of URL paths. Exported for tests.
 * Folders sort above files, a section's own page sits first in its folder,
 * and the branch you are standing in starts open.
 */
export declare function buildTree(entries: ExplorerEntry[], opts?: Omit<ExplorerOptions, 'load'>): TreeNode;
/** A neo-tree-style explorer over the site's pages. */
export declare function explorer(options: ExplorerOptions): SidebarSource;
export declare function outlineSource(ctx: PluginContext): SidebarSource;
export declare function recordBuffer(ctx: PluginContext): void;
export declare function buffersSource(ctx: PluginContext): SidebarSource;
export declare function settingsSource(ctx: PluginContext): SidebarSource;
export {};
