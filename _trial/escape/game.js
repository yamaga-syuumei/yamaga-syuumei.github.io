/* ==========================================================
   脱出ADV（プロトタイプ）
   企画書（事業計画/WEBゲーム企画_脱出ADV.md）どおりの制約で書く：
   - 画像なし（エンディング/タイトル/サムネイル兼用の1枚のみ）
   - 入力はすべて選択式。会話も謎も同じボタンの見た目
   - 状態は「謎のミス回数」のみ。あとはノードの位置と既読record
   - 台本は data.js の window.SCRIPT（file:// でも読めるよう .js に生データで持つ）
   - グローバルインストール・ビルドなし。素のJS・IIFE（tank/ と同じ流儀）
   ========================================================== */
(function () {
  'use strict';

  var S = window.SCRIPT;
  var SAVE_KEY = 'escape-save-v1';
  var ENDINGS_KEY = 'escape-endings-v1';

  /* ==========================================================
     ノードの end 定義から、存在しうる全エンドの一覧を先に集めておく。
     一覧画面で「未到達は伏せる」を出すために、全体の数が要る。
     ========================================================== */
  var ALL_ENDINGS = [];
  (function collectEndings() {
    var seen = {};
    Object.keys(S.nodes).forEach(function (id) {
      var ends = S.nodes[id].end;
      if (!ends) return;
      ends.forEach(function (e) {
        if (seen[e.id]) return;
        seen[e.id] = true;
        ALL_ENDINGS.push({ id: e.id, title: e.title });
      });
    });
  })();

  /* ==========================================================
     状態
     ========================================================== */
  var state = null;

  function freshState() {
    return { node: S.start, missCount: 0, checkpoint: null, seenNodes: {} };
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      var st = JSON.parse(raw);
      if (!st || !S.nodes[st.node]) return null;
      return st;
    } catch (e) { return null; }
  }

  function saveState() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function loadEndings() {
    try { return JSON.parse(localStorage.getItem(ENDINGS_KEY) || '{}'); } catch (e) { return {}; }
  }
  function recordEnding(id) {
    var rec = loadEndings();
    if (rec[id]) return;
    rec[id] = true;
    try { localStorage.setItem(ENDINGS_KEY, JSON.stringify(rec)); } catch (e) {}
  }

  /* ==========================================================
     画面切り替え
     ========================================================== */
  var elTitle = document.getElementById('screen-title');
  var elList  = document.getElementById('screen-list');
  var elChat  = document.getElementById('screen-chat');
  var elLog   = document.getElementById('log');
  var elChoices = document.getElementById('choices');

  function showScreen(name) {
    elTitle.hidden = name !== 'title';
    elList.hidden  = name !== 'list';
    elChat.hidden  = name !== 'chat';
  }

  /* ---------- タイトル ---------- */
  function renderTitle() {
    var hasSave = !!loadState();
    document.getElementById('btn-start').textContent = hasSave ? 'つづきから' : 'はじめる';
    document.getElementById('btn-restart-wrap').hidden = !hasSave;
    document.getElementById('restart-ask').hidden = true;
    showScreen('title');
  }

  document.getElementById('btn-start').addEventListener('click', function () {
    state = loadState() || freshState();
    saveState();
    enterChat();
  });
  document.getElementById('btn-restart').addEventListener('click', function () {
    document.getElementById('restart-ask').hidden = false;
  });
  document.getElementById('restart-no').addEventListener('click', function () {
    document.getElementById('restart-ask').hidden = true;
  });
  document.getElementById('restart-yes').addEventListener('click', function () {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    state = freshState();
    saveState();
    enterChat();
  });
  document.getElementById('btn-endings').addEventListener('click', renderEndingList);
  document.getElementById('list-back').addEventListener('click', renderTitle);
  document.getElementById('chat-back').addEventListener('click', renderTitle);

  /* ---------- エンディング一覧 ---------- */
  function renderEndingList() {
    var rec = loadEndings();
    var got = ALL_ENDINGS.filter(function (e) { return rec[e.id]; }).length;
    document.getElementById('list-count').textContent = got + ' / ' + ALL_ENDINGS.length + ' 到達';
    var wrap = document.getElementById('list-rows');
    wrap.innerHTML = '';
    ALL_ENDINGS.forEach(function (e) {
      var row = document.createElement('div');
      var reached = !!rec[e.id];
      row.className = 'ec-end-row' + (reached ? '' : ' is-locked');
      var title = document.createElement('div');
      title.className = 'ec-end-title';
      title.textContent = reached ? e.title : '？？？';
      row.appendChild(title);
      wrap.appendChild(row);
    });
    showScreen('list');
  }

  /* ==========================================================
     チャット本体
     ========================================================== */
  function enterChat() {
    elLog.innerHTML = '';
    elChoices.innerHTML = '';
    showScreen('chat');
    playNode(state.node);
  }

  // 文字数からだいたいのテンポで遅延を作る（本文側で個別にdelayを指定すれば上書きできる）
  function autoDelay(text) {
    return Math.max(650, Math.min(2600, 550 + text.length * 55));
  }

  function scrollLog() {
    elLog.scrollTop = elLog.scrollHeight;
  }

  function appendBubble(side, text) {
    var row = document.createElement('div');
    row.className = 'ec-row is-' + side;
    var b = document.createElement('div');
    b.className = 'ec-bubble';
    b.textContent = text;
    row.appendChild(b);
    elLog.appendChild(row);
    scrollLog();
    return row;
  }

  function appendMyChoice(text) {
    var row = appendBubble('me', text);
    var status = document.createElement('span');
    status.className = 'ec-status';
    status.textContent = '未読';
    row.appendChild(status);
    scrollLog();
    return status;
  }

  function markRead(statusEl) {
    if (statusEl) statusEl.textContent = '既読';
  }

  function showTyping() {
    var row = document.createElement('div');
    row.className = 'ec-row is-her ec-typing';
    row.innerHTML = '<div class="ec-bubble"><i></i><i></i><i></i></div>';
    elLog.appendChild(row);
    scrollLog();
    return row;
  }

  /* ---------- メッセージを1件ずつ再生する ----------
     instant=true のときは既読スキップ扱いで、間も入力中…も出さず即表示する。 */
  function playMessages(list, instant, done) {
    var i = 0;
    function next() {
      if (i >= list.length) return done();
      var m = list[i++];
      if (typeof m === 'string') m = { text: m };
      var delay = m.delay != null ? m.delay : autoDelay(m.text);

      if (instant) {
        appendBubble('her', m.text);
        next();
        return;
      }
      if (m.silent) {
        setTimeout(function () {
          appendBubble('her', m.text);
          setTimeout(next, 260);
        }, delay);
        return;
      }
      var typing = showTyping();
      setTimeout(function () {
        typing.remove();
        appendBubble('her', m.text);
        setTimeout(next, 260);
      }, delay);
    }
    next();
  }

  /* ---------- ノードを開始する ---------- */
  function playNode(id) {
    var node = S.nodes[id];
    state.node = id;

    if (node.checkpoint) {
      state.checkpoint = { node: id, missCount: state.missCount };
    }
    saveState();

    var already = !!state.seenNodes[id];
    elChoices.innerHTML = '';

    playMessages(node.messages || [], already, function () {
      state.seenNodes[id] = true;
      saveState();
      if (node.end) { showEnding(node); return; }
      showChoices(node.choices || []);
    });
  }

  /* ---------- 選択肢 ---------- */
  function showChoices(choices) {
    elChoices.innerHTML = '';
    choices.forEach(function (c) {
      var btn = document.createElement('button');
      btn.className = 'ec-choice';
      btn.textContent = c.text;
      btn.addEventListener('click', function () { pickChoice(choices, c); });
      elChoices.appendChild(btn);
    });
  }

  function disableChoices() {
    Array.prototype.forEach.call(elChoices.querySelectorAll('button'), function (b) { b.disabled = true; });
  }

  function pickChoice(siblingChoices, choice) {
    disableChoices();
    var statusEl = appendMyChoice(choice.text);
    elChoices.innerHTML = '';

    if (choice.kind === 'puzzle' && !choice.correct) {
      // 1回目に外したときだけミスとして数える
      var nodeId = state.node;
      if (!state.missedNodes) state.missedNodes = {};
      if (!state.missedNodes[nodeId]) {
        state.missedNodes[nodeId] = true;
        state.missCount++;
        saveState();
      }
      playMessages((choice.reply || []).map(function (t) { return { text: t }; }), false, function () {
        markRead(statusEl);
        showChoices(siblingChoices);
      });
      return;
    }

    // 応答・分かれ道・正解した謎は、そのまま次のノードへ
    var reply = choice.reply || [];
    playMessages(reply.map(function (t) { return { text: t }; }), false, function () {
      markRead(statusEl);
      playNode(choice.next);
    });
  }

  /* ---------- エンディング ---------- */
  function pickEnding(node) {
    var list = node.end;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (e.maxMiss == null || state.missCount <= e.maxMiss) return e;
    }
    return list[list.length - 1];
  }

  function showEnding(node) {
    var e = pickEnding(node);
    recordEnding(e.id);
    var isBad = /^bad/.test(e.id);

    var card = document.createElement('div');
    card.className = 'ec-endcard' + (isBad ? ' is-bad' : '');
    var h3 = document.createElement('h3');
    h3.textContent = e.title;
    var p = document.createElement('p');
    p.textContent = e.text;
    card.appendChild(h3);
    card.appendChild(p);

    var actions = document.createElement('div');
    actions.className = 'ec-actions';

    if (isBad && state.checkpoint) {
      var retry = document.createElement('button');
      retry.className = 'ec-btn is-main';
      retry.textContent = 'チェックポイントからやり直す';
      retry.addEventListener('click', function () {
        state.node = state.checkpoint.node;
        state.missCount = state.checkpoint.missCount;
        saveState();
        elLog.innerHTML = '';
        playNode(state.node);
      });
      actions.appendChild(retry);
    } else {
      var again = document.createElement('button');
      again.className = 'ec-btn is-main';
      again.textContent = 'もう一度さいしょから';
      again.addEventListener('click', function () {
        try { localStorage.removeItem(SAVE_KEY); } catch (err) {}
        state = freshState();
        saveState();
        elLog.innerHTML = '';
        playNode(state.node);
      });
      actions.appendChild(again);
    }

    var toTitle = document.createElement('button');
    toTitle.className = 'ec-btn';
    toTitle.textContent = 'タイトルへ';
    toTitle.addEventListener('click', renderTitle);
    actions.appendChild(toTitle);

    card.appendChild(actions);
    elLog.appendChild(card);
    scrollLog();
  }

  /* ==========================================================
     起動
     ========================================================== */
  renderTitle();

})();
