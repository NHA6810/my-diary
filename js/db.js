/* 声记 · 图片仓库（IndexedDB，不可用时降级为内存） */
(function (w) {
  'use strict';
  var VD = (w.VD = w.VD || {});
  var DB_NAME = 'voice-diary', STORE = 'images', VERSION = 1;
  var mem = Object.create(null), dbPromise = null, available = true;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve) {
      var settled = false;
      function done(v) { if (!settled) { settled = true; resolve(v); } }
      if (!w.indexedDB) { available = false; return done(null); }
      var req;
      try { req = indexedDB.open(DB_NAME, VERSION); }
      catch (e) { available = false; return done(null); }
      /* file:// 或隐私模式下 indexedDB 可能既不成功也不报错，加超时避免永久挂起 */
      var timer = setTimeout(function () { available = false; done(null); }, 1500);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function () { clearTimeout(timer); done(req.result); };
      req.onerror = function () { clearTimeout(timer); available = false; done(null); };
      req.onblocked = function () { clearTimeout(timer); available = false; done(null); };
    });
    return dbPromise;
  }

  function tx(mode, fn) {
    return open().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve, reject) {
        var t = db.transaction(STORE, mode), store = t.objectStore(STORE), r;
        try { r = fn(store); } catch (e) { reject(e); return; }
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { reject(r.error); };
      });
    });
  }

  VD.db = {
    get available() { return available; },
    put: function (id, dataUrl) {
      mem[id] = dataUrl;
      return tx('readwrite', function (s) { return s.put(dataUrl, id); }).catch(function () {
        try { localStorage.setItem('vd:img:' + id, dataUrl); } catch (e) { /* 仅内存 */ }
        return null;
      });
    },
    get: function (id) {
      if (mem[id]) return Promise.resolve(mem[id]);
      return tx('readonly', function (s) { return s.get(id); }).then(function (v) {
        if (v) { mem[id] = v; return v; }
        try { v = localStorage.getItem('vd:img:' + id); } catch (e) { v = null; }
        if (v) mem[id] = v;
        return v || null;
      }).catch(function () { return mem[id] || null; });
    },
    remove: function (id) {
      delete mem[id];
      try { localStorage.removeItem('vd:img:' + id); } catch (e) { /* noop */ }
      return tx('readwrite', function (s) { return s.delete(id); }).catch(function () { return null; });
    },
    keys: function () {
      return tx('readonly', function (s) { return s.getAllKeys(); }).then(function (k) { return k || Object.keys(mem); })
        .catch(function () { return Object.keys(mem); });
    },
    clear: function () {
      mem = Object.create(null);
      return tx('readwrite', function (s) { return s.clear(); }).catch(function () { return null; });
    }
  };
})(window);
