/* =========================================================================
 * 大学开学物品清单 · 外部数据
 * 说明：修改标签或增删物品，只需编辑本文件；
 *       tag 取值仅四种颜色：red / orange / yellow / green
 *       red=提前买  orange=开学马上买  yellow=最好买  green=看情况买
 *       icon 为 Lucide 图标名，见 index.html 中的 ICONS 映射
 * ========================================================================= */

window.CHECKLIST_DATA = {
  v: 2, // 数据版本号（仅作参考，不参与校验）
  title: "大学开学物品清单", // 页面标题：同步用于浏览器标签 <title> 与顶部 h1 大标题；改此即可重命名整个页面
  tags: {  // 顶部彩色图例：颜色 → 名称，与物品的 tag 取值一一对应；改此即可重命名/增减彩色图例
    red: "提前准备",
    orange: "开学准备",
    yellow: "最好准备",
    green: "看情况"
  },
  categories: [
    {
      id: "docs",
      name: "证件材料",
      icon: "file-text",
      items: [
        { id: "docs-1", text: "录取通知书", tag: "red" },
        { id: "docs-2", text: "身份证", tag: "red" },
        { id: "docs-3", text: "复印件", tag: "red" },
        { id: "docs-4", text: "高考档案", tag: "red" },
        { id: "docs-5", text: "团员/党员材料", tag: "red" },
        { id: "docs-6", text: "证件照（一寸/两寸）", tag: "red" },
        { id: "docs-7", text: "银行卡", tag: "orange" },
        { id: "docs-8", text: "户口迁移相关材料", tag: "red" }
      ]
    },
    {
      id: "bedding",
      name: "床上用品",
      icon: "bed-double",
      items: [
        { id: "bed-1", text: "床垫", tag: "red" },
        { id: "bed-2", text: "床单", tag: "red" },
        { id: "bed-3", text: "被套", tag: "red" },
        { id: "bed-4", text: "枕套", tag: "red" },
        { id: "bed-5", text: "枕头", tag: "red" },
        { id: "bed-6", text: "夏被", tag: "red" },
        { id: "bed-7", text: "秋冬厚被子", tag: "red" },
        { id: "bed-8", text: "蚊帐", tag: "orange" },
        { id: "bed-9", text: "床帘", tag: "orange" }
      ]
    },
    {
      id: "care",
      name: "洗漱化妆",
      icon: "spray-can",
      items: [
        { id: "care-1", text: "牙刷", tag: "orange" },
        { id: "care-2", text: "牙膏", tag: "orange" },
        { id: "care-3", text: "漱口杯", tag: "orange" },
        { id: "care-4", text: "毛巾", tag: "orange" },
        { id: "care-5", text: "浴巾", tag: "orange" },
        { id: "care-6", text: "洗发水", tag: "orange" },
        { id: "care-7", text: "沐浴露", tag: "orange" },
        { id: "care-8", text: "洗面奶", tag: "orange" },
        { id: "care-9", text: "护肤品", tag: "orange" },
        { id: "care-10", text: "吹风机", tag: "orange" },
        { id: "care-11", text: "化妆品", tag: "green" },
        { id: "care-12", text: "指甲刀", tag: "green" },
        { id: "care-13", text: "梳子", tag: "green" },
        { id: "care-14", text: "镜子", tag: "green" }
      ]
    },
    {
      id: "clean",
      name: "清洁洗涤",
      icon: "washing-machine",
      items: [
        { id: "cln-1", text: "洗衣液", tag: "orange" },
        { id: "cln-2", text: "洗衣皂", tag: "orange" },
        { id: "cln-3", text: "衣架", tag: "orange" },
        { id: "cln-4", text: "晾衣架", tag: "orange" },
        { id: "cln-5", text: "晾衣绳", tag: "orange" },
        { id: "cln-6", text: "晾衣夹", tag: "orange" },
        { id: "cln-7", text: "盆", tag: "orange" },
        { id: "cln-8", text: "卫生纸", tag: "orange" },
        { id: "cln-9", text: "抽纸", tag: "orange" },
        { id: "cln-10", text: "湿巾", tag: "orange" },
        { id: "cln-11", text: "卷纸", tag: "orange" },
        { id: "cln-12", text: "扫把+簸箕", tag: "orange" },
        { id: "cln-13", text: "除尘粘毛滚筒", tag: "orange" },
        { id: "cln-14", text: "抹布", tag: "orange" },
        { id: "cln-15", text: "洗衣袋", tag: "orange" },
        { id: "cln-16", text: "脏衣篮", tag: "yellow" },
        { id: "cln-17", text: "马桶刷", tag: "orange" },
        { id: "cln-18", text: "浴室脚垫", tag: "orange" },
        { id: "cln-19", text: "吸尘器", tag: "yellow" },
        { id: "cln-20", text: "一次性手套", tag: "yellow" }
      ]
    },
    {
      id: "clothes",
      name: "衣物饰件",
      icon: "shirt",
      items: [
        { id: "clo-1", text: "当季衣物", tag: "red" },
        { id: "clo-2", text: "换季衣物", tag: "red" },
        { id: "clo-3", text: "内衣", tag: "red" },
        { id: "clo-4", text: "袜子", tag: "red" },
        { id: "clo-5", text: "运动鞋", tag: "red" },
        { id: "clo-6", text: "拖鞋", tag: "orange" },
        { id: "clo-7", text: "正装", tag: "green" },
        { id: "clo-8", text: "雨伞/雨衣", tag: "orange" }
      ]
    },
    {
      id: "electronics",
      name: "电子数码",
      icon: "laptop",
      items: [
        { id: "elec-1", text: "手机", tag: "red" },
        { id: "elec-2", text: "耳机", tag: "red" },
        { id: "elec-3", text: "充电器", tag: "red" },
        { id: "elec-4", text: "充电宝", tag: "red" },
        { id: "elec-5", text: "数据线", tag: "red" },
        { id: "elec-6", text: "插排", tag: "orange" },
        { id: "elec-7", text: "台灯", tag: "orange" },
        { id: "elec-8", text: "U盘", tag: "red" },
        { id: "elec-9", text: "电脑支架", tag: "orange" },
        { id: "elec-10", text: "扩展坞", tag: "orange" },
        { id: "elec-11", text: "鼠标", tag: "orange" },
        { id: "elec-12", text: "鼠标垫", tag: "orange" },
        { id: "elec-13", text: "相机", tag: "green" },
        { id: "elec-14", text: "运动相机", tag: "green" },
        { id: "elec-15", text: "相机支架", tag: "green" },
        { id: "elec-16", text: "计算器", tag: "green" },
        { id: "elec-17", text: "干电池", tag: "green" },
        { id: "elec-18", text: "手电筒", tag: "green" },
        { id: "elec-19", text: "游戏手柄", tag: "green" }
      ]
    },
    {
      id: "study",
      name: "学习文具",
      icon: "book-open",
      items: [
        { id: "stu-1", text: "笔记本", tag: "red" },
        { id: "stu-2", text: "笔", tag: "red" },
        { id: "stu-3", text: "A4纸", tag: "red" },
        { id: "stu-4", text: "资料夹", tag: "orange" },
        { id: "stu-5", text: "书签", tag: "yellow" },
        { id: "stu-6", text: "订书机", tag: "yellow" },
        { id: "stu-7", text: "订书钉", tag: "yellow" },
        { id: "stu-8", text: "书立", tag: "yellow" },
        { id: "stu-9", text: "长尾夹", tag: "yellow" },
        { id: "stu-10", text: "束线带", tag: "yellow" }
      ]
    },
    {
      id: "daily",
      name: "日用杂项",
      icon: "package",
      items: [
        { id: "day-1", text: "水杯", tag: "orange" },
        { id: "day-2", text: "锁", tag: "orange" },
        { id: "day-3", text: "垃圾袋", tag: "orange" },
        { id: "day-4", text: "挂钩", tag: "orange" },
        { id: "day-5", text: "桌垫", tag: "yellow" },
        { id: "day-6", text: "剪刀", tag: "yellow" },
        { id: "day-7", text: "小刀", tag: "yellow" },
        { id: "day-8", text: "胶带", tag: "yellow" },
        { id: "day-9", text: "便携餐具（筷子勺子）", tag: "red" },
        { id: "day-10", text: "折叠椅", tag: "green" },
        { id: "day-11", text: "购物袋", tag: "green" },
        { id: "day-12", text: "SIM卡针", tag: "green" },
        { id: "day-13", text: "娃娃", tag: "green" },
        { id: "day-14", text: "体重计", tag: "green" }
      ]
    },
    {
      id: "sleep",
      name: "睡眠休息",
      icon: "moon",
      items: [
        { id: "slp-1", text: "耳塞", tag: "orange" },
        { id: "slp-2", text: "眼罩", tag: "orange" },
        { id: "slp-3", text: "闹钟", tag: "yellow" },
        { id: "slp-4", text: "小夜灯", tag: "yellow" },
        { id: "slp-5", text: "人体工学椅", tag: "green" },
        { id: "slp-6", text: "腰靠+头撑", tag: "green" }
      ]
    },
    {
      id: "health",
      name: "医药健康",
      icon: "pill",
      items: [
        { id: "hea-1", text: "感冒药", tag: "orange" },
        { id: "hea-2", text: "肠胃药", tag: "orange" },
        { id: "hea-3", text: "退烧药", tag: "orange" },
        { id: "hea-4", text: "创可贴", tag: "orange" },
        { id: "hea-5", text: "驱蚊液", tag: "orange" },
        { id: "hea-6", text: "无比滴", tag: "orange" },
        { id: "hea-7", text: "眼药水", tag: "orange" },
        { id: "hea-8", text: "唇膏", tag: "orange" },
        { id: "hea-9", text: "口腔溃疡药", tag: "yellow" },
        { id: "hea-10", text: "电蚊拍", tag: "yellow" },
        { id: "hea-11", text: "卫生巾", tag: "red" },
        { id: "hea-12", text: "布洛芬", tag: "yellow" },
        { id: "hea-13", text: "口罩", tag: "yellow" }
      ]
    },
    {
      id: "storage",
      name: "收纳整理",
      icon: "archive",
      items: [
        { id: "sto-1", text: "衣柜收纳盒", tag: "yellow" },
        { id: "sto-2", text: "真空压缩袋", tag: "yellow" },
        { id: "sto-3", text: "气泵", tag: "yellow" }
      ]
    }
  ]
};
