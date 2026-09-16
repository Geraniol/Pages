/* =====================================================================
   Git Playground · 沙盒的模拟改动集
   ---------------------------------------------------------------------
   沙盒里的"文件改动"从哪来？真实 Git 有工作区，沙盒没有 —— 于是预置三批
   改动，`git commit` 之后工作区一空，就自动铺下一批（见 core/model.js 的
   loadChangeset）。三批的取舍是让练习有层次：

     第 1 批 新增为主            —— 够做 init / add / commit
     第 2 批 新增 + 修改同一文件 —— 让 diff 里同时出现 + 和 ~
     第 3 批 新增 + 修改 + 删除  —— 三种状态齐全，合并时才有东西可冲突

   ---- 这份文件是从 lessons.js 里分出来的 ----
   原来它和课程数据（VGE.COURSE / VGE.TASKS）躺在同一个文件里。课程引擎
   （任务指南卡片）已经删除，而**这三批改动是沙盒赖以运转的数据**，不能跟着
   一起删 —— 于是单独拆出来。改这里 = 改沙盒里能练到什么。
   ===================================================================== */
'use strict';
window.VGE = window.VGE || {};

VGE.CHANGESETS = [
  { label:'项目脚手架', changes:[
    { p:'README.md', s:'A', content:'# visual-git\n\nAn interactive Git sandbox.\n' },
    { p:'.gitignore', s:'A', content:'node_modules/\n.env\n' },
    { p:'src/index.ts', s:'A', content:"export function main() {\n  greet('scaffold');\n}\n" },
    { p:'src/utils.ts', s:'A', content:"export function greet(n: string) {\n  console.log('hello ' + n);\n}\n" },
    { p:'src/graph/renderer.ts', s:'A', content:"export function render() {\n  // draw the commit graph\n}\n" },
    { p:'styles/main.css', s:'A', content:"body { margin: 0; font-family: sans-serif; }\n" } ],
    en:{ label:'Project scaffold' } },
  { label:'导航组件', changes:[
    { p:'src/components/NavBar.tsx', s:'A', content:"export const NavBar = () => <nav>Home</nav>;\n" },
    { p:'src/components/NavBar.test.ts', s:'A', content:"import { NavBar } from './NavBar'; // test stub\n" },
    { p:'src/index.ts', s:'M', content:"export function main() {\n  document.body.appendChild(NavBar());\n  greet('with nav');\n}\n" },
    { p:'styles/main.css', s:'M', content:"body { margin: 6px; font-family: system-ui; }\n" } ],
    en:{ label:'Nav component' } },
  { label:'文档与清理', changes:[
    { p:'docs/git-basics.md', s:'A', content:'# Git Basics\n\nSummary of the official tutorial.\n' },
    { p:'README.md', s:'M', content:'# visual-git\n\nAn interactive Git sandbox.\n\n## Collaborating\n\nPull before you push.\n' },
    { p:'src/utils.ts', s:'D' } ],
    en:{ label:'Docs & cleanup' } },
];
