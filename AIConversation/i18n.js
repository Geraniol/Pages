/* ═══════════════════════════════════════════
   AI Discussion — i18n
   All user-facing copy lives here. app.js holds no literal UI text.
   ═══════════════════════════════════════════ */
(function (global) {
  'use strict';

  var dict = {

    /* ─────────── 中文 ─────────── */
    zh: {
      'app.title':        'AI Discussion',

      'menu.topics':      '话题列表',
      'topic.new':        '新建话题',
      'topic.defaultName':'新话题',
      'topic.copySuffix': '（副本）',
      'topic.rename':     '编辑名称',
      'topic.pause':      '暂停',
      'topic.resume':     '继续',
      'topic.duplicate':  '复制话题 AI 配置/提示词并打开',
      'topic.export':     '导出聊天记录',
      'topic.delete':     '删除此话题',

      'export.title':     '导出聊天记录',
      'export.format':    '格式',
      'export.includeReasoning': '包含思考过程',
      'export.action':    '导出',
      'export.empty':     '该话题还没有对话内容',
      'export.mdTime':    '导出时间',

      'sys.title':        'System prompt',
      'sys.locked':       '已锁定：话题产生第一条发言后不可修改',

      'width.toWide':     '对话区加宽',
      'width.toNarrow':   '对话区收窄',

      'dot.empty':        '空话题 / 未配置',
      'dot.paused':       '已暂停',
      'dot.running':      '运行中',

      'empty.newTopic':   '开始新话题',
      'prompt.placeholder': '输入 System 提示词',
      'theme.toggle':     '切换日夜模式',

      'msg.modelA':       'Model A',
      'msg.modelB':       'Model B',
      'msg.thinking':     '思考过程',

      'run.start':        '开始',
      'run.pause':        '暂停',

      'settings.title':   '设置',
      'settings.model1':  '模型 1',
      'settings.model2':  '模型 2',
      'settings.endpoint':'Endpoint URL',
      'settings.apiKey':  'API Key',
      'settings.modelName':'Model Name',
      'settings.sameAsModel1': '和模型 1 保持一致',
      'settings.runtime': '运行',
      'settings.maxRounds':'最大轮数',
      'settings.maxRoundsHint': '0 表示不限',
      'settings.data':    '数据配置',
      'settings.clearConfig': '清除配置数据（保留对话）',
      'settings.clearAll':'清除所有会话数据',
      'settings.language':'语言',

      'action.test':      '测试',
      'action.close':     '关闭',
      'action.cancel':    '取消',
      'action.confirm':   '确认',
      'action.delete':    '删除',

      'test.testing':     '测试中',
      'test.passed':      '测试通过（{ms}ms）',
      'test.failed':      '测试失败：{msg}',

      'confirm.clearAll.title': '清除所有会话数据？',
      'confirm.clearAll.body':  '所有话题、对话记录与模型配置都将被永久删除，此操作不可撤销。',
      'confirm.clearConfig.title': '清除配置数据？',
      'confirm.clearConfig.body':  '所有话题的 Endpoint / API Key / Model Name 将被清空，System 提示词与对话记录保留。',
      'confirm.deleteTopic.title': '删除此话题？',
      'confirm.deleteTopic.body':  '「{name}」及其全部对话记录将被永久删除。',

      'notice.notConfigured': '请先在设置中完成模型配置',
      'notice.retrying':      '请求失败，正在重试（{n}/{total}）',
      'notice.turnFailed':    '{model} 请求失败，已暂停',
      'notice.maxRounds':     '已达到最大轮数（{n}）',
      'notice.configCleared': '已清除全部话题的模型配置',
      'notice.allCleared':    '已清除所有会话数据',
      'notice.interrupted':   '上次的发言被中断，已清除',

      'error.network':       '网络或 CORS 错误',
      'error.badResponse':   '响应不是合法的 SSE 或 JSON',
      'error.emptyResponse': '模型没有返回任何内容',
      'error.timeout':       '请求超时'
    },

    /* ─────────── English ─────────── */
    en: {
      'app.title':        'AI Discussion',

      'menu.topics':      'Topics',
      'topic.new':        'New topic',
      'topic.defaultName':'New Topic',
      'topic.copySuffix': ' (copy)',
      'topic.rename':     'Rename',
      'topic.pause':      'Pause',
      'topic.resume':     'Resume',
      'topic.duplicate':  'Duplicate topic with AI config / prompt and open',
      'topic.export':     'Export chat log',
      'topic.delete':     'Delete topic',

      'export.title':     'Export chat log',
      'export.format':    'Format',
      'export.includeReasoning': 'Include thinking',
      'export.action':    'Export',
      'export.empty':     'This topic has no messages yet',
      'export.mdTime':    'Exported',

      'sys.title':        'System prompt',
      'sys.locked':       'Locked: cannot be changed once the topic has a reply',

      'width.toWide':     'Widen conversation',
      'width.toNarrow':   'Narrow conversation',

      'dot.empty':        'Empty / not configured',
      'dot.paused':       'Paused',
      'dot.running':      'Running',

      'empty.newTopic':   'Start a new topic',
      'prompt.placeholder': 'Enter system prompt',
      'theme.toggle':     'Toggle light / dark',

      'msg.modelA':       'Model A',
      'msg.modelB':       'Model B',
      'msg.thinking':     'Thinking',

      'run.start':        'Start',
      'run.pause':        'Pause',

      'settings.title':   'Settings',
      'settings.model1':  'Model 1',
      'settings.model2':  'Model 2',
      'settings.endpoint':'Endpoint URL',
      'settings.apiKey':  'API Key',
      'settings.modelName':'Model Name',
      'settings.sameAsModel1': 'Same as Model 1',
      'settings.runtime': 'Runtime',
      'settings.maxRounds':'Max rounds',
      'settings.maxRoundsHint': '0 = unlimited',
      'settings.data':    'Data',
      'settings.clearConfig': 'Clear configuration (keep conversations)',
      'settings.clearAll':'Clear all session data',
      'settings.language':'Language',

      'action.test':      'Test',
      'action.close':     'Close',
      'action.cancel':    'Cancel',
      'action.confirm':   'Confirm',
      'action.delete':    'Delete',

      'test.testing':     'Testing',
      'test.passed':      'Test passed ({ms}ms)',
      'test.failed':      'Test failed: {msg}',

      'confirm.clearAll.title': 'Clear all session data?',
      'confirm.clearAll.body':  'Every topic, conversation and model configuration will be permanently deleted. This cannot be undone.',
      'confirm.clearConfig.title': 'Clear configuration?',
      'confirm.clearConfig.body':  'Endpoint / API key / model name will be wiped for every topic. System prompts and conversations are kept.',
      'confirm.deleteTopic.title': 'Delete this topic?',
      'confirm.deleteTopic.body':  '"{name}" and its entire conversation will be permanently deleted.',

      'notice.notConfigured': 'Configure a model in settings first',
      'notice.retrying':      'Request failed, retrying ({n}/{total})',
      'notice.turnFailed':    '{model} request failed, paused',
      'notice.maxRounds':     'Max rounds reached ({n})',
      'notice.configCleared': 'Model configuration cleared for all topics',
      'notice.allCleared':    'All session data cleared',
      'notice.interrupted':   'Previous turn was interrupted and has been removed',

      'error.network':       'Network or CORS error',
      'error.badResponse':   'Response was neither valid SSE nor JSON',
      'error.emptyResponse': 'The model returned nothing',
      'error.timeout':       'Request timed out'
    }
  };

  var lang = 'zh';

  /** Translate a key, interpolating {placeholders} from `vars`. */
  function t(key, vars) {
    var table = dict[lang] || dict.zh;
    var s = table[key];
    if (s === undefined) s = (dict.zh[key] !== undefined ? dict.zh[key] : key);
    if (!vars) return s;
    return s.replace(/\{(\w+)\}/g, function (m, name) {
      return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m;
    });
  }

  function getLang() { return lang; }

  function setLang(next) {
    if (!dict[next]) return;
    lang = next;
    global.document.documentElement.lang = (next === 'zh' ? 'zh-CN' : 'en');
  }

  /** Replace text of every [data-i18n] / [data-i18n-placeholder] / [data-i18n-title] node. */
  function apply(root) {
    var scope = root || global.document;
    var nodes, i;
    nodes = scope.querySelectorAll('[data-i18n]');
    for (i = 0; i < nodes.length; i++) nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'));
    nodes = scope.querySelectorAll('[data-i18n-placeholder]');
    for (i = 0; i < nodes.length; i++) nodes[i].placeholder = t(nodes[i].getAttribute('data-i18n-placeholder'));
    nodes = scope.querySelectorAll('[data-i18n-title]');
    for (i = 0; i < nodes.length; i++) nodes[i].title = t(nodes[i].getAttribute('data-i18n-title'));
  }

  /** Detect the browser language on first run. */
  function detect() {
    var n = (global.navigator && (global.navigator.language || global.navigator.userLanguage)) || 'zh';
    return /^zh/i.test(n) ? 'zh' : 'en';
  }

  global.I18N = {
    t: t,
    apply: apply,
    setLang: setLang,
    getLang: getLang,
    detect: detect,
    available: ['zh', 'en'],
    dict: dict
  };
})(window);
