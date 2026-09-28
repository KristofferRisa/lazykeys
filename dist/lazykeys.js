/*! lazykeys v0.1.0 | MIT | https://github.com/KristofferRisa/lazykeys */

// src/core/keys.ts
var LEADER = "<leader>";
var NAMED = {
  leader: LEADER,
  space: "Space",
  spc: "Space",
  cr: "Enter",
  enter: "Enter",
  return: "Enter",
  esc: "Escape",
  escape: "Escape",
  tab: "Tab",
  bs: "Backspace",
  backspace: "Backspace",
  del: "Delete",
  delete: "Delete",
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
  lt: "<",
  gt: ">",
  bar: "|",
  bslash: "\\"
};
function ctrlOf(rest) {
  const named = NAMED[rest.toLowerCase()];
  if (named && named !== LEADER) return "C-" + named;
  return "C-" + (rest.length === 1 ? rest.toLowerCase() : rest);
}
function normalizeToken(raw) {
  const token = raw.trim();
  if (token === "") return "Space";
  const bracket = /^<(.+)>$/.exec(token);
  if (bracket && bracket[1]) {
    const inner = bracket[1];
    const ctrl2 = /^[cC]-(.+)$/.exec(inner);
    if (ctrl2 && ctrl2[1]) return ctrlOf(ctrl2[1]);
    const named = NAMED[inner.toLowerCase()];
    return named ?? inner;
  }
  const ctrl = /^[cC]-(.+)$/.exec(token);
  if (ctrl && ctrl[1]) return ctrlOf(ctrl[1]);
  return token;
}
function parseSeq(seq) {
  return seq.trim().split(/\s+/).filter(Boolean).map(normalizeToken);
}
function normalizeSeq(seq) {
  return parseSeq(seq).join(" ");
}
function tokenDisplay(token) {
  switch (token) {
    case LEADER:
      return "<leader>";
    case "Space":
      return "<space>";
    case "Enter":
      return "<cr>";
    case "Escape":
      return "<esc>";
    case "Tab":
      return "<tab>";
    case "Backspace":
      return "<bs>";
    default:
      if (token.startsWith("C-")) return "<" + token + ">";
      return token;
  }
}
function displaySeq(seq) {
  const tokens = Array.isArray(seq) ? seq : parseSeq(seq);
  return tokens.map(tokenDisplay).join("");
}
var MODIFIERS = /* @__PURE__ */ new Set(["Control", "Shift", "Alt", "Meta", "AltGraph", "CapsLock", "Hyper", "Super", "OS", "Fn"]);
function keyName(e) {
  let key = e.key;
  if (!key || MODIFIERS.has(key) || key === "Unidentified" || key === "Dead") return null;
  if (key === "Esc") key = "Escape";
  if (key === " " || key === "Spacebar") key = "Space";
  if (e.ctrlKey && !e.metaKey && !e.altKey) {
    return "C-" + (key.length === 1 ? key.toLowerCase() : key);
  }
  return key;
}
var NOT_TEXT = /* @__PURE__ */ new Set(["checkbox", "radio", "button", "submit", "reset", "range", "color", "file", "image"]);
function isEditable(el) {
  if (!el || typeof el.tagName !== "string") return false;
  const node = el;
  const tag = node.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (node.type || "text").toLowerCase();
    return !NOT_TEXT.has(type);
  }
  return !!node.isContentEditable;
}

