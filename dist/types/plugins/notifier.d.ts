/**
 * notifier — the corner toasts, nvim-notify by way of snacks.nvim: a message
 * that matters should not have to compete for the one line at the bottom.
 * Newest at the bottom, five at most; `:messages` keeps the log either way.
 */
import type { Message, NotifyOptions } from '../types';
export interface NotifierApi {
    /** Draw a toast. Returns false when toasts are switched off. */
    show(message: Message, opts?: NotifyOptions): boolean;
    dismissAll(): void;
}
export declare const notifier: import("..").PluginSpec;
