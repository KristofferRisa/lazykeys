/** yank — `yy` copies the URL, `yt` a markdown link to the page. */

import { copyText, definePlugin } from './util';

export const yank = definePlugin({
  name: 'yank',
  keys: ({ lk, t, options }) => {
    const copy = (text: string, what: string) =>
      copyText(text).then(
        () => lk.echo(t('msg.yanked', { what }), 'success'),
        () => lk.echo(t('msg.clipboardFailed'), 'error'),
      );
    const section = t('section.yank');
    return {
      'y y': { desc: t('key.yankUrl'), section, run: () => void copy(location.href, t('msg.yankUrl')) },
      'y t': {
        desc: t('key.yankLink'),
        section,
        run: () => void copy(`[${options.title()}](${location.href})`, t('msg.yankLink')),
      },
    };
  },
});
