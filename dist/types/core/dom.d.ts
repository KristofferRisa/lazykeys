/**
 * DOM helpers. Everything LazyKeys draws is built with createElement and
 * textContent — there is no innerHTML anywhere, so no string a page or a
 * plugin hands in can become markup. Inline values go through CSSOM
 * (`style.setProperty`), which a strict `style-src` CSP allows.
 */
export type Child = Node | string | number | null | undefined | false;
export interface Props {
    class?: string;
    text?: string;
    attrs?: Record<string, string | number | boolean | null | undefined>;
    /** CSS custom properties and plain properties, set through CSSOM. */
    style?: Record<string, string | number>;
    on?: {
        [K in keyof HTMLElementEventMap]?: (e: HTMLElementEventMap[K]) => void;
    };
}
export declare function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, children?: Child | Child[]): HTMLElementTagNameMap[K];
export declare function append(parent: Node, children: Child | Child[]): void;
/** Replace an element's children. */
export declare function replace(parent: Element, children: Child | Child[]): void;
export declare function remove(node: Node | null | undefined): void;
/** `<kbd>` caps for a list of keys. */
export declare function kbds(keys: string[]): HTMLElement[];
declare const ICONS: {
    branch: ([string, {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
    }] | [string, {
        cx: number;
        cy: number;
        r: number;
    }] | [string, {
        d: string;
    }])[];
    search: ([string, {
        cx: number;
        cy: number;
        r: number;
    }] | [string, {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
    }])[];
    folder: [string, {
        d: string;
    }][];
    file: ([string, {
        d: string;
    }] | [string, {
        points: string;
    }])[];
    gear: ([string, {
        cx: number;
        cy: number;
        r: number;
    }] | [string, {
        d: string;
    }])[];
    list: [string, {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
    }][];
    layers: [string, {
        points: string;
    }][];
    command: ([string, {
        points: string;
    }] | [string, {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
    }])[];
    chevron: [string, {
        points: string;
    }][];
    zap: [string, {
        points: string;
    }][];
    check: [string, {
        points: string;
    }][];
    alert: ([string, {
        cx: number;
        cy: number;
        r: number;
    }] | [string, {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
    }])[];
    info: ([string, {
        cx: number;
        cy: number;
        r: number;
    }] | [string, {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
    }])[];
    heart: [string, {
        d: string;
    }][];
    keyboard: ([string, {
        x: number;
        y: number;
        width: number;
        height: number;
        rx: number;
    }] | [string, {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
    }])[];
    hash: [string, {
        x1: number;
        y1: number;
        x2: number;
        y2: number;
    }][];
    link: [string, {
        d: string;
    }][];
};
export type IconName = keyof typeof ICONS;
/** One icon as an `<svg>` element, or an empty span for an unknown name. */
export declare function icon(name: IconName | (string & {}), className?: string): Element;
export declare const iconNames: IconName[];
export {};
