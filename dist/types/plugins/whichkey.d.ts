/**
 * whichkey — leave a prefix hanging and a panel rises in the corner listing
 * every key that can follow it, `+name` for the ones that open a further
 * menu. The leader was pressed to ask the question, so it answers at once;
 * everything else waits `timeoutlen`, so a fluent `gg` never flashes a panel.
 *
 * The rows come from the keymap, never from a list of their own.
 */
export interface WhichKeyApi {
    show(tokens: string[]): void;
    hide(): void;
    visible(): boolean;
}
export declare const whichkey: import("..").PluginSpec;