// src/core/dispatcher.ts
var Dispatcher = class {
  constructor(opts) {
    this.opts = opts;
    this.keys = [];
    this.count = "";
    this.awaitingArg = null;
    this.ambiguous = null;
    this.timer = null;
  }
  get state() {
    return { keys: this.keys.slice(), count: this.count, awaitingArg: this.awaitingArg };
  }
  /** Whether anything is pending — a prefix, a count or an argument. */
  get busy() {
    return this.keys.length > 0 || this.count !== "" || this.awaitingArg !== null;
  }
  /** Drop whatever is pending. */
  reset() {
    this.clearTimer();
    const was = this.busy;
    this.keys = [];
    this.count = "";
    this.awaitingArg = null;
    this.ambiguous = null;
    if (was) this.emitPending();
  }
  /**
   * Feed one token. Returns true when it was consumed — the caller then
   * prevents the browser's default for it.
   */
  feed(key, event = null) {
    if (this.awaitingArg) {
      const entry2 = this.awaitingArg;
      if (key === "Escape") {
        this.reset();
        return true;
      }
      this.run(entry2, event, key);
      return true;
    }
    if (key === "Escape") {
      if (!this.busy) return false;
      this.reset();
      return true;
    }
    if (this.ambiguous) {
      this.clearTimer();
      const pendingEntry = this.ambiguous;
      this.ambiguous = null;
      const next = [...this.keys, key].join(" ");
      if (!this.opts.keymap.get(next) && !this.opts.keymap.isPrefix(next)) {
        this.run(pendingEntry, event);
        return this.feed(key, event) || true;
      }
    }
    let token = key;
    if (!this.keys.length && key === this.opts.leader()) token = LEADER;
    if (!this.keys.length && /^[0-9]$/.test(token) && !(token === "0" && !this.count)) {
      this.count += token;
      this.emitPending();
      return true;
    }
    const seq = [...this.keys, token].join(" ");
    const entry = this.opts.keymap.get(seq);
    const prefix = this.opts.keymap.isPrefix(seq);
    if (entry && entry.arg) {
      this.keys.push(token);
      this.awaitingArg = entry;
      this.emitPending();
      return true;
    }
    if (entry && !prefix) {
      this.run(entry, event);
      return true;
    }
    if (entry && prefix) {
      this.keys.push(token);
      this.ambiguous = entry;
      const wait = Math.max(0, this.opts.timeoutlen());
      this.timer = setTimeout(() => {
        this.timer = null;
        const pending = this.ambiguous;
        this.ambiguous = null;
        if (pending) this.run(pending, null);
      }, wait);
      this.emitPending();
      return true;
    }
    if (prefix) {
      this.keys.push(token);
      this.emitPending();
      return true;
    }
    if (this.busy) this.reset();
    return false;
  }
  run(entry, event, arg) {
    const hasCount = this.count.length > 0;
    const count = hasCount ? parseInt(this.count, 10) : 1;
    this.clearTimer();
    this.keys = [];
    this.count = "";
    this.awaitingArg = null;
    this.ambiguous = null;
    this.emitPending();
    const ctx = { count, hasCount, seq: entry.seq, event };
    if (arg !== void 0) ctx.arg = arg;
    try {
      entry.run(ctx);
    } catch (error) {
      if (this.opts.onError) this.opts.onError(error, entry);
      else console.error(`lazykeys: '${entry.seq}' failed`, error);
      return;
    }
    this.opts.onRun?.(entry, ctx);
  }
  clearTimer() {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
  emitPending() {
    this.opts.onPending?.(this.state);
  }
};

// src/core/ex.ts
function parseLine(line) {
  const text = String(line ?? "").replace(/^[\s:]+/, "");
  if (!text.trim()) return null;
  const parts = text.trim().split(/\s+/);
  const name = parts[0];
  return { name, argv: parts.slice(1), bang: /!$/.test(name) && name.length > 1, line: text };
}
var ExRegistry = class {
  constructor() {
    this.stacks = /* @__PURE__ */ new Map();
    this.order = [];
  }
  add(spec, plugin) {
    if (!spec.name) throw new Error("lazykeys: an ex command needs a name");
    const cmd = { ...spec };
    if (plugin !== void 0) cmd.plugin = plugin;
    const stack = this.stacks.get(spec.name) ?? [];
    if (!stack.length) this.order.push(spec.name);
    stack.push(cmd);
    this.stacks.set(spec.name, stack);
    return () => {
      const list = this.stacks.get(spec.name);
      if (!list) return;
      const at = list.indexOf(cmd);
      if (at !== -1) list.splice(at, 1);
      if (!list.length) {
        this.stacks.delete(spec.name);
        this.order = this.order.filter((n) => n !== spec.name);
      }
    };
  }
  /** Every live command, in registration order. */
  list() {
    const out = [];
    for (const name of this.order) {
      const stack = this.stacks.get(name);
      const top = stack?.[stack.length - 1];
      if (top) out.push(top);
    }
    return out;
  }
  get(name) {
    const stack = this.stacks.get(name);
    return stack?.[stack.length - 1];
  }
  /** Exact name, then alias, then unique prefix of a name. */
  resolve(name) {
    if (!name) return null;
    const all = this.list();
    const exact = this.get(name);
    if (exact) return exact;
    const aliased = all.find((c) => c.alias?.includes(name));
    if (aliased) return aliased;
    const hits = all.filter((c) => c.name.startsWith(name));
    if (hits.length === 1) return hits[0];
    const lower = name.toLowerCase();
    const folded = all.filter((c) => c.name.toLowerCase() === lower);
    if (folded.length === 1) return folded[0];
    const foldedPrefix = hits.length ? [] : all.filter((c) => c.name.toLowerCase().startsWith(lower));
    return foldedPrefix.length === 1 ? foldedPrefix[0] : null;
  }
  /**
   * Resolve a parsed line: `:q!` is tried as written first (it may be an
   * alias), then without its bang.
   */
  resolveLine(parsed) {
    const direct = this.resolve(parsed.name);
    if (direct) return { command: direct, bang: parsed.bang };
    if (parsed.bang) {
      const bare = this.resolve(parsed.name.slice(0, -1));
      if (bare) return { command: bare, bang: true };
    }
    return null;
  }
  /**
   * The wildmenu's rows for a partly typed line: command names for the first
   * word, the command's own `complete()` after that.
   */
  completions(text) {
    const trimmed = text.replace(/^\s+/, "");
    const parts = trimmed.split(/\s+/);
    if (parts.length <= 1) {
      const word2 = parts[0] ?? "";
      return this.list().filter((c) => !c.hidden && c.name.startsWith(word2)).map((c) => {
        const row = { value: c.name, label: ":" + c.name };
        if (c.desc) row.hint = c.desc;
        return row;
      });
    }
    const command = this.resolve(parts[0]);
    if (!command?.complete) return [];
    const word = parts[parts.length - 1] ?? "";
    const head = parts.slice(0, -1).join(" ");
    return command.complete(word, parts.slice(1, -1)).filter((c) => c.value.startsWith(word)).map((c) => ({ ...c, label: c.label ?? c.value, value: head + " " + c.value }));
  }
};

// src/core/i18n.ts
var defaultMessages = {
  // ---- modes, as the status line prints them
  "mode.normal": "NORMAL",
  "mode.insert": "INSERT",
  "mode.cmdline": "COMMAND",
  "mode.hints": "HINTS",
  // ---- :help sections
  "section.motion": "Motion",
  "section.links": "Links",
  "section.go": "Go",
  "section.search": "Search",
  "section.yank": "Yank",
  "section.marks": "Marks",
  "section.ui": "UI",
  "section.lazykeys": "LazyKeys",
  "section.leader": "Leader",
  "section.other": "Other",
  "section.commands": "Command line",
  "section.leftAlone": "Left alone on purpose",
  // ---- which-key group names
  "group.goto": "goto",
  "group.yank": "yank",
  "group.quit": "quit",
  "group.prev": "prev",
  "group.next": "next",
  "group.leader": "leader",
  "group.file": "file/find",
  "group.git": "git",
  "group.search": "search",
  "group.ui": "ui/toggle",
  "group.code": "code",
  "group.buffer": "buffer",
  "group.session": "quit/session",
  // ---- key descriptions
  "key.down": "Down a step (also Ctrl-E)",
  "key.up": "Up a step (also Ctrl-Y)",
  "key.halfDown": "Half a screen down (also Ctrl-D)",
  "key.halfUp": "Half a screen up (also Ctrl-U)",
  "key.top": "Top of the page — {count}gg is that percent",
  "key.bottom": "Bottom — {count}G is that percent down",
  "key.percent": "{count}% down the page",
  "key.nextSection": "Next heading",
  "key.prevSection": "Previous heading",
  "key.back": "Back in history",
  "key.forward": "Forward in history",
  "key.reload": "Reload",
  "key.field": "Into the first text field (also i)",
  "key.hint": "Hint every link in view, then type its label (also s)",
  "key.hintNewTab": "Same, but open it in a new tab",
  "key.find": "Find on this page",
  "key.findNext": "Next match",
  "key.findPrev": "Previous match",
  "key.cmdline": "Command line — :help lists every command",
  "key.yankUrl": "This page's URL",
  "key.yankLink": "Title and URL, as markdown",
  "key.help": "This help",
  "key.quit": "Turn LazyKeys off",
  "key.setMark": "Set a mark here — uppercase marks span the site",
  "key.jumpMark": "Jump to a mark",
  "key.explorer": "Explorer",
  "key.buffers": "Switch buffer",
  "key.recent": "Recent pages",
  "key.outline": "Outline of this page",
  "key.symbols": "Goto symbol (outline)",
  "key.quickSettings": "Quick settings",
  "key.history": "Command history",
  "key.keymaps": "Keymaps",
  "key.marks": "Marks",
  "key.notifications": "Notifications",
  "key.dismiss": "Dismiss notifications",
  "key.hlsearch": "Highlight matches",
  "key.statusline": "Status line",
  "key.whichkey": "This helper",
  "key.zen": "Zen mode",
  "key.checkhealth": "Checkhealth",
  "key.lazy": "Lazy",
  "key.count": "Before a motion, repeats it: 5j, 3}, 40%",
  // ---- ex command descriptions
  "cmd.help": "The keymap and this list",
  "cmd.set": "Read or change a setting — :set alone lists them",
  "cmd.quit": "Turn LazyKeys off",
  "cmd.write": "Nothing to write — settings save themselves",
  "cmd.wq": "Write and quit, for the muscle memory",
  "cmd.explorer": "The explorer, on the side",
  "cmd.outline": "The headings of this page, on the side",
  "cmd.buffers": "Pages visited this session",
  "cmd.options": "The settings, in the sidebar",
  "cmd.zen": "Hide everything but the content",
  "cmd.nohlsearch": "Stop highlighting the last search",
  "cmd.marks": "List the marks you have set",
  "cmd.messages": "Everything LazyKeys has said",
  "cmd.history": "The : and / lines you have run",
  "cmd.lazy": "Every plugin loaded, and what it cost",
  "cmd.checkhealth": "Whether everything LazyKeys leans on is here",
  "cmd.version": "What this is",
  // ---- messages
  "msg.on": "LazyKeys on",
  "msg.off": "LazyKeys off",
  "msg.introTitle": "LazyKeys",
  "msg.intro": "Press {leader} for the map, ? for the manual, :q to leave.",
  "msg.noSections": "no sections here",
  "msg.noField": "nothing to type into on this page",
  "msg.yanked": "yanked {what}",
  "msg.yankUrl": "the URL",
  "msg.yankLink": "a markdown link",
  "msg.clipboardFailed": "could not reach the clipboard",
  "msg.markInvalid": "marks are a-z (this page) and A-Z (site-wide)",
  "msg.markSet": "mark {mark} set",
  "msg.markSetGlobal": "mark {mark} set (site-wide)",
  "msg.markUnset": "mark {mark} is not set",
  "msg.noMarks": "no marks set — m{a-z} sets one, '{a-z} jumps back",
  "msg.noHints": "nothing to hint in view",
  "msg.hintsActive": "Link hints: type a label, Escape to cancel",
  "msg.notFound": "/{pattern} — not found",
  "msg.searchPos": "/{pattern}  [{index}/{total}]",
  "msg.noMatches": "no matches",
  "msg.noPrevSearch": "no previous search",
  "msg.notCommand": "E492: not an editor command: {name}",
  "msg.noHistory": "no history yet",
  "msg.written": "every setting is written the moment it changes",
  "msg.version": "LazyKeys {version} — a keymap over a web page. Not actually vim.",
  "msg.unavailable": "{what} is not available",
  "msg.failed": "{what} failed",
  "msg.zenOn": "zen mode — the page and nothing else",
  "msg.zenOff": "zen mode off",
  "msg.toggled": "{label} {state}",
  "msg.on.short": "on",
  "msg.off.short": "off",
  // ---- :set
  "set.title": "Options",
  "set.note": "Set one with :set scroll=120, :set nostatusline, :set hlsearch! to flip it, or :set scroll? to ask.",
  "set.unknown": "E518: unknown option: {name}",
  "set.invalid": "E474: invalid argument: {arg}",
  "set.number": "E521: number required after =: {arg}",
  "set.values": "E474: invalid argument: {arg} — one of {values}",
  // ---- command line
  "cmdline.title": "Cmdline",
  "cmdline.searchTitle": "Search",
  "cmdline.label": "Command line",
  "cmdline.searchLabel": "Find on this page",
  "cmdline.completions": "{n} ⇥",
  "cmdline.matches": "{n} matches",
  "cmdline.noMatches": "no matches",
  // ---- floats and pickers
  "float.close": "Close",
  "foot.move": "move",
  "foot.open": "open",
  "foot.filter": "filter",
  "foot.close": "close",
  "foot.scroll": "scroll",
  "foot.choose": "choose",
  "help.title": "Keymap",
  "help.intro": "Press {leader} and wait: every key that can follow it appears in the corner. That panel and this list are drawn from the same table the keys dispatch through, so neither can be out of date.",
  "pass.C-f": "Native find stays native — / is here as well",
  "pass.C-k": "The browser (or the page’s own palette) keeps it",
  "pass.meta": "Every Cmd and Alt combination belongs to the browser",
  "messages.title": "Messages",
  "messages.empty": "Nothing has been said yet.",
  "marks.title": "Marks",
  "marks.header": "mark  line  page",
  "history.title": "History",
  "lazy.title": "Lazy",
  "lazy.summary": "{n} plugins loaded in {ms}ms",
  "lazy.detail": "{keys} keys · {commands} cmds",
  "lazy.disabled": "disabled",
  "health.title": "checkhealth",
  "health.ok": "OK",
  "health.warn": "WARNING",
  "health.error": "ERROR",
  "health.core": "lazykeys",
  "health.browser": "browser",
  "health.enabled": "LazyKeys is {state}",
  "health.leader": "leader is {leader}",
  "health.keymap": "keymap",
  "health.bindings": "{n} bindings",
  "health.commands": "ex commands",
  "health.whichkey": "which-key",
  "health.after": "after {ms}ms",
  "health.storage": "settings storage",
  "health.highlight": "CSS Custom Highlight API",
  "health.highlightDetail": "what / paints matches with — without it, n still jumps",
  "health.clipboard": "clipboard",
  "health.clipboardDetail": "yy and yt fall back to execCommand",
  "health.local": "localStorage",
  "health.localDetail": "where the settings live, with the default adapter",
  "health.session": "sessionStorage",
  "health.sessionDetail": "marks, buffers and : history",
  "health.motion": "reduced motion",
  "health.motionDetail": "smooth scrolling is forced off when this is set",
  // ---- which-key
  "whichkey.label": "Keys after {seq}",
  // ---- sidebar
  "sidebar.label": "Sidebar",
  "sidebar.filter": "filter",
  "sidebar.filterLabel": "Filter the list",
  "sidebar.loading": "Loading…",
  "sidebar.empty": "Nothing here.",
  "sidebar.noMatch": "Nothing matches “{filter}”.",
  "sidebar.reloaded": "{source} reloaded",
  "sidebar.noSources": "the sidebar has no sources",
  "sidebar.unknownSource": "no sidebar source called {source}",
  "sidebar.textSetting": "{label} is text — :set {option}= changes it",
  "source.explorer": "Explorer",
  "source.outline": "Outline",
  "source.buffers": "Buffers",
  "source.settings": "Settings",
  // ---- status line
  "status.label": "Status line",
  "status.home": "main",
  // ---- settings rows
  "settings.group": "LazyKeys",
  "setting.enabled": "LazyKeys",
  "setting.enabled.help": "The modal keymap over the whole page.",
  "setting.leader": "Leader key",
  "setting.leader.help": "The key that opens the helper: space, a comma or a backslash.",
  "setting.whichkey": "Key helper",
  "setting.whichkey.help": "Leave a prefix hanging and a panel lists everything that can follow it.",
  "setting.timeoutlen": "Helper delay (ms)",
  "setting.timeoutlen.help": "How long a prefix waits before the helper appears, so a fluent gg never flashes a panel. The leader never waits.",
  "setting.cmdline": "Command line",
  "setting.cmdline.help": '"popup" floats : and / over the page; "bottom" is the classic line along the edge.',
  "setting.sidebar": "Sidebar side",
  "setting.sidebar.help": "Which edge the sidebar opens on. The which-key panel takes the other corner.",
  "setting.notify": "Notifications",
  "setting.notify.help": "Messages also rise in the corner and fade. :messages has the log either way.",
  "setting.statusline": "Status line",
  "setting.statusline.help": "The bar along the bottom: mode, pending keys, search position and scroll position.",
  "setting.hintchars": "Hint characters",
  "setting.hintchars.help": "The alphabet f builds labels from.",
  "setting.scroll": "Scroll step (px)",
  "setting.scroll.help": "How far one j or k moves. Counts multiply it.",
  "setting.smoothscroll": "Smooth scrolling",
  "setting.smoothscroll.help": "Animate motions instead of landing on them. Off while reduced motion is asked for.",
  "setting.hlsearch": "Highlight search matches",
  "setting.hlsearch.help": "Paint every match of a / search, not just the current one.",
  "setting.ignorecase": "Ignore case when searching",
  "setting.ignorecase.help": "With smartcase: an uppercase letter in the pattern means you meant it."
};
function createTranslator(overrides = {}) {
  const table = { ...defaultMessages, ...overrides };
  return (key, vars) => {
    const template = table[key] ?? key;
    if (!vars) return template;
    return template.replace(
      /\{(\w+)\}/g,
      (whole, name) => Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole
    );
  };
}

// src/core/keymap.ts
var Keymap = class {
  constructor() {
    this.slots = /* @__PURE__ */ new Map();
    this.groups = /* @__PURE__ */ new Map();
    this.prefixCache = null;
    this.listeners = /* @__PURE__ */ new Set();
  }
  /** Add a binding. Returns the function that removes exactly this one. */
  set(seq, spec, plugin) {
    const canonical = normalizeSeq(seq);
    if (!canonical) throw new Error(`lazykeys: empty key sequence`);
    let slot;
    if (spec === false) {
      slot = { entry: null };
    } else {
      const base = typeof spec === "function" ? { run: spec } : spec;
      if (typeof base.run !== "function") {
        throw new Error(`lazykeys: the binding for '${seq}' has no run()`);
      }
      const entry = { ...base, seq: canonical, tokens: canonical.split(" ") };
      if (plugin !== void 0) entry.plugin = plugin;
      slot = { entry };
    }
    const stack = this.slots.get(canonical) ?? [];
    stack.push(slot);
    this.slots.set(canonical, stack);
    this.changed();
    return () => {
      const list = this.slots.get(canonical);
      if (!list) return;
      const at = list.indexOf(slot);
      if (at === -1) return;
      list.splice(at, 1);
      if (!list.length) this.slots.delete(canonical);
      this.changed();
    };
  }
  /** Name a prefix, which-key style. `'+file'` and `'file'` are the same. */
  group(prefix, label) {
    const canonical = normalizeSeq(prefix);
    const clean = label.replace(/^\+/, "");
    const stack = this.groups.get(canonical) ?? [];
    stack.push(clean);
    this.groups.set(canonical, stack);
    this.changed();
    return () => {
      const list = this.groups.get(canonical);
      if (!list) return;
      const at = list.lastIndexOf(clean);
      if (at !== -1) list.splice(at, 1);
      if (!list.length) this.groups.delete(canonical);
      this.changed();
    };
  }
  /** Apply a whole table at once. Returns one function that undoes all of it. */
  apply(table, plugin) {
    const undo = [];
    for (const [seq, mapping] of Object.entries(table)) {
      if (typeof mapping === "string") {
        undo.push(this.group(seq, mapping));
      } else {
        undo.push(this.set(seq, mapping, plugin));
      }
    }
    return () => undo.reverse().forEach((fn) => fn());
  }
  /** The live binding for a sequence, if there is one. */
  get(seq) {
    const stack = this.slots.get(seq) ?? this.slots.get(normalizeSeq(seq));
    const top = stack?.[stack.length - 1];
    return top?.entry ?? void 0;
  }
  /** Every live binding, in the order they were first mapped. */
  list() {
    const out = [];
    for (const stack of this.slots.values()) {
      const top = stack[stack.length - 1];
      if (top?.entry) out.push(top.entry);
    }
    return out;
  }
  /** Whether some longer binding starts with this sequence. Derived, never declared. */
  isPrefix(seq) {
    return this.prefixes().has(seq);
  }
  prefixes() {
    if (this.prefixCache) return this.prefixCache;
    const set = /* @__PURE__ */ new Set();
    for (const entry of this.list()) {
      for (let i = 1; i < entry.tokens.length; i++) {
        set.add(entry.tokens.slice(0, i).join(" "));
      }
    }
    this.prefixCache = set;
    return set;
  }
  groupLabel(prefix) {
    const stack = this.groups.get(prefix);
    return stack?.[stack.length - 1];
  }
  /** Every declared group label, for `:help`. */
  groupLabels() {
    const out = /* @__PURE__ */ new Map();
    for (const [prefix, stack] of this.groups) {
      const label = stack[stack.length - 1];
      if (label) out.set(prefix, label);
    }
    return out;
  }
  /**
   * The rows which-key shows under a hanging prefix: one per next token,
   * `+name` for tokens that open a further menu.
   */
  children(prefix) {
    const own = this.get(prefix);
    if (own?.arg) {
      return [
        {
          token: "",
          display: typeof own.arg === "string" ? own.arg : "{key}",
          label: own.desc ?? "",
          group: false
        }
      ];
    }
    const head = prefix ? prefix.split(" ") : [];
    const seen = /* @__PURE__ */ new Set();
    const rows = [];
    for (const entry of this.list()) {
      if (entry.tokens.length <= head.length) continue;
      if (head.some((t, i) => entry.tokens[i] !== t)) continue;
      const token = entry.tokens[head.length];
      if (seen.has(token)) continue;
      const child = [...head, token].join(" ");
      const command = this.get(child);
      const isPrefix = this.isPrefix(child);
      if (command && !command.hidden) {
        seen.add(token);
        rows.push({ token, display: tokenDisplay(token), label: command.desc ?? "", group: false });
        continue;
      }
      if (isPrefix && this.hasVisibleUnder(child)) {
        seen.add(token);
        const label = this.groupLabel(child) ?? token;
        rows.push({ token, display: tokenDisplay(token), label: "+" + label, group: true });
      }
    }
    rows.sort((a, b) => a.display.localeCompare(b.display));
    return rows;
  }
  hasVisibleUnder(prefix) {
    const head = prefix + " ";
    return this.list().some((e) => e.seq.startsWith(head) && !e.hidden);
  }
  /** Subscribe to changes. */
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  changed() {
    this.prefixCache = null;
    this.listeners.forEach((fn) => fn());
  }
};
function defaultSection(entry, keymap, leaderLabel) {
  if (entry.section) return entry.section;
  if (entry.tokens[0] === LEADER) {
    if (entry.tokens.length > 2) {
      const group2 = keymap.groupLabel(entry.tokens.slice(0, 2).join(" "));
      return group2 ? `${leaderLabel} · ${group2}` : leaderLabel;
    }
    return leaderLabel;
  }
  return "";
}

// src/core/settings.ts
function safeLocal() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}
function localStorageAdapter(namespace = "lazykeys") {
  const KEY = `${namespace}:settings`;
  let cache = null;
  function read() {
    if (cache) return cache;
    let parsed = null;
    try {
      const raw = safeLocal()?.getItem(KEY);
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = null;
    }
    cache = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    return cache;
  }
  return {
    get: (key) => read()[key],
    set(key, value) {
      const store = { ...read() };
      if (value === void 0) delete store[key];
      else store[key] = value;
      cache = store;
      try {
        const ls = safeLocal();
        if (!ls) return;
        if (Object.keys(store).length) ls.setItem(KEY, JSON.stringify(store));
        else ls.removeItem(KEY);
      } catch {
      }
    },
    subscribe(fn) {
      if (typeof window === "undefined") return () => {
      };
      const onStorage = (e) => {
        if (e.key !== KEY && e.key !== null) return;
        cache = null;
        fn(null);
      };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    }
  };
}
function memoryAdapter(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    get: (key) => store.get(key),
    set(key, value) {
      if (value === void 0) store.delete(key);
      else store.set(key, value);
    }
  };
}
var TRUE = /* @__PURE__ */ new Set(["true", "1", "on", "yes"]);
var FALSE = /* @__PURE__ */ new Set(["false", "0", "off", "no"]);
var Settings = class {
  constructor(adapter, overrides = {}) {
    this.adapter = adapter;
    this.overrides = overrides;
    this.rows = [];
    this.byKey = /* @__PURE__ */ new Map();
    this.byOption = /* @__PURE__ */ new Map();
    this.listeners = /* @__PURE__ */ new Set();
    this.unsubscribe = null;
    if (adapter.subscribe) {
      this.unsubscribe = adapter.subscribe((key) => this.emit(key, key === null ? void 0 : this.get(key)));
    }
  }
  /** Add rows. A row whose key exists replaces it. Returns the undo. */
  define(specs) {
    const added = [];
    for (const spec of specs) {
      const row = { ...spec };
      if (Object.prototype.hasOwnProperty.call(this.overrides, row.key)) {
        row.default = this.coerce(row, this.overrides[row.key]);
      }
      const existing = this.byKey.get(row.key);
      if (existing) this.rows = this.rows.filter((r) => r !== existing);
      this.rows.push(row);
      added.push(row);
    }
    this.reindex();
    return () => {
      this.rows = this.rows.filter((r) => !added.includes(r));
      this.reindex();
    };
  }
  reindex() {
    this.byKey.clear();
    this.byOption.clear();
    for (const row of this.rows) {
      this.byKey.set(row.key, row);
      if (row.option) this.byOption.set(row.option, row);
    }
  }
  schema() {
    return this.rows.slice();
  }
  /** A row by its key, or by its `:set` option name. */
  row(name) {
    return this.byKey.get(name) ?? this.byOption.get(name) ?? null;
  }
  /**
   * A stored value is only trusted as far as its own row allows: anything out
   * of range falls back to the default rather than reaching a feature.
   */
  coerce(row, value) {
    if (value === void 0 || value === null) return row.default;
    switch (row.type) {
      case "boolean":
        if (typeof value === "boolean") return value;
        if (typeof value === "string") {
          if (TRUE.has(value.toLowerCase())) return true;
          if (FALSE.has(value.toLowerCase())) return false;
        }
        if (typeof value === "number") return value !== 0;
        return row.default;
      case "number": {
        let n = typeof value === "number" ? value : parseFloat(String(value));
        if (!Number.isFinite(n)) return row.default;
        if (row.min !== void 0 && n < row.min) n = row.min;
        if (row.max !== void 0 && n > row.max) n = row.max;
        return n;
      }
      case "enum":
        return row.values?.includes(String(value)) ? String(value) : row.default;
      default: {
        const s = String(value);
        return s.length ? s : row.default;
      }
    }
  }
  /** Check a value typed by a person, rather than silently falling back. */
  validate(row, raw) {
    switch (row.type) {
      case "boolean": {
        const v = raw.toLowerCase();
        if (TRUE.has(v)) return { ok: true, value: true };
        if (FALSE.has(v)) return { ok: true, value: false };
        return { ok: true, value: v.length > 0 };
      }
      case "number": {
        const n = Number(raw);
        if (raw.trim() === "" || !Number.isFinite(n)) return { ok: false, error: "number" };
        return { ok: true, value: this.coerce(row, n) };
      }
      case "enum":
        return row.values?.includes(raw) ? { ok: true, value: raw } : { ok: false, error: "enum" };
      default:
        return raw.length ? { ok: true, value: raw } : { ok: false, error: "empty" };
    }
  }
  get(key) {
    const row = this.byKey.get(key);
    if (!row) return void 0;
    let stored;
    try {
      stored = this.adapter.get(key);
    } catch {
      stored = void 0;
    }
    return this.coerce(row, stored);
  }
  all() {
    const out = {};
    for (const row of this.rows) out[row.key] = this.get(row.key);
    return out;
  }
  /**
   * Write a value. Defaults are not written: the store stays a record of what
   * was actually chosen, so changing a default later reaches everyone who never
   * touched that row.
   */
  set(key, value) {
    const row = this.byKey.get(key);
    if (!row) return void 0;
    const previous = this.get(key);
    const next = this.coerce(row, value);
    try {
      this.adapter.set(key, next === row.default ? void 0 : next);
    } catch {
    }
    if (next !== previous) this.emit(key, next);
    return next;
  }
  toggle(key) {
    const row = this.byKey.get(key);
    if (!row || row.type !== "boolean") return void 0;
    return this.set(key, !this.get(key));
  }
  /** Every row back to its default. */
  reset() {
    for (const row of this.rows) {
      try {
        this.adapter.set(row.key, void 0);
      } catch {
      }
    }
    this.emit(null, void 0);
  }
  /** Subscribe to changes. `key` is null when anything may have changed. */
  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  destroy() {
    this.unsubscribe?.();
    this.listeners.clear();
  }
  emit(key, value) {
    for (const fn of [...this.listeners]) {
      try {
        fn(key, value);
      } catch (e) {
        console.error("lazykeys: a settings listener failed", e);
      }
    }
  }
};

