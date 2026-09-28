/**
 * statusline — lualine's segments, in lualine's order: mode, section, path,
 * the last message, the search position, pending keys, and how far down the
 * page you are. Any plugin adds a segment with `statusline: [...]`.
 *
 * It is decorative to assistive tech (a screen reader announcing every j would
 * be a punishment); messages reach screen readers through the live region.
 */
export declare const statusline: import("..").PluginSpec;
