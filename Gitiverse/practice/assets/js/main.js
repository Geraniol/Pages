/* =====================================================================
   Git Playground · 入口
   ---------------------------------------------------------------------
   职责：脚本已按顺序加载完毕（vendor → data → core），这里做初始化：
   1) 应用 i18n 到静态 DOM
   2) 种子化"本地仓库"模式的默认待办
   3) 以练习场景（SEED_CMDS）启动 sandbox
   可在此处占位切换到多种语言：window.__setLang('en-US')
   ===================================================================== */
'use strict';

(function init(){
  /* 1. 语言：默认英文，但记住用户上次的选择。
        必须在 apply 之前定下来，否则静态 DOM 会先按默认语言渲染一遍。 */
  let savedLang = null;
  try{ savedLang = localStorage.getItem(VGE.i18n.STORE_KEY); }catch(e){ /* 隐私模式 */ }
  if(savedLang && VGE.i18n.dict[savedLang]) VGE.i18n.current = savedLang;
  document.documentElement.setAttribute('lang', VGE.i18n.current);
  VGE.i18n.apply(document);

  /* 1.2 明暗主题。head 里那段内联脚本已经写过一次 data-theme（防白闪），
         这里再跑一次是幂等的：补上"跟随系统"的监听，并兜住 <head> 脚本
         万一被挡掉的情况（比如某些 CSP 设置）。 */
  VGE.theme.init();

  /* 1.5 读取本机保存的 AI 配置（刷新自动加载）。
         必须在首次 renderAll 之前完成，否则状态徽标会先闪一下"未配置"。 */
  VGE.ai.loadConfig();

  /* 1.6 AI 徽标（模型名 / 未配置）刷新一次。
         这里原来先 `VGE.gitapi.health()` 再刷 —— 因为 AI 走不走同源转发取决于后端在不在。
         转发已经拆掉，AI 与后端再无关系；而这条探测在 file:// 下必定失败
         （fetch file:///api/health 会被浏览器直接拒绝），每次开页都往控制台丢一条红字。
         后端探测本身没有消失：真要用本地仓库模式时，realmode.init() 里还会探一次。 */
  VGE.render.renderAiChrome();

  /* 2. 启动沙盒：从"还没有仓库"开始，用户在终端里自己敲 */
  boot([]);
  /* 这里原来是 setMode('teaching') —— 模式切换删除后没有 setMode 了，
     <body data-mode="teaching"> 是写死在 HTML 上的。 */
  /* 开场白：告诉学习者界面怎么用（原来那句会介绍"右侧课程向导"，随课程卡片一起改过） */
  chat(VGE.i18n.t('chat.courseStart'));

  /* 3.5 原来这里在 file:// 下弹一条气泡，教用户"去跑 node server/node/server.js
     再用 http 地址打开"。后端转发已经拆掉，本页就是为双击打开设计的，
     那条提示只剩反效果，删掉。
     跨域本身没有消失（换了别家厂商、或碰上公司网络的中间层仍可能被拦），
     但实测 DeepSeek 直连是通的，所以不再预先警告 ——
     真连不上时由 ai.errNet 说一次就够，不必每次开页都念。 */

  /* 3. 绘制静态骨架上的 [data-ic]（appbar / 卡片头 / 图例 / 弹窗等）。
        动态内容已由各 render 内的 paintIcons 处理，这里只补一次静态部分。 */
  paintIcons(document);

  /* 4. 初始化设置面板里的语言滑块（分段按钮，文字随界面语言走） */
  syncLangSeg();

  /* 5. 可调布局：读取本机保存的尺寸并挂上分隔线（在首屏渲染之后，
        这样量得到真实的列宽/卡高） */
  VGE.layout.init();

  /* 6. 半屏堆叠模式：左栏折叠按钮 + 行 3 的终端 ⇄ AI 切换（事件已委托，
        与当前窗口宽度无关地挂着；宽度合适时才有实际效果） */
  if(VGE.stacked) VGE.stacked.init();
})();
