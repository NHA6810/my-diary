/* 声记 · 界面渲染 */
(function (w) {
  'use strict';
  var VD = (w.VD = w.VD || {}), U = VD.util;
  var MOODS = [
    { e: '😊', l: '开心' }, { e: '😌', l: '平静' }, { e: '🥰', l: '幸福' }, { e: '🎉', l: '兴奋' },
    { e: '🤔', l: '思考' }, { e: '😔', l: '低落' }, { e: '😤', l: '烦躁' }, { e: '😴', l: '疲惫' },
    { e: '😭', l: '难过' }, { e: '🫶', l: '感恩' }
  ];
  var WEATHERS = [
    { e: '☀️', l: '晴' }, { e: '⛅', l: '多云' }, { e: '☁️', l: '阴' }, { e: '🌧️', l: '小雨' },
    { e: '⛈️', l: '雷雨' }, { e: '❄️', l: '雪' }, { e: '💨', l: '有风' }, { e: '🌫️', l: '雾' }
  ];

  function applyTheme(theme) {
    var dark = theme === 'dark' || (theme === 'auto' && w.matchMedia && w.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#17181a' : '#f7f4ef');
  }

  function switchView(name) {
    U.$$('.view').forEach(function (v) { v.classList.toggle('is-active', v.id === 'view-' + name); });
    U.$$('[data-view]').forEach(function (b) { b.classList.toggle('is-active', b.dataset.view === name); });
    w.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function tickClock() {
    var d = new Date();
    var c = U.$('#heroClock'); if (c) c.textContent = U.timeStr(d) + ':' + U.pad(d.getSeconds());
    var g = U.$('#heroGreeting'); if (g) g.textContent = U.greeting(d.getHours());
    var m = U.$('#heroMeta'); if (m) m.textContent = d.getFullYear() + ' 年第 ' + U.weekOfYear(d) + ' 周 · 第 ' + U.dayOfYear(d) + ' 天';
  }

  function renderHero(date, entry) {
    var p = date.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
    U.$('#heroDay').textContent = Number(p[2]);
    U.$('#heroYM').textContent = p[0] + '年' + Number(p[1]) + '月';
    U.$('#heroWeek').textContent = U.weekdayOf(date);
    U.$('#heroStamp').textContent = '开始于 ' + String(entry.created || '').slice(11, 16) +
      (entry.updated && entry.updated !== entry.created ? ' · 最近编辑 ' + String(entry.updated).slice(11, 16) : '');
    tickClock();
    void d;
  }

  function renderMoods(entry, onPick) {
    var row = U.$('#moodRow');
    row.innerHTML = MOODS.map(function (m) {
      var on = entry.mood === m.l;
      return '<button type="button" class="mood-chip' + (on ? ' is-active' : '') + '" data-label="' + m.l + '" data-emoji="' + m.e + '" role="radio" aria-checked="' + on + '">' +
        '<span class="em">' + m.e + '</span><span class="lb">' + m.l + '</span></button>';
    }).join('');
    U.$$('.mood-chip', row).forEach(function (b) {
      b.addEventListener('click', function () { onPick(b.dataset.emoji, b.dataset.label); });
    });
  }

  function renderWeather(entry, show, onPick) {
    var box = U.$('#weatherRow'), btn = U.$('#weatherBtn');
    box.hidden = !show;
    btn.classList.toggle('is-on', !!show);
    btn.textContent = entry.weather ? entry.weather : '天气 · 未设置';
    if (!show) return;
    box.innerHTML = WEATHERS.map(function (x) {
      var v = x.e + ' ' + x.l;
      return '<button type="button" class="weather-chip' + (entry.weather === v ? ' is-active' : '') + '" data-v="' + v + '">' + v + '</button>';
    }).join('') + '<button type="button" class="weather-chip" data-v="">清除</button>';
    U.$$('.weather-chip', box).forEach(function (b) {
      b.addEventListener('click', function () { onPick(b.dataset.v); });
    });
  }

  function renderTags(entry) {
    U.$('#tagPreview').innerHTML = (entry.tags || []).map(function (t) {
      return '<span class="tag-pill">#' + U.escapeHtml(t) + '</span>';
    }).join('');
  }

  function renderImages(entry, onRemove) {
    var grid = U.$('#imageGrid'), imgs = entry.images || [];
    grid.innerHTML = imgs.map(function (im) {
      return '<div class="img-tile"><img data-id="' + U.escapeHtml(im.id) + '" alt="' + U.escapeHtml(im.name || '日记图片') + '">' +
        '<button class="img-del" type="button" data-del="' + U.escapeHtml(im.id) + '" aria-label="删除图片">×</button>' +
        (im.uploaded ? '' : '<span class="img-badge">待上传</span>') + '</div>';
    }).join('') + '<button class="img-add" type="button" id="addImageBtn"><span>+</span>添加图片</button>';
    U.$('#addImageBtn').addEventListener('click', function () { U.$('#imageInput').click(); });
    U.$$('[data-del]', grid).forEach(function (b) {
      b.addEventListener('click', function () { onRemove(b.dataset.del); });
    });
    imgs.forEach(function (im) {
      VD.github.resolveImage(im).then(function (src) {
        var el = grid.querySelector('img[data-id="' + im.id + '"]');
        if (el && src) el.src = src;
      });
    });
  }

  function setSync(state, text) {
    var chip = U.$('#syncChip');
    chip.dataset.state = state;
    chip.querySelector('.label').textContent = text || ({
      local: '本地草稿', syncing: '同步中…', synced: '已同步', error: '同步失败'
    }[state] || state);
  }

  function setVoice(status, interim, recording, mode) {
    U.$('#voiceStatus').textContent = status;
    U.$('#interim').textContent = interim || '';
    U.$('#micBtn').classList.toggle('is-rec', !!recording);
    U.$('#wave').hidden = !recording;
    U.$('#voiceModeBtn').textContent = mode === 'file' ? '录音' : '实时';
  }

  function renderList(entries, filter) {
    var box = U.$('#entryList'), kw = String(filter || '').trim().toLowerCase();
    var list = entries.filter(function (e) {
      if (!kw) return true;
      return [e.date, e.content, e.mood, e.weather, (e.tags || []).join(' ')].join(' ').toLowerCase().indexOf(kw) >= 0;
    });
    U.$('#listEmpty').hidden = list.length > 0;
    U.$('#listStats').textContent = '共 ' + entries.length + ' 篇' +
      (entries.length ? ' · 已同步 ' + entries.filter(function (e) { return e.synced; }).length + ' 篇' : '');
    box.innerHTML = list.map(function (e) {
      var excerpt = (e.content || '（这天还没有写下文字）').replace(/\n+/g, '  ');
      var imgs = (e.images || []).slice(0, 4);
      return '<article class="entry-card" data-date="' + e.date + '">' +
        '<div class="entry-top"><span class="entry-date">' + U.prettyDate(e.date) + '</span>' +
        '<span class="entry-week">' + U.weekdayOf(e.date) + '</span>' +
        '<span class="entry-mood">' + U.escapeHtml((e.moodEmoji || '') + ' ' + (e.mood || '')) + '</span></div>' +
        '<p class="entry-excerpt">' + U.escapeHtml(excerpt) + '</p>' +
        (imgs.length ? '<div class="entry-thumbs">' + imgs.map(function (im) { return '<img data-img="' + U.escapeHtml(im.id) + '" alt="">'; }).join('') + '</div>' : '') +
        '<div class="entry-foot"><span>' + String(e.updated || '').slice(11, 16) + '</span>' +
        (e.weather ? '<span>' + U.escapeHtml(e.weather) + '</span>' : '') +
        ((e.tags || []).length ? '<span>' + U.escapeHtml(e.tags.map(function (t) { return '#' + t; }).join(' ')) + '</span>' : '') +
        ((e.images || []).length ? '<span>' + e.images.length + ' 张图片</span>' : '') +
        '<span class="badge ' + (e.synced ? 'ok' : 'local') + '">' + (e.synced ? '已归档' : '仅本地') + '</span></div></article>';
    }).join('');
    U.$$('.entry-card', box).forEach(function (c) {
      c.addEventListener('click', function () { w.VD.app.openDate(c.dataset.date); });
    });
    entries.forEach(function (e) {
      (e.images || []).slice(0, 4).forEach(function (im) {
        VD.db.get(im.id).then(function (src) {
          if (!src) return;
          U.$$('img[data-img="' + im.id + '"]', box).forEach(function (el) { el.src = src; });
        });
      });
    });
    return list.length;
  }

  function renderSettings() {
    var s = VD.store.settings();
    ['owner', 'repo', 'branch', 'token', 'prefix', 'commitPrefix', 'lang', 'whisperUrl', 'whisperKey', 'whisperModel', 'theme'].forEach(function (k) {
      var el = U.$('#cfg' + k.charAt(0).toUpperCase() + k.slice(1));
      if (el) el.value = s[k] == null ? '' : s[k];
    });
    U.$('#cfgAutoSync').checked = !!s.autoSync;
    U.$('#cfgSyncOnExit').checked = !!s.syncOnExit;
    U.$('#connState').textContent = VD.github.isConfigured() ? s.owner + '/' + s.repo : '待填令牌 · ' + s.owner + '/' + s.repo;
    U.$('#speechSupport').textContent = VD.speech.live.supported ? '实时识别可用' : '实时识别不可用';
    applyTheme(s.theme);
  }

  function modal(o) {
    var box = U.$('#modal');
    U.$('#modalTitle').textContent = o.title || '';
    U.$('#modalBody').innerHTML = o.html || '';
    var foot = U.$('#modalFoot'); foot.innerHTML = '';
    (o.actions || []).forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'btn ' + (a.cls || ''); b.textContent = a.label;
      b.addEventListener('click', function () { a.onClick && a.onClick(close); });
      foot.appendChild(b);
    });
    box.hidden = false;
    return close;
  }
  function closeModal() { U.$('#modal').hidden = true; U.$('#modalBody').innerHTML = ''; }
  function close() { closeModal(); }

  VD.ui = {
    MOODS: MOODS, WEATHERS: WEATHERS,
    applyTheme: applyTheme, switchView: switchView, tickClock: tickClock,
    renderHero: renderHero, renderMoods: renderMoods, renderWeather: renderWeather,
    renderTags: renderTags, renderImages: renderImages, renderList: renderList,
    renderSettings: renderSettings, setSync: setSync, setVoice: setVoice,
    modal: modal, closeModal: closeModal
  };
})(window);
