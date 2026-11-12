/* 声记 · 语音转文字：实时识别 + 录音转写双通道 */
(function (w) {
  'use strict';
  var VD = (w.VD = w.VD || {});
  var SR = w.SpeechRecognition || w.webkitSpeechRecognition;
  var rec = null, want = false, timer = null;

  var live = {
    supported: !!SR,
    isActive: function () { return want; },
    start: function (o) {
      o = o || {};
      if (!SR) {
        o.onError && o.onError('当前浏览器不支持实时识别，请切换到「录音」模式，或使用 Chrome / Edge / Safari');
        return false;
      }
      if (want) return true;
      want = true;
      function make() {
        if (!want) return;
        var r = new SR();
        r.lang = o.lang || 'zh-CN';
        r.continuous = true;
        r.interimResults = true;
        r.maxAlternatives = 1;
        r.onstart = function () { o.onStatus && o.onStatus('正在聆听，请说话…', 'rec'); };
        r.onresult = function (ev) {
          var finalText = '', interimText = '';
          for (var i = ev.resultIndex; i < ev.results.length; i++) {
            var res = ev.results[i], t = res[0].transcript;
            if (res.isFinal) finalText += t; else interimText += t;
          }
          if (interimText) o.onInterim && o.onInterim(interimText);
          if (finalText) o.onFinal && o.onFinal(finalText);
        };
        r.onerror = function (ev) {
          if (ev.error === 'no-speech' || ev.error === 'aborted') return;
          var map = {
            'not-allowed': '麦克风权限被拒绝，请在浏览器设置中允许录音',
            'service-not-allowed': '系统语音服务不可用，可切换到「录音」模式',
            'network': '实时识别需要网络连接，可切换到「录音」模式',
            'audio-capture': '没有检测到麦克风',
            'language-not-supported': '当前语言不支持语音识别'
          };
          o.onError && o.onError(map[ev.error] || ('语音识别出错：' + ev.error));
          if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed' || ev.error === 'audio-capture') stop();
        };
        r.onend = function () {
          if (want) timer = setTimeout(make, 260);
          else o.onStatus && o.onStatus('已停止', 'idle');
        };
        rec = r;
        try { r.start(); }
        catch (e) { want = false; o.onError && o.onError('无法启动识别：' + e.message); }
      }
      make();
      return true;
    },
    stop: stop
  };

  function stop() {
    want = false;
    clearTimeout(timer);
    if (rec) {
      try { rec.onend = null; rec.onresult = null; rec.onerror = null; rec.stop(); }
      catch (e) { /* noop */ }
      rec = null;
    }
  }

  /* ---- MediaRecorder：兼容不支持 Web Speech 的浏览器 ---- */
  var mr = null, stream = null, chunks = [];
  function pickMime() {
    if (!w.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
    var list = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    for (var i = 0; i < list.length; i++) if (MediaRecorder.isTypeSupported(list[i])) return list[i];
    return '';
  }
  function extOf(mime) {
    if (/mp4|m4a|aac/i.test(mime)) return 'm4a';
    if (/ogg/i.test(mime)) return 'ogg';
    if (/wav/i.test(mime)) return 'wav';
    return 'webm';
  }
  var recorder = {
    supported: !!(w.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    isActive: function () { return !!(mr && mr.state === 'recording'); },
    start: function () {
      if (!recorder.supported) return Promise.reject(new Error('当前浏览器不支持录音'));
      return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
        stream = s; chunks = [];
        var mime = pickMime();
        mr = mime ? new MediaRecorder(s, { mimeType: mime }) : new MediaRecorder(s);
        mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
        mr.start(250);
        return true;
      });
    },
    stop: function () {
      return new Promise(function (resolve, reject) {
        if (!mr) return reject(new Error('尚未开始录音'));
        var type = mr.mimeType || 'audio/webm';
        mr.onstop = function () {
          var blob = new Blob(chunks, { type: type });
          if (stream) { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { /* noop */ } }
          stream = null; mr = null; chunks = [];
          resolve({ blob: blob, ext: extOf(type), mime: type });
        };
        try { mr.stop(); } catch (e) { reject(e); }
      });
    },
    cancel: function () {
      if (mr && mr.state === 'recording') { try { mr.onstop = null; mr.stop(); } catch (e) { /* noop */ } }
      if (stream) { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) { /* noop */ } }
      stream = null; mr = null; chunks = [];
    },
    transcribe: function (blob, ext, mime) {
      var s = VD.store.settings();
      if (!s.whisperUrl) return Promise.reject(new Error('尚未配置转写接口：请在「设置 → 语音」中填写兼容 Whisper 的接口地址'));
      var fd = new FormData();
      fd.append('file', blob, 'diary-audio.' + (ext || 'webm'));
      fd.append('model', s.whisperModel || 'whisper-1');
      if (s.lang) fd.append('language', String(s.lang).split('-')[0]);
      var h = {};
      if (s.whisperKey) h.Authorization = 'Bearer ' + s.whisperKey;
      return fetch(s.whisperUrl, { method: 'POST', headers: h, body: fd }).then(function (r) {
        if (!r.ok) throw new Error('转写接口返回 ' + r.status);
        return r.json();
      }).then(function (d) {
        var t = d.text || d.transcript || (d.data && d.data.text) || '';
        if (!t) throw new Error('转写结果为空');
        return t;
      });
    }
  };

  VD.speech = { live: live, recorder: recorder, stopAll: function () { stop(); recorder.cancel(); } };
})(window);
