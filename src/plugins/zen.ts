/**
 * zen — `<leader>uz` toggles `lk-zen` on `<html>`. What it hides is the
 * site's call: `.lk-zen .site-header { display: none }`.
 */

import { definePlugin } from './util';

export const zen = definePlugin({
  name: 'zen',
  keys: ({ lk, t }) => ({
    '<leader> u z': { desc: t('key.zen'), run: () => void lk.exec('zen') },
  }),
  commands: ({ lk, t }) => [
    {
      name: 'zen',
      desc: t('cmd.zen'),
      run() {
        const on = document.documentElement.classList.toggle('lk-zen');
        lk.echo(t(on ? 'msg.zenOn' : 'msg.zenOff'), 'success');
      },
    },
  ],
  setup({ lk }) {
    return lk.on('disable', () => document.documentElement.classList.remove('lk-zen'));
  },
});
