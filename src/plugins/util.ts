import { settingLabel } from '../core/set';
import type { PluginContext, PluginSpec } from '../types';

/** Identity, for type inference: `definePlugin({ name, keys, … })`. */
export function definePlugin(spec: PluginSpec): PluginSpec {
  return spec;
}

/** Flip a boolean setting and say so. */
export function toggleSetting(ctx: PluginContext, key: string): void {
  const row = ctx.settings.row(key);
  const value = ctx.settings.toggle(key);
  if (value === undefined) return;
  ctx.lk.echo(
    ctx.t('msg.toggled', {
      label: row ? settingLabel(row, ctx.t) : key,
      state: ctx.t(value ? 'msg.on.short' : 'msg.off.short'),
    }),
    'success',
  );
}

/** Whether an element is on screen and drawn. */
export function inView(el: Element): boolean {
  const rects = el.getClientRects();
  if (!rects.length) return false;
  const r = rects[0] as DOMRect;
  if (r.width < 2 || r.height < 2) return false;
  if (r.bottom < 0 || r.top > window.innerHeight) return false;
  if (r.right < 0 || r.left > window.innerWidth) return false;
  const style = window.getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none' && style.opacity !== '0';
}

export function isExcluded(el: Element, selector: string): boolean {
  if (!selector) return false;
  try {
    return !!el.closest(selector);
  } catch {
    return false;
  }
}

/** Copy text, with the execCommand fallback for when the clipboard API is not there. */
export function copyText(text: string): Promise<void> {
  const fallback = (): Promise<void> =>
    new Promise((resolve, reject) => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.setProperty('position', 'fixed');
      ta.style.setProperty('opacity', '0');
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch {
        ok = false;
      }
      document.body.removeChild(ta);
      if (ok) resolve();
      else reject(new Error('copy failed'));
    });
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(fallback);
  }
  return fallback();
}

/** The side the sidebar uses; which-key takes the other. */
export function sidebarSide(ctx: PluginContext): 'left' | 'right' {
  return ctx.settings.get<string>('sidebar') === 'left' ? 'left' : 'right';
}
