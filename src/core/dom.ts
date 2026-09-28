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
  on?: { [K in keyof HTMLElementEventMap]?: (e: HTMLElementEventMap[K]) => void };
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props | null = null,
  children: Child | Child[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    if (props.class) el.className = props.class;
    if (props.text !== undefined) el.textContent = props.text;
    if (props.attrs) {
      for (const [name, value] of Object.entries(props.attrs)) {
        if (value === null || value === undefined || value === false) continue;
        el.setAttribute(name, value === true ? '' : String(value));
      }
    }
    if (props.style) {
      for (const [name, value] of Object.entries(props.style)) el.style.setProperty(name, String(value));
    }
    if (props.on) {
      for (const [name, fn] of Object.entries(props.on)) {
        if (fn) el.addEventListener(name, fn as EventListener);
      }
    }
  }
  append(el, children);
  return el;
}

export function append(parent: Node, children: Child | Child[]): void {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'object' ? child : document.createTextNode(String(child)));
  }
}

/** Replace an element's children. */
export function replace(parent: Element, children: Child | Child[]): void {
  while (parent.firstChild) parent.removeChild(parent.firstChild);
  append(parent, children);
}

export function remove(node: Node | null | undefined): void {
  node?.parentNode?.removeChild(node);
}

/** `<kbd>` caps for a list of keys. */
export function kbds(keys: string[]): HTMLElement[] {
  return keys.map((k) => h('kbd', { text: k }));
}

// ---------------------------------------------------------------------------
// Icons — Lucide-shaped 24×24 strokes, drawn at 1em, so nothing depends on a
// Nerd Font being installed. Stored as data, built with createElementNS.
// ---------------------------------------------------------------------------

type Shape = [tag: string, attrs: Record<string, string | number>];

const ICONS = {
  branch: [
    ['line', { x1: 6, y1: 3, x2: 6, y2: 15 }],
    ['circle', { cx: 18, cy: 6, r: 3 }],
    ['circle', { cx: 6, cy: 18, r: 3 }],
    ['path', { d: 'M18 9a9 9 0 0 1-9 9' }],
  ],
  search: [
    ['circle', { cx: 11, cy: 11, r: 8 }],
    ['line', { x1: 21, y1: 21, x2: 16.65, y2: 16.65 }],
  ],
  folder: [['path', { d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' }]],
  file: [
    ['path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }],
    ['polyline', { points: '14 2 14 8 20 8' }],
  ],
  gear: [
    ['circle', { cx: 12, cy: 12, r: 3 }],
    ['path', { d: 'M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1' }],
  ],
  list: [
    ['line', { x1: 8, y1: 6, x2: 21, y2: 6 }],
    ['line', { x1: 8, y1: 12, x2: 21, y2: 12 }],
    ['line', { x1: 8, y1: 18, x2: 21, y2: 18 }],
    ['line', { x1: 3, y1: 6, x2: 3.01, y2: 6 }],
    ['line', { x1: 3, y1: 12, x2: 3.01, y2: 12 }],
    ['line', { x1: 3, y1: 18, x2: 3.01, y2: 18 }],
  ],
  layers: [
    ['polygon', { points: '12 2 2 7 12 12 22 7 12 2' }],
    ['polyline', { points: '2 17 12 22 22 17' }],
    ['polyline', { points: '2 12 12 17 22 12' }],
  ],
  command: [
    ['polyline', { points: '4 17 10 11 4 5' }],
    ['line', { x1: 12, y1: 19, x2: 20, y2: 19 }],
  ],
  chevron: [['polyline', { points: '9 18 15 12 9 6' }]],
  zap: [['polygon', { points: '13 2 3 14 12 14 11 22 21 10 12 10 13 2' }]],
  check: [['polyline', { points: '20 6 9 17 4 12' }]],
  alert: [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['line', { x1: 12, y1: 8, x2: 12, y2: 12 }],
    ['line', { x1: 12, y1: 16, x2: 12.01, y2: 16 }],
  ],
  info: [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['line', { x1: 12, y1: 16, x2: 12, y2: 12 }],
    ['line', { x1: 12, y1: 8, x2: 12.01, y2: 8 }],
  ],
  heart: [
    [
      'path',
      {
        d: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21.2l7.7-7.8 1.1-1a5.5 5.5 0 0 0 0-7.8z',
      },
    ],
  ],
  keyboard: [
    ['rect', { x: 2, y: 5, width: 20, height: 14, rx: 2 }],
    ['line', { x1: 6, y1: 10, x2: 6.01, y2: 10 }],
    ['line', { x1: 10, y1: 10, x2: 10.01, y2: 10 }],
    ['line', { x1: 14, y1: 10, x2: 14.01, y2: 10 }],
    ['line', { x1: 18, y1: 10, x2: 18.01, y2: 10 }],
    ['line', { x1: 7, y1: 15, x2: 17, y2: 15 }],
  ],
  hash: [
    ['line', { x1: 4, y1: 9, x2: 20, y2: 9 }],
    ['line', { x1: 4, y1: 15, x2: 20, y2: 15 }],
    ['line', { x1: 10, y1: 3, x2: 8, y2: 21 }],
    ['line', { x1: 16, y1: 3, x2: 14, y2: 21 }],
  ],
  link: [
    ['path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }],
    ['path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }],
  ],
} satisfies Record<string, Shape[]>;

export type IconName = keyof typeof ICONS;

const SVG = 'http://www.w3.org/2000/svg';

/** One icon as an `<svg>` element, or an empty span for an unknown name. */
export function icon(name: IconName | (string & {}), className = ''): Element {
  const shapes = (ICONS as Record<string, Shape[]>)[name];
  if (!shapes) return h('span', { class: 'lk-icon lk-icon--none', attrs: { 'aria-hidden': 'true' } });
  const svg = document.createElementNS(SVG, 'svg');
  const attrs: Record<string, string> = {
    class: ('lk-icon ' + className).trim(),
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  };
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
  for (const [tag, shapeAttrs] of shapes) {
    const node = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(shapeAttrs)) node.setAttribute(k, String(v));
    svg.appendChild(node);
  }
  return svg;
}

export const iconNames = Object.keys(ICONS) as IconName[];
