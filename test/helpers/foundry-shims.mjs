/**
 * Just-enough Foundry globals for the pure logic under plain Node.
 *
 * Nothing in `scripts/data/` needs a real Foundry; `config.mjs` reaches for `game.settings`,
 * `game.i18n` and `Hooks` in its helpers, and that is all this provides. Vitest loads it through
 * `setupFiles`, before any test imports resolve. Tests override the pieces they exercise and call
 * {@link installFoundryShims} in `beforeEach` when they have mutated one.
 */

import { DEFAULTS } from "../../scripts/config.mjs";

export function installFoundryShims() {
  globalThis.game = {
    settings: {
      _values: structuredClone({ ...DEFAULTS }),
      get(_module, key) {
        if ( !(key in this._values) ) throw new Error(`setting ${key} is not registered`);
        return this._values[key];
      },
      set(_module, key, value) { this._values[key] = value; }
    },
    // Echo the key back, with interpolation data appended, so text assertions stay stable.
    i18n: {
      localize: key => key,
      format: (key, data) => `${key}:${JSON.stringify(data ?? {})}`
    },
    modules: { get: () => null },
    user: { isGM: false }
  };

  globalThis.Hooks = {
    _listeners: {},
    on(hook, fn) { (this._listeners[hook] ??= []).push(fn); },
    callAll(hook, ...args) { for ( const fn of this._listeners[hook] ?? [] ) fn(...args); return true; },
    call(hook, ...args) {
      for ( const fn of this._listeners[hook] ?? [] ) if ( fn(...args) === false ) return false;
      return true;
    }
  };

  // Notifications are recorded so a test can assert what the player was told.
  globalThis.ui = {
    notifications: {
      shown: [],
      warn(message) { this.shown.push({ type: "warn", message }); },
      info(message) { this.shown.push({ type: "info", message }); }
    }
  };

  let ids = 0;
  globalThis.foundry = {
    utils: {
      deepClone: v => structuredClone(v),
      randomID: () => `id${String(++ids).padStart(14, "0")}`,
      escapeHTML: v => String(v).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`),
      setProperty(obj, path, value) {
        const keys = path.split(".");
        const last = keys.pop();
        let cur = obj;
        for ( const k of keys ) cur = (cur[k] ??= {});
        cur[last] = value;
      }
    }
  };
}

installFoundryShims();
