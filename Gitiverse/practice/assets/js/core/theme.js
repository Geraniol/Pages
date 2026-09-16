/* =====================================================================
   Git Playground · 明暗主题
   ---------------------------------------------------------------------
   搬自 chapter_1.html（assets/app.js 的 Theme 模块），只是把存储键换成
   本项目的 vge.* 命名空间、文案走本项目自己的词表。

   三件事：
     1) <html> 上的 data-theme 属性 —— 全部颜色都挂在这个属性下（见 theme.css）
     2) localStorage 记住选择；没存过就跟随系统 prefers-color-scheme
     3) 系统主题变化时，**只在用户没手动选过**的情况下跟着变
        （手动选过就尊重用户，别让系统把他的选择顶掉）

   ⚠ 首屏防闪在 index.html 的 <head> 里那段内联脚本 —— 它必须跑在样式表之前，
     所以不能指望这个文件（它在 </body> 前才加载，那时页面已经画过一帧了）。
     两处的取值规则必须一致，改一个记得改另一个。
   ===================================================================== */
'use strict';
window.VGE = window.VGE || {};

(function(){

const STORE_KEY = 'vge.theme';          /* 只存 'light' | 'dark' 两个字符串 */
const root = document.documentElement;
const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function stored(){
  try{ return localStorage.getItem(STORE_KEY); }catch(e){ return null; }   /* 隐私模式 */
}
function save(v){
  try{ localStorage.setItem(STORE_KEY, v); }catch(e){ /* 隐私模式：记住不了，但本次仍然生效 */ }
}
const systemPref = () => (media && media.matches) ? 'dark' : 'light';

/* 应用主题。按钮的提示文案跟着走 —— 它说的是"点下去会切到哪边"，
   所以亮色时读"切换明暗主题"这个中性说法就够了（本项目只有中英两套词表，
   不像 chapter_1 分了 toDark / toLight 两条）。 */
function apply(mode){
  root.setAttribute('data-theme', mode);
}
function current(){ return root.getAttribute('data-theme') || 'light'; }
function toggle(){
  const next = current() === 'dark' ? 'light' : 'dark';
  save(next);
  apply(next);
  return next;
}
function init(){
  apply(stored() || systemPref());
  /* 只在"用户没手动选过"时跟随系统。加了 addEventListener 就不用 addListener
     那套老 API —— 本项目的 target 是能力齐全的现代浏览器（已经用了
     flex/grid/:has()/color-mix）。 */
  if(media && media.addEventListener){
    media.addEventListener('change', e => {
      if(!stored()) apply(e.matches ? 'dark' : 'light');
    });
  }
}
/* 设置面板的「重置布局」不重置主题；留一个复位口子给将来用 */
function reset(){
  try{ localStorage.removeItem(STORE_KEY); }catch(e){ /* 隐私模式 */ }
  apply(systemPref());
}

VGE.theme = { init:init, toggle:toggle, apply:apply, current:current, reset:reset };

})();
