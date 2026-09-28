/**
 * The shared furniture: one root element, floating windows (`:help`,
 * `:messages`, `:checkhealth`, the pickers) and a screen-reader line.
 *
 * A float is a modal dialog in everything but name: one at a time, it takes
 * the keyboard while it is up, moves focus into itself and hands it back to
 * wherever it was when it closes.
 */
import type { Translate } from './i18n';
import type { KeyLayer, Ui } from '../types';
export interface UiDeps {
    t: Translate;
    mount: () => HTMLElement;
    pushLayer: (layer: KeyLayer) => () => void;
}
export declare function createUi(deps: UiDeps): Ui & {
    destroy(): void;
    remount(): void;
};
