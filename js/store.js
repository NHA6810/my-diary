/* 声记 · 本地状态（设置 + 按日期归档的日记条目） */
(function (w) {
  'use strict';
  var VD = (w.VD = w.VD || {}), U = VD.util;
  var K_SET = 'vd:settings', K_IDX = 'vd:index', K_ENTRY = 'vd:entry:';

  var DEFAULTS = {
    owner: VD.site.owner, repo: VD.site.dataRepo, branch: VD.site.branch, token: '', prefix: 'diaries',
    autoSync: true, syncOnExit: true, commitPrefix: '日记',
    lang: 'zh-CN', whisperUrl: '', whisperKey: '', whisperModel: 'whisper-1',
    theme: 'light', voiceMode: 'live'
  };

  function read(key, fallback) {
    try { var raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (e) { return fallback; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { U.toast('本地空间不足，部分内容可能未能保存', 'warn'); return false; }
  }

  VD.store = {
    defaults: DEFAULTS,
    settings: function () {
      var s = read(K_SET, {}) || {}, out = {};
      Object.keys(DEFAULTS).forEach(function (k) { out[k] = (s[k] === undefined || s[k] === null) ? DEFAULTS[k] : s[k]; });
      return out;
    },
    saveSettings: function (patch) {
      var s = this.settings();
      Object.keys(patch || {}).forEach(function (k) { s[k] = patch[k]; });
      return write(K_SET, s);
    },
    blank: function (date) {
      var now = U.localISO();
      return {
        date: date || U.dateKey(), created: now, updated: now,
        mood: '', moodEmoji: '', weather: '', tags: [], content: '', images: [],
        synced: false, sha: null
      };
    },
    getEntry: function (date) {
      var e = read(K_ENTRY + date, null);
      if (!e) return null;
      var d = this.blank(date);
      Object.keys(d).forEach(function (k) { if (e[k] === undefined) e[k] = d[k]; });
      if (!Array.isArray(e.images)) e.images = [];
      if (!Array.isArray(e.tags)) e.tags = [];
      return e;
    },
    saveEntry: function (e) {
      if (!e || !e.date) return false;
      var idx = read(K_IDX, []) || [];
      if (idx.indexOf(e.date) < 0) { idx.push(e.date); idx.sort(); write(K_IDX, idx); }
      return write(K_ENTRY + e.date, e);
    },
    listDates: function () { return (read(K_IDX, []) || []).slice().sort().reverse(); },
    listEntries: function () {
      var self = this;
      return this.listDates().map(function (d) { return self.getEntry(d); }).filter(Boolean);
    },
    removeEntry: function (date) {
      var e = this.getEntry(date);
      if (e && e.images) e.images.forEach(function (i) { VD.db.remove(i.id); });
      var idx = (read(K_IDX, []) || []).filter(function (d) { return d !== date; });
      write(K_IDX, idx);
      try { localStorage.removeItem(K_ENTRY + date); } catch (err) { /* noop */ }
    },
    clearAll: function () {
      var self = this;
      this.listDates().forEach(function (d) { self.removeEntry(d); });
      try { localStorage.removeItem(K_IDX); localStorage.removeItem(K_SET); } catch (e) { /* noop */ }
      return VD.db.clear();
    },
    exportBackup: function () {
      var self = this, out = { app: 'voice-diary', version: 1, exportedAt: new Date().toISOString(), settings: this.settings(), entries: {} };
      return VD.db.keys().then(function () {
        var jobs = self.listDates().map(function (d) {
          return Promise.all((self.getEntry(d).images || []).map(function (im) {
            return VD.db.get(im.id).then(function (data) { return { id: im.id, dataUrl: data }; });
          })).then(function (imgs) {
            out.entries[d] = { entry: self.getEntry(d), images: imgs };
          });
        });
        return Promise.all(jobs).then(function () { return out; });
      });
    },
    importBackup: function (data) {
      if (!data || data.app !== 'voice-diary' || !data.entries) throw new Error('备份文件格式不正确');
      if (data.settings) this.saveSettings(data.settings);
      var self = this;
      return Promise.all(Object.keys(data.entries).map(function (d) {
        var item = data.entries[d];
        self.saveEntry(item.entry);
        return Promise.all((item.images || []).map(function (im) {
          return im.dataUrl ? VD.db.put(im.id, im.dataUrl) : null;
        }));
      })).then(function () { return Object.keys(data.entries).length; });
    }
  };
})(window);