// src/core/dom.ts
function h(tag, props = null, children = []) {
  const el = document.createElement(tag);
  if (props) {
    if (props.class) el.className = props.class;
    if (props.text !== void 0) el.textContent = props.text;
    if (props.attrs) {
      for (const [name, value] of Object.entries(props.attrs)) {
        if (value === null || value === void 0 || value === false) continue;
        el.setAttribute(name, value === true ? "" : String(value));
      }
    }
    if (props.style) {
      for (const [name, value] of Object.entries(props.style)) el.style.setProperty(name, String(value));
    }
    if (props.on) {
      for (const [name, fn] of Object.entries(props.on)) {
        if (fn) el.addEventListener(name, fn);
      }
    }
  }
  append(el, children);
  return el;
}
function append(parent, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === void 0 || child === false) continue;
    parent.appendChild(typeof child === "object" ? child : document.createTextNode(String(child)));
  }
}
function replace(parent, children) {
  while (parent.firstChild) parent.removeChild(parent.firstChild);
  append(parent, children);
}
function remove(node) {
  node?.parentNode?.removeChild(node);
}
function kbds(keys) {
  return keys.map((k) => h("kbd", { text: k }));
}
var ICONS = {
  branch: [
    ["line", { x1: 6, y1: 3, x2: 6, y2: 15 }],
    ["circle", { cx: 18, cy: 6, r: 3 }],
    ["circle", { cx: 6, cy: 18, r: 3 }],
    ["path", { d: "M18 9a9 9 0 0 1-9 9" }]
  ],
  search: [
    ["circle", { cx: 11, cy: 11, r: 8 }],
    ["line", { x1: 21, y1: 21, x2: 16.65, y2: 16.65 }]
  ],
  folder: [["path", { d: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" }]],
  file: [
    ["path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }],
    ["polyline", { points: "14 2 14 8 20 8" }]
  ],
  gear: [
    ["circle", { cx: 12, cy: 12, r: 3 }],
    ["path", { d: "M12 1v3M12 20v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M1 12h3M20 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" }]
  ],
  list: [
    ["line", { x1: 8, y1: 6, x2: 21, y2: 6 }],
    ["line", { x1: 8, y1: 12, x2: 21, y2: 12 }],
    ["line", { x1: 8, y1: 18, x2: 21, y2: 18 }],
    ["line", { x1: 3, y1: 6, x2: 3.01, y2: 6 }],
    ["line", { x1: 3, y1: 12, x2: 3.01, y2: 12 }],
    ["line", { x1: 3, y1: 18, x2: 3.01, y2: 18 }]
  ],
  layers: [
    ["polygon", { points: "12 2 2 7 12 12 22 7 12 2" }],
    ["polyline", { points: "2 17 12 22 22 17" }],
    ["polyline", { points: "2 12 12 17 22 12" }]
  ],
  command: [
    ["polyline", { points: "4 17 10 11 4 5" }],
    ["line", { x1: 12, y1: 19, x2: 20, y2: 19 }]
  ],
  chevron: [["polyline", { points: "9 18 15 12 9 6" }]],
  zap: [["polygon", { points: "13 2 3 14 12 14 11 22 21 10 12 10 13 2" }]],
  check: [["polyline", { points: "20 6 9 17 4 12" }]],
  alert: [
    ["circle", { cx: 12, cy: 12, r: 10 }],
    ["line", { x1: 12, y1: 8, x2: 12, y2: 12 }],
    ["line", { x1: 12, y1: 16, x2: 12.01, y2: 16 }]
  ],
  info: [
    ["circle", { cx: 12, cy: 12, r: 10 }],
    ["line", { x1: 12, y1: 16, x2: 12, y2: 12 }],
    ["line", { x1: 12, y1: 8, x2: 12.01, y2: 8 }]
  ],
  heart: [
    [
      "path",
      {
        d: "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1L12 21.2l7.7-7.8 1.1-1a5.5 5.5 0 0 0 0-7.8z"
      }
    ]
  ],
  keyboard: [
    ["rect", { x: 2, y: 5, width: 20, height: 14, rx: 2 }],
    ["line", { x1: 6, y1: 10, x2: 6.01, y2: 10 }],
    ["line", { x1: 10, y1: 10, x2: 10.01, y2: 10 }],
    ["line", { x1: 14, y1: 10, x2: 14.01, y2: 10 }],
    ["line", { x1: 18, y1: 10, x2: 18.01, y2: 10 }],
    ["line", { x1: 7, y1: 15, x2: 17, y2: 15 }]
  ],
  hash: [
    ["line", { x1: 4, y1: 9, x2: 20, y2: 9 }],
    ["line", { x1: 4, y1: 15, x2: 20, y2: 15 }],
    ["line", { x1: 10, y1: 3, x2: 8, y2: 21 }],
    ["line", { x1: 16, y1: 3, x2: 14, y2: 21 }]
  ],
  link: [
    ["path", { d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" }],
    ["path", { d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" }]
  ]
};
var SVG = "http://www.w3.org/2000/svg";
function icon(name, className = "") {
  const shapes = ICONS[name];
  if (!shapes) return h("span", { class: "lk-icon lk-icon--none", attrs: { "aria-hidden": "true" } });
  const svg = document.createElementNS(SVG, "svg");
  const attrs = {
    class: ("lk-icon " + className).trim(),
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": "2",
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    focusable: "false"
  };
  for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, v);
  for (const [tag, shapeAttrs] of shapes) {
    const node = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(shapeAttrs)) node.setAttribute(k, String(v));
    svg.appendChild(node);
  }
  return svg;
}
var iconNames = Object.keys(ICONS);

// src/core/ui.ts
function createUi(deps) {
  const { t } = deps;
  let rootEl = null;
  let srEl = null;
  let current = null;
  let floatSeq = 0;
  function root() {
    if (!rootEl) rootEl = h("div", { class: "lk-root", attrs: { "data-lazykeys": "" } });
    if (!rootEl.isConnected) deps.mount().appendChild(rootEl);
    return rootEl;
  }
  function announce(text) {
    if (!text) return;
    if (!srEl || !srEl.isConnected) {
      srEl = h("div", { class: "lk-sr", attrs: { "aria-live": "polite", role: "status" } });
      root().appendChild(srEl);
    }
    srEl.textContent = "";
    const el = srEl;
    setTimeout(() => {
      el.textContent = text;
    }, 30);
  }
  function footer(parts) {
    const children = [];
    parts.forEach(([keys, label], i) => {
      if (i) children.push(h("span", { class: "lk-dot", text: " · ", attrs: { "aria-hidden": "true" } }));
      children.push(...kbds(keys), " " + label);
    });
    return h("div", { class: "lk-foot" }, children);
  }
  function closeFloat() {
    if (!current) return;
    const { handle, pop, restore, onClose } = current;
    current = null;
    pop();
    remove(handle.el);
    if (restore && restore.focus && restore.isConnected) {
      try {
        restore.focus({ preventScroll: true });
      } catch {
      }
    }
    onClose?.();
  }
  function float(opts) {
    closeFloat();
    const titleId = `lk-float-title-${++floatSeq}`;
    const body = h("div", { class: "lk-float-body", attrs: { tabindex: "0" } }, opts.body);
    const win = h(
      "div",
      { class: "lk-float-win", style: opts.width ? { width: opts.width } : {} },
      [
        h("div", { class: "lk-float-title", attrs: { id: titleId } }, [
          icon(opts.icon ?? "command"),
          h("span", { text: opts.title })
        ]),
        body,
        opts.footer !== void 0 ? h("div", { class: "lk-float-footwrap" }, opts.footer) : footer([
          [["j", "k"], t("foot.scroll")],
          [["q"], t("foot.close")]
        ])
      ]
    );
    const el = h(
      "div",
      {
        class: ("lk-float " + (opts.class ?? "")).trim(),
        attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": titleId },
        on: {
          mousedown: (e) => {
            if (e.target === el) closeFloat();
          }
        }
      },
      win
    );
    const handle = {
      el,
      body,
      close: closeFloat,
      setBody: (children) => replace(body, children)
    };
    const layer = {
      name: "float",
      onKey(e) {
        if (e.metaKey || e.altKey) return false;
        if (opts.onKey && opts.onKey(e) === true) return true;
        const key = e.key;
        if (key === "Escape" || key === "q" || key === "?") {
          closeFloat();
          return true;
        }
        let by = 0;
        if (key === "j" || key === "ArrowDown") by = 60;
        else if (key === "k" || key === "ArrowUp") by = -60;
        else if (key === "d" && e.ctrlKey) by = body.clientHeight / 2;
        else if (key === "u" && e.ctrlKey) by = -body.clientHeight / 2;
        else if (key === "G") by = body.scrollHeight;
        else if (key === "g") {
          body.scrollTop = 0;
          return true;
        }
        if (by) {
          body.scrollTop += by;
          return true;
        }
        if (key === "Tab") return true;
        return false;
      }
    };
    const restore = typeof document !== "undefined" ? document.activeElement : null;
    root().appendChild(el);
    const pop = deps.pushLayer(layer);
    current = { handle, pop, restore, ...opts.onClose ? { onClose: opts.onClose } : {} };
    try {
      body.focus({ preventScroll: true });
    } catch {
    }
    return handle;
  }
  function picker(opts) {
    const items = opts.items;
    let sel = Math.max(0, Math.min(opts.selected ?? 0, items.length - 1));
    const listId = `lk-picker-${floatSeq + 1}`;
    const list = h("ul", { class: "lk-picker", attrs: { role: "listbox", id: listId } });
    function draw() {
      replace(
        list,
        items.map(
          (item, i) => h(
            "li",
            {
              class: i === sel ? "is-selected" : "",
              attrs: { role: "option", "aria-selected": i === sel ? "true" : "false", "data-i": i },
              on: {
                click: () => choose(i)
              }
            },
            [
              h("span", { class: "lk-picker-label", text: item.label }),
              item.hint ? h("span", { class: "lk-picker-hint", text: item.hint }) : null
            ]
          )
        )
      );
      const node = list.children[sel];
      node?.scrollIntoView?.({ block: "nearest" });
    }
    function choose(i) {
      const item = items[i];
      closeFloat();
      if (item) opts.onChoose(item, i);
    }
    draw();
    return float({
      title: opts.title,
      icon: opts.icon ?? "list",
      width: opts.width ?? "min(420px, 92vw)",
      class: "lk-float--picker",
      body: list,
      footer: footer([
        [["j", "k"], t("foot.move")],
        [["↵"], t("foot.choose")],
        [["q"], t("foot.close")]
      ]),
      onKey(e) {
        if (!items.length) return false;
        if (e.key === "j" || e.key === "ArrowDown" || e.ctrlKey && e.key === "n") {
          sel = (sel + 1) % items.length;
          draw();
          return true;
        }
        if (e.key === "k" || e.key === "ArrowUp" || e.ctrlKey && e.key === "p") {
          sel = (sel - 1 + items.length) % items.length;
          draw();
          return true;
        }
        if (e.key === "Enter") {
          choose(sel);
          return true;
        }
        return false;
      }
    });
  }
  return {
    root,
    icon,
    float,
    closeFloat,
    floatIsOpen: () => current !== null,
    remount() {
      if (rootEl && !rootEl.isConnected) deps.mount().appendChild(rootEl);
    },
    picker,
    footer,
    announce,
    destroy() {
      closeFloat();
      remove(rootEl);
      rootEl = null;
      srEl = null;
    }
  };
}

// src/plugins/util.ts
function definePlugin(spec) {
  return spec;
}
function toggleSetting(ctx, key) {
  const row = ctx.settings.row(key);
  const value = ctx.settings.toggle(key);
  if (value === void 0) return;
  ctx.lk.echo(
    ctx.t("msg.toggled", {
      label: row?.label ?? key,
      state: ctx.t(value ? "msg.on.short" : "msg.off.short")
    }),
    "success"
  );
}
function inView(el) {
  const rects = el.getClientRects();
  if (!rects.length) return false;
  const r = rects[0];
  if (r.width < 2 || r.height < 2) return false;
  if (r.bottom < 0 || r.top > window.innerHeight) return false;
  if (r.right < 0 || r.left > window.innerWidth) return false;
  const style = window.getComputedStyle(el);
  return style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
}
function isExcluded(el, selector) {
  if (!selector) return false;
  try {
    return !!el.closest(selector);
  } catch {
    return false;
  }
}
function copyText(text) {
  const fallback = () => new Promise((resolve, reject) => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.setProperty("position", "fixed");
    ta.style.setProperty("opacity", "0");
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    document.body.removeChild(ta);
    if (ok) resolve();
    else reject(new Error("copy failed"));
  });
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(fallback);
  }
  return fallback();
}
function sidebarSide(ctx) {
  return ctx.settings.get("sidebar") === "left" ? "left" : "right";
}

// src/plugins/cmdline.ts
var HISTORY = "history";
function createCmdline(ctx) {
  const { t, lk } = ctx;
  const factories = /* @__PURE__ */ new Map();
  let el = null;
  let input;
  let hintEl;
  let menuEl;
  let titleEl;
  let iconEl;
  let prefixEl;
  let current = null;
  let pop = null;
  let histIndex = -1;
  let menuItems = [];
  let menuSel = -1;
  let seq = 0;
  const readHistory = () => {
    const list = ctx.session.get(HISTORY, []);
    return Array.isArray(list) ? list.filter((x) => typeof x === "string") : [];
  };
  function remember(line) {
    const list = readHistory().filter((l) => l !== line);
    list.push(line);
    ctx.session.set(HISTORY, list.slice(-50));
  }
  function build() {
    if (el) {
      if (!el.isConnected) ctx.ui.root().appendChild(el);
      return;
    }
    const menuId = `lk-cmdline-menu-${++seq}`;
    input = h("input", {
      class: "lk-cmdline-input",
      attrs: {
        type: "text",
        autocomplete: "off",
        autocorrect: "off",
        autocapitalize: "off",
        spellcheck: "false",
        role: "combobox",
        "aria-autocomplete": "list",
        "aria-expanded": "false",
        "aria-controls": menuId
      },
      on: {
        input: () => onInput(),
        blur: () => {
          setTimeout(() => {
            if (current && document.activeElement !== input) cancel();
          }, 0);
        }
      }
    });
    hintEl = h("span", { class: "lk-cmdline-hint", attrs: { "aria-live": "polite" } });
    titleEl = h("span", { class: "lk-cmdline-title" });
    iconEl = h("span", { class: "lk-cmdline-icon", attrs: { "aria-hidden": "true" } });
    prefixEl = h("span", { class: "lk-cmdline-prefix", attrs: { "aria-hidden": "true" } });
    menuEl = h("div", {
      class: "lk-cmdline-menu",
      attrs: { role: "listbox", id: menuId },
      on: {
        mousedown: (e) => {
          e.preventDefault();
          const item = e.target.closest?.("[data-i]");
          if (!item) return;
          selectMenu(parseInt(item.getAttribute("data-i") ?? "0", 10));
          input.focus();
        }
      }
    });
    el = h("div", { class: "lk-cmdline", attrs: { hidden: true } }, [
      h("div", { class: "lk-cmdline-box" }, [titleEl, h("div", { class: "lk-cmdline-line" }, [iconEl, prefixEl, input, hintEl])]),
      menuEl
    ]);
    ctx.ui.root().appendChild(el);
  }
  function renderMenu() {
    const open = menuItems.length > 0;
    input.setAttribute("aria-expanded", open ? "true" : "false");
    menuEl.classList.toggle("is-open", open);
    if (!open) {
      replace(menuEl, []);
      input.removeAttribute("aria-activedescendant");
      return;
    }
    replace(
      menuEl,
      menuItems.slice(0, 12).map(
        (item, i) => h(
          "div",
          {
            class: "lk-cmdline-item" + (i === menuSel ? " is-selected" : ""),
            attrs: {
              role: "option",
              id: `${menuEl.id}-${i}`,
              "aria-selected": i === menuSel ? "true" : "false",
              "data-i": i
            }
          },
          [
            h("span", { class: "lk-cmdline-item-key", text: item.label ?? item.value }),
            item.hint ? h("span", { class: "lk-cmdline-item-doc", text: item.hint }) : null
          ]
        )
      )
    );
    if (menuSel >= 0) {
      input.setAttribute("aria-activedescendant", `${menuEl.id}-${menuSel}`);
      menuEl.children[menuSel]?.scrollIntoView?.({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }
  function selectMenu(i) {
    if (!menuItems.length) return;
    const shown = Math.min(menuItems.length, 12);
    menuSel = (i % shown + shown) % shown;
    input.value = menuItems[menuSel].value;
    renderMenu();
  }
  function setHint(text, empty = false) {
    hintEl.textContent = text;
    hintEl.setAttribute("data-empty", empty ? "true" : "false");
  }
  function onInput() {
    if (!current) return;
    const value = input.value;
    if (current.onInput) {
      const r = current.onInput(value);
      setHint(r?.hint ?? "", !!r?.empty);
    }
    if (current.complete) {
      menuItems = current.complete(value);
      menuSel = -1;
      if (menuItems.length === 1 && menuItems[0]?.value === value) menuItems = [];
      if (!current.onInput) setHint(menuItems.length ? t("cmdline.completions", { n: menuItems.length }) : "");
      renderMenu();
    }
  }
  function walkHistory(delta) {
    if (!current) return;
    const prefix = current.prefix;
    const all = readHistory().filter((l) => l.startsWith(prefix));
    if (!all.length) return;
    if (histIndex === -1) histIndex = all.length;
    histIndex = Math.max(0, Math.min(histIndex + delta, all.length));
    input.value = histIndex === all.length ? "" : all[histIndex].slice(prefix.length);
    onInput();
  }
  function close() {
    if (!el || !current) return;
    current = null;
    pop?.();
    pop = null;
    el.hidden = true;
    el.classList.remove("is-open");
    menuItems = [];
    menuSel = -1;
    renderMenu();
    setHint("");
    if (document.activeElement === input) input.blur();
    if (lk.mode() === "cmdline") lk.setMode("normal");
  }
  function cancel() {
    const was = current;
    close();
    was?.onCancel?.();
  }
  function accept() {
    const was = current;
    if (!was) return;
    const value = input.value;
    close();
    if (!value.trim()) return;
    remember(was.prefix + value);
    was.onAccept(value);
  }
  function onKey(e) {
    if (!current) return false;
    if (e.key === "Escape") {
      cancel();
      return true;
    }
    if (e.key === "Enter") {
      accept();
      return true;
    }
    if (e.key === "Tab") {
      if (current.complete) {
        if (!menuItems.length) menuItems = current.complete(input.value);
        if (menuItems.length) selectMenu(menuSel + (e.shiftKey ? -1 : 1));
      }
      return true;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (menuItems.length && !e.ctrlKey) selectMenu(menuSel + (e.key === "ArrowDown" ? 1 : -1));
      else walkHistory(e.key === "ArrowUp" ? -1 : 1);
      return true;
    }
    if (e.ctrlKey && !e.metaKey && (e.key === "n" || e.key === "p")) {
      walkHistory(e.key === "p" ? -1 : 1);
      return true;
    }
    if (e.key === "Backspace" && input.value === "") {
      cancel();
      return true;
    }
    if (document.activeElement !== input) input.focus();
    return false;
  }
  function prompt(opts) {
    if (current) close();
    build();
    const node = el;
    current = opts;
    histIndex = -1;
    menuItems = [];
    menuSel = -1;
    const kind = opts.kind ?? (opts.prefix === ":" ? "cmd" : "prompt");
    node.setAttribute("data-shape", ctx.settings.get("cmdline") === "bottom" ? "bottom" : "popup");
    node.setAttribute("data-kind", kind);
    prefixEl.textContent = opts.prefix;
    titleEl.textContent = opts.title ?? "";
    replace(iconEl, icon(opts.icon ?? "command"));
    input.setAttribute("aria-label", opts.label ?? opts.title ?? t("cmdline.label"));
    input.value = opts.initial ?? "";
    setHint("");
    renderMenu();
    node.hidden = false;
    node.classList.add("is-open");
    pop = ctx.pushLayer({ name: "cmdline", onKey });
    lk.setMode("cmdline");
    input.focus();
    if (input.value) onInput();
  }
  const api = {
    open(prefix = ":", initial = "") {
      const factory = factories.get(prefix);
      if (!factory) {
        lk.echo(t("msg.unavailable", { what: prefix }), "error");
        return;
      }
      prompt({ ...factory(), initial });
    },
    define(prefix, factory) {
      factories.set(prefix, factory);
      return () => {
        if (factories.get(prefix) === factory) factories.delete(prefix);
      };
    },
    prompt,
    close: cancel,
    active: () => current !== null,
    history: readHistory
  };
  api.define(":", () => ({
    prefix: ":",
    title: t("cmdline.title"),
    label: t("cmdline.label"),
    icon: "command",
    kind: "cmd",
    complete: (value) => lk.complete(value),
    onAccept: (value) => void lk.exec(value)
  }));
  return api;
}
var cmdline = definePlugin({
  name: "cmdline",
  settings: ({ t }) => [
    {
      key: "cmdline",
      option: "cmdline",
      type: "enum",
      values: ["popup", "bottom"],
      default: "popup",
      group: t("settings.group"),
      label: t("setting.cmdline"),
      help: t("setting.cmdline.help")
    }
  ],
  keys: ({ lk, t }) => ({
    ":": {
      desc: t("key.cmdline"),
      section: t("section.search"),
      run: () => lk.use("cmdline")?.open(":")
    },
    "<leader> :": { desc: t("key.history"), run: () => void lk.exec("history") }
  }),
  commands: ({ lk, t, ui }) => [
    {
      name: "history",
      alias: ["his"],
      desc: t("cmd.history"),
      run() {
        const api = lk.use("cmdline");
        const all = api?.history() ?? [];
        if (!api || !all.length) {
          lk.echo(t("msg.noHistory"));
          return;
        }
        ui.picker({
          title: t("history.title"),
          icon: "command",
          items: all.slice().reverse().map((line) => ({ label: line })),
          onChoose: (item) => api.open(item.label.charAt(0), item.label.slice(1))
        });
      }
    }
  ],
  setup(ctx) {
    const api = createCmdline(ctx);
    ctx.provide("cmdline", api);
    const offs = [ctx.lk.on("disable", api.close), ctx.lk.on("navigate", api.close)];
    return () => {
      api.close();
      offs.forEach((off) => off());
    };
  }
});

// src/core/set.ts
function parseSetArg(arg) {
  const text = arg.trim();
  const eq = text.search(/[=:]/);
  if (eq > 0) {
    return { name: text.slice(0, eq), op: "assign", value: text.slice(eq + 1) };
  }
  if (text.endsWith("?")) return { name: text.slice(0, -1), op: "ask" };
  if (text.endsWith("!")) return { name: text.slice(0, -1), op: "toggle" };
  return { name: text, op: "on" };
}
function formatOption(row, value) {
  const name = row.option ?? row.key;
  if (row.type === "boolean") return (value ? "  " : "no") + name;
  return "  " + name + "=" + String(value);
}
function resolveOption(settings, name) {
  const direct = settings.row(name);
  if (direct?.option) return { row: direct, negated: false, inverted: false };
  if (name.startsWith("no")) {
    const row = settings.row(name.slice(2));
    if (row?.option) return { row, negated: true, inverted: false };
  }
  if (name.startsWith("inv")) {
    const row = settings.row(name.slice(3));
    if (row?.option) return { row, negated: false, inverted: true };
  }
  return null;
}
function applySet(settings, argv, t) {
  return argv.map((arg) => {
    const parsed = parseSetArg(arg);
    const found = resolveOption(settings, parsed.name);
    if (!found) return { ok: false, message: t("set.unknown", { name: parsed.name }) };
    const { row, negated, inverted } = found;
    const show = () => formatOption(row, settings.get(row.key)).trim();
    if (parsed.op === "ask") return { ok: true, message: show() };
    if (parsed.op === "assign") {
      if (negated || inverted) return { ok: false, message: t("set.invalid", { arg }) };
      const check = settings.validate(row, parsed.value ?? "");
      if (!check.ok) {
        if (check.error === "number") return { ok: false, message: t("set.number", { arg }) };
        if (check.error === "enum") {
          return {
            ok: false,
            message: t("set.values", { arg, values: (row.values ?? []).join(", ") })
          };
        }
        return { ok: false, message: t("set.invalid", { arg }) };
      }
      settings.set(row.key, check.value);
      return { ok: true, message: show(), changed: true };
    }
    if (row.type !== "boolean") {
      if (parsed.op === "on" && !negated && !inverted) return { ok: true, message: show() };
      return { ok: false, message: t("set.invalid", { arg }) };
    }
    if (parsed.op === "toggle" || inverted) settings.toggle(row.key);
    else settings.set(row.key, !negated);
    return { ok: true, message: show(), changed: true };
  });
}
function setCompletions(settings) {
  const pool = [];
  for (const row of settings.schema()) {
    if (!row.option) continue;
    pool.push({ value: row.option, hint: row.label ?? row.key });
    if (row.type === "boolean") pool.push({ value: "no" + row.option, hint: row.label ?? row.key });
    if (row.type === "enum") {
      for (const v of row.values ?? []) pool.push({ value: `${row.option}=${v}`, hint: row.label ?? row.key });
    }
  }
  return pool;
}

// src/version.ts
var VERSION = "0.1.0";

// src/plugins/core.ts
function storageWorks(kind) {
  try {
    const store = kind === "local" ? localStorage : sessionStorage;
    store.setItem("lazykeys:probe", "1");
    store.removeItem("lazykeys:probe");
    return true;
  } catch {
    return false;
  }
}
function healthList(ctx, items) {
  return h(
    "ul",
    { class: "lk-health" },
    items.map((item) => {
      const state = item.ok === true ? "ok" : item.ok === false ? "error" : "warn";
      return h("li", { attrs: { "data-state": state } }, [
        h("b", { text: ctx.t(`health.${state}`) }),
        h("span", { text: item.label }),
        item.detail ? h("em", { text: item.detail }) : null
      ]);
    })
  );
}
function openSetList(ctx) {
  const lines = ctx.settings.schema().filter((row) => row.option).map((row) => formatOption(row, ctx.settings.get(row.key)));
  ctx.ui.float({
    title: ctx.t("set.title"),
    icon: "gear",
    class: "lk-float--options",
    body: [h("pre", { class: "lk-pre", text: lines.join("\n") }), h("p", { class: "lk-note", text: ctx.t("set.note") })]
  });
}
var core = definePlugin({
  name: "core",
  settings: ({ t }) => [
    {
      key: "enabled",
      type: "boolean",
      default: true,
      hidden: true,
      group: t("settings.group"),
      label: t("setting.enabled"),
      help: t("setting.enabled.help")
    },
    {
      key: "leader",
      option: "leader",
      type: "enum",
      values: ["space", ",", "\\"],
      default: "space",
      group: t("settings.group"),
      label: t("setting.leader"),
      help: t("setting.leader.help")
    },
    {
      key: "timeoutlen",
      option: "timeoutlen",
      type: "number",
      default: 250,
      min: 0,
      max: 2e3,
      step: 50,
      group: t("settings.group"),
      label: t("setting.timeoutlen"),
      help: t("setting.timeoutlen.help")
    }
  ],
  keys: ({ lk, t }) => ({
    g: "+" + t("group.goto"),
    y: "+" + t("group.yank"),
    Z: "+" + t("group.quit"),
    "[": "+" + t("group.prev"),
    "]": "+" + t("group.next"),
    "<leader> f": "+" + t("group.file"),
    "<leader> g": "+" + t("group.git"),
    "<leader> s": "+" + t("group.search"),
    "<leader> u": "+" + t("group.ui"),
    "<leader> c": "+" + t("group.code"),
    "<leader> b": "+" + t("group.buffer"),
    "<leader> q": "+" + t("group.session"),
    "Z Z": { desc: t("key.quit"), section: t("section.lazykeys"), run: () => lk.disable() },
    "<leader> q q": { desc: t("key.quit"), run: () => lk.disable() },
    "<leader> c h": { desc: t("key.checkhealth"), run: () => void lk.exec("checkhealth") },
    "<leader> l": { desc: t("key.lazy"), run: () => void lk.exec("Lazy") }
  }),
  commands: (ctx) => {
    const { lk, t, settings } = ctx;
    return [
      {
        name: "set",
        alias: ["se"],
        args: "[option]",
        desc: t("cmd.set"),
        run(argv) {
          if (!argv.length) {
            openSetList(ctx);
            return;
          }
          const results = applySet(settings, argv, t);
          const last = results[results.length - 1];
          const failed = results.find((r) => !r.ok);
          if (failed) lk.echo(failed.message, "error");
          else if (last) lk.echo(last.message, last.changed ? "success" : void 0);
        },
        complete: () => setCompletions(settings)
      },
      {
        name: "quit",
        alias: ["q", "q!", "qa", "qa!", "qall", "quitall"],
        desc: t("cmd.quit"),
        run: () => lk.disable()
      },
      { name: "write", alias: ["w"], desc: t("cmd.write"), run: () => lk.echo(t("msg.written")) },
      { name: "wq", alias: ["x", "xa", "wqa"], desc: t("cmd.wq"), run: () => lk.disable() },
      {
        name: "version",
        alias: ["ver"],
        desc: t("cmd.version"),
        run: () => lk.echo(t("msg.version", { version: VERSION }))
      },
      {
        name: "Lazy",
        alias: ["plugins"],
        desc: t("cmd.lazy"),
        run() {
          const plugins = lk.plugins().sort((a, b) => b.ms - a.ms);
          const total = plugins.reduce((sum, p) => sum + p.ms, 0);
          ctx.ui.float({
            title: t("lazy.title"),
            icon: "zap",
            class: "lk-float--lazy",
            body: [
              h("p", {
                class: "lk-note",
                text: t("lazy.summary", { n: plugins.length, ms: total.toFixed(2) })
              }),
              h(
                "ul",
                { class: "lk-lazy" },
                plugins.map(
                  (p) => h("li", null, [
                    h("span", { class: "lk-lazy-ok", text: "●", attrs: { "aria-hidden": "true" } }),
                    h("span", { class: "lk-lazy-name", text: p.name }),
                    h("span", { class: "lk-lazy-detail", text: t("lazy.detail", { keys: p.keys, commands: p.commands }) }),
                    h("span", { class: "lk-lazy-ms", text: p.ms.toFixed(2) + "ms" })
                  ])
                )
              )
            ]
          });
        }
      },
      {
        name: "checkhealth",
        alias: ["che", "health"],
        desc: t("cmd.checkhealth"),
        run() {
          const body = [];
          for (const { plugin, items } of lk.health()) {
            if (!items.length) continue;
            body.push(h("h3", { text: plugin === "core" ? t("health.core") : `lazykeys.${plugin}` }), healthList(ctx, items));
          }
          ctx.ui.float({ title: t("health.title"), icon: "heart", class: "lk-float--health", body });
        }
      }
    ];
  },
  health: ({ lk, t, settings }) => {
    const hasHighlight = typeof CSS !== "undefined" && !!CSS.highlights;
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    return [
      {
        label: t("health.enabled", { state: t(lk.isEnabled() ? "msg.on.short" : "msg.off.short") }),
        ok: true,
        detail: t("health.leader", { leader: lk.leader() })
      },
      { label: t("health.keymap"), ok: lk.keymap.list().length > 0, detail: t("health.bindings", { n: lk.keymap.list().length }) },
      { label: t("health.commands"), ok: lk.exCommands().length > 0, detail: String(lk.exCommands().length) },
      { label: t("health.storage"), ok: settings.schema().length > 0, detail: String(settings.schema().length) },
      { label: t("health.highlight"), ok: hasHighlight ? true : null, detail: t("health.highlightDetail") },
      {
        label: t("health.clipboard"),
        ok: typeof navigator !== "undefined" && !!navigator.clipboard?.writeText ? true : null,
        detail: t("health.clipboardDetail")
      },
      { label: t("health.local"), ok: storageWorks("local") ? true : null, detail: t("health.localDetail") },
      { label: t("health.session"), ok: storageWorks("session") ? true : null, detail: t("health.sessionDetail") },
      { label: t("health.motion"), ok: reduced ? null : true, detail: t("health.motionDetail") }
    ];
  }
});

// src/plugins/find.ts
var SKIP = /* @__PURE__ */ new Set(["SCRIPT", "STYLE", "NOSCRIPT", "CANVAS", "TEMPLATE", "SVG"]);
var MAX = 500;
function registry() {
  const css = typeof CSS !== "undefined" ? CSS : null;
  const HighlightCtor = globalThis.Highlight;
  return css?.highlights && HighlightCtor ? css.highlights : null;
}
function makeHighlight(ranges) {
  const Ctor = globalThis.Highlight;
  const hl = new Ctor();
  for (const r of ranges) hl.add(r);
  return hl;
}
function collectMatches(root, needle, ignoreCase, exclude) {
  const out = [];
  if (!needle) return out;
  const fold = ignoreCase && !/[A-Z]/.test(needle);
  const probe = fold ? needle.toLowerCase() : needle;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node2) {
      if (!node2.nodeValue || !node2.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node2.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (SKIP.has(parent.tagName.toUpperCase())) return NodeFilter.FILTER_REJECT;
      if (isExcluded(parent, exclude)) return NodeFilter.FILTER_REJECT;
      if (!parent.getClientRects().length) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  let node;
  while ((node = walker.nextNode()) && out.length < MAX) {
    const text = fold ? (node.nodeValue ?? "").toLowerCase() : node.nodeValue ?? "";
    let from = 0;
    while (out.length < MAX) {
      const at = text.indexOf(probe, from);
      if (at === -1) break;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + needle.length);
      out.push(range);
      from = at + needle.length;
    }
  }
  return out;
}
function createFind(ctx) {
  let matches2 = [];
  let index = -1;
  let pattern = "";
  function unpaint() {
    const reg = registry();
    if (!reg) return;
    try {
      reg.delete("lk-search");
      reg.delete("lk-search-current");
    } catch {
    }
  }
  function paint() {
    const reg = registry();
    if (!reg) return;
    try {
      if (ctx.settings.get("hlsearch") && matches2.length) reg.set("lk-search", makeHighlight(matches2));
      else reg.delete("lk-search");
      const current = matches2[index];
      if (current) reg.set("lk-search-current", makeHighlight([current]));
      else reg.delete("lk-search-current");
    } catch {
      unpaint();
    }
  }
  function reveal(i) {
    const range = matches2[i];
    if (!range) return;
    const s = ctx.lk.scroll;
    s.to(Math.max(0, s.offsetOf(range) - s.viewport() / 3));
  }
  function nearest() {
    const s = ctx.lk.scroll;
    const here = s.y() + 8;
    const at = matches2.findIndex((r) => s.offsetOf(r) >= here);
    return at === -1 ? 0 : at;
  }
  function report() {
    ctx.lk.echo(ctx.t("msg.searchPos", { pattern, index: index + 1, total: matches2.length }));
  }
  const api = {
    repaint: paint,
    preview(text) {
      pattern = text;
      matches2 = collectMatches(
        ctx.options.root(),
        text,
        ctx.settings.get("ignorecase") !== false,
        ctx.options.exclude
      );
      index = matches2.length ? nearest() : -1;
      paint();
      ctx.lk.echo("");
      return matches2.length;
    },
    accept(text) {
      const n = api.preview(text);
      if (!n) {
        ctx.lk.echo(ctx.t("msg.notFound", { pattern: text }));
        return 0;
      }
      reveal(index);
      report();
      return n;
    },
    next(delta = 1) {
      if (!matches2.length && pattern) api.preview(pattern);
      if (!matches2.length) {
        ctx.lk.echo(ctx.t(pattern ? "msg.noMatches" : "msg.noPrevSearch"));
        return;
      }
      index = ((index + delta) % matches2.length + matches2.length) % matches2.length;
      paint();
      reveal(index);
      report();
    },
    clear() {
      unpaint();
      matches2 = [];
      index = -1;
    },
    nohl: unpaint,
    pattern: () => pattern,
    count: () => matches2.length,
    index: () => index
  };
  return api;
}
var find = definePlugin({
  name: "find",
  settings: ({ t }) => [
    {
      key: "hlsearch",
      option: "hlsearch",
      type: "boolean",
      default: true,
      group: t("settings.group"),
      label: t("setting.hlsearch"),
      help: t("setting.hlsearch.help")
    },
    {
      key: "ignorecase",
      option: "ignorecase",
      type: "boolean",
      default: true,
      group: t("settings.group"),
      label: t("setting.ignorecase"),
      help: t("setting.ignorecase.help")
    }
  ],
  keys: (ctx) => {
    const { lk, t } = ctx;
    const api = () => lk.use("find");
    const open = () => {
      const cmdline2 = lk.use("cmdline");
      if (!cmdline2) lk.echo(t("msg.unavailable", { what: "/" }), "error");
      else cmdline2.open("/");
    };
    const section = t("section.search");
    return {
      "/": { desc: t("key.find"), section, run: open },
      n: { desc: t("key.findNext"), section, run: ({ count }) => api()?.next(count) },
      N: { desc: t("key.findPrev"), section, run: ({ count }) => api()?.next(-count) },
      "<leader> s h": { desc: t("key.find"), run: open },
      "<leader> u h": { desc: t("key.hlsearch"), run: () => toggleSetting(ctx, "hlsearch") }
    };
  },
  commands: ({ lk, t }) => [
    {
      name: "nohlsearch",
      alias: ["noh", "nohl"],
      desc: t("cmd.nohlsearch"),
      run() {
        lk.use("find")?.nohl();
        lk.echo("");
      }
    }
  ],
  statusline: ({ lk }) => [
    {
      id: "search",
      order: 50,
      render() {
        const api = lk.use("find");
        if (!api || !api.pattern() || !api.count()) return null;
        return `${api.index() + 1}/${api.count()}`;
      }
    }
  ],
  setup(ctx) {
    const api = createFind(ctx);
    ctx.provide("find", api);
    const { lk, t } = ctx;
    const undefine = lk.use("cmdline")?.define("/", () => {
      const before = lk.scroll.y();
      return {
        prefix: "/",
        title: t("cmdline.searchTitle"),
        label: t("cmdline.searchLabel"),
        icon: "search",
        kind: "search",
        onInput(value) {
          if (!value) {
            api.clear();
            return { hint: "" };
          }
          const n = api.preview(value);
          return { hint: n ? t("cmdline.matches", { n }) : t("cmdline.noMatches"), empty: !n };
        },
        onAccept: (value) => void api.accept(value),
        onCancel() {
          api.clear();
          lk.scroll.to(before);
        }
      };
    });
    const offs = [
      () => undefine?.(),
      ctx.lk.on("escape", api.clear),
      ctx.lk.on("disable", api.clear),
      ctx.lk.on("navigate", api.clear),
      ctx.settings.on((key) => {
        if (key === "hlsearch" || key === null) api.repaint();
      })
    ];
    return () => {
      api.clear();
      offs.forEach((off) => off());
    };
  }
});

// src/plugins/help.ts
function group(name, rows) {
  return h("section", { class: "lk-help-group" }, [
    h("h3", { text: name }),
    h(
      "dl",
      null,
      rows.flatMap((row) => [
        h("dt", null, h("kbd", { text: row.key })),
        h("dd", null, [row.doc, row.extra ? h("span", { class: "lk-help-alias", text: row.extra }) : null])
      ])
    )
  ]);
}
function openHelp(ctx) {
  const { lk, t } = ctx;
  const leaderLabel = t("section.leader");
  const sections = /* @__PURE__ */ new Map();
  const add = (name, row) => {
    const list = sections.get(name) ?? [];
    list.push(row);
    sections.set(name, list);
  };
  for (const entry of lk.keymap.list()) {
    if (entry.hidden) continue;
    const section = defaultSection(entry, lk.keymap, leaderLabel) || t("section.other");
    const key = displaySeq(entry.tokens) + (entry.arg ? typeof entry.arg === "string" ? entry.arg : "{key}" : "");
    add(section, { key, doc: entry.desc ?? "" });
  }
  const motion = sections.get(t("section.motion"));
  if (motion) motion.push({ key: "{count}", doc: t("key.count") });
  const commandRows = lk.exCommands().filter((c) => !c.hidden).map((c) => {
    const row = { key: ":" + c.name + (c.args ? " " + c.args : ""), doc: c.desc ?? "" };
    if (c.alias?.length) row.extra = ":" + c.alias.join(", :");
    return row;
  });
  const leftAlone = ctx.options.passthrough.map((p) => ({
    key: displaySeq([p.key]),
    doc: p.desc ?? t(`pass.${p.key}`)
  }));
  leftAlone.push({ key: "Cmd/Alt-*", doc: t("pass.meta") });
  const first = ["section.motion", "section.links", "section.go", "section.search", "section.yank", "section.marks"].map(
    (k) => t(k)
  );
  const rank = (name) => {
    const at = first.indexOf(name);
    if (at !== -1) return at;
    if (name === leaderLabel || name.startsWith(leaderLabel + " ")) return 200;
    if (name === t("section.lazykeys")) return 150;
    return 100;
  };
  const ordered = [...sections.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
  const body = h("div", { class: "lk-help-body" }, [
    ...ordered.map(([name, rows]) => group(name, rows)),
    commandRows.length ? group(t("section.commands"), commandRows) : null,
    group(t("section.leftAlone"), leftAlone)
  ]);
  ctx.ui.float({
    title: t("help.title"),
    icon: "keyboard",
    class: "lk-float--help",
    body: [h("p", { class: "lk-note", text: t("help.intro", { leader: lk.leader() }) }), body]
  });
}
var help = definePlugin({
  name: "help",
  keys: (ctx) => {
    const show = () => openHelp(ctx);
    return {
      "?": { desc: ctx.t("key.help"), section: ctx.t("section.lazykeys"), run: show },
      "<leader> ?": { desc: ctx.t("key.keymaps"), run: show },
      "<leader> s k": { desc: ctx.t("key.keymaps"), run: show }
    };
  },
  commands: (ctx) => [{ name: "help", alias: ["h"], desc: ctx.t("cmd.help"), run: () => openHelp(ctx) }]
});

// src/core/labels.ts
function labelsFor(n, alphabet) {
  const chars = Array.from(new Set(Array.from(alphabet.replace(/\s/g, ""))));
  const base = chars.length;
  if (base < 2) throw new Error("lazykeys: a hint alphabet needs at least two distinct characters");
  const out = [];
  if (n <= 0) return out;
  const prefixes = Math.max(0, Math.ceil((n - base) / (base - 1)));
  if (prefixes <= base) {
    const singles = base - prefixes;
    for (let i = 0; i < singles && out.length < n; i++) out.push(chars[i]);
    for (let p = singles; p < base && out.length < n; p++) {
      for (let q = 0; q < base && out.length < n; q++) out.push(chars[p] + chars[q]);
    }
    return out;
  }
  let len = 2;
  while (Math.pow(base, len) < n) len++;
  for (let i = 0; i < n; i++) {
    let label = "";
    let x = i;
    for (let d = 0; d < len; d++) {
      label = chars[x % base] + label;
      x = Math.floor(x / base);
    }
    out.push(label);
  }
  return out;
}

// src/plugins/hints.ts
function createHints(ctx) {
  let container = null;
  let hints2 = [];
  let typed = "";
  let newTab = false;
  let pop = null;
  let startY = 0;
  function onScroll() {
    if (Math.abs(ctx.lk.scroll.y() - startY) > 2) cancel();
  }
  function chars() {
    const raw = String(ctx.settings.get("hintchars") ?? "").replace(/\s/g, "").toLowerCase();
    return new Set(raw).size >= 2 ? raw : "asdfghjkl";
  }
  function render() {
    for (const hint of hints2) {
      const match = hint.label.startsWith(typed);
      hint.node.hidden = !match;
      while (hint.node.firstChild) hint.node.removeChild(hint.node.firstChild);
      if (match && typed) {
        hint.node.appendChild(h("b", { text: hint.label.slice(0, typed.length) }));
        hint.node.appendChild(document.createTextNode(hint.label.slice(typed.length)));
      } else {
        hint.node.textContent = hint.label;
      }
    }
  }
  function follow(el) {
    const tab = newTab;
    cancel();
    const href = el.href;
    if (tab && href) {
      ctx.lk.navigate(href, { newTab: true });
      return;
    }
    el.focus?.({ preventScroll: true });
    el.click();
  }
  function onKey(e) {
    if (e.metaKey || e.altKey || e.ctrlKey) return false;
    if (e.key === "Escape") {
      cancel();
      return true;
    }
    if (e.key === "Backspace") {
      typed = typed.slice(0, -1);
      render();
      return true;
    }
    if (e.key === "Enter") {
      const first = hints2.find((x) => x.label.startsWith(typed));
      if (first) follow(first.el);
      else cancel();
      return true;
    }
    if (e.key.length !== 1) return true;
    const next = typed + e.key.toLowerCase();
    const candidates = hints2.filter((x) => x.label.startsWith(next));
    if (!candidates.length) {
      cancel();
      return true;
    }
    typed = next;
    const only = candidates[0];
    if (candidates.length === 1 && only && only.label === typed) {
      follow(only.el);
      return true;
    }
    render();
    return true;
  }
  function start(opts = {}) {
    cancel();
    newTab = !!opts.newTab;
    const all = Array.from(document.querySelectorAll(ctx.options.hintTargets));
    const targets = all.filter((el) => !isExcluded(el, ctx.options.exclude) && inView(el));
    if (!targets.length) {
      ctx.lk.echo(ctx.t("msg.noHints"));
      return;
    }
    const labels = labelsFor(targets.length, chars());
    container = h("div", { class: "lk-hints", attrs: { "aria-hidden": "true", "data-new-tab": newTab ? "true" : null } });
    targets.forEach((el, i) => {
      const r = el.getClientRects()[0];
      const node = h("span", {
        class: "lk-hint",
        text: labels[i],
        style: { left: Math.max(0, r.left - 4) + "px", top: Math.max(0, r.top - 6) + "px" }
      });
      container.appendChild(node);
      hints2.push({ el, label: labels[i], node });
    });
    ctx.ui.root().appendChild(container);
    typed = "";
    render();
    pop = ctx.pushLayer({ name: "hints", onKey });
    window.addEventListener("wheel", cancel, { passive: true });
    window.addEventListener("resize", cancel);
    startY = ctx.lk.scroll.y();
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    ctx.lk.setMode("hints");
    ctx.ui.announce(ctx.t("msg.hintsActive"));
  }
  function cancel() {
    if (!container) return;
    window.removeEventListener("wheel", cancel);
    window.removeEventListener("resize", cancel);
    window.removeEventListener("scroll", onScroll, { capture: true });
    pop?.();
    pop = null;
    remove(container);
    container = null;
    hints2 = [];
    typed = "";
    if (ctx.lk.mode() === "hints") ctx.lk.setMode("normal");
  }
  return {
    start,
    cancel,
    active: () => container !== null,
    list: () => hints2.map((x) => ({ label: x.label, tag: x.el.tagName.toLowerCase(), href: x.el.href ?? "" }))
  };
}
var hints = definePlugin({
  name: "hints",
  settings: ({ t }) => [
    {
      key: "hintchars",
      option: "hintchars",
      type: "string",
      default: "asdfghjkl",
      group: t("settings.group"),
      label: t("setting.hintchars"),
      help: t("setting.hintchars.help")
    }
  ],
  keys: ({ lk, t }) => {
    const api = () => lk.use("hints");
    const section = t("section.links");
    return {
      f: { desc: t("key.hint"), section, run: () => api()?.start({ newTab: false }) },
      F: { desc: t("key.hintNewTab"), section, run: () => api()?.start({ newTab: true }) },
      s: { hidden: true, section, run: () => api()?.start({ newTab: false }) },
      S: { hidden: true, section, run: () => api()?.start({ newTab: true }) }
    };
  },
  setup(ctx) {
    const api = createHints(ctx);
    ctx.provide("hints", api);
    const offs = [ctx.lk.on("disable", api.cancel), ctx.lk.on("navigate", api.cancel)];
    return () => {
      api.cancel();
      offs.forEach((off) => off());
    };
  }
});

// src/plugins/marks.ts
var MARKS = "marks";
var PENDING = "pending-scroll";
function marks(ctx) {
  const value = ctx.session.get(MARKS, {});
  return value && typeof value === "object" ? value : {};
}
function keyOf(letter) {
  return letter === letter.toUpperCase() ? letter : `${location.pathname}|${letter}`;
}
function setMark(ctx, letter = "") {
  if (!/^[a-zA-Z]$/.test(letter)) {
    ctx.lk.echo(ctx.t("msg.markInvalid"), "warn");
    return;
  }
  const all = marks(ctx);
  all[keyOf(letter)] = { path: location.pathname, y: ctx.lk.scroll.y() };
  ctx.session.set(MARKS, all);
  const global = letter === letter.toUpperCase();
  ctx.lk.echo(ctx.t(global ? "msg.markSetGlobal" : "msg.markSet", { mark: letter }), "success");
}
function jumpMark(ctx, letter = "") {
  if (!/^[a-zA-Z]$/.test(letter)) {
    ctx.lk.echo(ctx.t("msg.markInvalid"), "warn");
    return;
  }
  const mark = marks(ctx)[keyOf(letter)];
  if (!mark) {
    ctx.lk.echo(ctx.t("msg.markUnset", { mark: letter }), "warn");
    return;
  }
  if (mark.path !== location.pathname) {
    ctx.session.set(PENDING, mark.y);
    ctx.lk.navigate(mark.path);
    return;
  }
  ctx.lk.scroll.to(mark.y);
}
function restorePending(ctx) {
  const y = ctx.session.get(PENDING, null);
  if (y === null) return;
  ctx.session.remove(PENDING);
  const scroller = ctx.lk.scroll;
  requestAnimationFrame(() => scroller.to(Number(y) || 0));
}
var marksPlugin = definePlugin({
  name: "marks",
  keys: (ctx) => ({
    m: { desc: ctx.t("key.setMark"), section: ctx.t("section.marks"), arg: "{a-z A-Z}", run: ({ arg }) => setMark(ctx, arg) },
    "'": { desc: ctx.t("key.jumpMark"), section: ctx.t("section.marks"), arg: "{a-z A-Z}", run: ({ arg }) => jumpMark(ctx, arg) },
    "<leader> s m": { desc: ctx.t("key.marks"), run: () => void ctx.lk.exec("marks") }
  }),
  commands: (ctx) => [
    {
      name: "marks",
      desc: ctx.t("cmd.marks"),
      run() {
        const all = marks(ctx);
        const keys = Object.keys(all).sort();
        if (!keys.length) {
          ctx.lk.echo(ctx.t("msg.noMarks"), "warn");
          return;
        }
        const rows = keys.map((k) => {
          const m = all[k];
          return ` ${k.split("|").pop()}     ${String(Math.round(m.y)).padStart(5)}  ${m.path}`;
        });
        ctx.ui.float({
          title: ctx.t("marks.title"),
          icon: "list",
          class: "lk-float--marks",
          body: h("pre", { class: "lk-pre", text: ctx.t("marks.header") + "\n" + rows.join("\n") })
        });
      }
    }
  ],
  setup(ctx) {
    restorePending(ctx);
    return ctx.lk.on("navigate", () => restorePending(ctx));
  }
});

// src/plugins/motions.ts
function jumpSection(ctx, dir, n) {
  const { scroll } = ctx.lk;
  const targets = ctx.options.sections().filter((el) => !isExcluded(el, ctx.options.exclude));
  if (!targets.length) {
    ctx.lk.echo(ctx.t("msg.noSections"));
    return;
  }
  const here = scroll.y() + 4;
  const tops = targets.map((el) => scroll.offsetOf(el) - 16);
  let idx = -1;
  if (dir > 0) {
    for (let a = 0; a < tops.length; a++) {
      if (tops[a] > here) {
        idx = Math.min(a + (n - 1), tops.length - 1);
        break;
      }
    }
    if (idx === -1) return scroll.to(scroll.max());
  } else {
    for (let b = tops.length - 1; b >= 0; b--) {
      if (tops[b] < here - 8) {
        idx = Math.max(b - (n - 1), 0);
        break;
      }
    }
    if (idx === -1) return scroll.to(0);
  }
  scroll.to(tops[idx]);
}
function focusFirstField(ctx) {
  const candidates = Array.from(document.querySelectorAll(ctx.options.fields));
  const el = candidates.find(
    (c) => !isExcluded(c, ctx.options.exclude) && c.getClientRects().length > 0 && !c.disabled
  );
  if (!el) {
    ctx.lk.echo(ctx.t("msg.noField"));
    return;
  }
  el.focus();
  el.select?.();
  ctx.lk.setMode("insert");
}
var motions = definePlugin({
  name: "motions",
  settings: ({ t }) => [
    {
      key: "scroll",
      option: "scroll",
      type: "number",
      default: 72,
      min: 8,
      max: 400,
      step: 4,
      group: t("settings.group"),
      label: t("setting.scroll"),
      help: t("setting.scroll.help")
    },
    {
      key: "smoothscroll",
      option: "smoothscroll",
      type: "boolean",
      default: false,
      group: t("settings.group"),
      label: t("setting.smoothscroll"),
      help: t("setting.smoothscroll.help")
    }
  ],
  keys: (ctx) => {
    const { lk, t, settings } = ctx;
    const s = lk.scroll;
    const step = () => settings.get("scroll") || 72;
    const half = () => s.viewport() / 2;
    const motion = t("section.motion");
    const links = t("section.links");
    const go = t("section.go");
    return {
      j: { desc: t("key.down"), section: motion, run: ({ count }) => s.by(step() * count) },
      k: { desc: t("key.up"), section: motion, run: ({ count }) => s.by(-step() * count) },
      "C-e": { hidden: true, section: motion, run: ({ count }) => s.by(step() * count) },
      "C-y": { hidden: true, section: motion, run: ({ count }) => s.by(-step() * count) },
      d: { desc: t("key.halfDown"), section: motion, run: ({ count }) => s.by(half() * count) },
      u: { desc: t("key.halfUp"), section: motion, run: ({ count }) => s.by(-half() * count) },
      "C-d": { hidden: true, section: motion, run: ({ count }) => s.by(half() * count) },
      "C-u": { hidden: true, section: motion, run: ({ count }) => s.by(-half() * count) },
      "g g": {
        desc: t("key.top"),
        section: motion,
        run: ({ count, hasCount }) => hasCount ? s.toPercent(count) : s.to(0)
      },
      G: {
        desc: t("key.bottom"),
        section: motion,
        run: ({ count, hasCount }) => hasCount ? s.toPercent(count) : s.to(s.max())
      },
      "%": { desc: t("key.percent"), section: motion, run: ({ count }) => s.toPercent(count) },
      "}": { desc: t("key.nextSection"), section: motion, run: ({ count }) => jumpSection(ctx, 1, count) },
      "{": { desc: t("key.prevSection"), section: motion, run: ({ count }) => jumpSection(ctx, -1, count) },
      H: { desc: t("key.back"), section: links, run: ({ count }) => history.go(-count) },
      L: { desc: t("key.forward"), section: links, run: ({ count }) => history.go(count) },
      r: { desc: t("key.reload"), section: links, run: () => location.reload() },
      "g i": { desc: t("key.field"), section: go, run: () => focusFirstField(ctx) },
      i: { hidden: true, section: go, run: () => focusFirstField(ctx) }
    };
  }
});

// src/plugins/notifier.ts
var LEVEL_ICON = { info: "info", warn: "alert", error: "alert", success: "check" };
function createNotifier(ctx) {
  let host = null;
  const timers = /* @__PURE__ */ new Set();
  function ensure() {
    if (!host || !host.isConnected) {
      host = h("div", {
        class: "lk-notify",
        attrs: { "aria-live": "polite", "aria-relevant": "additions", role: "log" }
      });
      ctx.ui.root().appendChild(host);
    }
    host.setAttribute("data-side", sidebarSide(ctx));
    return host;
  }
  function dismiss(toast) {
    if (!toast.isConnected) return;
    toast.classList.add("is-leaving");
    const timer = setTimeout(() => {
      timers.delete(timer);
      remove(toast);
      if (host && !host.children.length) {
        remove(host);
        host = null;
      }
    }, 200);
    timers.add(timer);
  }
  return {
    show(message, opts = {}) {
      if (ctx.settings.get("notify") === false) return false;
      const parent = ensure();
      const toast = h(
        "div",
        {
          class: "lk-toast",
          attrs: { "data-level": message.level },
          on: { click: () => dismiss(toast) }
        },
        [
          ctx.ui.icon(LEVEL_ICON[message.level] ?? "info"),
          h("div", { class: "lk-toast-text" }, [
            message.title ? h("b", { text: message.title }) : null,
            h("span", { text: message.message })
          ])
        ]
      );
      parent.appendChild(toast);
      while (parent.children.length > 5 && parent.firstChild) parent.removeChild(parent.firstChild);
      const timeout = opts.timeout ?? (message.level === "error" ? 6e3 : 3800);
      if (timeout > 0) {
        const timer = setTimeout(() => {
          timers.delete(timer);
          dismiss(toast);
        }, timeout);
        timers.add(timer);
      }
      return true;
    },
    dismissAll() {
      if (!host) return;
      Array.from(host.children).forEach((c) => dismiss(c));
    },
    destroy() {
      timers.forEach(clearTimeout);
      timers.clear();
      remove(host);
      host = null;
    }
  };
}
var notifier = definePlugin({
  name: "notifier",
  settings: ({ t }) => [
    {
      key: "notify",
      option: "notify",
      type: "boolean",
      default: true,
      group: t("settings.group"),
      label: t("setting.notify"),
      help: t("setting.notify.help")
    }
  ],
  keys: ({ lk, t }) => ({
    "<leader> u n": { desc: t("key.dismiss"), run: () => lk.use("notifier")?.dismissAll() },
    "<leader> s n": { desc: t("key.notifications"), run: () => void lk.exec("messages") }
  }),
  commands: ({ lk, t, ui }) => [
    {
      name: "messages",
      alias: ["mes", "notifications"],
      desc: t("cmd.messages"),
      run() {
        const all = lk.messages();
        const body = all.length ? h(
          "ul",
          { class: "lk-msglist" },
          all.slice().reverse().map(
            (m) => h("li", { attrs: { "data-level": m.level } }, [
              h("time", { text: m.at.toTimeString().slice(0, 8), attrs: { datetime: m.at.toISOString() } }),
              h("span", { text: m.message })
            ])
          )
        ) : h("p", { class: "lk-empty", text: t("messages.empty") });
        ui.float({ title: t("messages.title"), icon: "info", class: "lk-float--messages", body });
      }
    }
  ],
  setup(ctx) {
    const api = createNotifier(ctx);
    ctx.provide("notifier", api);
    return api.destroy;
  }
});

// src/plugins/sources.ts
function pathOf(input) {
  try {
    return new URL(input, location.href).pathname;
  } catch {
    return input;
  }
}
function segmentsOf(path) {
  return path.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
}
function buildTree(entries, opts = {}) {
  const indexName = opts.indexName ?? "index";
  const fileName = opts.fileName ?? ((segment) => segment);
  const trailing = (p) => p.endsWith("/") ? p : p + "/";
  const root = { label: opts.rootLabel ?? "/", path: "/", open: true, children: [] };
  const dirs = /* @__PURE__ */ new Map([["", root]]);
  const isDir = /* @__PURE__ */ new Set();
  const seen = /* @__PURE__ */ new Set();
  const list = [];
  for (const raw of entries) {
    const path = pathOf(raw.path);
    if (seen.has(path)) continue;
    seen.add(path);
    list.push({ ...raw, path });
    const segs = segmentsOf(path);
    for (let i = 0; i < segs.length - 1; i++) isDir.add("/" + segs.slice(0, i + 1).join("/"));
    if (raw.dir && segs.length) isDir.add("/" + segs.join("/"));
  }
  const dirFor = (segs) => {
    let parent = root;
    let prefix = "";
    for (const seg of segs) {
      prefix += "/" + seg;
      let node = dirs.get(prefix);
      if (!node) {
        node = { label: seg + "/", path: trailing(prefix), open: false, children: [] };
        dirs.set(prefix, node);
        parent.children.push(node);
      }
      parent = node;
    }
    return parent;
  };
  for (const entry of list) {
    const segs = segmentsOf(entry.path);
    const own = "/" + segs.join("/");
    let parent;
    let name;
    if (!segs.length) {
      parent = root;
      name = indexName;
    } else if (isDir.has(own)) {
      parent = dirFor(segs);
      name = indexName;
    } else {
      parent = dirFor(segs.slice(0, -1));
      name = fileName(segs[segs.length - 1], entry);
    }
    const leaf = { label: name, path: entry.path };
    if (entry.title) leaf.hint = entry.title;
    parent.children.push(leaf);
  }
  const sortNode = (node) => {
    node.children?.sort((a, b) => {
      const ad = !!a.children;
      const bd = !!b.children;
      if (ad !== bd) return ad ? -1 : 1;
      if (a.label === indexName) return -1;
      if (b.label === indexName) return 1;
      return a.label.localeCompare(b.label);
    });
    node.children?.forEach((c) => c.children && sortNode(c));
  };
  sortNode(root);
  const here = segmentsOf(opts.current ? opts.current() : location.pathname);
  let walk = "";
  for (const seg of here) {
    walk += "/" + seg;
    const node = dirs.get(walk);
    if (node) node.open = true;
  }
  return root;
}
function toRows(node, current) {
  return (node.children ?? []).map((child) => {
    const row = { id: child.path + "#" + child.label, label: child.label, current: child.path === current };
    if (child.hint) row.hint = child.hint;
    if (child.children) {
      row.kind = "dir";
      row.children = toRows(child, current);
      row.open = !!child.open;
      row.current = false;
    } else {
      row.kind = "file";
      row.href = child.path;
    }
    return row;
  });
}
function explorer(options) {
  let cache = null;
  return {
    id: options.id ?? "explorer",
    label: options.label ?? "",
    icon: "folder",
    order: options.order ?? 10,
    rows() {
      if (!cache) {
        cache = Promise.resolve().then(() => options.load()).catch(() => []).then((entries) => {
          const current2 = options.current ? options.current() : location.pathname;
          const all = entries.slice();
          if (!all.some((e) => pathOf(e.path) === current2)) all.push({ path: current2, title: document.title });
          return buildTree(all, options);
        });
      }
      const current = options.current ? options.current() : location.pathname;
      return cache.then((root) => [
        { id: "/#root", label: root.label, kind: "dir", open: true, children: toRows(root, current) }
      ]);
    },
    reload() {
      cache = null;
    }
  };
}
function outlineSource(ctx) {
  return {
    id: "outline",
    label: ctx.t("source.outline"),
    icon: "list",
    order: 20,
    rows() {
      const heads = Array.from(ctx.options.root().querySelectorAll(ctx.options.headings)).filter(
        (el) => !isExcluded(el, ctx.options.exclude) && el.getClientRects().length > 0
      );
      const levels = heads.map((el) => /^H([1-6])$/.test(el.tagName) ? parseInt(el.tagName.slice(1), 10) : 2);
      const min = levels.length ? Math.min(...levels) : 1;
      return heads.map((el, i) => ({
        id: "h" + i,
        kind: "symbol",
        icon: "hash",
        depth: levels[i] - min,
        label: (el.textContent ?? "").replace(/\s*[¶#§]\s*$/, "").trim(),
        hint: el.tagName.toLowerCase(),
        onSelect() {
          ctx.lk.scroll.to(ctx.lk.scroll.offsetOf(el) - 16);
        }
      }));
    }
  };
}
var BUFFERS = "buffers";
function recordBuffer(ctx) {
  const path = location.pathname + location.search;
  const list = ctx.session.get(BUFFERS, []).filter((b) => b && b.path !== path);
  list.unshift({ path, title: ctx.options.title() });
  ctx.session.set(BUFFERS, list.slice(0, 25));
}
function buffersSource(ctx) {
  return {
    id: "buffers",
    label: ctx.t("source.buffers"),
    icon: "layers",
    order: 30,
    rows() {
      const here = location.pathname + location.search;
      return ctx.session.get(BUFFERS, []).map((b) => ({
        id: b.path,
        kind: "file",
        label: b.path,
        hint: b.title,
        href: b.path,
        current: b.path === here
      }));
    }
  };
}
function settingsSource(ctx) {
  const { settings, t, lk } = ctx;
  return {
    id: "settings",
    label: t("source.settings"),
    icon: "gear",
    order: 40,
    rows() {
      const out = [];
      let group2;
      for (const row of settings.schema()) {
        if (row.hidden) continue;
        if (row.group !== group2) {
          group2 = row.group;
          if (group2) out.push({ kind: "header", label: group2 });
        }
        const value = settings.get(row.key);
        const requires = row.requires ? settings.row(row.requires) : null;
        const cycle = (dir) => {
          const now = settings.get(row.key);
          if (row.type === "boolean") settings.set(row.key, !now);
          else if (row.type === "enum" && row.values?.length) {
            const at = row.values.indexOf(String(now));
            settings.set(row.key, row.values[(at + dir + row.values.length) % row.values.length]);
          } else if (row.type === "number") settings.set(row.key, Number(now) + (row.step ?? 1) * dir);
          else lk.echo(t("sidebar.textSetting", { label: row.label ?? row.key, option: row.option ?? row.key }), "warn");
        };
        const item = {
          id: "setting:" + row.key,
          kind: "option",
          icon: "gear",
          depth: group2 ? 1 : 0,
          label: row.label ?? row.key,
          dormant: !!(requires && !settings.get(requires.key)),
          onCycle: cycle,
          onSelect: () => cycle(1)
        };
        if (row.type === "boolean") item.toggled = !!value;
        else item.value = String(value);
        if (row.help) item.hint = row.help;
        out.push(item);
      }
      return out;
    }
  };
}

// src/plugins/sidebar.ts
function rowId(row) {
  return row.id ?? row.href ?? row.label;
}
function matches(row, filter) {
  const hay = (row.label + " " + (row.kind === "option" ? "" : row.hint ?? "")).toLowerCase();
  return hay.includes(filter.toLowerCase());
}
function flattenRows(rows, openState, filter = "", depth = 0) {
  const out = [];
  for (const row of rows) {
    const id = rowId(row);
    const d = depth + (row.depth ?? 0);
    if (row.children) {
      const open = filter ? true : openState.get(id) ?? !!row.open;
      const kids = open || filter ? flattenRows(row.children, openState, filter, d + 1) : [];
      if (filter && !kids.length && !matches(row, filter)) continue;
      out.push({ row, depth: d, id, isDir: true, open });
      if (open) out.push(...kids);
      continue;
    }
    if (filter && row.kind !== "header" && !matches(row, filter)) continue;
    out.push({ row, depth: d, id, isDir: false, open: false });
  }
  if (!filter) return out;
  return out.filter((r, i) => r.row.kind !== "header" || out[i + 1] && out[i + 1].row.kind !== "header");
}
function createSidebar(ctx) {
  const { t } = ctx;
  const lk = ctx.lk;
  let el = null;
  let tabsEl;
  let listEl;
  let filterWrap;
  let filterEl;
  let current = "";
  let raw = [];
  let flat = [];
  let sel = 0;
  let filter = "";
  let filtering = false;
  let pendingG = false;
  let loading = false;
  let ticket = 0;
  let pop = null;
  let restoreFocus = null;
  const openState = /* @__PURE__ */ new Map();
  const sources = () => [...lk._sources].sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  const sourceById = (id) => sources().find((s) => s.id === id);
  const labelOf = (s) => s.label || t(`source.${s.id}`);
  const stateFor = (id) => {
    let m = openState.get(id);
    if (!m) openState.set(id, m = /* @__PURE__ */ new Map());
    return m;
  };
  const isOpen = () => !!(el && el.classList.contains("is-open"));
  function build() {
    if (el) {
      if (!el.isConnected) ctx.ui.root().appendChild(el);
      return;
    }
    tabsEl = h("div", { class: "lk-sb-tabs", attrs: { role: "tablist" } });
    filterEl = h("input", {
      attrs: {
        type: "text",
        placeholder: t("sidebar.filter"),
        autocomplete: "off",
        spellcheck: "false",
        "aria-label": t("sidebar.filterLabel")
      },
      on: {
        input: () => {
          filter = filterEl.value;
          sel = 0;
          render();
        }
      }
    });
    filterWrap = h("div", { class: "lk-sb-filter", attrs: { hidden: true } }, [icon("search"), filterEl]);
    listEl = h("div", {
      class: "lk-sb-list",
      attrs: { role: "tree", tabindex: "-1", "aria-label": t("sidebar.label") },
      on: {
        click: (e) => {
          const item = e.target.closest?.("[data-i]");
          if (!item) return;
          sel = parseInt(item.getAttribute("data-i") ?? "0", 10);
          activate();
        }
      }
    });
    el = h("aside", { class: "lk-sb", attrs: { "aria-label": t("sidebar.label") } }, [
      tabsEl,
      filterWrap,
      listEl,
      ctx.ui.footer([
        [["j", "k"], t("foot.move")],
        [["↵"], t("foot.open")],
        [["/"], t("foot.filter")],
        [["q"], t("foot.close")]
      ])
    ]);
    ctx.ui.root().appendChild(el);
  }
  function renderTabs() {
    replace(
      tabsEl,
      sources().map(
        (s, i) => h(
          "button",
          {
            class: "lk-sb-tab" + (s.id === current ? " is-active" : ""),
            attrs: {
              type: "button",
              role: "tab",
              tabindex: "-1",
              "aria-selected": s.id === current ? "true" : "false",
              title: `${labelOf(s)} (${i + 1})`
            },
            on: {
              mousedown: (e) => e.preventDefault(),
              click: () => setSource(s.id)
            }
          },
          [icon(s.icon ?? "file"), h("span", { text: labelOf(s) })]
        )
      )
    );
  }
  function render() {
    if (!el) return;
    renderTabs();
    flat = flattenRows(raw, stateFor(current), filter);
    if (sel >= flat.length) sel = Math.max(0, flat.length - 1);
    if (flat[sel]?.row.kind === "header") sel = nextSelectable(sel, 1);
    if (!flat.length) {
      const text = loading ? t("sidebar.loading") : filter ? t("sidebar.noMatch", { filter }) : t("sidebar.empty");
      replace(listEl, h("p", { class: "lk-empty", text }));
      listEl.removeAttribute("aria-activedescendant");
      return;
    }
    replace(
      listEl,
      flat.map((f, i) => {
        const { row } = f;
        if (row.kind === "header") {
          return h("div", { class: "lk-sb-head", text: row.label, attrs: { role: "presentation" } });
        }
        const classes = ["lk-sb-row"];
        if (i === sel) classes.push("is-selected");
        if (row.current) classes.push("is-current");
        if (row.dormant) classes.push("is-dormant");
        if (f.isDir) classes.push(f.open ? "is-open" : "is-closed");
        const right = row.toggled !== void 0 ? h("span", {
          class: "lk-sb-switch",
          text: t(row.toggled ? "msg.on.short" : "msg.off.short"),
          attrs: { "data-on": row.toggled ? "true" : "false" }
        }) : row.value !== void 0 ? h("span", { class: "lk-sb-value", text: row.value }) : row.hint && row.kind !== "option" ? h("span", { class: "lk-sb-hint", text: row.hint }) : null;
        return h(
          "div",
          {
            class: classes.join(" "),
            attrs: {
              role: "treeitem",
              id: `lk-sb-row-${i}`,
              "data-i": i,
              "aria-level": f.depth + 1,
              "aria-selected": i === sel ? "true" : "false",
              "aria-expanded": f.isDir ? f.open ? "true" : "false" : null,
              "aria-current": row.current ? "page" : null,
              title: row.kind === "option" ? row.hint ?? null : null
            },
            style: { "--lk-depth": f.depth }
          },
          [
            f.isDir ? h("span", { class: "lk-sb-twist", attrs: { "aria-hidden": "true" } }, icon("chevron")) : null,
            icon(row.icon ?? (f.isDir ? "folder" : row.kind === "option" ? "gear" : row.kind === "symbol" ? "hash" : "file")),
            h("span", { class: "lk-sb-label", text: row.label }),
            right
          ]
        );
      })
    );
    listEl.setAttribute("aria-activedescendant", `lk-sb-row-${sel}`);
    const node = listEl.querySelector(".is-selected");
    node?.scrollIntoView?.({ block: "nearest" });
  }
  function load() {
    const source = sourceById(current);
    const mine = ++ticket;
    if (!source) {
      raw = [];
      loading = false;
      render();
      return;
    }
    let result;
    try {
      result = source.rows({ lk, t });
    } catch {
      result = [];
    }
    if (Array.isArray(result)) {
      raw = result;
      loading = false;
      render();
      return;
    }
    loading = true;
    raw = [];
    render();
    result.then(
      (rows) => {
        if (mine !== ticket) return;
        raw = rows;
        loading = false;
        render();
      },
      () => {
        if (mine !== ticket) return;
        raw = [];
        loading = false;
        render();
      }
    );
  }
  function nextSelectable(from, dir) {
    if (!flat.length) return 0;
    let i = from;
    for (let guard = 0; guard < flat.length; guard++) {
      if (flat[i] && flat[i].row.kind !== "header") return i;
      i = (i + dir + flat.length) % flat.length;
    }
    return from;
  }
  function move(delta) {
    if (!flat.length) return;
    sel = nextSelectable((sel + delta + flat.length) % flat.length, delta);
    render();
  }
  function setOpen(f, open2) {
    stateFor(current).set(f.id, open2);
    render();
  }
  function activate() {
    const f = flat[sel];
    if (!f) return;
    const { row } = f;
    if (f.isDir) {
      setOpen(f, !f.open);
      return;
    }
    if (row.onSelect) {
      const close_ = row.onSelect();
      if (close_ === true) close();
      else if (isOpen()) load();
      return;
    }
    if (row.href) {
      const href = row.href;
      close();
      lk.navigate(href);
    }
  }
  function collapseToParent() {
    const depth = flat[sel]?.depth ?? 0;
    for (let i = sel - 1; i >= 0; i--) {
      const f = flat[i];
      if (f.isDir && f.depth < depth) {
        sel = i;
        setOpen(f, false);
        return;
      }
    }
  }
  function setSource(id) {
    current = id;
    sel = 0;
    filter = "";
    filterEl.value = "";
    stopFiltering();
    load();
  }
  function startFiltering() {
    filtering = true;
    filterWrap.hidden = false;
    el?.classList.add("is-filtering");
    filterEl.focus();
  }
  function stopFiltering() {
    filtering = false;
    if (!filter) filterWrap.hidden = true;
    el?.classList.remove("is-filtering");
    if (document.activeElement === filterEl) listEl.focus({ preventScroll: true });
  }
  function onKey(e) {
    if (filtering) {
      if (e.key === "Escape") {
        filter = "";
        filterEl.value = "";
        stopFiltering();
        render();
        return true;
      }
      if (e.key === "Enter" || e.key === "ArrowDown") {
        stopFiltering();
        return true;
      }
      return false;
    }
    if (e.metaKey || e.altKey) return false;
    const key = e.key;
    if (pendingG) {
      pendingG = false;
      if (key === "g") {
        sel = nextSelectable(0, 1);
        render();
      }
      return true;
    }
    if (e.ctrlKey) {
      if (key === "d") {
        for (let i = 0; i < 10; i++) move(1);
        return true;
      }
      if (key === "u") {
        for (let i = 0; i < 10; i++) move(-1);
        return true;
      }
      return false;
    }
    const f = flat[sel];
    switch (key) {
      case "Escape":
      case "q":
        close();
        return true;
      case "j":
      case "ArrowDown":
        move(1);
        return true;
      case "k":
      case "ArrowUp":
        move(-1);
        return true;
      case "g":
        pendingG = true;
        return true;
      case "G":
        sel = nextSelectable(flat.length - 1, -1);
        render();
        return true;
      case "Enter":
      case "l":
      case "o":
      case "ArrowRight":
        if (f?.isDir && f.open && key !== "Enter" && key !== "o") move(1);
        else if (f?.row.kind === "option" && (key === "l" || key === "ArrowRight")) {
          f.row.onCycle?.(1);
          load();
        } else activate();
        return true;
      case "h":
      case "ArrowLeft":
        if (f?.isDir && f.open) setOpen(f, false);
        else if (f?.row.kind === "option") {
          f.row.onCycle?.(-1);
          load();
        } else collapseToParent();
        return true;
      case " ":
        if (f?.row.onCycle) {
          f.row.onCycle(1);
          load();
        } else activate();
        return true;
      case "Tab": {
        const ids = sources().map((s) => s.id);
        if (!ids.length) return true;
        const at = ids.indexOf(current);
        setSource(ids[(at + (e.shiftKey ? -1 : 1) + ids.length) % ids.length]);
        return true;
      }
      case "/":
        startFiltering();
        return true;
      case "R": {
        const source = sourceById(current);
        source?.reload?.();
        load();
        if (source) lk.echo(t("sidebar.reloaded", { source: labelOf(source) }));
        return true;
      }
      default:
        if (/^[1-9]$/.test(key)) {
          const target = sources()[parseInt(key, 10) - 1];
          if (target) setSource(target.id);
          return true;
        }
        return false;
    }
  }
  function open(which) {
    const all = sources();
    if (!all.length) {
      lk.echo(t("sidebar.noSources"), "warn");
      return;
    }
    let id = which ?? (current || all[0].id);
    if (!sourceById(id)) {
      if (which && which !== "explorer") {
        lk.echo(t("sidebar.unknownSource", { source: which }), "warn");
        return;
      }
      id = all[0].id;
    }
    build();
    const node = el;
    node.setAttribute("data-side", ctx.settings.get("sidebar") === "left" ? "left" : "right");
    const wasOpen = isOpen();
    if (id !== current || !wasOpen) {
      current = id;
      sel = 0;
      filter = "";
      filterEl.value = "";
      filterWrap.hidden = true;
      load();
    }
    if (!wasOpen) {
      node.classList.add("is-open");
      document.documentElement.classList.add("lk-sidebar-open");
      document.documentElement.setAttribute("data-lk-sidebar", node.getAttribute("data-side") ?? "right");
      restoreFocus = document.activeElement;
      pop = ctx.pushLayer({ name: "sidebar", onKey });
      lk.setMode("normal");
    }
    listEl.focus({ preventScroll: true });
  }
  function close() {
    if (!isOpen()) return;
    stopFiltering();
    pendingG = false;
    el.classList.remove("is-open");
    document.documentElement.classList.remove("lk-sidebar-open");
    document.documentElement.removeAttribute("data-lk-sidebar");
    pop?.();
    pop = null;
    const back = restoreFocus;
    restoreFocus = null;
    if (back?.isConnected && back.focus) back.focus({ preventScroll: true });
    else if (el.contains(document.activeElement)) document.activeElement.blur?.();
  }
  return {
    open,
    close,
    toggle(which) {
      if (isOpen() && (!which || which === current || which === "explorer" && !sourceById("explorer"))) close();
      else open(which);
    },
    isOpen,
    source: () => current,
    sources,
    refresh() {
      if (!isOpen()) return;
      document.documentElement.classList.add("lk-sidebar-open");
      document.documentElement.setAttribute("data-lk-sidebar", el?.getAttribute("data-side") ?? "right");
      load();
    },
    destroy() {
      close();
      el?.parentNode?.removeChild(el);
      el = null;
    }
  };
}
var sidebar = definePlugin({
  name: "sidebar",
  settings: ({ t }) => [
    {
      key: "sidebar",
      option: "sidebar",
      type: "enum",
      values: ["right", "left"],
      default: "right",
      group: t("settings.group"),
      label: t("setting.sidebar"),
      help: t("setting.sidebar.help")
    }
  ],
  sources: (ctx) => [outlineSource(ctx), buffersSource(ctx), settingsSource(ctx)],
  keys: ({ lk, t }) => {
    const api = () => lk.use("sidebar");
    const toggle = (id) => () => api()?.toggle(id);
    return {
      "<leader> e": { desc: t("key.explorer"), run: toggle("explorer") },
      "<leader> f e": { desc: t("key.explorer"), run: toggle("explorer") },
      "<leader> ,": { desc: t("key.buffers"), run: toggle("buffers") },
      "<leader> f r": { desc: t("key.recent"), run: toggle("buffers") },
      "<leader> s s": { desc: t("key.symbols"), run: toggle("outline") },
      "<leader> u o": { desc: t("key.quickSettings"), run: toggle("settings") },
      "g o": { desc: t("key.outline"), section: t("section.go"), run: toggle("outline") }
    };
  },
  commands: ({ lk, t }) => {
    const open = (id) => () => lk.use("sidebar")?.open(id);
    return [
      { name: "explorer", alias: ["Neotree", "tree"], desc: t("cmd.explorer"), run: open("explorer") },
      { name: "outline", alias: ["symbols"], desc: t("cmd.outline"), run: open("outline") },
      { name: "buffers", alias: ["ls", "bufs"], desc: t("cmd.buffers"), run: open("buffers") },
      { name: "options", alias: ["opt"], desc: t("cmd.options"), run: open("settings") }
    ];
  },
  setup(ctx) {
    const api = createSidebar(ctx);
    ctx.provide("sidebar", api);
    recordBuffer(ctx);
    const offs = [
      ctx.lk.on("disable", api.close),
      ctx.lk.on("navigate", () => {
        recordBuffer(ctx);
        api.refresh();
      }),
      // The settings source is a view of the store, so a :set from anywhere
      // else has to show up here too.
      ctx.settings.on(() => {
        if (api.isOpen() && api.source() === "settings") api.refresh();
      })
    ];
    return () => {
      offs.forEach((off) => off());
      api.destroy();
    };
  }
});

// src/plugins/statusline.ts
var KNOWN_MODES = /* @__PURE__ */ new Set(["normal", "insert", "cmdline", "hints"]);
function modeLabel(ctx, mode) {
  return KNOWN_MODES.has(mode) ? ctx.t(`mode.${mode}`) : String(mode).toUpperCase();
}
function createStatusline(ctx) {
  const lk = ctx.lk;
  let el = null;
  let frame = 0;
  function visible() {
    return lk.isEnabled() && ctx.settings.get("statusline") !== false;
  }
  function teardown() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    el?.parentNode?.removeChild(el);
    el = null;
    document.documentElement.classList.remove("lk-status-on");
  }
  function render() {
    frame = 0;
    if (!visible()) {
      teardown();
      return;
    }
    if (!el) el = h("div", { class: "lk-status", attrs: { "aria-hidden": "true" } });
    if (!el.isConnected) ctx.ui.root().appendChild(el);
    document.documentElement.classList.add("lk-status-on");
    const state = lk.dispatcher.state;
    const status = {
      lk,
      t: ctx.t,
      mode: lk.mode(),
      pending: state.count + state.keys.map(tokenDisplay).join(""),
      message: lk._echo()
    };
    el.setAttribute("data-mode", status.mode);
    const segments = [...lk._segments].sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
    const nodes = [];
    for (const seg of segments) {
      let content;
      try {
        content = seg.render(status);
      } catch {
        content = null;
      }
      const list = (Array.isArray(content) ? content : [content]).filter(
        (c) => c !== null && c !== void 0 && c !== false && c !== ""
      );
      const node = h("span", {
        class: ["lk-seg", `lk-seg--${seg.id}`, seg.grow ? "is-grow" : "", seg.class ?? ""].filter(Boolean).join(" ")
      });
      if (list.length) append(node, list);
      else node.hidden = !seg.grow;
      nodes.push(node);
    }
    el.replaceChildren(...nodes);
  }
  function schedule() {
    if (frame) return;
    if (typeof requestAnimationFrame === "function") frame = requestAnimationFrame(render);
    else render();
  }
  return { render, schedule, teardown };
}
var statusline = definePlugin({
  name: "statusline",
  settings: ({ t }) => [
    {
      key: "statusline",
      option: "statusline",
      type: "boolean",
      default: true,
      group: t("settings.group"),
      label: t("setting.statusline"),
      help: t("setting.statusline.help")
    }
  ],
  keys: (ctx) => ({
    "<leader> u l": { desc: ctx.t("key.statusline"), run: () => toggleSetting(ctx, "statusline") }
  }),
  statusline: (ctx) => [
    { id: "mode", order: 10, render: (s) => modeLabel(ctx, s.mode) },
    {
      id: "section",
      order: 20,
      render: () => [ctx.ui.icon("branch"), h("span", { text: ctx.options.section() || ctx.t("status.home") })]
    },
    { id: "path", order: 30, render: () => decodeURI(location.pathname) },
    { id: "message", order: 40, grow: true, render: (s) => s.message.text },
    { id: "keys", order: 60, render: (s) => s.pending },
    { id: "position", order: 90, render: ({ lk }) => lk.scroll.percent() }
  ],
  setup(ctx) {
    const bar = createStatusline(ctx);
    const onScroll = () => bar.schedule();
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    const offs = [
      ctx.lk.on("render", bar.schedule),
      ctx.lk.on("enable", bar.render),
      ctx.lk.on("disable", bar.teardown)
    ];
    if (ctx.lk.isEnabled()) bar.render();
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
      offs.forEach((off) => off());
      bar.teardown();
    };
  }
});

// src/plugins/whichkey.ts
function createWhichKey(ctx) {
  const { lk } = ctx;
  let el = null;
  let timer = null;
  function hide() {
    if (timer) clearTimeout(timer);
    timer = null;
    remove(el);
    el = null;
  }
  function show(tokens) {
    hide();
    const seq = tokens.join(" ");
    const rows = lk.keymap.children(seq);
    if (!rows.length) return;
    const label = displaySeq(tokens);
    const perColumn = 9;
    const columns = Math.min(3, Math.ceil(rows.length / perColumn));
    const height = Math.ceil(rows.length / columns);
    el = h(
      "div",
      {
        class: "lk-wk",
        attrs: {
          role: "region",
          "aria-label": ctx.t("whichkey.label", { seq: label }),
          "data-side": sidebarSide(ctx) === "right" ? "left" : "right"
        }
      },
      [
        h("div", { class: "lk-wk-head" }, [
          icon("keyboard"),
          h("span", { class: "lk-wk-seq", text: label }),
          h("span", { class: "lk-wk-count", text: String(rows.length) })
        ]),
        h(
          "div",
          { class: "lk-wk-grid", style: { "--lk-wk-rows": height } },
          rows.map(
            (row) => h(
              "button",
              {
                class: "lk-wk-row" + (row.group ? " is-group" : ""),
                attrs: { type: "button", tabindex: "-1", "data-key": row.token },
                on: {
                  mousedown: (e) => e.preventDefault(),
                  click: () => {
                    if (row.token) lk.dispatcher.feed(row.token, null);
                  }
                }
              },
              [
                h("kbd", { text: row.display }),
                h("span", { class: "lk-wk-arrow", text: "→", attrs: { "aria-hidden": "true" } }),
                h("span", { class: "lk-wk-label", text: row.label })
              ]
            )
          )
        )
      ]
    );
    ctx.ui.root().appendChild(el);
  }
  function schedule(tokens) {
    if (timer) clearTimeout(timer);
    timer = null;
    if (!tokens.length || ctx.settings.get("whichkey") === false) {
      hide();
      return;
    }
    const delay = tokens[0] === LEADER ? 0 : Math.max(0, ctx.settings.get("timeoutlen") ?? 250);
    const want = tokens.join(" ");
    const fire = () => {
      timer = null;
      if (!lk.isEnabled() || lk.dispatcher.state.keys.join(" ") !== want) return;
      show(tokens);
    };
    if (delay === 0) fire();
    else timer = setTimeout(fire, delay);
  }
  return { schedule, hide, visible: () => el !== null, show };
}
var whichkey = definePlugin({
  name: "whichkey",
  settings: ({ t }) => [
    {
      key: "whichkey",
      option: "whichkey",
      type: "boolean",
      default: true,
      group: t("settings.group"),
      label: t("setting.whichkey"),
      help: t("setting.whichkey.help")
    }
  ],
  keys: (ctx) => ({
    "<leader> u w": { desc: ctx.t("key.whichkey"), run: () => toggleSetting(ctx, "whichkey") }
  }),
  setup(ctx) {
    const wk = createWhichKey(ctx);
    ctx.provide("whichkey", { show: wk.show, hide: wk.hide, visible: wk.visible });
    const offs = [
      ctx.lk.on("pending", (state) => wk.schedule(state.keys)),
      ctx.lk.on("disable", wk.hide),
      ctx.lk.on("escape", wk.hide)
    ];
    return () => {
      wk.hide();
      offs.forEach((off) => off());
    };
  }
});

// src/plugins/yank.ts
var yank = definePlugin({
  name: "yank",
  keys: ({ lk, t, options }) => {
    const copy = (text, what) => copyText(text).then(
      () => lk.echo(t("msg.yanked", { what }), "success"),
      () => lk.echo(t("msg.clipboardFailed"), "error")
    );
    const section = t("section.yank");
    return {
      "y y": { desc: t("key.yankUrl"), section, run: () => void copy(location.href, t("msg.yankUrl")) },
      "y t": {
        desc: t("key.yankLink"),
        section,
        run: () => void copy(`[${options.title()}](${location.href})`, t("msg.yankLink"))
      }
    };
  }
});

// src/plugins/zen.ts
var zen = definePlugin({
  name: "zen",
  keys: ({ lk, t }) => ({
    "<leader> u z": { desc: t("key.zen"), run: () => void lk.exec("zen") }
  }),
  commands: ({ lk, t }) => [
    {
      name: "zen",
      desc: t("cmd.zen"),
      run() {
        const on = document.documentElement.classList.toggle("lk-zen");
        lk.echo(t(on ? "msg.zenOn" : "msg.zenOff"), "success");
      }
    }
  ],
  setup({ lk }) {
    return lk.on("disable", () => document.documentElement.classList.remove("lk-zen"));
  }
});

// src/plugins/index.ts
var builtins = {
  core,
  motions,
  yank,
  marks: marksPlugin,
  hints,
  cmdline,
  find,
  whichkey,
  help,
  sidebar,
  statusline,
  notifier,
  zen
};
function builtinPlugins() {
  return Object.values(builtins);
}

// src/core/lazykeys.ts
var COMMAND_EVENT = "lazykeys:command";
var DEFAULT_PASSTHROUGH = ["C-f", "C-k"];
function resolveOptions(o) {
  const rootOpt = o.root ?? "main";
  const root = () => {
    const found = typeof rootOpt === "function" ? rootOpt() : document.querySelector(rootOpt);
    return found ?? document.body;
  };
  const headings = o.headings ?? "h1, h2, h3, h4";
  const sectionsOpt = o.sections ?? "h2, h3";
  const sections = () => {
    if (typeof sectionsOpt === "function") return sectionsOpt();
    const inRoot = Array.from(root().querySelectorAll(sectionsOpt));
    return inRoot.length ? inRoot : Array.from(root().querySelectorAll(headings));
  };
  const passthrough = (o.passthrough ?? DEFAULT_PASSTHROUGH).map(
    (p) => typeof p === "string" ? { key: normalizeToken(p) } : { ...p, key: normalizeToken(p.key) }
  );
  return {
    enabled: o.enabled ?? true,
    persist: o.persist ?? true,
    namespace: o.namespace ?? "lazykeys",
    passthrough,
    eventName: o.eventName ?? null,
    navigate: o.navigate ?? ((url, opts) => {
      if (opts.newTab) window.open(url, "_blank", "noopener");
      else window.location.assign(url);
    }),
    root,
    headings,
    sections,
    hintTargets: o.hintTargets ?? [
      "a[href]",
      "button:not([disabled])",
      '[role="button"]',
      '[role="link"]',
      '[role="tab"]',
      'input:not([type="hidden"]):not([disabled])',
      "textarea:not([disabled])",
      "select:not([disabled])",
      "summary",
      '[tabindex]:not([tabindex="-1"])'
    ].join(", "),
    exclude: ["[data-lazykeys]", o.exclude].filter(Boolean).join(", "),
    fields: o.fields ?? 'input[type="search"], input[type="text"], input:not([type]), input[type="email"], input[type="url"], textarea, [contenteditable="true"]',
    title: o.title ?? (() => document.title),
    section: o.section ?? (() => {
      const first = location.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean)[0];
      return first ?? "";
    }),
    mount: o.mount ?? (() => document.body ?? document.documentElement)
  };
}
function createSession(namespace) {
  const store = () => {
    try {
      return typeof sessionStorage === "undefined" ? null : sessionStorage;
    } catch {
      return null;
    }
  };
  const k = (key) => `${namespace}:${key}`;
  return {
    get(key, fallback) {
      try {
        const raw = store()?.getItem(k(key));
        return raw === null || raw === void 0 ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        store()?.setItem(k(key), JSON.stringify(value));
      } catch {
      }
    },
    remove(key) {
      try {
        store()?.removeItem(k(key));
      } catch {
      }
    }
  };
}
function createLazyKeys(options = {}) {
  const opts = resolveOptions(options);
  const t = createTranslator(options.messages);
  const session = createSession(opts.namespace);
  const settings = new Settings(options.storage ?? localStorageAdapter(opts.namespace), {
    enabled: opts.enabled,
    ...options.defaults ?? {}
  });
  const keymap = new Keymap();
  const commands = new ExRegistry();
  const listeners = /* @__PURE__ */ new Map();
  const services = /* @__PURE__ */ new Map();
  const layers = [];
  const guards = new Set(options.yieldTo ?? []);
  const log = [];
  const pluginInfo = [];
  const healthFns = [];
  const cleanups = [];
  const sources = [];
  const segments = [];
  let enabled = false;
  let destroyed = false;
  let mode = "normal";
  let echoState = { text: "" };
  let echoTimer = null;
  function emit(event, payload) {
    const set = listeners.get(event);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(payload);
      } catch (e) {
        console.error(`lazykeys: a '${event}' listener failed`, e);
      }
    }
  }
  function on(event, fn) {
    let set = listeners.get(event);
    if (!set) listeners.set(event, set = /* @__PURE__ */ new Set());
    set.add(fn);
    return () => set?.delete(fn);
  }
  function pushLayer(layer) {
    layers.push(layer);
    return () => {
      const at = layers.lastIndexOf(layer);
      if (at !== -1) layers.splice(at, 1);
    };
  }
  const ui = createUi({ t, mount: opts.mount, pushLayer });
  const scrollerOpt = options.scroller;
  const target = () => scrollerOpt ? scrollerOpt() : null;
  const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scroll = {
    behavior: () => settings.get("smoothscroll") && !reducedMotion() ? "smooth" : "instant",
    y: () => {
      const el = target();
      return el ? el.scrollTop : window.scrollY;
    },
    viewport: () => {
      const el = target();
      return el ? el.clientHeight : window.innerHeight;
    },
    max: () => {
      const el = target();
      const height = el ? el.scrollHeight : document.documentElement.scrollHeight;
      return Math.max(0, height - scroll.viewport());
    },
    by(px) {
      const el = target();
      const o = { top: px, left: 0, behavior: scroll.behavior() };
      if (el) el.scrollBy(o);
      else window.scrollBy(o);
    },
    to(y) {
      const el = target();
      const o = { top: Math.max(0, Math.min(y, scroll.max())), left: 0, behavior: scroll.behavior() };
      if (el) el.scrollTo(o);
      else window.scrollTo(o);
    },
    toPercent(pct) {
      scroll.to(scroll.max() * (Math.max(0, Math.min(100, pct)) / 100));
    },
    offsetOf(node) {
      const el = target();
      const top = node.getBoundingClientRect().top;
      return el ? top - el.getBoundingClientRect().top + el.scrollTop : top + window.scrollY;
    },
    percent() {
      const max = scroll.max();
      const y = scroll.y();
      if (max <= 0) return "All";
      if (y <= 1) return "Top";
      if (y >= max - 1) return "Bot";
      return Math.round(y / max * 100) + "%";
    }
  };
  function notify(message, o) {
    if (!message) return;
    const nopts = typeof o === "string" ? { level: o } : o ?? {};
    const entry = { at: /* @__PURE__ */ new Date(), level: nopts.level ?? "info", message };
    if (nopts.title) entry.title = nopts.title;
    log.push(entry);
    if (log.length > 100) log.shift();
    const shown = services.get("notifier");
    if (!(shown && shown.show(entry, nopts))) ui.announce(message);
    emit("message", entry);
  }
  function echo(message, level) {
    echoState = level ? { text: message ?? "", level } : { text: message ?? "" };
    if (echoTimer) clearTimeout(echoTimer);
    echoTimer = null;
    emit("echo", echoState);
    emit("render", void 0);
    if (!message) return;
    if (level) notify(message, { level });
    else ui.announce(message);
    echoTimer = setTimeout(() => {
      echoState = { text: "" };
      emit("echo", echoState);
      emit("render", void 0);
    }, 2600);
  }
  function announceCommand(detail) {
    emit("command", detail);
    emit("render", void 0);
    if (typeof document === "undefined") return;
    document.dispatchEvent(new CustomEvent(COMMAND_EVENT, { detail }));
    if (opts.eventName) document.dispatchEvent(new CustomEvent(opts.eventName, { detail }));
  }
  const leaderToken = () => {
    const value2 = settings.get("leader");
    if (value2 === "," || value2 === "\\") return value2;
    return "Space";
  };
  const dispatcher = new Dispatcher({
    keymap,
    leader: leaderToken,
    timeoutlen: () => settings.get("timeoutlen") ?? 250,
    onPending: (state) => {
      emit("pending", state);
      emit("render", void 0);
    },
    onRun: (entry, ctx) => announceCommand({ seq: entry.seq, count: ctx.count }),
    onError: (error, entry) => {
      console.error(`lazykeys: '${entry.seq}' failed`, error);
      echo(t("msg.failed", { what: entry.seq }), "error");
    }
  });
  function exec(line) {
    const parsed = parseLine(line);
    if (!parsed) return false;
    const hit = commands.resolveLine(parsed);
    if (!hit) {
      echo(t("msg.notCommand", { name: parsed.name }), "error");
      return false;
    }
    try {
      hit.command.run(parsed.argv, { line: parsed.line, bang: hit.bang });
    } catch (error) {
      console.error(`lazykeys: ':${hit.command.name}' failed`, error);
      echo(t("msg.failed", { what: ":" + hit.command.name }), "error");
      return false;
    }
    announceCommand({ ex: hit.command.name, line: parsed.line });
    return true;
  }
  function yielding() {
    for (const guard of guards) {
      try {
        if (guard()) return true;
      } catch {
      }
    }
    return false;
  }
  function setMode(next) {
    if (mode === next) return;
    mode = next;
    emit("mode", mode);
    emit("render", void 0);
  }
  function onKeydown(e) {
    if (!enabled || destroyed || e.isComposing) return;
    if (yielding()) return;
    const top = layers[layers.length - 1];
    if (top) {
      if (top.onKey(e) === true) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    const path = typeof e.composedPath === "function" ? e.composedPath() : [];
    const origin = path[0] ?? e.target;
    if (isEditable(origin)) {
      if (e.key === "Escape") {
        origin.blur?.();
        setMode("normal");
        return;
      }
      setMode("insert");
      return;
    }
    if (mode === "insert") setMode("normal");
    if (e.defaultPrevented || e.metaKey || e.altKey) return;
    const token = keyName(e);
    if (!token) return;
    if (opts.passthrough.some((p) => p.key === token)) {
      dispatcher.reset();
      return;
    }
    if (token === "Escape") {
      const consumed = dispatcher.feed("Escape", e);
      emit("escape", void 0);
      echo("");
      if (consumed) e.preventDefault();
      return;
    }
    if (dispatcher.feed(token, e)) e.preventDefault();
  }
  function onFocusIn(e) {
    if (!enabled || layers.length) return;
    if (isEditable(e.target)) setMode("insert");
  }
  function onFocusOut() {
    if (!enabled || mode !== "insert") return;
    setTimeout(() => {
      if (mode === "insert" && !isEditable(document.activeElement)) setMode("normal");
    }, 0);
  }
  function activate() {
    if (enabled || destroyed) return;
    enabled = true;
    mode = isEditable(document.activeElement) ? "insert" : "normal";
    document.documentElement.classList.add("lk-on");
    emit("enable", void 0);
    emit("render", void 0);
  }
  function deactivate() {
    if (!enabled) return;
    enabled = false;
    dispatcher.reset();
    ui.closeFloat();
    mode = "normal";
    document.documentElement.classList.remove("lk-on");
    emit("disable", void 0);
  }
  function applyEnabled() {
    if (settings.get("enabled")) activate();
    else deactivate();
  }
  const unregister = /* @__PURE__ */ new Map();
  function contextFor(name, own) {
    return {
      lk: instance,
      name,
      settings,
      t,
      options: opts,
      session,
      ui,
      pushLayer,
      provide(service, api) {
        services.set(service, api);
        own.push(() => {
          if (services.get(service) === api) services.delete(service);
        });
      },
      onCleanup(fn) {
        own.push(fn);
      }
    };
  }
  function value(field, ctx) {
    return typeof field === "function" ? field(ctx) : field;
  }
  function isEnabledSpec(spec) {
    if (spec.enabled === void 0) return true;
    if (typeof spec.enabled === "function") {
      try {
        return spec.enabled(instance);
      } catch {
        return false;
      }
    }
    return spec.enabled;
  }
  function load(specs, builtinSpecs) {
    const staged = specs.filter(isEnabledSpec).map((spec) => {
      const own = [];
      const ctx = contextFor(spec.name, own);
      const started = now();
      try {
        const rows = value(spec.settings, ctx);
        if (rows?.length) own.push(settings.define(rows));
      } catch (error) {
        console.error(`lazykeys: plugin '${spec.name}' settings failed`, error);
      }
      return { spec, ctx, own, ms: now() - started, keys: 0, commands: 0 };
    });
    for (const stage of staged) {
      const { spec, ctx, own } = stage;
      const started = now();
      try {
        const table = value(spec.keys, ctx);
        if (table) {
          own.push(keymap.apply(table, spec.name));
          stage.keys = Object.values(table).filter((m) => typeof m !== "string" && m !== false).length;
        }
        const cmds = value(spec.commands, ctx) ?? [];
        for (const c of cmds) own.push(commands.add(c, spec.name));
        stage.commands = cmds.length;
        for (const s of value(spec.sources, ctx) ?? []) {
          sources.push(s);
          own.push(() => {
            const at = sources.indexOf(s);
            if (at !== -1) sources.splice(at, 1);
          });
        }
        for (const seg of value(spec.statusline, ctx) ?? []) {
          segments.push(seg);
          own.push(() => {
            const at = segments.indexOf(seg);
            if (at !== -1) segments.splice(at, 1);
          });
        }
        const healthFn = spec.health;
        if (healthFn) {
          const entry = { plugin: spec.name, fn: () => healthFn(ctx) };
          healthFns.push(entry);
          own.push(() => {
            const at = healthFns.indexOf(entry);
            if (at !== -1) healthFns.splice(at, 1);
          });
        }
      } catch (error) {
        console.error(`lazykeys: plugin '${spec.name}' failed to load`, error);
      }
      stage.ms += now() - started;
    }
    for (const stage of staged) {
      const { spec, ctx, own } = stage;
      const started = now();
      if (spec.setup) {
        try {
          const cleanup = spec.setup(ctx);
          if (typeof cleanup === "function") own.push(cleanup);
        } catch (error) {
          console.error(`lazykeys: plugin '${spec.name}' setup failed`, error);
        }
      }
      stage.ms += now() - started;
      const info = {
        name: spec.name,
        keys: stage.keys,
        commands: stage.commands,
        ms: Math.round(stage.ms * 100) / 100,
        builtin: builtinSpecs.has(spec)
      };
      pluginInfo.push(info);
      const undo = () => {
        own.reverse().forEach((fn) => {
          try {
            fn();
          } catch (e) {
            console.error(`lazykeys: cleanup of '${spec.name}' failed`, e);
          }
        });
        own.length = 0;
        const at = pluginInfo.indexOf(info);
        if (at !== -1) pluginInfo.splice(at, 1);
        if (unregister.get(spec.name) === undo) unregister.delete(spec.name);
        const c = cleanups.indexOf(undo);
        if (c !== -1) cleanups.splice(c, 1);
      };
      unregister.set(spec.name, undo);
      cleanups.push(undo);
    }
  }
  const now = () => typeof performance !== "undefined" ? performance.now() : Date.now();
  const instance = {
    version: VERSION,
    keymap,
    commands,
    settings,
    dispatcher,
    scroll,
    ui,
    options: opts,
    t,
    _sources: sources,
    _segments: segments,
    _echo: () => echoState,
    enable() {
      if (destroyed) return;
      const was = enabled;
      if (opts.persist) settings.set("enabled", true);
      activate();
      if (!was && enabled) {
        echo(t("msg.on"), "success");
        notify(t("msg.intro", { leader: instance.leader() }), { level: "info", title: t("msg.introTitle"), timeout: 5200 });
      }
    },
    disable() {
      if (opts.persist) settings.set("enabled", false);
      deactivate();
    },
    toggle() {
      if (enabled) instance.disable();
      else instance.enable();
    },
    isEnabled: () => enabled,
    ownsKeys: () => enabled && !destroyed && !yielding(),
    destroy() {
      if (destroyed) return;
      deactivate();
      destroyed = true;
      emit("destroy", void 0);
      document.removeEventListener("keydown", onKeydown, true);
      document.removeEventListener("focusin", onFocusIn, true);
      document.removeEventListener("focusout", onFocusOut, true);
      for (const undo of cleanups.splice(0).reverse()) undo();
      if (echoTimer) clearTimeout(echoTimer);
      ui.destroy();
      settings.destroy();
      listeners.clear();
      services.clear();
    },
    map(seq, mapping, desc) {
      if (typeof mapping === "string") return keymap.group(seq, mapping);
      if (mapping === false) return keymap.set(seq, false);
      const spec = typeof mapping === "function" ? { run: mapping } : { ...mapping };
      if (desc) spec.desc = desc;
      return keymap.set(seq, spec, "user");
    },
    command: (spec) => commands.add(spec, "user"),
    register(plugin) {
      unregister.get(plugin.name)?.();
      load([plugin], /* @__PURE__ */ new Set());
      return () => unregister.get(plugin.name)?.();
    },
    exec,
    feed(seq) {
      for (const token of parseSeq(seq)) {
        dispatcher.feed(token === LEADER ? leaderToken() : token, null);
      }
    },
    notify,
    echo,
    messages: () => log.slice(),
    on,
    use: (service) => services.get(service),
    mode: () => mode,
    setMode,
    leader: () => tokenDisplay(leaderToken()),
    navigate(url, o = {}) {
      opts.navigate(url, { newTab: !!o.newTab });
    },
    refresh() {
      dispatcher.reset();
      ui.closeFloat();
      ui.remount();
      if (enabled) document.documentElement.classList.add("lk-on");
      emit("navigate", void 0);
      emit("render", void 0);
    },
    yieldTo(fn) {
      guards.add(fn);
      return () => guards.delete(fn);
    },
    plugins: () => pluginInfo.map((p) => ({ ...p })),
    health: () => healthFns.map(({ plugin, fn }) => {
      try {
        return { plugin, items: fn() };
      } catch {
        return { plugin, items: [{ label: t("msg.failed", { what: plugin }), ok: false }] };
      }
    }),
    complete: (text) => commands.completions(text),
    exCommands: () => commands.list()
  };
  const disabled = new Set(options.disable ?? []);
  const userPlugins = options.plugins ?? [];
  const replaced = new Set(userPlugins.map((p) => p.name));
  const builtins2 = builtinPlugins().filter((p) => !disabled.has(p.name) && !replaced.has(p.name));
  const tail = [];
  if (options.settings?.length || options.keys || options.commands?.length) {
    const user = { name: "user" };
    if (options.settings?.length) user.settings = options.settings;
    if (options.keys) user.keys = options.keys;
    if (options.commands?.length) user.commands = options.commands;
    tail.push(user);
  }
  load([...builtins2, ...userPlugins, ...tail], new Set(builtins2));
  document.addEventListener("keydown", onKeydown, true);
  document.addEventListener("focusin", onFocusIn, true);
  document.addEventListener("focusout", onFocusOut, true);
  cleanups.unshift(
    settings.on((key) => {
      if (key === null || key === "enabled") applyEnabled();
      emit("render", void 0);
    })
  );
  const start = () => {
    if (!destroyed) applyEnabled();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
  return instance;
}
export {
  COMMAND_EVENT,
  Dispatcher,
  ExRegistry,
  Keymap,
  LEADER,
  Settings,
  VERSION,
  applySet,
  buildTree,
  builtins,
  createLazyKeys,
  createTranslator,
  defaultMessages,
  defaultSection,
  definePlugin,
  displaySeq,
  explorer,
  formatOption,
  h,
  icon,
  iconNames,
  isEditable,
  keyName,
  labelsFor,
  localStorageAdapter,
  memoryAdapter,
  normalizeSeq,
  normalizeToken,
  parseLine,
  parseSeq,
  parseSetArg,
  resolveOption,
  createLazyKeys as setup,
  tokenDisplay
};
