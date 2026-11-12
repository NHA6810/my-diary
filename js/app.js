/* 声记 · 业务逻辑（上）：状态、编辑器、语音、图片、GitHub 同步 */
(function (w) {
  'use strict';
  var VD = (w.VD = w.VD || {}), U = VD.util;
  var $ = U.$;

  var state = {
    date: U.dateKey(), lastDateKey: U.dateKey(), entry: null,
    view: 'write', weatherOpen: false, voiceMode: 'live', recording: false,
    syncing: false, dirty: false, lastSyncedMd: '', lastExitAt: 0, filter: ''
  };

  function parseTags(str) {
    return String(str || '').split(/[,，、;；\n]/).map(function (s) {
      return s.trim().replace(/^#+/, '');
    }).filter(Boolean).slice(0, 20);
  }
  function fingerprint(e) {
    return JSON.stringify([e.content, e.tags, e.mood, e.moodEmoji, e.weather,
      (e.images || []).map(function (i) { return i.path; })]);
  }
  function collect() {
    var e = state.entry;
    e.content = $('#content').value;
    e.tags = parseTags($('#tagsInput').value);
    var fp = fingerprint(e);
    if (state.dirty && fp !== state.lastFp) {
      e.updated = U.localISO();
      state.lastFp = fp;
    }
    return e;
  }
  function persist() {
    var e = collect();
    VD.store.saveEntry(e);
    VD.ui.renderHero(state.date, e);
    return e;
  }
  function updateCount() { $('#charCount').textContent = $('#content').value.length + ' 字'; }
  function updateAutoHint() {
    var s = VD.store.settings();
    $('#autoHint').textContent = VD.github.isConfigured()
      ? '已绑定 ' + s.owner + '/' + s.repo + ' · ' + (s.branch || 'main') + '/' + (s.prefix || 'diaries') + '/年/月/日期.md，输入停止后自动归档'
      : '内容先保存在本机；到「设置」绑定 GitHub 仓库后即可自动归档。';
  }
  function refreshList() { return VD.features.refreshList(); }

  var autoSave = U.debounce(function () { persist(); }, 700);
  var autoSync = U.debounce(function () {
    if (VD.store.settings().autoSync && VD.github.isConfigured()) syncNow({ silent: true });
  }, 25000);

  function markDirty() {
    state.dirty = true;
    if (state.entry) state.entry.synced = false;
    VD.ui.setSync('local', '有改动未同步');
    autoSave();
    if (VD.store.settings().autoSync && VD.github.isConfigured()) autoSync();
  }

  function openDate(date) {
    if (state.dirty) persist();
    var e = VD.store.getEntry(date) || VD.store.blank(date);
    state.date = date; state.entry = e; state.dirty = false;
    state.lastFp = fingerprint(e);
    $('#content').value = e.content || '';
    $('#tagsInput').value = (e.tags || []).join(', ');
    VD.ui.renderHero(date, e);
    VD.ui.renderMoods(e, pickMood);
    VD.ui.renderWeather(e, state.weatherOpen, pickWeather);
    VD.ui.renderTags(e);
    VD.ui.renderImages(e, removeImage);
    updateCount();
    VD.ui.setSync(e.synced ? 'synced' : 'local', e.synced ? '已同步' : '本地草稿');
    state.lastSyncedMd = e.synced ? VD.github.buildMarkdown(e) : '';
    VD.ui.switchView('write'); state.view = 'write';
    updateAutoHint();
  }

  function pickMood(emoji, label) {
    var e = collect();
    if (e.mood === label) { e.mood = ''; e.moodEmoji = ''; }
    else { e.mood = label; e.moodEmoji = emoji; }
    VD.ui.renderMoods(e, pickMood);
    markDirty();
  }
  function pickWeather(v) {
    var e = collect();
    e.weather = v || '';
    VD.ui.renderWeather(e, true, pickWeather);
    markDirty();
  }

  /* ---------- 图片 ---------- */
  function addImages(fileList) {
    var files = Array.prototype.slice.call(fileList || []).filter(function (f) { return /^image\//.test(f.type); });
    if (!files.length) return;
    U.toast('正在压缩 ' + files.length + ' 张图片…');
    var chain = Promise.resolve();
    files.forEach(function (f) {
      chain = chain.then(function () {
        return U.compressImage(f).then(function (c) {
          var id = U.uid('img'), fname = id + '.jpg';
          /* 写入内存缓存是同步的；持久化异步进行，不阻塞图片出现在界面上 */
          VD.db.put(id, c.dataUrl);
          state.entry.images.push({
            id: id, name: f.name || fname, path: VD.github.assetPath(state.date, fname),
            mime: 'image/jpeg', w: c.w, h: c.h, uploaded: false
          });
        }).catch(function (err) { U.toast('图片处理失败：' + err.message, 'error'); });
      });
    });
    chain.then(function () {
      VD.ui.renderImages(state.entry, removeImage);
      markDirty();
      U.toast('已添加图片，稍后自动上传', 'ok');
    });
  }
  function removeImage(id) {
    var im = (state.entry.images || []).filter(function (x) { return x.id === id; })[0];
    state.entry.images = (state.entry.images || []).filter(function (x) { return x.id !== id; });
    VD.db.remove(id);
    if (im && im.path && VD.github.isConfigured()) VD.github.deleteAsset(im.path, state.date);
    VD.ui.renderImages(state.entry, removeImage);
    markDirty();
  }

  /* ---------- 语音 ---------- */
  function appendToEditor(t) {
    var ta = $('#content');
    ta.value = U.appendText(ta.value, t);
    ta.scrollTop = ta.scrollHeight;
    updateCount(); markDirty();
  }
  function setVoiceMode(mode) {
    if (state.recording) { U.toast('请先结束当前录音', 'warn'); return; }
    if (mode === 'file' && !VD.speech.recorder.supported) { U.toast('当前浏览器不支持录音', 'error'); return; }
    if (mode === 'live' && !VD.speech.live.supported) { U.toast('当前浏览器不支持实时识别，请使用「录音」模式', 'warn'); }
    state.voiceMode = mode;
    VD.store.saveSettings({ voiceMode: mode });
    VD.ui.setVoice(mode === 'live' ? '点击麦克风，把想说的话变成文字' : '点击开始录音，结束后自动转成文字', '', false, mode);
  }
  function startVoice() {
    var s = VD.store.settings();
    if (state.voiceMode === 'live') {
      var ok = VD.speech.live.start({
        lang: s.lang,
        onStatus: function (t) { VD.ui.setVoice(t, '', true, 'live'); },
        onInterim: function (t) { VD.ui.setVoice('正在聆听…', '「' + t + '」', true, 'live'); },
        onFinal: function (t) { appendToEditor(t); },
        onError: function (msg) {
          U.toast(msg, 'error'); state.recording = false;
          VD.ui.setVoice('识别已停止', '', false, state.voiceMode);
        }
      });
      if (ok) { state.recording = true; VD.ui.setVoice('正在启动麦克风…', '', true, 'live'); }
    } else {
      VD.speech.recorder.start().then(function () {
        state.recording = true;
        VD.ui.setVoice('录音中…点击麦克风结束并转写', '', true, 'file');
      }).catch(function (err) { U.toast('无法录音：' + err.message, 'error'); });
    }
  }
  function stopVoice() {
    if (state.voiceMode === 'live') {
      VD.speech.live.stop(); state.recording = false;
      VD.ui.setVoice('已停止，文字已写入日记', '', false, 'live');
      U.toast('语音已写入日记', 'ok');
    } else {
      VD.ui.setVoice('正在转写，请稍候…', '', false, 'file');
      VD.speech.recorder.stop().then(function (r) {
        return VD.speech.recorder.transcribe(r.blob, r.ext, r.mime);
      }).then(function (t) {
        appendToEditor(t); state.recording = false;
        VD.ui.setVoice('转写完成，文字已写入日记', '', false, 'file');
        U.toast('语音已转成文字', 'ok');
      }).catch(function (err) {
        state.recording = false;
        VD.ui.setVoice('转写失败', '', false, 'file');
        U.toast(err.message, 'error');
      });
    }
  }
  function toggleMic() { state.recording ? stopVoice() : startVoice(); }

  /* ---------- GitHub 同步 ---------- */
  function withConflictRetry(fn, path) {
    return fn(null).catch(function (err) {
      if (!/冲突|409|422/.test(err.message)) throw err;
      return VD.github.getFile(path).then(function (f) { return fn(f && f.sha); });
    });
  }

  function syncNow(opts) {
    opts = opts || {};
    if (!VD.github.isConfigured()) {
      VD.ui.setSync('local', '本地草稿');
      if (!opts.silent) U.toast('尚未配置 GitHub，内容已保存在本机', 'warn');
      return Promise.resolve(false);
    }
    if (state.syncing) return Promise.resolve(false);
    var e = persist();
    state.syncing = true;
    VD.ui.setSync('syncing', '同步中…');
    var md = '', path = VD.github.entryPath(e.date);

    return (function () {
      var jobs = Promise.resolve();
      (e.images || []).forEach(function (im) {
        if (im.uploaded) return;
        jobs = jobs.then(function () {
          return VD.db.get(im.id).then(function (data) {
            if (!data) { im.uploaded = true; return; }
            return withConflictRetry(function (sha) {
              return VD.github.getFile(im.path, true).then(function (f) {
                return VD.github.putBinary(im.path, U.dataUrlToBase64(data),
                  VD.github.commitMsg('图片', e.date), sha || (f && f.sha));
              });
            }, im.path).then(function () { im.uploaded = true; });
          });
        });
      });
      return jobs.then(function () {
        md = VD.github.buildMarkdown(e);
        return VD.github.getFile(path);
      }).then(function (prev) {
        return VD.github.putText(path, md, VD.github.commitMsg(prev ? '更新' : '新建', e.date),
          prev && prev.sha, !!opts.exit).catch(function (err) {
          if (!/冲突|409|422/.test(err.message)) throw err;
          return VD.github.getFile(path).then(function (f) {
            return VD.github.putText(path, md, VD.github.commitMsg('更新', e.date), f && f.sha, !!opts.exit);
          });
        });
      });
    })().then(function (out) {
      e.synced = true;
      if (out && out.content && out.content.sha) e.sha = out.content.sha;
      state.lastSyncedMd = md; state.dirty = false;
      VD.store.saveEntry(e);
      VD.ui.setSync('synced', '已同步 ' + U.timeStr());
      if (!opts.silent) U.toast('已归档到 GitHub 仓库', 'ok');
      refreshList();
      return true;
    }).catch(function (err) {
      VD.ui.setSync('error', '同步失败');
      if (!opts.silent) U.toast(err.message || '同步失败', 'error');
      else console.warn('[声记] 自动同步失败：', err.message);
      return false;
    }).then(function (r) { state.syncing = false; return r; });
  }

  /* 关闭 / 退出时的兜底同步：keepalive 请求可在页面卸载后继续发出 */
  function fastExitSync() {
    var s = VD.store.settings();
    if (!s.syncOnExit || !VD.github.isConfigured() || state.syncing) return;
    var e = collect();
    VD.store.saveEntry(e);
    var md = VD.github.buildMarkdown(e);
    if (md === state.lastSyncedMd) return;
    VD.github.firePutText(VD.github.entryPath(e.date), md, VD.github.commitMsg('自动同步', e.date), e.sha);
    state.lastSyncedMd = md;
  }

  function switchToView(name) {
    if (state.view === 'write' && name !== 'write' && state.dirty) persist();
    state.view = name;
    VD.ui.switchView(name);
    if (name === 'list') refreshList();
    if (name === 'settings') VD.ui.renderSettings();
  }

  /* ======================================================================
     业务逻辑（下）：回顾、导出、分享、设置、事件绑定
     ====================================================================== */
  function refreshListNow() {
    return VD.ui.renderList(VD.store.listEntries(), state.filter);
  }

  function pull(opts) {
    opts = opts || {};
    if (!VD.github.isConfigured()) {
      if (!opts.silent) { U.toast('请先在「设置」中绑定 GitHub 仓库', 'warn'); switchToView('settings'); }
      return Promise.resolve(0);
    }
    if (!opts.silent) U.toast('正在从仓库读取日记…');
    return VD.github.listMarkdowns().then(function (paths) {
      if (!paths.length) { if (!opts.silent) U.toast('仓库中还没有日记文件', 'warn'); return 0; }
      return Promise.all(paths.map(function (p) {
        return VD.github.getFile(p).then(function (f) {
          if (!f) return null;
          var e = VD.github.parseMarkdown(f.text, (p.split('/').pop() || '').replace(/\.md$/i, ''));
          e.sha = f.sha;
          var local = VD.store.getEntry(e.date);
          if (local && !local.synced && String(local.updated) > String(e.updated)) {
            local.sha = f.sha; VD.store.saveEntry(local); return local;
          }
          if (local && local.synced === true && String(local.updated) > String(e.updated)) return local;
          VD.store.saveEntry(e);
          return e;
        }).catch(function () { return null; });
      })).then(function (r) { return r.filter(Boolean).length; });
    }).then(function (n) {
      if (n && !opts.silent) U.toast('已从仓库载入 ' + n + ' 篇日记', 'ok');
      refreshListNow();
      return n;
    }).catch(function (err) {
      if (!opts.silent) U.toast(err.message, 'error');
      else console.warn('[声记] 拉取失败：', err.message);
      return 0;
    });
  }

  function exportWord(scope) {
    var all = VD.store.listEntries(), entries;
    if (scope === 'current') entries = [collect()];
    else if (scope === 'month') entries = all.filter(function (e) { return e.date.slice(0, 7) === state.date.slice(0, 7); });
    else if (scope === 'filtered') entries = all.filter(function (e) {
      return [e.date, e.content, e.mood, e.weather, (e.tags || []).join(' ')].join(' ').toLowerCase()
        .indexOf(String(state.filter).toLowerCase()) >= 0;
    });
    else entries = all;
    if (!entries.length) { U.toast('没有可导出的日记', 'warn'); return; }
    U.toast('正在生成 Word 文档…');
    var title = scope === 'current' ? U.prettyDate(state.date) + ' 日记' : '我的日记合集';
    VD.docx.build(entries, { title: title, includeImages: true }).then(function (blob) {
      var tag = scope === 'current' ? state.date : scope === 'month' ? state.date.slice(0, 7) : scope === 'filtered' ? '筛选' : '全部';
      U.download(blob, '声记日记_' + tag + '_' + U.dateKey() + '.docx');
      U.toast('已导出 ' + entries.length + ' 篇日记', 'ok');
    }).catch(function (err) { U.toast('导出失败：' + err.message, 'error'); });
  }

  function exportDialog() {
    var opts = [
      { v: 'current', t: '仅当前这篇日记' },
      { v: 'month', t: '本月的所有日记' },
      { v: 'all', t: '全部日记（' + VD.store.listDates().length + ' 篇）' }
    ];
    if (state.filter.trim()) opts.push({ v: 'filtered', t: '当前搜索结果' });
    VD.ui.modal({
      title: '导出为 Word 文档',
      html: '<p>选择要导出的范围，生成标准 .docx 文件（含文字、心情、标签与图片）。</p>' +
        '<div class="opt-list" style="margin-top:12px">' + opts.map(function (o, i) {
          return '<label class="opt"><input type="radio" name="scope" value="' + o.v + '"' + (i === 0 ? ' checked' : '') + '>' + o.t + '</label>';
        }).join('') + '</div><p class="tip">导出在本机完成，无需联网，也不会上传任何内容。</p>',
      actions: [
        { label: '取消', onClick: function (c) { c(); } },
        {
          label: '生成 .docx', cls: 'btn-primary', onClick: function (c) {
            var el = document.querySelector('input[name="scope"]:checked');
            var v = el ? el.value : 'current'; c(); exportWord(v);
          }
        }
      ]
    });
  }

  function shareText(e) {
    var L = [U.prettyDate(e.date) + ' · ' + U.weekdayOf(e.date)], m = [];
    if (e.moodEmoji || e.mood) m.push(((e.moodEmoji || '') + ' ' + (e.mood || '')).trim());
    if (e.weather) m.push(e.weather);
    if (m.length) L.push(m.join(' · '));
    L.push('', e.content || '（这天还没有写下文字）');
    if ((e.tags || []).length) L.push('', e.tags.map(function (t) { return '#' + t; }).join('  '));
    L.push('', '—— 记于「声记 · 语音日记」');
    return L.join('\n');
  }
  function share() {
    var e = collect(), text = shareText(e);
    var link = VD.github.isConfigured() ? VD.github.blobUrl(VD.github.entryPath(e.date)) : location.href;
    VD.ui.modal({
      title: '转发分享',
      html: '<p>日记内容（可直接粘贴发送）：</p>' +
        '<textarea class="share-text" id="shareText" readonly>' + U.escapeHtml(text) + '</textarea>' +
        '<div class="status-line" style="margin-top:10px"><span>仓库链接</span><span style="text-align:right;word-break:break-all;max-width:70%">' +
        U.escapeHtml(VD.github.isConfigured() ? link : '未绑定仓库，分享当前页面地址') + '</span></div>' +
        '<p class="tip">私有仓库的链接仅对有权限的成员可见；系统分享会调用手机/浏览器原生分享面板。</p>',
      actions: [
        { label: '复制文本', onClick: function () { U.copy(text).then(function () { U.toast('日记文本已复制', 'ok'); }); } },
        { label: '复制链接', onClick: function () { U.copy(link).then(function () { U.toast('链接已复制', 'ok'); }); } },
        {
          label: '复制 Markdown', onClick: function () {
            U.copy(VD.github.buildMarkdown(e)).then(function () { U.toast('Markdown 已复制', 'ok'); });
          }
        },
        {
          label: '系统分享', cls: 'btn-primary', onClick: function () {
            if (navigator.share) {
              navigator.share({ title: '我的日记 · ' + e.date, text: text, url: link })
                .catch(function (err) { if (err && err.name !== 'AbortError') U.toast('分享失败，可改用复制', 'error'); });
            } else {
              U.copy(text + '\n' + link).then(function () { U.toast('当前浏览器不支持原生分享，已复制内容', 'ok'); });
            }
          }
        }
      ]
    });
  }

  function statusDialog() {
    var s = VD.store.settings(), e = collect();
    var pending = (e.images || []).filter(function (i) { return !i.uploaded; }).length;
    var rows = [
      ['仓库', VD.github.isConfigured() ? s.owner + '/' + s.repo : '未配置'],
      ['归档目录', (s.prefix || 'diaries') + '/年/月/日期.md'],
      ['分支', s.branch || 'main'],
      ['本篇状态', e.synced ? '已归档' : '仅本地 / 有改动'],
      ['待上传图片', pending + ' 张'],
      ['本地日记', VD.store.listDates().length + ' 篇'],
      ['实时语音识别', VD.speech.live.supported ? '可用' : '不可用（可用录音模式）']
    ];
    VD.ui.modal({
      title: '同步状态',
      html: rows.map(function (r) {
        return '<div class="status-line"><span>' + U.escapeHtml(r[0]) + '</span><span>' + U.escapeHtml(r[1]) + '</span></div>';
      }).join('') + '<p class="tip">日记先写入本机，随后以 Markdown 归档到仓库；切换后台、刷新或关闭页面时会自动补传。</p>',
      actions: [
        { label: '去设置', onClick: function (c) { c(); switchToView('settings'); } },
        { label: '立即同步', cls: 'btn-primary', onClick: function (c) { c(); syncNow({}); } }
      ]
    });
  }

  /* ---------- 设置 ---------- */
  function readForm() {
    return {
      owner: $('#cfgOwner').value.trim(), repo: $('#cfgRepo').value.trim(),
      branch: $('#cfgBranch').value.trim() || 'main',
      prefix: ($('#cfgPrefix').value.trim() || 'diaries').replace(/^\/+|\/+$/g, ''),
      token: $('#cfgToken').value.trim(),
      commitPrefix: $('#cfgCommitPrefix').value.trim() || '日记',
      autoSync: $('#cfgAutoSync').checked, syncOnExit: $('#cfgSyncOnExit').checked,
      lang: $('#cfgLang').value,
      whisperUrl: $('#cfgWhisperUrl').value.trim(),
      whisperKey: $('#cfgWhisperKey').value.trim(),
      whisperModel: $('#cfgWhisperModel').value.trim() || 'whisper-1',
      theme: $('#cfgTheme').value
    };
  }
  function saveForm(silent) {
    VD.store.saveSettings(readForm());
    var s = VD.store.settings();
    VD.ui.applyTheme(s.theme);
    $('#connState').textContent = VD.github.isConfigured() ? s.owner + '/' + s.repo : '未配置';
    updateAutoHint();
    if (!silent) U.toast('设置已保存', 'ok');
  }
  function bindSettings() {
    $('#saveSettingsBtn').addEventListener('click', function () { saveForm(); });
    $('#testConnBtn').addEventListener('click', function () {
      saveForm(true);
      if (!VD.github.isConfigured()) { U.toast('请先填写所有者、仓库名和令牌', 'warn'); return; }
      U.toast('正在连接 GitHub…');
      VD.github.test().then(function (d) {
        U.toast('连接成功：' + d.full_name + '（默认分支 ' + d.default_branch + '）', 'ok', 4000);
        if (!$('#cfgBranch').value.trim()) { $('#cfgBranch').value = d.default_branch; saveForm(true); }
        $('#connState').textContent = '已连接 · ' + d.full_name;
      }).catch(function (err) { U.toast(err.message, 'error', 4500); });
    });
    $('#cfgTheme').addEventListener('change', function () { VD.ui.applyTheme(this.value); });
    $('#clearLocalBtn').addEventListener('click', function () {
      VD.ui.modal({
        title: '清除本地数据',
        html: '<p>将删除本机保存的全部日记草稿、图片与设置。</p><p class="tip">GitHub 仓库中的文件不会被删除。建议先「导出本地备份」。</p>',
        actions: [
          { label: '取消', onClick: function (c) { c(); } },
          { label: '确认清除', cls: 'btn-danger', onClick: function (c) { c(); VD.store.clearAll().then(function () { location.reload(); }); } }
        ]
      });
    });
    $('#exportBackupBtn').addEventListener('click', function () {
      VD.store.exportBackup().then(function (data) {
        U.download(new Blob([JSON.stringify(data)], { type: 'application/json' }), '声记备份_' + U.dateKey() + '.json');
        U.toast('备份已导出', 'ok');
      });
    });
    $('#importBackupBtn').addEventListener('click', function () { $('#backupInput').click(); });
    $('#backupInput').addEventListener('change', function (ev) {
      var f = ev.target.files && ev.target.files[0]; if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          VD.store.importBackup(JSON.parse(reader.result)).then(function (n) {
            U.toast('已导入 ' + n + ' 篇日记', 'ok');
            VD.ui.renderSettings(); refreshListNow(); openDate(state.date);
          });
        } catch (err) { U.toast(err.message || '备份文件无法读取', 'error'); }
      };
      reader.readAsText(f); ev.target.value = '';
    });
  }

  /* ---------- 事件 ---------- */
  function bind() {
    U.$$('[data-view]').forEach(function (b) {
      b.addEventListener('click', function () { switchToView(b.dataset.view); });
    });
    $('#content').addEventListener('input', function () { updateCount(); markDirty(); });
    $('#tagsInput').addEventListener('input', function () { VD.ui.renderTags(collect()); markDirty(); });
    $('#weatherBtn').addEventListener('click', function () {
      state.weatherOpen = !state.weatherOpen;
      VD.ui.renderWeather(collect(), state.weatherOpen, pickWeather);
    });
    $('#imageInput').addEventListener('change', function (ev) { addImages(ev.target.files); ev.target.value = ''; });
    $('#micBtn').addEventListener('click', toggleMic);
    $('#voiceModeBtn').addEventListener('click', function () { setVoiceMode(state.voiceMode === 'live' ? 'file' : 'live'); });
    $('#saveBtn').addEventListener('click', function () { persist(); syncNow({}); });
    $('#exportBtn').addEventListener('click', exportDialog);
    $('#exportAllBtn').addEventListener('click', exportDialog);
    $('#shareBtn').addEventListener('click', share);
    $('#syncChip').addEventListener('click', statusDialog);
    $('#pullBtn').addEventListener('click', function () { pull(); });
    $('#refreshBtn').addEventListener('click', function () { refreshListNow(); U.toast('已刷新', 'ok'); });
    $('#searchInput').addEventListener('input', U.debounce(function (ev) { state.filter = ev.target.value; refreshListNow(); }, 220));
    $('#modalClose').addEventListener('click', VD.ui.closeModal);
    $('#modal').addEventListener('click', function (ev) { if (ev.target.id === 'modal') VD.ui.closeModal(); });
    document.addEventListener('keydown', function (ev) {
      if ((ev.ctrlKey || ev.metaKey) && String(ev.key).toLowerCase() === 's') {
        ev.preventDefault(); persist(); syncNow({});
      }
      if (ev.key === 'Escape') VD.ui.closeModal();
    });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'hidden') return;
      persist();
      if (VD.store.settings().syncOnExit && VD.github.isConfigured()) syncNow({ silent: true, exit: true });
    });
    w.addEventListener('pagehide', fastExitSync);
    w.addEventListener('beforeunload', fastExitSync);
  }

  function init() {
    var s = VD.store.settings();
    VD.ui.applyTheme(s.theme);
    state.voiceMode = VD.speech.live.supported ? (s.voiceMode || 'live') : 'file';
    VD.features.bindSettings();
    bind();
    openDate(U.dateKey());
    VD.ui.setVoice(state.voiceMode === 'live'
      ? '点击麦克风，把想说的话变成文字'
      : '点击开始录音，结束后自动转成文字', '', false, state.voiceMode);
    updateAutoHint();
    if (!VD.github.isConfigured()) {
      setTimeout(function () { U.toast('欢迎使用声记！到「设置」填入 GitHub 令牌即可自动归档到 ' + VD.site.owner + '/' + VD.site.dataRepo, 'warn', 4600); }, 800);
    } else {
      setTimeout(function () { pull({ silent: true }); }, 900);
    }
    setInterval(function () {
      VD.ui.tickClock();
      var k = U.dateKey();
      if (k !== state.lastDateKey) {
        state.lastDateKey = k;
        openDate(k);
        U.toast('新的一天，已为你新建 ' + U.prettyDate(k) + ' 的日记', 'ok', 4000);
      }
    }, 30000);
  }

  var features = {
    refreshList: refreshListNow, pull: pull, exportDialog: exportDialog, exportWord: exportWord,
    share: share, statusDialog: statusDialog, bindSettings: bindSettings
  };
  VD.features = features;
  VD.app = {
    state: state, collect: collect, persist: persist, markDirty: markDirty,
    syncNow: syncNow, openDate: openDate, switchToView: switchToView,
    refreshList: refreshList, updateAutoHint: updateAutoHint
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window);
