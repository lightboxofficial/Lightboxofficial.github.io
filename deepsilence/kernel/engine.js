/* ============================================================
   OriginalDeepsilenceHeart (ODH) · 窗口引擎
   ------------------------------------------------------------
   引擎由三部分组成：
     1. 排版文件  layouts/*.json     窗口基础属性 + 侧边栏各项(内嵌 html/css/js)
     2. 指令集    events/commands.json   定义“有哪些指令可用”
     3. 事件定义  events/events.json     每个事件是一段指令序列；root 为启动流程，
                                          其余事件可在 HTML 中用 runEvent('名') 调用
   引擎自身不含任何具体内容，内容全部来自上述文件。
   ============================================================ */
(function (global) {
  'use strict';

  var VERSION = '1.0.0';
  var IS_FILE = location.protocol === 'file:';
  var STORE_PREFIX = 'lbx.win.';
  var WALL_KEY = 'odh.wallpaper';
  var WALL_DEFAULT_JSON = 'https://lightboxofficial.github.io/Bing-Wallpaper-Action/data/zh-CN_update.json';
  var WALL_DEFAULT_HOST = 'https://cn.bing.com';
  var Z_TOP = 60;

  /* ------------------------------------------------------------
     0. 基础工具
     ------------------------------------------------------------ */
  function num(v, d) {
    if (typeof v === 'number' && isFinite(v)) return v;
    if (v !== null && v !== undefined && v !== '' && isFinite(Number(v))) return Number(v);
    return d;
  }

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function px(v) {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number') return v + 'px';
    var s = String(v).trim();
    if (/^-?\d+(\.\d+)?$/.test(s)) return s + 'px';
    return s;
  }

  function escapeHtml(str) {
    return String(str === null || str === undefined ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function readStore(key) {
    try {
      var raw = localStorage.getItem(STORE_PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  function writeStore(key, value) {
    try {
      localStorage.setItem(STORE_PREFIX + key, JSON.stringify(value));
    } catch (err) {
      /* 隐私模式下忽略 */
    }
  }

  function readWallpaper() {
    try {
      return localStorage.getItem(WALL_KEY) || '';
    } catch (err) {
      return '';
    }
  }

  function writeWallpaper(url) {
    try {
      if (url) localStorage.setItem(WALL_KEY, url);
      else localStorage.removeItem(WALL_KEY);
    } catch (err) {
      /* 隐私模式下忽略 */
    }
  }

  /* 默认壁纸源：与 simple 一致，取 Bing 每日壁纸数据的首图 */
  function loadDefaultWallpaper() {
    if (!global.fetch) return Promise.reject(new Error('当前环境不支持 fetch'));
    return fetch(WALL_DEFAULT_JSON, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        var img = data && data.images && data.images[0];
        if (!img || !img.url) throw new Error('壁纸数据为空');
        var url = /^https?:/i.test(img.url) ? img.url : WALL_DEFAULT_HOST + img.url;
        return new Promise(function (resolve, reject) {
          var pre = new Image();
          pre.onload = function () { resolve(url); };
          pre.onerror = function () { reject(new Error('默认壁纸图片加载失败')); };
          pre.src = url;
        });
      });
  }

  var DEFAULT_ICON =
    '<svg viewBox="0 0 24 24"><rect x="3.5" y="4" width="17" height="16" rx="3"/>' +
    '<path d="M8 9.5h8M8 13.5h5"/></svg>';

  var ICONS = {
    sidebar:
      '<svg viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="15" rx="2.6"/>' +
      '<line x1="9.6" y1="4.8" x2="9.6" y2="19.2"/></svg>',
    settings:
      '<svg viewBox="0 0 24 24"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="17" x2="20" y2="17"/>' +
      '<circle cx="9" cy="7" r="2.1"/><circle cx="15" cy="17" r="2.1"/></svg>',
    min: '<svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    max: '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>',
    close:
      '<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
  };

  /* ------------------------------------------------------------
     1. 源文件注册表
     浏览器在 file:// 下无法 fetch 本地 json，
     因此 mirror.js 会把三件套原文镜像进 ODH_MIRROR，保证双击可预览；
     通过 http(s) 访问时优先读取真实文件。
     ------------------------------------------------------------ */
  var Sources = {
    inline: {},
    cache: Object.create(null),

    registerInline: function (map) {
      if (!map) return;
      Object.keys(map).forEach(function (key) {
        this.inline[normalizePath(key)] = map[key];
      }, this);
    },

    text: function (name) {
      var self = this;
      var key = normalizePath(name);
      if (self.cache[key] !== undefined) return Promise.resolve(self.cache[key]);

      function fromInline() {
        if (self.inline[key] !== undefined) {
          self.cache[key] = self.inline[key];
          return self.inline[key];
        }
        return null;
      }

      if (IS_FILE) {
        var inlineRaw = fromInline();
        if (inlineRaw !== null) return Promise.resolve(inlineRaw);
        return Promise.reject(new Error('离线模式下找不到镜像源: ' + key));
      }

      return fetch(key, { cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.text();
        })
        .then(function (txt) {
          self.cache[key] = txt;
          return txt;
        })
        .catch(function () {
          var fallback = fromInline();
          if (fallback !== null) return fallback;
          throw new Error('找不到源文件: ' + key);
        });
    },

    tryText: function (name) {
      return this.text(name).catch(function () {
        return null;
      });
    },

    json: function (name) {
      return this.text(name).then(function (txt) {
        try {
          return JSON.parse(txt);
        } catch (err) {
          throw new Error('JSON 解析失败 ' + name + '：' + err.message);
        }
      });
    }
  };

  function normalizePath(p) {
    return String(p).replace(/\\/g, '/').replace(/^\.\//, '');
  }

  /* ------------------------------------------------------------
     2. 排版文件规范化
     ------------------------------------------------------------ */
  function normalizeLayout(raw, name) {
    if (!raw || typeof raw !== 'object') throw new Error('排版文件内容为空：' + name);
    var base = raw.base || raw.window || {};
    var win = {
      id: String(raw.id || base.id || name.replace(/^.*\//, '').replace(/\..*$/, '')),
      title: base.title || raw.title || '窗口',
      icon: base.icon || DEFAULT_ICON,
      width: num(base.width, 720),
      height: num(base.height, 480),
      x: base.x !== undefined ? base.x : 'center',
      y: base.y !== undefined ? base.y : 'center',
      opacity: clamp(num(base.opacity, 0.8), 0.2, 1),
      radius: clamp(num(base.radius, 16), 0, 40),
      blur: clamp(num(base.blur, 28), 0, 60),
      padding: clamp(num(base.padding, 0), 0, 80),
      minWidth: num(base.minWidth, 320),
      minHeight: num(base.minHeight, 220),
      resizable: base.resizable !== false,
      draggable: base.draggable !== false
    };

    var sb = raw.sidebar || {};
    var items = (sb.items || []).map(function (it, i) {
      if (typeof it === 'string') {
        return { id: 'page-' + (i + 1), label: it, icon: '', html: '', htmlSrc: null };
      }
      return {
        id: String(it.id || 'page-' + (i + 1)),
        label: it.label || it.title || it.id || '页面 ' + (i + 1),
        icon: it.icon || '',
        html: it.html || '',
        htmlSrc: it.htmlSrc || null
      };
    });

    var page = raw.page || raw.layout || {};
    return {
      name: name,
      win: win,
      sidebar: { title: sb.title || '目录', items: items },
      page: {
        html: page.html || raw.html || '',
        htmlSrc: page.htmlSrc || null
      }
    };
  }

  /* ------------------------------------------------------------
     3. 指令参数解析（供 runStatement 调用）
     ------------------------------------------------------------ */
  function splitTop(str, sep) {
    var out = [];
    var buf = '';
    var quote = null;
    var depth = 0;
    for (var i = 0; i < str.length; i++) {
      var c = str[i];
      if (quote) {
        buf += c;
        if (c === quote && str[i - 1] !== '\\') quote = null;
        continue;
      }
      if (c === '"' || c === "'") {
        quote = c;
        buf += c;
        continue;
      }
      if (c === '(' || c === '[' || c === '{') {
        depth++;
        buf += c;
        continue;
      }
      if (c === ')' || c === ']' || c === '}') {
        depth--;
        buf += c;
        continue;
      }
      if (c === sep && depth === 0) {
        out.push(buf);
        buf = '';
        continue;
      }
      buf += c;
    }
    if (buf.trim() !== '') out.push(buf);
    return out;
  }

  function parseLiteral(raw) {
    var s = String(raw).trim();
    if (!s) return '';
    if ((s.charAt(0) === '"' && s.charAt(s.length - 1) === '"') ||
        (s.charAt(0) === "'" && s.charAt(s.length - 1) === "'")) {
      return s.slice(1, -1).replace(/\\([\\'"n])/g, function (m, ch) {
        return ch === 'n' ? '\n' : ch;
      });
    }
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    return s;
  }

  function findTopEquals(piece) {
    var quote = null;
    var depth = 0;
    for (var i = 0; i < piece.length; i++) {
      var c = piece[i];
      if (quote) {
        if (c === quote && piece[i - 1] !== '\\') quote = null;
        continue;
      }
      if (c === '"' || c === "'") {
        quote = c;
        continue;
      }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
      else if (c === '=' && depth === 0) {
        if (piece[i + 1] === '=') return -1;
        if (i > 0 && (piece[i - 1] === '=' || piece[i - 1] === '!' || piece[i - 1] === '<' || piece[i - 1] === '>')) return -1;
        return i;
      }
    }
    return -1;
  }

  /* 解析调用实参：返回 [{key, value}]，key 为 null 表示位置参数 */
  function parseCallArgs(str) {
    if (!str || !str.trim()) return [];
    var pieces = splitTop(str, ',');
    var args = [];
    for (var i = 0; i < pieces.length; i++) {
      var piece = pieces[i].trim();
      if (!piece) continue;
      var eq = findTopEquals(piece);
      if (eq > 0) {
        args.push({ key: piece.slice(0, eq).trim(), value: parseLiteral(piece.slice(eq + 1)) });
      } else {
        args.push({ key: null, value: parseLiteral(piece) });
      }
    }
    return args;
  }

  /* ------------------------------------------------------------
     4. 透明 html 加载层文档
     ------------------------------------------------------------ */
  var FRAME_CSS = [
    // 加载层必须彻底透明：html/body 不绘制任何底色，只留内容对象
    'html,body{margin:0;padding:0;background:transparent!important;background-color:transparent!important;background-image:none!important;}',
    'html{color-scheme:dark;}',
    'body{overflow:auto;overflow-x:hidden;color:rgba(255,255,255,.86);',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;',
    'font-size:13.5px;line-height:1.68;-webkit-font-smoothing:antialiased;}',
    'body::-webkit-scrollbar{width:6px;height:6px;}',
    'body::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:3px;}',
    'body::-webkit-scrollbar-track{background:transparent;}',
    'a{color:rgba(255,255,255,.82);text-decoration:none;}',
    'a:hover{text-decoration:underline;}',
    'h1,h2,h3,h4{color:#fff;font-weight:600;}',
    '*{box-sizing:border-box;}',
    '::selection{background:rgba(255,255,255,.22);}'
  ].join('');

  function buildFrameDoc(html) {
    return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">' +
      '<style>' + FRAME_CSS + '</style></head><body>' + (html || '') + '</body></html>';
  }

  /* ------------------------------------------------------------
     5. 单窗口
     ------------------------------------------------------------ */
  var SETTINGS_FIELDS = [
    { key: 'x', label: 'X', step: 1 },
    { key: 'y', label: 'Y', step: 1 },
    { key: 'w', label: '宽', step: 1, min: 320 },
    { key: 'h', label: '高', step: 1, min: 220 },
    { key: 'opacity', label: '透明度', step: 0.01, min: 0.2, max: 1 },
    { key: 'radius', label: '圆角', step: 1, min: 0, max: 40 },
    { key: 'blur', label: '模糊', step: 1, min: 0, max: 60 },
    { key: 'padding', label: '内边距', step: 1, min: 0, max: 80 }
  ];

  function resolveAxis(v, size, viewMax) {
    if (typeof v === 'number' && isFinite(v)) return v;
    if (v === null || v === undefined || v === 'center') return Math.round((viewMax - size) / 2);
    var n = parseFloat(v);
    return isFinite(n) ? n : Math.round((viewMax - size) / 2);
  }

  function LBWindow(layout, overrides) {
    overrides = overrides || {};
    this.layout = layout;
    this.id = layout.win.id;
    this.pages = layout.sidebar.items;
    this.state = this.initialState(overrides);
    this.maximized = false;
    this.minimized = false;
    this.prevState = null;
    this.popOpen = null;
    this.pageId = null;
    this.dockChip = null;
    this.saveTimer = null;

    this.el = this.build();
    document.body.appendChild(this.el);
    this.bar = this.el.querySelector('.lb-titlebar');
    this.frame = this.el.querySelector('.lb-frame');

    this.clampPos();
    this.applyState();
    this.bind();
    this.syncInputs();
    this.setTitle(this.state.title);

    var self = this;
    requestAnimationFrame(function () {
      self.el.classList.add('lb-open');
    });

    this.setPage(this.pages.length ? this.pages[0].id : null);
  }

  LBWindow.prototype.initialState = function (overrides) {
    var b = this.layout.win;
    var saved = readStore(this.id) || {};
    var vw = global.innerWidth;
    var vh = global.innerHeight;

    var w = num(overrides.w, num(saved.w, b.width));
    var h = num(overrides.h, num(saved.h, b.height));
    w = clamp(w, b.minWidth, Math.max(b.minWidth, vw - 12));
    h = clamp(h, b.minHeight, Math.max(b.minHeight, vh - 12));

    var x, y;
    if (overrides.x !== undefined) x = num(overrides.x, 0);
    else if (saved.x !== undefined) x = num(saved.x, 0);
    else x = resolveAxis(b.x, w, vw);

    if (overrides.y !== undefined) y = num(overrides.y, 0);
    else if (saved.y !== undefined) y = num(saved.y, 0);
    else y = resolveAxis(b.y, h, vh);

    return {
      x: x,
      y: y,
      w: w,
      h: h,
      title: saved.title || b.title,
      opacity: clamp(num(overrides.opacity, num(saved.opacity, b.opacity)), 0.2, 1),
      radius: saved.radius !== undefined ? clamp(num(saved.radius, b.radius), 0, 40) : b.radius,
      blur: saved.blur !== undefined ? clamp(num(saved.blur, b.blur), 0, 60) : b.blur,
      padding: saved.padding !== undefined ? clamp(num(saved.padding, b.padding), 0, 80) : b.padding
    };
  };

  LBWindow.prototype.build = function () {
    var win = this.layout.win;

    var el = document.createElement('section');
    el.className = 'lb-window';
    el.setAttribute('data-win', this.id);
    el.style.minWidth = win.minWidth + 'px';
    el.style.minHeight = win.minHeight + 'px';

    var navHtml = this.pages.map(function (it) {
      return '<button class="lb-nav-item" data-page="' + escapeHtml(it.id) + '">' +
        (it.icon ? it.icon : '') + '<span>' + escapeHtml(it.label) + '</span></button>';
    }).join('');

    if (!navHtml) {
      navHtml = '<span class="lb-nav-empty">此排版文件未声明侧边栏</span>';
    }

    var fieldsHtml = SETTINGS_FIELDS.map(function (f) {
      return '<label class="lb-ifield"><span>' + escapeHtml(f.label) + '</span>' +
        '<input type="number" data-key="' + f.key + '"' +
        (f.min !== undefined ? ' min="' + f.min + '"' : '') +
        (f.max !== undefined ? ' max="' + f.max + '"' : '') +
        (f.step !== undefined ? ' step="' + f.step + '"' : '') + '></label>';
    }).join('');

    el.innerHTML =
      '<header class="lb-titlebar">' +
        '<div class="lb-cluster lb-cluster-left">' +
          '<button class="lb-ibtn" data-act="sidebar" title="侧边栏" aria-label="侧边栏">' + ICONS.sidebar + '</button>' +
          '<button class="lb-ibtn" data-act="settings" title="窗口属性" aria-label="窗口属性">' + ICONS.settings + '</button>' +
        '</div>' +
        '<div class="lb-cluster lb-cluster-center">' +
          '<span class="lb-winicon">' + win.icon + '</span>' +
          '<span class="lb-wintitle"></span>' +
        '</div>' +
        '<div class="lb-cluster lb-cluster-right">' +
          '<button class="lb-ibtn lb-tb" data-act="min" title="最小化" aria-label="最小化">' + ICONS.min + '</button>' +
          '<button class="lb-ibtn lb-tb" data-act="max" title="最大化" aria-label="最大化">' + ICONS.max + '</button>' +
          '<button class="lb-ibtn lb-tb lb-tb-close" data-act="close" title="关闭" aria-label="关闭">' + ICONS.close + '</button>' +
        '</div>' +

        '<div class="lb-pop lb-pop-sidebar" data-pop="sidebar">' +
          '<span class="lb-pop-label">' + escapeHtml(this.layout.sidebar.title) + '</span>' +
          '<div class="lb-nav">' + navHtml + '</div>' +
        '</div>' +

        '<div class="lb-pop lb-pop-settings" data-pop="settings">' +
          '<div class="lb-set-head"><span class="lb-pop-label">窗口属性</span>' +
            '<span class="lb-set-actions">' +
              '<button class="lb-mini" data-act="settings-center">居中</button>' +
              '<button class="lb-mini" data-act="settings-reset">重置</button>' +
            '</span></div>' +
          '<div class="lb-set-row">' +
            '<label class="lb-ifield lb-ifield-title"><span>标题</span><input type="text" data-key="title"></label>' +
            fieldsHtml +
          '</div>' +
        '</div>' +
      '</header>' +

      '<div class="lb-body">' +
        '<div class="lb-layer lb-layer-frame"><iframe class="lb-frame" title="内容加载层" ' +
          'sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe></div>' +
      '</div>' +

      ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map(function (dir) {
        return '<div class="lb-rz" data-dir="' + dir + '"></div>';
      }).join('');

    // 侧边栏 / 属性 浮窗的容器在标题栏之外时结构更稳，这里保持标题栏内以共享拖拽区
    return el;
  };

  LBWindow.prototype.setTitle = function (title) {
    this.state.title = String(title === undefined || title === null ? '' : title);
    var node = this.el.querySelector('.lb-wintitle');
    if (node) node.textContent = this.state.title;
    this.el.setAttribute('aria-label', this.state.title);
    this.syncInputs('title');
  };

  LBWindow.prototype.applyState = function () {
    var s = this.state;
    this.el.style.left = Math.round(s.x) + 'px';
    this.el.style.top = Math.round(s.y) + 'px';
    this.el.style.width = Math.round(s.w) + 'px';
    this.el.style.height = Math.round(s.h) + 'px';
    this.el.style.setProperty('--lb-opacity', s.opacity);
    this.el.style.setProperty('--lb-radius', s.radius + 'px');
    this.el.style.setProperty('--lb-blur', s.blur + 'px');
    this.el.style.setProperty('--lb-pad', s.padding + 'px');
  };

  LBWindow.prototype.syncInputs = function (skipKey) {
    var s = this.state;
    Array.prototype.forEach.call(this.el.querySelectorAll('input[data-key]'), function (input) {
      var key = input.getAttribute('data-key');
      if (key === skipKey && input === document.activeElement) return;
      var v = s[key];
      if (v === undefined) return;
      if (input.value !== String(v) && input !== document.activeElement) input.value = v;
    });
  };

  LBWindow.prototype.save = function () {
    var self = this;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(function () {
      writeStore(self.id, self.state);
    }, 220);
  };

  LBWindow.prototype.applyField = function (key, raw) {
    if (key === 'title') {
      this.setTitle(raw);
      this.save();
      return;
    }
    if (!(key in this.state)) return;
    var v = Number(raw);
    if (!isFinite(v)) return;
    if (key === 'w') v = Math.max(this.layout.win.minWidth, v);
    if (key === 'h') v = Math.max(this.layout.win.minHeight, v);
    if (key === 'opacity') v = clamp(v, 0.2, 1);
    if (key === 'radius') v = clamp(v, 0, 40);
    if (key === 'blur') v = clamp(v, 0, 60);
    if (key === 'padding') v = clamp(v, 0, 80);
    this.state[key] = v;
    this.applyState();
    this.syncInputs(key);
    this.save();
  };

  LBWindow.prototype.resetState = function () {
    var b = this.layout.win;
    var vw = global.innerWidth;
    var vh = global.innerHeight;
    this.maximized = false;
    this.el.classList.remove('lb-max');
    this.state.w = clamp(b.width, b.minWidth, Math.max(b.minWidth, vw - 12));
    this.state.h = clamp(b.height, b.minHeight, Math.max(b.minHeight, vh - 12));
    this.state.x = resolveAxis(b.x, this.state.w, vw);
    this.state.y = resolveAxis(b.y, this.state.h, vh);
    this.state.opacity = b.opacity;
    this.state.radius = b.radius;
    this.state.blur = b.blur;
    this.state.padding = b.padding;
    this.setTitle(b.title);
    this.applyState();
    this.syncInputs();
    this.save();
    Kernel.log('窗口 ' + this.id + ' 属性已重置', 'ok');
  };

  LBWindow.prototype.center = function () {
    this.state.x = Math.round((global.innerWidth - this.state.w) / 2);
    this.state.y = Math.round((global.innerHeight - this.state.h) / 2);
    this.applyState();
    this.syncInputs();
    this.save();
  };

  LBWindow.prototype.bind = function () {
    var self = this;

    this.el.addEventListener('pointerdown', function () {
      self.bringToFront();
    }, true);

    this.bar.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      if (act === 'sidebar' || act === 'settings') self.togglePop(act);
      else if (act === 'min') {
        self.closePops();
        self.minimize();
      } else if (act === 'max') {
        self.closePops();
        self.toggleMax();
      } else if (act === 'close') {
        self.close();
      } else if (act === 'settings-reset') self.resetState();
      else if (act === 'settings-center') self.center();
    });

    var nav = this.el.querySelector('.lb-nav');
    nav.addEventListener('click', function (e) {
      var item = e.target.closest('[data-page]');
      if (!item) return;
      self.setPage(item.getAttribute('data-page'));
      self.closePops();
    });

    var settingsPop = this.el.querySelector('.lb-pop-settings');
    settingsPop.addEventListener('input', function (e) {
      var input = e.target;
      if (!input || !input.getAttribute) return;
      var key = input.getAttribute('data-key');
      if (!key) return;
      self.applyField(key, input.value);
    });

    this.bar.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target.closest('.lb-pop') || e.target.closest('button') || e.target.closest('input')) return;
      self.bringToFront();
      self.closePops();
      if (self.maximized || !self.layout.win.draggable) return;
      self.startDrag(e);
    });

    this.bar.addEventListener('dblclick', function (e) {
      if (e.target.closest('button') || e.target.closest('.lb-pop')) return;
      self.toggleMax();
    });

    if (this.layout.win.resizable) {
      Array.prototype.forEach.call(this.el.querySelectorAll('.lb-rz'), function (h) {
        h.addEventListener('pointerdown', function (e) {
          if (e.button !== undefined && e.button !== 0) return;
          if (self.maximized) return;
          self.startResize(e, h);
        });
      });
    } else {
      Array.prototype.forEach.call(this.el.querySelectorAll('.lb-rz'), function (h) {
        h.parentNode.removeChild(h);
      });
    }
  };

  LBWindow.prototype.startDrag = function (e) {
    var self = this;
    var bar = this.bar;
    var sx = e.clientX;
    var sy = e.clientY;
    var ox = this.state.x;
    var oy = this.state.y;

    bar.classList.add('lb-grabbing');

    function move(ev) {
      self.state.x = ox + (ev.clientX - sx);
      self.state.y = oy + (ev.clientY - sy);
      self.clampPos();
      self.applyState();
      self.syncInputs();
    }

    function end() {
      bar.classList.remove('lb-grabbing');
      bar.removeEventListener('pointermove', move);
      bar.removeEventListener('pointerup', end);
      bar.removeEventListener('pointercancel', end);
      self.save();
    }

    try {
      bar.setPointerCapture(e.pointerId);
    } catch (err) {
      /* 某些浏览器不支持，忽略 */
    }
    bar.addEventListener('pointermove', move);
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', end);
    e.preventDefault();
  };

  LBWindow.prototype.startResize = function (e, handle) {
    var self = this;
    var dir = handle.getAttribute('data-dir');
    var s0 = { x: this.state.x, y: this.state.y, w: this.state.w, h: this.state.h };
    var sx = e.clientX;
    var sy = e.clientY;
    var minW = this.layout.win.minWidth;
    var minH = this.layout.win.minHeight;

    function move(ev) {
      var dx = ev.clientX - sx;
      var dy = ev.clientY - sy;
      var x = s0.x;
      var y = s0.y;
      var w = s0.w;
      var h = s0.h;

      if (dir.indexOf('e') >= 0) w = s0.w + dx;
      if (dir.indexOf('s') >= 0) h = s0.h + dy;
      if (dir.indexOf('w') >= 0) {
        w = s0.w - dx;
        x = s0.x + dx;
      }
      if (dir.indexOf('n') >= 0) {
        h = s0.h - dy;
        y = s0.y + dy;
      }
      if (w < minW) {
        if (dir.indexOf('w') >= 0) x = s0.x + (s0.w - minW);
        w = minW;
      }
      if (h < minH) {
        if (dir.indexOf('n') >= 0) y = s0.y + (s0.h - minH);
        h = minH;
      }

      self.state.x = x;
      self.state.y = y;
      self.state.w = w;
      self.state.h = h;
      self.applyState();
      self.syncInputs();
    }

    function end() {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      self.save();
    }

    try {
      handle.setPointerCapture(e.pointerId);
    } catch (err) {
      /* ignore */
    }
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    e.preventDefault();
    e.stopPropagation();
  };

  LBWindow.prototype.clampPos = function () {
    var vw = global.innerWidth;
    var vh = global.innerHeight;
    this.state.x = clamp(this.state.x, -(this.state.w - 180), vw - 180);
    this.state.y = clamp(this.state.y, 0, Math.max(0, vh - 54));
  };

  LBWindow.prototype.bringToFront = function () {
    this.el.style.zIndex = ++Z_TOP;
    Kernel.focused = this;
  };

  LBWindow.prototype.toggleMax = function () {
    if (!this.maximized) {
      this.prevState = {
        x: this.state.x,
        y: this.state.y,
        w: this.state.w,
        h: this.state.h
      };
      this.maximized = true;
      this.el.classList.add('lb-max');
      this.state.x = 8;
      this.state.y = 8;
      this.state.w = global.innerWidth - 16;
      this.state.h = global.innerHeight - 72;
    } else {
      this.maximized = false;
      this.el.classList.remove('lb-max');
      if (this.prevState) {
        this.state.x = this.prevState.x;
        this.state.y = this.prevState.y;
        this.state.w = this.prevState.w;
        this.state.h = this.prevState.h;
      }
    }
    this.applyState();
    this.syncInputs();
    this.save();
  };

  LBWindow.prototype.minimize = function () {
    this.minimized = true;
    this.closePops();
    this.el.classList.add('lb-hidden');
    Kernel.dockAdd(this);
  };

  LBWindow.prototype.restore = function () {
    if (!this.minimized) return;
    this.minimized = false;
    this.el.classList.remove('lb-hidden');
    Kernel.dockRemove(this);
    this.bringToFront();
  };

  LBWindow.prototype.close = function () {
    var self = this;
    this.closePops();
    this.el.classList.remove('lb-open');
    Kernel.dockRemove(this);
    windows.delete(this.id);
    if (Kernel.focused === this) Kernel.focused = null;
    setTimeout(function () {
      if (self.el.parentNode) self.el.parentNode.removeChild(self.el);
    }, 320);
    Kernel.log('窗口 ' + this.id + ' 已关闭', 'ok');
  };

  LBWindow.prototype.togglePop = function (which) {
    var self = this;
    var pop = this.el.querySelector('.lb-pop[data-pop="' + which + '"]');
    var btn = this.el.querySelector('[data-act="' + which + '"]');
    if (!pop) return;
    var isOpen = pop.classList.contains('lb-show');
    this.closePops();
    if (isOpen) return;

    pop.classList.add('lb-show');
    if (btn) btn.classList.add('lb-on');
    this.placePop(pop);
    this.popOpen = pop;

    this._docDown = function (e) {
      if (e.target && e.target.closest && e.target.closest('.lb-pop')) return;
      self.closePops();
    };
    setTimeout(function () {
      document.addEventListener('pointerdown', self._docDown, true);
    }, 0);
  };

  LBWindow.prototype.closePops = function () {
    Array.prototype.forEach.call(this.el.querySelectorAll('.lb-pop.lb-show'), function (p) {
      p.classList.remove('lb-show');
    });
    Array.prototype.forEach.call(this.el.querySelectorAll('.lb-ibtn.lb-on'), function (b) {
      b.classList.remove('lb-on');
    });
    this.popOpen = null;
    if (this._docDown) {
      document.removeEventListener('pointerdown', this._docDown, true);
      this._docDown = null;
    }
  };

  LBWindow.prototype.placePop = function (pop) {
    var barRect = this.bar.getBoundingClientRect();
    var width = pop.offsetWidth || 300;
    var height = pop.offsetHeight || 44;

    // 上方放不下时向下弹出
    var down = barRect.top - height - 12 < 8;
    pop.classList.toggle('lb-down', down);

    var left = barRect.left - 1;
    var minLeft = 10;
    var maxLeft = Math.max(minLeft, global.innerWidth - width - 10);
    left = Math.min(Math.max(left, minLeft), maxLeft);
    pop.style.left = Math.round(left - barRect.left) + 'px';
  };

  LBWindow.prototype.renderFrame = function (html) {
    this.frame.srcdoc = buildFrameDoc(html);
  };

  LBWindow.prototype.setPage = function (itemId) {
    var self = this;
    var item = null;
    for (var i = 0; i < this.pages.length; i++) {
      if (this.pages[i].id === itemId) {
        item = this.pages[i];
        break;
      }
    }

    this.pageId = item ? item.id : null;
    this.highlightNav();

    // 窗口级 html（如右下角悬浮按钮）始终保留，页面内容追加其后
    var html = this.layout.page.html || '';
    if (item && item.html) html = html + (html ? '\n' : '') + item.html;
    var src = item ? item.htmlSrc : this.layout.page.htmlSrc;

    function finish(content) {
      self.renderFrame(content || '');
    }

    if (!html && src) {
      Sources.tryText(src).then(function (txt) {
        finish(txt);
      });
    } else {
      finish(html);
    }
  };

  LBWindow.prototype.highlightNav = function () {
    var id = this.pageId;
    Array.prototype.forEach.call(this.el.querySelectorAll('.lb-nav-item'), function (item) {
      item.classList.toggle('lb-on', item.getAttribute('data-page') === id);
    });
  };

  /* ------------------------------------------------------------
     8. 内核：指令集 / 全局指令 / 窗口注册表
     ------------------------------------------------------------ */
  var windows = new Map();

  var Kernel = {
    version: VERSION,
    layouts: new Map(),
    windows: windows,
    instructions: new Map(),
    events: Object.create(null),
    focused: null,

    /* ---------- 排版文件 ---------- */
    loadLayout: function (ref) {
      var self = this;
      var key = String(ref === undefined || ref === null ? '' : ref).trim();
      if (!key) return Promise.reject(new Error('排版文件名为空'));
      if (this.layouts.has(key)) return Promise.resolve(this.layouts.get(key));

      var path = /\.(json|lbxlayout)$/i.test(key) ? key : 'layouts/' + key + '.json';
      return Sources.json(path).then(function (raw) {
        var layout = normalizeLayout(raw, path);
        self.layouts.set(key, layout);
        self.layouts.set(path, layout);
        self.layouts.set(layout.win.id, layout);
        self.log('排版文件 ' + path + ' 已载入', 'ok');
        return layout;
      });
    },

    /* ---------- 指令集定义（commands.json） ---------- */
    loadCommands: function (ref) {
      var self = this;
      var path = /\.(json|lbxevents)$/i.test(ref) || ref.indexOf('/') >= 0 ? ref : 'events/' + ref + '.json';
      return Sources.json(path).then(function (def) {
        var set = def.instructions || {};
        var names = Object.keys(set);
        names.forEach(function (name) {
          var spec = set[name] || {};
          self.instructions.set(name, {
            name: name,
            set: def.id || path,
            desc: spec.desc || '',
            args: spec.args || [],
            builtin: spec.builtin || null,
            run: spec.run || null
          });
        });
        self.log('指令集 ' + (def.id || path) + ' 注册 ' + names.length + ' 条指令', 'ok');
        return names.length;
      });
    },

    /* ---------- 事件定义（events.json） ---------- */
    loadEvents: function (ref) {
      var self = this;
      var path = /\.json$/i.test(ref) || ref.indexOf('/') >= 0 ? ref : 'events/' + ref + '.json';
      return Sources.json(path).then(function (def) {
        var evs = def.events || {};
        var names = Object.keys(evs);
        names.forEach(function (name) {
          self.events[name] = evs[name];
        });
        self.log('事件定义 ' + (def.id || path) + ' 注册 ' + names.length + ' 个事件', 'ok');
        return names.length;
      });
    },

    /* ---------- 执行一个事件 ---------- */
    runEvent: function (name) {
      var self = this;
      var ev = this.events[name];
      if (ev === undefined) {
        this.log('未定义的事件：' + name, 'err');
        return Promise.reject(new Error('未定义的事件：' + name));
      }
      var list = Array.isArray(ev) ? ev : parseCommandText(String(ev));
      this.log('▶ 事件 ' + name + ' · ' + list.length + ' 条指令', 'cmd');
      var chain = Promise.resolve();
      list.forEach(function (stmt) {
        chain = chain.then(function () {
          return self.runStatement(stmt, 'event:' + name).catch(function (err) {
            self.log('事件 ' + name + ' 执行失败：' + err.message, 'err');
          });
        });
      });
      return chain.then(function () { return list.length; });
    },

    /* ---------- 单句执行 ---------- */
    runStatement: function (stmt, source) {
      var m = /^([A-Za-z_$][\w$]*)\s*(?:\(([\s\S]*)\))?\s*$/.exec(String(stmt).trim());
      if (!m) return Promise.reject(new Error('无法解析指令：' + stmt));
      return this.invoke(m[1], m[2] !== undefined ? parseCallArgs(m[2]) : [], source);
    },

    invoke: function (name, callList, source) {
      var self = this;
      var spec = this.instructions.get(name);
      if (!spec) {
        var msg = '未定义的指令 ' + name + '()' + (source ? '（' + source + '）' : '');
        this.log(msg, 'err');
        return Promise.reject(new Error(msg));
      }

      var args = { __pos: [], __source: source, __name: name };
      var positionals = [];
      callList.forEach(function (item) {
        if (item.key) args[item.key] = item.value;
        else positionals.push(item.value);
      });
      args.__pos = positionals;

      (spec.args || []).forEach(function (argName, i) {
        if (args[argName] === undefined && positionals[i] !== undefined) args[argName] = positionals[i];
      });

      try {
        var result;
        if (spec.run) {
          var fn = new Function('args', 'kernel', 'source', spec.run);
          result = fn(args, Kernel, source || '');
        } else if (spec.builtin && this.builtins[spec.builtin]) {
          result = this.builtins[spec.builtin](args);
        } else {
          throw new Error('指令 ' + name + '() 没有可执行的实现');
        }
        return Promise.resolve(result);
      } catch (err) {
        this.log('指令 ' + name + '() 执行失败：' + err.message, 'err');
        return Promise.reject(err);
      }
    },

    /* ---------- 内置动作 ---------- */
    builtins: {
      window: function (a) {
        var ref = a.layout !== undefined ? a.layout : a.__pos[0];
        return Kernel.openWindow(ref, a);
      },
      close: function (a) {
        return Kernel.closeWindow(a.id !== undefined ? a.id : a.__pos[0]);
      },
      minimize: function (a) {
        var win = Kernel.pickWindow(a.id !== undefined ? a.id : a.__pos[0]);
        if (win) win.minimize();
      },
      maximize: function (a) {
        var win = Kernel.pickWindow(a.id !== undefined ? a.id : a.__pos[0]);
        if (win) win.toggleMax();
      },
      focus: function (a) {
        var win = Kernel.pickWindow(a.id !== undefined ? a.id : a.__pos[0]);
        if (win) {
          win.restore();
          win.bringToFront();
        }
      },
      setwall: function (a) {
        var url = a.url !== undefined ? a.url : a.__pos[0];
        return Kernel.setWallpaper(url === undefined ? '' : url);
      },
      dialog: function (a) {
        var message = a.message !== undefined ? a.message : (a.text !== undefined ? a.text : a.__pos[0]);
        var type = a.type !== undefined ? a.type : (a.__pos[1] || 'info');
        var title = a.title !== undefined ? a.title : (a.__pos[2] || undefined);
        Kernel.dialog({ message: message, type: type, title: title });
      },
      notif: function (a) {
        var message = a.message !== undefined ? a.message : (a.text !== undefined ? a.text : a.__pos[0]);
        var type = a.type !== undefined ? a.type : (a.__pos[1] || 'info');
        var title = a.title !== undefined ? a.title : (a.__pos[2] || undefined);
        var duration = a.duration !== undefined ? a.duration : (a.__pos[3] !== undefined ? a.__pos[3] : undefined);
        Kernel.notif({ message: message, type: type, title: title, duration: duration });
      },
      page: function (a) {
        var id = a.id !== undefined ? a.id : a.__pos[0];
        var page = a.page !== undefined ? a.page : a.__pos[1];
        var win = Kernel.pickWindow(id);
        if (!win) throw new Error('找不到窗口 ' + id);
        win.setPage(page);
      },
      set: function (a) {
        var id = a.id !== undefined ? a.id : a.__pos[0];
        var key = a.key !== undefined ? a.key : a.__pos[1];
        var value = a.value !== undefined ? a.value : a.__pos[2];
        var win = Kernel.pickWindow(id);
        if (!win) throw new Error('找不到窗口 ' + id);
        if (key === undefined) throw new Error('set() 需要属性名');
        win.applyField(key, value);
      },
      notify: function (a) {
        var text = a.text !== undefined ? a.text : a.__pos[0];
        Kernel.notify(text === undefined ? '' : text);
      },
      log: function (a) {
        var text = a.text !== undefined ? a.text : a.__pos[0];
        Kernel.log(String(text === undefined ? '' : text), 'cmd');
      },
      exec: function (a) {
        var text = a.text !== undefined ? a.text : a.__pos[0];
        return Kernel.exec(text);
      }
    },

    /* ---------- 窗口操作 ---------- */
    openWindow: function (ref, opts) {
      var self = this;
      opts = opts || {};
      if (ref === undefined || ref === null || ref === '') {
        return Promise.reject(new Error('window() 需要指定排版文件'));
      }
      return this.loadLayout(ref).then(function (layout) {
        var exists = windows.get(layout.win.id);
        if (exists) {
          exists.restore();
          exists.bringToFront();
          self.log('窗口 ' + layout.win.id + ' 已存在，聚焦到前台', 'warn');
          return exists;
        }
        var win = new LBWindow(layout, {
          x: opts.x,
          y: opts.y,
          w: opts.w,
          h: opts.h,
          opacity: opts.opacity
        });
        windows.set(win.id, win);
        win.bringToFront();
        self.log('窗口 ' + layout.win.id + ' 已创建（排版：' + layout.name + '）', 'ok');
        return win;
      });
    },

    pickWindow: function (id) {
      if (id === undefined || id === null || id === '') return this.focused;
      return windows.get(String(id)) || null;
    },

    closeWindow: function (id) {
      var win = this.pickWindow(id);
      if (!win) {
        if (id !== undefined && id !== null && id !== '') throw new Error('找不到窗口 ' + id);
        return;
      }
      win.close();
    },

    setPage: function (id, page) {
      var win = this.pickWindow(id);
      if (!win) throw new Error('找不到窗口 ' + id);
      win.setPage(page);
    },

    setWindowProp: function (id, key, value) {
      var win = this.pickWindow(id);
      if (!win) throw new Error('找不到窗口 ' + id);
      win.applyField(key, value);
    },

    /* ---------- 指令字符串（外部可直接调用） ---------- */
    exec: function (text) {
      var self = this;
      var list = parseCommandText(String(text === undefined || text === null ? '' : text));
      var chain = Promise.resolve();
      list.forEach(function (stmt) {
        chain = chain.then(function () {
          self.log('↳ ' + stmt, 'cmd');
          return self.runStatement(stmt, '<action>');
        }).catch(function (err) {
          self.log(err.message, 'err');
        });
      });
      return chain;
    },

    /* ---------- 反馈 ---------- */
    notify: function (text) {
      UI.toast(String(text));
    },

    log: function (text, kind) {
      UI.log(String(text), kind);
    },

    /* ---------- 桌面壁纸 ---------- */
    setWallpaper: function (url) {
      var self = this;
      var raw = url === undefined || url === null ? '' : String(url).trim();
      if (!raw) {
        UI.applyWallpaper('');
        writeWallpaper('');
        return this.applyDefaultWallpaper(false).then(function () {
          return '';
        });
      }
      return new Promise(function (resolve, reject) {
        var pre = new Image();
        pre.onload = function () {
          UI.applyWallpaper(raw);
          writeWallpaper(raw);
          self.log('壁纸已更新：' + raw, 'ok');
          resolve(raw);
        };
        pre.onerror = function () {
          var msg = '壁纸加载失败：' + raw;
          self.log(msg, 'err');
          reject(new Error(msg));
        };
        pre.src = raw;
      });
    },

    /* ---------- 模态对话框 / 顶部通知 ---------- */
    dialog: function (opts) {
      if (typeof opts === 'string') opts = { message: opts };
      opts = opts || {};
      UI.dialog(opts);
      this.log('弹窗[' + (opts.type || 'info') + '] ' + (opts.title || '提示') + '：' + (opts.message || opts.text || ''), 'cmd');
    },

    notif: function (opts) {
      if (typeof opts === 'string') opts = { message: opts };
      opts = opts || {};
      UI.notif(opts);
      this.log('顶部通知[' + (opts.type || 'info') + '] ' + (opts.title || '通知') + '：' + (opts.message || opts.text || ''), 'cmd');
    },

    applyDefaultWallpaper: function (quiet) {
      var self = this;
      return loadDefaultWallpaper().then(function (url) {
        UI.applyWallpaper(url);
        if (!quiet) self.log('默认壁纸已加载', 'ok');
        return url;
      }).catch(function () {
        if (!quiet) self.log('默认壁纸加载失败，使用内置背景', 'warn');
        return '';
      });
    },

    /* ---------- 最小化 dock ---------- */
    dockAdd: function (win) {
      UI.dockAdd(win);
    },

    dockRemove: function (win) {
      UI.dockRemove(win);
    },

    /* ---------- 启动 ---------- */
    boot: function () {
      var self = this;
      var t0 = global.performance ? performance.now() : Date.now();
      Sources.registerInline(global.ODH_MIRROR || {});
      UI.bind();

      var savedWall = readWallpaper();
      if (savedWall) UI.applyWallpaper(savedWall);
      else this.applyDefaultWallpaper(true);

      return this.loadCommands('events/commands.json')
        .then(function () {
          return self.loadEvents('events/events.json');
        })
        .then(function () {
          return self.runEvent('root');
        })
        .then(function (count) {
          var ms = Math.round((global.performance ? performance.now() : Date.now()) - t0);
          UI.status('v' + VERSION + ' · ' + self.instructions.size + ' 指令 · 执行 ' + count + ' 条');
          self.log('OriginalDeepsilenceHeart 启动完成，用时 ' + ms + 'ms', 'ok');
        })
        .catch(function (err) {
          UI.status('启动失败：' + err.message);
          self.log('启动失败：' + err.message, 'err');
          UI.toast('OriginalDeepsilenceHeart 启动失败：' + err.message, true);
        });
    }
  };

  /* ------------------------------------------------------------
     9. 全局指令文本解析（换行 / 分号分隔，支持 # 与 // 注释）
     ------------------------------------------------------------ */
  function stripComment(stmt) {
    var quote = null;
    for (var i = 0; i < stmt.length; i++) {
      var c = stmt[i];
      if (quote) {
        if (c === quote && stmt[i - 1] !== '\\') quote = null;
        continue;
      }
      if (c === '"' || c === "'") {
        quote = c;
        continue;
      }
      if (c === '#' || (c === '/' && stmt[i + 1] === '/')) {
        return stmt.slice(0, i).trim();
      }
    }
    return stmt.trim();
  }

  function parseCommandText(text) {
    var out = [];
    var buf = '';
    var quote = null;
    var depth = 0;
    var src = String(text === undefined || text === null ? '' : text);

    function push() {
      var stmt = stripComment(buf);
      if (stmt) out.push(stmt);
      buf = '';
    }

    for (var i = 0; i < src.length; i++) {
      var c = src[i];
      if (quote) {
        buf += c;
        if (c === quote && src[i - 1] !== '\\') quote = null;
        continue;
      }
      if (c === '"' || c === "'") {
        quote = c;
        buf += c;
        continue;
      }
      if (c === '(') {
        depth++;
        buf += c;
        continue;
      }
      if (c === ')') {
        depth--;
        buf += c;
        continue;
      }
      if ((c === '\n' || c === ';') && depth === 0) {
        push();
        continue;
      }
      buf += c;
    }
    push();
    return out;
  }

  /* ------------------------------------------------------------
     10. 桌面 UI（左上角启动器 / 日志 / dock / toast）
     ------------------------------------------------------------ */
  var UI = {
    el: {},
    logCount: 0,

    bind: function () {
      var self = this;
      this.el.dock = document.getElementById('lbDock') || createNode('div', 'lb-dock', '', 'lbDock');
      this.el.dockApps = document.getElementById('lbDockApps');
      this.el.dockWins = document.getElementById('lbDockWins');
      this.el.toasts = document.getElementById('lbToasts') || createNode('div', 'lb-toasts', '', 'lbToasts');
      this.el.notifs = document.getElementById('lbNotifs') || createNode('div', 'lb-notifs', '', 'lbNotifs');
      this.el.dialogWrap = document.getElementById('lbDialogWrap') || createNode('div', 'lb-dialog-wrap', '', 'lbDialogWrap');
      this.el.status = document.getElementById('lbStatus');
      this.el.logList = document.getElementById('lbLogList');
      this.el.logPanel = document.getElementById('lbLogPanel');
      this.el.logBtn = document.getElementById('lbLogBtn');
      this.el.wallBtn = document.getElementById('lbWallBtn');
      this.el.wallPanel = document.getElementById('lbWallPanel');
      this.el.wallInput = document.getElementById('lbWallInput');
      this.el.wallApply = document.getElementById('lbWallApply');
      this.el.wallReset = document.getElementById('lbWallReset');
      this.el.launcher = document.getElementById('lbLauncher');
      this.el.launcherBtn = document.getElementById('lbLauncherBtn');

      /* ---------- 底部应用启动器 ---------- */
      var apps = [
        { id: 'desktop', label: '应用桌面', event: 'openDesktop',
          svg: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M3 9h18"/><rect x="6" y="12" width="5" height="6" rx="1"/><rect x="13" y="12" width="5" height="6" rx="1"/>' },
        { id: 'settings', label: '系统设置', event: 'openSettings',
          svg: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>' },
        { id: 'control', label: '控制中心', event: 'openControl',
          svg: '<line x1="6" y1="4" x2="6" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="18" y1="4" x2="18" y2="20"/><circle cx="6" cy="8" r="2.2"/><circle cx="12" cy="15" r="2.2"/><circle cx="18" cy="11" r="2.2"/>' },
        { id: 'blog', label: '博客社区', event: 'openBlog',
          svg: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>' },
        { id: 'custom', label: '自定义', event: 'openCustom',
          svg: '<path d="M12 2.5l1.9 4.8 4.8 1.9-4.8 1.9L12 16l-1.9-4.9L5.3 9.2l4.8-1.9z"/><path d="M19 14l.9 2.3 2.3.9-2.3.9L19 21l-.9-2.3-2.3-.9 2.3-.9z"/>' }
      ];
      if (this.el.dockApps) {
        apps.forEach(function (app, idx) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'lb-dock-app';
          btn.setAttribute('data-tip', app.label);
          btn.style.animation = 'lbDockIconIn 0.4s ' + (0.08 * idx) + 's cubic-bezier(0.34, 1.56, 0.64, 1) both';
          btn.innerHTML = '<svg viewBox="0 0 24 24">' + app.svg + '</svg>';
          btn.addEventListener('click', function () {
            Kernel.log('点击应用「' + app.label + '」，触发事件 ' + app.event, 'cmd');
            Kernel.runEvent(app.event).then(function (n) {
              Kernel.notify(app.label + ' 操作成功');
            }).catch(function (err) {
              Kernel.notify(app.label + ' 操作失败：' + err.message, true);
              Kernel.log(err.message, 'err');
            });
          });
          self.el.dockApps.appendChild(btn);
        });
      }

      var setLauncher = function (open) {
        if (!self.el.launcher) return;
        self.el.launcher.classList.toggle('lb-open', !!open);
        if (self.el.launcherBtn) self.el.launcherBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      };

      if (this.el.launcherBtn) {
        this.el.launcherBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          setLauncher(!self.el.launcher.classList.contains('lb-open'));
        });
      }

      document.addEventListener('click', function (e) {
        if (!self.el.launcher || self.el.launcher.contains(e.target)) return;
        setLauncher(false);
      });

      if (this.el.logBtn) {
        this.el.logBtn.addEventListener('click', function () {
          var open = self.el.logPanel.classList.toggle('lb-show');
          if (open && self.el.wallPanel) self.el.wallPanel.classList.remove('lb-show');
          if (open) setLauncher(false);
        });
      }

      var applyWall = function () {
        var value = self.el.wallInput ? self.el.wallInput.value.trim() : '';
        Kernel.setWallpaper(value).then(function () {
          UI.toast(value ? '壁纸已更新' : '已恢复默认壁纸');
          if (self.el.wallPanel) self.el.wallPanel.classList.remove('lb-show');
        }).catch(function (err) {
          UI.toast(err.message, true);
        });
      };

      if (this.el.wallBtn && this.el.wallPanel) {
        this.el.wallBtn.addEventListener('click', function () {
          var open = self.el.wallPanel.classList.toggle('lb-show');
          if (open) {
            if (self.el.logPanel) self.el.logPanel.classList.remove('lb-show');
            if (self.el.wallInput) {
              self.el.wallInput.value = readWallpaper();
              self.el.wallInput.focus();
            }
            setLauncher(false);
          }
        });
      }

      if (this.el.wallApply) this.el.wallApply.addEventListener('click', applyWall);

      if (this.el.wallInput) {
        this.el.wallInput.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') {
            e.preventDefault();
            applyWall();
          }
        });
      }

      if (this.el.wallReset) {
        this.el.wallReset.addEventListener('click', function () {
          Kernel.setWallpaper('').then(function () {
            UI.toast('已恢复默认壁纸');
            if (self.el.wallInput) self.el.wallInput.value = '';
            if (self.el.wallPanel) self.el.wallPanel.classList.remove('lb-show');
          });
        });
      }

      global.addEventListener('resize', function () {
        windows.forEach(function (win) {
          win.clampPos();
          win.applyState();
        });
      });

      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape') return;
        windows.forEach(function (win) {
          win.closePops();
        });
      });
    },

    status: function (text) {
      if (this.el.status) this.el.status.textContent = text;
    },

    applyWallpaper: function (url) {
      var body = document.body;
      if (!body) return;
      if (!url) {
        body.style.backgroundImage = '';
        body.classList.remove('lb-wall');
        return;
      }
      body.style.backgroundImage = 'url("' + String(url).replace(/"/g, '\\"') + '")';
      body.classList.add('lb-wall');
      if (this.el.wallInput) this.el.wallInput.value = url;
    },

    toast: function (text, isError) {
      var box = this.el.toasts;
      if (!box) return;
      var node = document.createElement('div');
      node.className = 'lb-toast' + (isError ? ' lb-err' : '');
      node.innerHTML = '<span class="lb-toast-dot"></span><span></span>';
      node.lastChild.textContent = text;
      box.appendChild(node);
      setTimeout(function () {
        node.classList.add('lb-out');
        setTimeout(function () {
          if (node.parentNode) node.parentNode.removeChild(node);
        }, 280);
      }, isError ? 4200 : 2600);
    },

    /* ---------- Windows 风格模态对话框 ---------- */
    dialog: function (opts) {
      var self = this;
      var wrap = this.el.dialogWrap;
      if (!wrap) return;
      opts = opts || {};
      var type = opts.type || 'info';
      var title = opts.title || '提示';
      var message = opts.message !== undefined ? opts.message : (opts.text !== undefined ? opts.text : '');
      var btnText = opts.button || '确定';

      var iconSvg = {
        info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
        warn: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
        err: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>'
      };

      var html =
        '<div class="lb-dialog-mask"></div>' +
        '<div class="lb-dialog" role="alertdialog" aria-modal="true">' +
          '<div class="lb-dialog-head">' +
            '<div class="lb-dialog-icon t-' + type + '"><svg viewBox="0 0 24 24">' + (iconSvg[type] || iconSvg.info) + '</svg></div>' +
            '<div class="lb-dialog-titles">' +
              '<div class="lb-dialog-title"></div>' +
            '</div>' +
          '</div>' +
          '<div class="lb-dialog-body"></div>' +
          '<div class="lb-dialog-foot">' +
            '<button class="lb-dialog-btn primary" type="button"></button>' +
          '</div>' +
        '</div>';
      wrap.innerHTML = html;
      wrap.querySelector('.lb-dialog-title').textContent = title;
      wrap.querySelector('.lb-dialog-body').textContent = message;
      var btn = wrap.querySelector('.lb-dialog-btn');
      btn.textContent = btnText;
      wrap.classList.add('lb-show');

      var close = function () {
        wrap.classList.remove('lb-show');
        setTimeout(function () { wrap.innerHTML = ''; }, 200);
      };
      btn.addEventListener('click', close);
      wrap.querySelector('.lb-dialog-mask').addEventListener('click', close);
      document.addEventListener('keydown', function onKey(e) {
        if (e.key === 'Escape' || e.key === 'Enter') {
          close();
          document.removeEventListener('keydown', onKey);
        }
      });
      setTimeout(function () { btn.focus(); }, 50);
    },

    /* ---------- Android 风格顶部通知 ---------- */
    notif: function (opts) {
      var self = this;
      var box = this.el.notifs;
      if (!box) return;
      opts = opts || {};
      var type = opts.type || 'info';
      var title = opts.title || '通知';
      var message = opts.message !== undefined ? opts.message : (opts.text !== undefined ? opts.text : '');
      var duration = opts.duration !== undefined ? num(opts.duration, 3200) : 3200;

      var iconSvg = {
        info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>',
        warn: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
        err: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
        ok: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'
      };

      var node = document.createElement('div');
      node.className = 'lb-notif';
      node.innerHTML =
        '<div class="lb-notif-icon t-' + type + '"><svg viewBox="0 0 24 24">' + (iconSvg[type] || iconSvg.info) + '</svg></div>' +
        '<div class="lb-notif-body">' +
          '<div class="lb-notif-title"></div>' +
          '<div class="lb-notif-msg"></div>' +
        '</div>' +
        '<button class="lb-notif-close" type="button" aria-label="关闭"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>';
      node.querySelector('.lb-notif-title').textContent = title;
      node.querySelector('.lb-notif-msg').textContent = message;

      var timer;
      var remove = function () {
        if (timer) clearTimeout(timer);
        node.classList.add('lb-out');
        setTimeout(function () {
          if (node.parentNode) node.parentNode.removeChild(node);
        }, 280);
      };
      node.querySelector('.lb-notif-close').addEventListener('click', remove);
      if (duration > 0) timer = setTimeout(remove, duration);

      box.appendChild(node);
    },

    log: function (text, kind) {
      var list = this.el.logList;
      if (!list) return;
      var time = new Date();
      var hh = ('0' + time.getHours()).slice(-2);
      var mm = ('0' + time.getMinutes()).slice(-2);
      var ss = ('0' + time.getSeconds()).slice(-2);

      var line = document.createElement('div');
      line.className = 'lb-log-line k-' + (kind || 'ok');
      line.innerHTML = '<span class="lb-log-time">' + hh + ':' + mm + ':' + ss + '</span><span></span>';
      line.lastChild.textContent = text;
      list.appendChild(line);
      this.logCount++;
      while (list.childNodes.length > 90) list.removeChild(list.firstChild);
      list.scrollTop = list.scrollHeight;
    },

    dockAdd: function (win) {
      var self = this;
      if (!this.el.dockWins || win.dockChip) return;
      var chip = document.createElement('button');
      chip.className = 'lb-dock-chip';
      chip.type = 'button';
      chip.innerHTML = win.layout.win.icon + '<span></span>';
      chip.lastChild.textContent = win.state.title;
      chip.addEventListener('click', function () {
        win.restore();
      });
      this.el.dockWins.appendChild(chip);
      win.dockChip = chip;
      this.updateDockSep();
    },

    dockRemove: function (win) {
      if (win.dockChip && win.dockChip.parentNode) win.dockChip.parentNode.removeChild(win.dockChip);
      win.dockChip = null;
      this.updateDockSep();
    },

    updateDockSep: function () {
      if (!this.el.dockSep) return;
      var hasWins = this.el.dockWins && this.el.dockWins.children.length > 0;
      this.el.dockSep.classList.toggle('lb-hide', !hasWins);
    }
  };

  function createNode(tag, cls, html, id) {
    var node = document.createElement(tag);
    node.className = cls;
    if (html) node.innerHTML = html;
    if (id) node.id = id;
    document.body.appendChild(node);
    return node;
  }

  /* ------------------------------------------------------------
     11. 对外暴露 + 启动
     ------------------------------------------------------------ */
  global.ODH = Kernel;
  global.ODHWindow = LBWindow;
  global.ODHPipeline = {
    Sources: Sources,
    parseCommandText: parseCommandText,
    buildFrameDoc: buildFrameDoc
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      Kernel.boot();
    });
  } else {
    Kernel.boot();
  }
})(window);
