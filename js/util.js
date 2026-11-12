/* 声记 · 通用工具 */
(function (w) {
  'use strict';
  var VD = (w.VD = w.VD || {});
  var U = (VD.util = {});

  /* 站点与默认归档仓库（部署到 GitHub Pages 后生效） */
  VD.site = {
    url: 'https://nha6810.github.io/my-diary',
    owner: 'NHA6810',
    repo: 'my-diary',          // 站点代码仓库（公开，GitHub Pages 发布用）
    dataRepo: 'my-diary-data', // 日记归档仓库（私有，Contents API 读写用）
    branch: 'main'
  };

  U.$ = function (s, r) { return (r || document).querySelector(s); };
  U.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  U.pad = function (n) { return n < 10 ? '0' + n : '' + n; };
  U.dateKey = function (d) {
    d = d || new Date();
    return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate());
  };
  var WEEK = U.WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  U.weekday = function (d) { return WEEK[(d || new Date()).getDay()]; };
  U.weekdayOf = function (key) {
    var p = String(key).split('-');
    return WEEK[new Date(+p[0], +p[1] - 1, +p[2]).getDay()] || '';
  };
  U.timeStr = function (d) { d = d || new Date(); return U.pad(d.getHours()) + ':' + U.pad(d.getMinutes()); };
  U.localISO = function (d) {
    d = d || new Date();
    return U.dateKey(d) + 'T' + U.pad(d.getHours()) + ':' + U.pad(d.getMinutes()) + ':' + U.pad(d.getSeconds());
  };
  U.prettyDate = function (key) {
    var p = String(key).split('-');
    return p[0] + '年' + Number(p[1]) + '月' + Number(p[2]) + '日';
  };
  U.dayOfYear = function (d) {
    d = d || new Date();
    return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  };
  U.weekOfYear = function (d) {
    d = d || new Date();
    var t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    t.setDate(t.getDate() + 4 - (t.getDay() || 7));
    var y0 = new Date(t.getFullYear(), 0, 1);
    return Math.ceil((((t - y0) / 86400000) + 1) / 7);
  };
  U.greeting = function (h) {
    if (h < 5) return '夜深了，早点休息';
    if (h < 9) return '早上好，新的一天开始了';
    if (h < 12) return '上午好，慢慢来';
    if (h < 14) return '午安，歇一会儿吧';
    if (h < 18) return '下午好，今天过得怎么样';
    if (h < 22) return '晚上好，聊聊今天吧';
    return '夜色温柔，写点什么吧';
  };

  /* ---- 编码 ---- */
  U.utf8Bytes = function (str) { return new TextEncoder().encode(str); };
  U.utf8ToBase64 = function (str) {
    var bytes = U.utf8Bytes(str), bin = '', chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  };
  U.base64ToUtf8 = function (b64) {
    var bin = atob(String(b64).replace(/\s/g, '')), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  };
  U.base64ToBytes = function (b64) {
    var bin = atob(String(b64).replace(/\s/g, '')), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  };
  U.dataUrlToBase64 = function (d) { return String(d).split(',')[1] || ''; };
  U.bytesToDataUrl = function (bytes, mime) {
    var bin = '', chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return 'data:' + (mime || 'image/jpeg') + ';base64,' + btoa(bin);
  };

  U.escapeXml = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  };
  U.escapeHtml = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };

  U.uid = function (prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  };
  U.debounce = function (fn, ms) {
    var t;
    return function () {
      var self = this, args = arguments;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  };
  U.formatBytes = function (n) {
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  };
  U.safeName = function (s) { return String(s).replace(/[^0-9A-Za-z\u4e00-\u9fa5._-]/g, '_').slice(0, 80); };

  var toastTimer;
  U.toast = function (msg, type, ms) {
    var el = U.$('#toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast is-on' + (type ? ' ' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'toast'; }, ms || 2600);
  };
  U.download = function (blob, filename) {
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1500);
  };
  U.copy = function (text) {
    if (navigator.clipboard && w.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (res, rej) {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? res() : rej(new Error('copy failed')); }
      catch (e) { rej(e); }
      document.body.removeChild(ta);
    });
  };

  /* 图片压缩：统一转 JPEG，最长边 1600px，避免 localStorage / GitHub 文件过大 */
  U.compressImage = function (file, maxSide, quality) {
    maxSide = maxSide || 1600; quality = quality || 0.78;
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        try {
          var W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
          var scale = Math.min(1, maxSide / Math.max(W, H));
          var cw = Math.max(1, Math.round(W * scale)), ch = Math.max(1, Math.round(H * scale));
          var cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
          var ctx = cv.getContext('2d');
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cw, ch);
          ctx.drawImage(img, 0, 0, cw, ch);
          var dataUrl = cv.toDataURL('image/jpeg', quality);
          URL.revokeObjectURL(url);
          resolve({ dataUrl: dataUrl, w: cw, h: ch, mime: 'image/jpeg' });
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('图片读取失败')); };
      img.src = url;
    });
  };

  /* 拼接文本时智能加标点/空格 */
  U.appendText = function (base, piece) {
    piece = String(piece || '').trim();
    if (!piece) return base;
    if (!base) return piece;
    var last = base.slice(-1);
    if (/[，。！？；：、,.!?;:\n]/.test(last)) return base + piece;
    if (/[\u4e00-\u9fa5]/.test(last) && /[\u4e00-\u9fa5]/.test(piece[0])) return base + '，' + piece;
    return base + ' ' + piece;
  };
})(window);
