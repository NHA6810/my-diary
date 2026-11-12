/* 声记 · GitHub REST 归档（Contents API + Git Trees API） */
(function (w) {
  'use strict';
  var VD = (w.VD = w.VD || {}), U = VD.util;
  var API = 'https://api.github.com';

  function cfg() { return VD.store.settings(); }
  function norm(p) { return String(p || '').replace(/^\/+|\/+$/g, ''); }
  function branch() { return cfg().branch || 'main'; }
  function base() {
    var s = cfg();
    return API + '/repos/' + encodeURIComponent(s.owner) + '/' + encodeURIComponent(s.repo);
  }
  function encPath(p) { return norm(p).split('/').map(encodeURIComponent).join('/'); }
  function headers() {
    return {
      'Authorization': 'Bearer ' + cfg().token,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    };
  }
  function friendly(status, msg) {
    if (status === 401) return '令牌无效或已过期，请到设置里更新';
    if (status === 403) return '没有权限或触发 API 限流：请检查令牌的 Contents 读写权限';
    if (status === 404) return '找不到仓库或分支，请检查所有者 / 仓库名 / 分支';
    if (status === 409 || status === 422) return '文件冲突（' + status + '）：在别处被修改，请重试';
    return 'GitHub 请求失败（' + status + '）' + (msg ? '：' + msg : '');
  }
  function isConfigured() {
    var s = cfg();
    return !!(s.owner && s.repo && s.token);
  }

  function request(path, opts) {
    if (!isConfigured()) return Promise.reject(new Error('尚未配置 GitHub 仓库'));
    opts = opts || {};
    var url = base() + path;
    return fetch(url, {
      method: opts.method || 'GET',
      headers: headers(),
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      keepalive: !!opts.keepalive
    }).then(function (res) {
      return res.text().then(function (raw) {
        var data = null;
        try { data = raw ? JSON.parse(raw) : null; } catch (e) { data = null; }
        if (res.status === 404 && opts.nullOn404) return null;
        if (!res.ok) throw new Error(friendly(res.status, data && data.message));
        return data;
      });
    });
  }

  function getFile(path, binary) {
    var q = '?ref=' + encodeURIComponent(branch()) + '&t=' + Date.now();
    return request('/contents/' + encPath(path) + q, { nullOn404: true }).then(function (d) {
      if (!d || !d.content) return null;
      var b64 = String(d.content).replace(/\s/g, '');
      return {
        sha: d.sha, size: d.size, base64: b64,
        text: binary ? '' : U.base64ToUtf8(b64)
      };
    });
  }

  function put(path, body, keepalive) {
    return request('/contents/' + encPath(path), { method: 'PUT', body: body, keepalive: keepalive });
  }
  function commitMsg(what, date) {
    var s = cfg();
    return (s.commitPrefix || '日记') + ' ' + what + (date ? ' ' + date : '');
  }

  function putText(path, text, message, sha, keepalive) {
    var body = { message: message || '更新日记', content: U.utf8ToBase64(text), branch: branch() };
    if (sha) body.sha = sha;
    return put(path, body, keepalive);
  }
  function putBinary(path, b64, message, sha) {
    var body = { message: message || '上传日记图片', content: b64, branch: branch() };
    if (sha) body.sha = sha;
    return put(path, body, false);
  }
  /* 关闭页面时用：不等待结果，keepalive 保证请求发出 */
  function firePutText(path, text, message, sha) {
    try {
      var body = { message: message, content: U.utf8ToBase64(text), branch: branch() };
      if (sha) body.sha = sha;
      fetch(base() + '/contents/' + encPath(path), {
        method: 'PUT', headers: headers(), body: JSON.stringify(body), keepalive: true
      }).catch(function () { /* 页面已卸载 */ });
      return true;
    } catch (e) { return false; }
  }

  function walkDir(dir) {
    return request('/contents/' + encPath(dir) + '?ref=' + encodeURIComponent(branch()) + '&t=' + Date.now(), { nullOn404: true })
      .then(function (list) {
        if (!list || !Array.isArray(list)) return [];
        var out = [], jobs = list.map(function (it) {
          if (it.type === 'dir') return walkDir(it.path).then(function (sub) { out = out.concat(sub); });
          if (/\.md$/i.test(it.name)) out.push(it.path);
          return Promise.resolve();
        });
        return Promise.all(jobs).then(function () { return out; });
      });
  }

  function listMarkdowns() {
    var prefix = norm(cfg().prefix || 'diaries');
    return request('/git/trees/' + encodeURIComponent(branch()) + '?recursive=1&t=' + Date.now(), { nullOn404: true })
      .then(function (tree) {
        if (tree && Array.isArray(tree.tree)) {
          return tree.tree.filter(function (x) {
            return x.type === 'blob' && x.path.indexOf(prefix + '/') === 0 && /\.md$/i.test(x.path);
          }).map(function (x) { return x.path; });
        }
        return walkDir(prefix);
      })
      .catch(function () { return walkDir(prefix); });
  }

  function test() {
    return request('').then(function (d) {
      return { full_name: d.full_name, default_branch: d.default_branch, private: d.private };
    });
  }

  function deleteAsset(path, date) {
    if (!isConfigured() || !path) return Promise.resolve(false);
    return getFile(path, true).then(function (f) {
      if (!f) return false;
      return request('/contents/' + encPath(path), {
        method: 'DELETE',
        body: { message: commitMsg('删除图片', date), sha: f.sha, branch: branch() }
      }).then(function () { return true; });
    }).catch(function () { return false; });
  }

  /* ---------- 路径规则 ---------- */
  function entryPath(date) {
    var p = date.split('-');
    return norm(cfg().prefix || 'diaries') + '/' + p[0] + '/' + p[1] + '/' + date + '.md';
  }
  function assetPath(date, filename) {
    return norm(cfg().prefix || 'diaries') + '/assets/' + date + '/' + U.safeName(filename);
  }
  function blobUrl(path) {
    var s = cfg();
    return 'https://github.com/' + encodeURIComponent(s.owner) + '/' + encodeURIComponent(s.repo) +
      '/blob/' + encodeURIComponent(branch()) + '/' + norm(path).split('/').map(encodeURIComponent).join('/');
  }
  function relPath(fromFile, toFile) {
    var a = fromFile.split('/'); a.pop();
    var b = toFile.split('/');
    while (a.length && b.length && a[0] === b[0]) { a.shift(); b.shift(); }
    return (a.length ? new Array(a.length + 1).join('../') : './') + b.join('/');
  }
  function q(v) { return JSON.stringify(v == null ? '' : String(v)); }

  /* ---------- Markdown 归档格式 ---------- */
  function buildMarkdown(e) {
    var ep = entryPath(e.date), imgs = e.images || [], L = [];
    L.push('---');
    L.push('date: ' + q(e.date));
    L.push('weekday: ' + q(U.weekdayOf(e.date)));
    L.push('created: ' + q(e.created));
    L.push('updated: ' + q(e.updated));
    L.push('mood: ' + q(e.mood));
    L.push('mood_emoji: ' + q(e.moodEmoji));
    L.push('weather: ' + q(e.weather));
    L.push('tags: [' + (e.tags || []).map(q).join(', ') + ']');
    L.push('images:');
    imgs.forEach(function (im) { L.push('  - ' + q(im.path || '')); });
    L.push('---', '');
    L.push('# ' + U.prettyDate(e.date) + ' · ' + U.weekdayOf(e.date), '');
    var meta = [];
    if (e.moodEmoji || e.mood) meta.push(((e.moodEmoji || '') + ' ' + (e.mood || '')).trim());
    if (e.weather) meta.push(e.weather);
    if ((e.tags || []).length) meta.push('#' + e.tags.join(' #'));
    meta.push('记录于 ' + String(e.created || '').slice(11, 16));
    L.push('> ' + meta.filter(Boolean).join(' · '), '');
    L.push(e.content || '（这天还没有写下文字）', '');
    if (imgs.length) {
      L.push('## 这一天的画面', '');
      imgs.forEach(function (im, i) {
        L.push('![' + (im.name || '图片 ' + (i + 1)).replace(/[\]\n]/g, ' ') + '](' + relPath(ep, im.path || '') + ')');
      });
      L.push('');
    }
    var payload = {
      v: 1, date: e.date, created: e.created, updated: e.updated,
      mood: e.mood, moodEmoji: e.moodEmoji, weather: e.weather,
      tags: e.tags, content: e.content,
      images: imgs.map(function (im) {
        return { id: im.id, name: im.name, path: im.path, mime: im.mime, w: im.w, h: im.h };
      })
    };
    L.push('<!-- VD-DATA:' + U.utf8ToBase64(JSON.stringify(payload)) + ' -->', '');
    return L.join('\n');
  }

  function normalize(p, fallbackDate) {
    var base = VD.store.blank(p.date || fallbackDate || U.dateKey());
    return {
      date: p.date || base.date, created: p.created || base.created, updated: p.updated || base.updated,
      mood: p.mood || '', moodEmoji: p.moodEmoji || '', weather: p.weather || '',
      tags: Array.isArray(p.tags) ? p.tags : [], content: p.content || '',
      images: (Array.isArray(p.images) ? p.images : []).map(function (im, i) {
        if (typeof im === 'string') im = { path: im };
        return {
          id: im.id || 'gh-' + i + '-' + (im.path || '').split('/').pop(),
          name: im.name || '图片 ' + (i + 1), path: im.path || '',
          mime: im.mime || 'image/jpeg', w: im.w || 1200, h: im.h || 800,
          uploaded: true
        };
      }),
      synced: true, sha: null
    };
  }

  function parseMarkdown(text, fallbackDate) {
    var m = /<!--\s*VD-DATA:([A-Za-z0-9+/=]+)\s*-->/.exec(text);
    if (m) {
      try { return normalize(JSON.parse(U.base64ToUtf8(m[1])), fallbackDate); }
      catch (e) { /* 继续用 frontmatter 解析 */ }
    }
    var fm = /^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n([\s\S]*)$/.exec(text);
    var meta = { tags: [], images: [] }, body = fm ? fm[2] : text;
    if (fm) {
      var inImages = false;
      fm[1].split(/\r?\n/).forEach(function (line) {
        if (/^\s*-\s+/.test(line) && inImages) { meta.images.push(line.replace(/^\s*-\s+/, '').trim().replace(/^"|"$/g, '')); return; }
        inImages = false;
        var kv = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
        if (!kv) return;
        var v = kv[2].trim().replace(/^"|"$/g, '');
        if (kv[1] === 'images') { inImages = true; return; }
        if (kv[1] === 'tags') { meta.tags = v.replace(/^\[|\]$/g, '').split(',').map(function (x) { return x.trim().replace(/^"|"$/g, ''); }).filter(Boolean); return; }
        meta[kv[1]] = v;
      });
    }
    body = body.replace(/^#\s+[^\n]*\n?/m, '').replace(/^>\s+[^\n]*\n?/m, '');
    var cut = body.indexOf('## 这一天的画面');
    if (cut >= 0) body = body.slice(0, cut);
    return normalize({
      date: meta.date || fallbackDate, created: meta.created, updated: meta.updated,
      mood: meta.mood, moodEmoji: meta.mood_emoji, weather: meta.weather,
      tags: meta.tags, content: body.trim(), images: meta.images
    }, fallbackDate);
  }

  function guessMime(path) {
    return /\.png$/i.test(path) ? 'image/png' : /\.gif$/i.test(path) ? 'image/gif' :
      /\.webp$/i.test(path) ? 'image/webp' : 'image/jpeg';
  }
  /* 从仓库读取图片，转成可用的 data URL；带缓存 */
  function resolveImage(img) {
    if (!img) return Promise.resolve(null);
    return VD.db.get(img.id).then(function (cached) {
      if (cached) return cached;
      if (!img.path || !isConfigured()) return null;
      return getFile(img.path, true).then(function (f) {
        if (!f) return null;
        var dataUrl = U.bytesToDataUrl(U.base64ToBytes(f.base64), guessMime(img.path));
        return VD.db.put(img.id, dataUrl).then(function () { return dataUrl; });
      });
    }).catch(function () { return null; });
  }

  VD.github = {
    isConfigured: isConfigured, cfg: cfg, test: test, getFile: getFile,
    putText: putText, putBinary: putBinary, firePutText: firePutText, deleteAsset: deleteAsset,
    listMarkdowns: listMarkdowns, commitMsg: commitMsg,
    entryPath: entryPath, assetPath: assetPath, blobUrl: blobUrl,
    buildMarkdown: buildMarkdown, parseMarkdown: parseMarkdown,
    resolveImage: resolveImage, guessMime: guessMime
  };
})(window);
