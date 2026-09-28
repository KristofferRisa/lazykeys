/**
 * sidebar — the neo-tree panel. Sources are pluggable: the built-ins are the
 * outline of this page, the buffers visited this session and the settings;
 * a site adds its own explorer with `explorer({ load })`.
 *
 * Inside it: j/k move, Enter opens (or expands, or flips a switch), h/l
 * collapse and expand, / filters, Tab and 1–9 switch source, R reloads, q
 * closes. While it is open it owns the keyboard.
 */
import type { SidebarRow, SidebarSource } from '../types';
export interface SidebarApi {
    open(source?: string): void;
    close(): void;
    toggle(source?: string): void;
    isOpen(): boolean;
    /** The id of the source on show. */
    source(): string;
    /** Every registered source, in tab order. */
    sources(): SidebarSource[];
    /** Ask the current source for its rows again. */
    refresh(): void;
}
interface FlatRow {
    row: SidebarRow;
    depth: number;
    id: string;
    isDir: boolean;
    open: boolean;
}
/** Flatten a row tree for display. With a filter, keep matches and the folders above them. */
export declare function flattenRows(rows: SidebarRow[], openState: Map<string, boolean>, filter?: string, depth?: number): FlatRow[];
export declare const sidebar: import("..").PluginSpec;
export {};
