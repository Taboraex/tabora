/* Chrome API shim — lets Tabora pages run in a normal browser (for previews/dev).
   In the real extension this exits instantly. */
(function () {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) return;
  const KEY = 'tabora_store';
  const loadAll = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } };
  window.chrome = Object.assign(window.chrome || {}, {
    storage: {
      local: {
        async get(keys) {
          const all = loadAll();
          if (keys == null) return all;
          if (typeof keys === 'string') return { [keys]: all[keys] };
          if (Array.isArray(keys)) { const o = {}; keys.forEach(k => { o[k] = all[k]; }); return o; }
          return all;
        },
        async set(obj) {
          const all = loadAll();
          Object.assign(all, obj);
          localStorage.setItem(KEY, JSON.stringify(all));
        },
        async remove(keys) {
          const all = loadAll();
          (Array.isArray(keys) ? keys : [keys]).forEach(k => delete all[k]);
          localStorage.setItem(KEY, JSON.stringify(all));
        }
      }
    },
    runtime: {
      id: 'tabora-preview',
      getURL: (p) => p,
      getManifest: () => ({ version: '1.0.0-preview' }),
      onInstalled: { addListener() { } }
    }
  });
})();
