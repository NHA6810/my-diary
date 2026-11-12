/* 声记 · 纯前端 .docx 生成（ZIP + OOXML，无外部依赖，可离线导出） */
(function (w) {
  'use strict';
  var VD = (w.VD = w.VD || {}), U = VD.util;
  var enc = new TextEncoder();
  function bytes(s) { return s instanceof Uint8Array ? s : enc.encode(s); }

  /* ---------- CRC32 / ZIP(store) ---------- */
  var CRC_TABLE = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(buf) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function zip(files) {
    var parts = [], central = [], offset = 0, now = new Date();
    var dosTime = ((now.getHours() & 31) << 11) | ((now.getMinutes() & 63) << 5) | ((now.getSeconds() >> 1) & 31);
    var dosDate = (((now.getFullYear() - 1980) & 127) << 9) | (((now.getMonth() + 1) & 15) << 5) | (now.getDate() & 31);
    files.forEach(function (f) {
      var name = bytes(f.name), data = bytes(f.data), crc = crc32(data);
      var lh = new Uint8Array(30 + name.length), dv = new DataView(lh.buffer);
      dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true);
      dv.setUint16(6, 0x0800, true); dv.setUint16(8, 0, true);
      dv.setUint16(10, dosTime, true); dv.setUint16(12, dosDate, true);
      dv.setUint32(14, crc, true); dv.setUint32(18, data.length, true); dv.setUint32(22, data.length, true);
      dv.setUint16(26, name.length, true); dv.setUint16(28, 0, true);
      lh.set(name, 30);
      parts.push(lh, data);
      var ch = new Uint8Array(46 + name.length), cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true);
      cv.setUint16(12, dosTime, true); cv.setUint16(14, dosDate, true);
      cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true); cv.setUint16(30, 0, true); cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true); cv.setUint16(36, 0, true); cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      ch.set(name, 46);
      central.push(ch);
      offset += lh.length + data.length;
    });
    var cdSize = central.reduce(function (a, b) { return a + b.length; }, 0);
    var eo = new Uint8Array(22), ev = new DataView(eo.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(4, 0, true); ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true); ev.setUint32(16, offset, true); ev.setUint16(20, 0, true);
    return new Blob(parts.concat(central, [eo]), { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  /* ---------- OOXML 片段 ---------- */
  var XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  var NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  var FONT = '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Microsoft YaHei"/>';

  function run(text, opt) {
    opt = opt || {};
    var rpr = FONT;
    if (opt.size) rpr += '<w:sz w:val="' + opt.size + '"/><w:szCs w:val="' + opt.size + '"/>';
    if (opt.bold) rpr += '<w:b/>';
    if (opt.italic) rpr += '<w:i/>';
    if (opt.color) rpr += '<w:color w:val="' + opt.color + '"/>';
    return '<w:r><w:rPr>' + rpr + '</w:rPr><w:t xml:space="preserve">' + U.escapeXml(text) + '</w:t></w:r>';
  }
  function para(content, opt) {
    opt = opt || {};
    var ppr = '<w:spacing w:before="' + (opt.before || 0) + '" w:after="' + (opt.after === undefined ? 120 : opt.after) + '" w:line="' + (opt.line || 360) + '" w:lineRule="auto"/>';
    if (opt.align) ppr += '<w:jc w:val="' + opt.align + '"/>';
    if (opt.borderBottom) ppr += '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="6" w:color="D9D2C7"/></w:pBdr>';
    return '<w:p><w:pPr>' + ppr + '</w:pPr>' + content + '</w:p>';
  }
  function textPara(text, opt) { return para(run(text, opt), opt); }
  function bodyParas(text) {
    var lines = String(text || '（这天还没有写下文字）').replace(/\r/g, '').split('\n');
    return lines.map(function (line) {
      return line.trim() ? para(run(line, { size: 22 }), { after: 100 }) : '<w:p/>';
    }).join('');
  }
  function imagePara(relId, im, idx, w, h) {
    var maxCx = 5120640; // 5.6 英寸
    var pw = w || 1200, ph = h || 800;
    var cx = Math.max(200000, Math.min(maxCx, Math.round(pw * 9525)));
    var cy = Math.max(150000, Math.round(cx * ph / pw));
    var nm = U.escapeXml(im.name || '图片 ' + (idx + 1));
    return '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="160"/></w:pPr><w:r><w:drawing>' +
      '<wp:inline distT="0" distB="0" distL="0" distR="0">' +
      '<wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:effectExtent l="0" t="0" r="0" b="0"/>' +
      '<wp:docPr id="' + (1000 + idx) + '" name="' + nm + '" descr="日记图片"/><wp:cNvGraphicFramePr/>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="' + nm + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
      '<pic:blipFill><a:blip r:embed="' + relId + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
      '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>' +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
      '</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
  }

  function contentTypes(exts) {
    var def = '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="jpg" ContentType="image/jpeg"/>' +
      '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
      '<Default Extension="png" ContentType="image/png"/>' +
      '<Default Extension="gif" ContentType="image/gif"/>';
    return XML_HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' + def +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      '</Types>';
  }
  var ROOT_RELS = XML_HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
    '</Relationships>';
  var STYLES = XML_HEAD + '<w:styles xmlns:w="' + NS_W + '">' +
    '<w:docDefaults><w:rPrDefault><w:rPr>' + FONT + '<w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>' +
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>' +
    '</w:styles>';

  function coreXml(title, count) {
    var now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    return XML_HEAD + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
      'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>' + U.escapeXml(title) + '</dc:title><dc:creator>声记 · 语音日记</dc:creator>' +
      '<cp:lastModifiedBy>声记</cp:lastModifiedBy>' +
      '<dcterms:created xsi:type="dcterms:W3CDTF">' + now + '</dcterms:created>' +
      '<dcterms:modified xsi:type="dcterms:W3CDTF">' + now + '</dcterms:modified>' +
      '<dc:description>共 ' + count + ' 篇日记</dc:description></cp:coreProperties>';
  }
  var APP_XML = XML_HEAD + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
    'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">' +
    '<Application>声记 Voice Diary</Application></Properties>';

  function documentXml(body) {
    return XML_HEAD + '<w:document xmlns:w="' + NS_W + '" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ' +
      'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
      'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<w:body>' + body +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="720" w:footer="720" w:gutter="0"/>' +
      '</w:sectPr></w:body></w:document>';
  }

  /* ---------- 组装 ---------- */
  function build(entries, opt) {
    opt = opt || {};
    entries = (entries || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var includeImages = opt.includeImages !== false;
    var title = opt.title || '我的日记';
    var media = [], rels = [], bodyParts = [], imgIdx = 0;

    bodyParts.push(textPara(title, { size: 40, bold: true, color: 'B96746', align: 'center', before: 200, after: 100 }));
    bodyParts.push(textPara(entries.length ? (entries[0].date + ' — ' + entries[entries.length - 1].date + '   ·   共 ' + entries.length + ' 篇') : '暂无日记',
      { size: 18, color: '8A827A', align: 'center', after: 320, borderBottom: true }));

    var imageJobs = entries.map(function (e) {
      var imgs = includeImages ? (e.images || []) : [];
      return Promise.all(imgs.map(function (im) { return VD.github.resolveImage(im); }));
    });

    return Promise.all(imageJobs).then(function (imageSets) {
      entries.forEach(function (e, ei) {
        if (ei > 0) bodyParts.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
        bodyParts.push(textPara(U.prettyDate(e.date) + '  ' + U.weekdayOf(e.date),
          { size: 30, bold: true, color: '302C28', before: 240, after: 100, borderBottom: true }));
        var meta = [];
        if (e.moodEmoji || e.mood) meta.push((e.moodEmoji || '') + ' ' + (e.mood || ''));
        if (e.weather) meta.push(e.weather);
        if ((e.tags || []).length) meta.push((e.tags || []).map(function (t) { return '#' + t; }).join('  '));
        meta.push('记录于 ' + String(e.created || '').slice(11, 16));
        bodyParts.push(textPara(meta.filter(Boolean).join('    ·    '), { size: 18, italic: true, color: '8A827A', after: 220 }));
        bodyParts.push(bodyParas(e.content));

        var resolved = imageSets[ei] || [];
        if (resolved.length) {
          bodyParts.push(textPara('这一天的画面', { size: 20, bold: true, color: 'B96746', before: 220, after: 80 }));
          resolved.forEach(function (dataUrl, i) {
            var im = (e.images || [])[i] || {};
            if (!dataUrl) return;
            var ext = /png/i.test(im.mime || '') ? 'png' : /gif/i.test(im.mime || '') ? 'gif' : 'jpg';
            var name = 'word/media/image' + (++imgIdx) + '.' + ext;
            var relId = 'rId' + (10 + imgIdx);
            media.push({ name: name, data: U.base64ToBytes(U.dataUrlToBase64(dataUrl)) });
            rels.push('<Relationship Id="' + relId + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image' + imgIdx + '.' + ext + '"/>');
            bodyParts.push(imagePara(relId, im, imgIdx, im.w, im.h));
          });
        }
        bodyParts.push(textPara('—— 由「声记 · 语音日记」导出', { size: 16, color: 'B4ADA4', align: 'right', before: 260, after: 0 }));
      });

      var docRels = XML_HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        rels.join('') + '</Relationships>';

      var files = [
        { name: '[Content_Types].xml', data: contentTypes() },
        { name: '_rels/.rels', data: ROOT_RELS },
        { name: 'word/document.xml', data: documentXml(bodyParts.join('')) },
        { name: 'word/_rels/document.xml.rels', data: docRels },
        { name: 'word/styles.xml', data: STYLES },
        { name: 'docProps/core.xml', data: coreXml(title, entries.length) },
        { name: 'docProps/app.xml', data: APP_XML }
      ].concat(media);
      return zip(files);
    });
  }

  VD.docx = { build: build, zip: zip };
})(window);
