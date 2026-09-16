/* =====================================================================
   Git Playground · 补充词条（i18n 扩展）
   ---------------------------------------------------------------------
   lang.js 放主词表；这里放两类补充：
     1) 只有 title / aria-label 的图标按钮等零散文案（中英对照的紧凑写法）
     2) 由 core 各模块在运行时拼出来的键
   加载后合并进 VGE.i18n.dict，重复键覆盖。
   ===================================================================== */
'use strict';

/* =====================================================================
   后端报错词表：已删除
   ---------------------------------------------------------------------
   这里原来是一张“后端错误码 → 中英文案”的对照表（约 100 条），
   配合 VGE.i18n.apiErr() 在 core/gitapi.js 的唯一出口上做本地化。
   gitapi.js（本地仓库后端适配层）已随该模式删除，码表也就没了消费者。
   沙盒引擎（core/model.js）自己就会说中英文，不走这层。 */

/* =====================================================================
   界面上只有 title / aria-label 的图标按钮 → 中英对照词条
   ---------------------------------------------------------------------
   这些原先写死在 index.html 里：英文界面下悬停图标按钮还是中文提示
   （齿轮 / 方向 / 重置 / 显示密钥…）。集中到这里以便翻译。
   （课程导入面板的 DSL 说明表已随 teaching.js 一起删除。）
   ===================================================================== */
(function mergeChromeI18n(){
  if(!(window.VGE && VGE.i18n && VGE.i18n.dict)) return;
  var zh = VGE.i18n.dict['zh-CN'] || {};
  var en = VGE.i18n.dict['en-US'] || {};

  var EXTRA = {
    /* ---- 底部面板切换（终端 ⇄ AI）：按钮的无障碍名 + 悬浮指示 ---- */
    'stack.toTermAria':   ['切换到命令终端', 'Switch to the command terminal'],
    'stack.toAiAria':     ['切换到 AI 助手', 'Switch to the AI assistant'],
    'stack.tipToTerm':    ['切回命令终端', 'Back to the command terminal'],
    'stack.tipToAi':      ['切到 AI 助手 · 输入非 git 内容会自动切过去', 'Switch to the AI assistant · typing anything but git switches automatically'],
    /* 语言按钮上的短标签 = **当前**界面语言自己的写法（中文界面「中」/ 英文界面 EN）。
       放在字典里而不是写死在 app.js，是为了让"英文界面不得出现中文字面量"这条门禁
       能靠词表归属来判断，而不是靠给 app.js 开例外。 */
    'graph.fit':          ['自适应视图', 'Fit the view'],
    'graph.dir':          ['切换横向 / 纵向排布', 'Toggle horizontal / vertical layout'],
    'graph.engineSvg':    ['内置 SVG（CDN 不可用）', 'built-in SVG (CDN unavailable)'],
    'graph.snapCount':    ['{n} 个文件', '{n} files'],
    'btn.resetTitle':     ['重置练习沙盒', 'Reset the practice sandbox'],
    /* 顶栏那枚明暗切换。文案说的是**点下去会怎样**，不是当前状态 ——
       与 chapter_1 的 theme-toggle 同一条规则（亮色时提示"切到夜间模式"）。 */
    'theme.toggle':       ['切换明暗主题', 'Switch light / dark theme'],
    'cfg.keyEyeAria':     ['显示 / 隐藏密钥', 'Show / hide the API key'],
    'ai.listSep':         ['、', ', '],
    /* 提交节点详情面板（点击提交图节点弹出） */
    'node.title':         ['节点详情', 'Node details'],
    'node.files':         ['共 {n} 个文件', '{n} file(s)'],
    'node.diffLoading':   ['正在读取 diff…', 'Loading diff…'],
    'node.diffNone':      ['这个文件没有可显示的文本差异', 'No textual diff for this file'],
    'node.noChanges':     ['这次提交没有文件改动', 'No file changes in this commit'],
    'btn.closeAria':      ['关闭', 'Close'],
  };
  Object.keys(EXTRA).forEach(function(k){
    zh[k] = EXTRA[k][0];
    en[k] = EXTRA[k][1];
  });
})();
