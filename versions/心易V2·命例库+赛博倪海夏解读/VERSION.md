# 心易 V2 · 命例库 + 赛博倪海夏解读

> 定稿日期:2026-07-04　·　在 V1「真紫微引擎」基础上,接入开源 ziwei-2.0 纯资产、整体升级紫微解读、加命例库(MetaSight 风格)。
> 本目录是该版本快照,沿用「墨韵 Ink Luxe」水墨设计系统(见 `theme.css`,设计唯一真源为仓库 `design-system/MASTER.md`)。

## 这一版的里程碑(相对上一版「心易V1·真紫微引擎」)

1. **接入开源 ziwei-2.0 三项纯资产**(只搬知识/规则,不搬 React/Next 框架):
   - 倪海夏系统提示词 → 拆三篇 `knowledge/ziwei/*.md` 进 RAG(改写语气合规)。
   - **格局识别**(此前没有的能力):`src/ziwei-patterns.js`,11 条规则改读 iztro 结构;命盘面板新增「命盘格局」区(标签按 level 分色 + 点开白话释义)。
   - 星曜五行/关键词元数据 `STAR_META`。

2. **紫微解读整体升级为「赛博倪海夏」深解**(移植 ziwei-2.0 interpret 模块):
   - `ZIWEI_SYSTEM` 换 ~300 行三合派(南派)人设 + `buildChartContext` 喂十二宫全量上下文;`/api/ziwei` 一次性解读 与 `/chat` tianming 模式 口径一致。保留 `detectCrisis` 危机前置。
   - **隐去真实人名 → 易理口径**:42 处「倪海夏/倪师」全改「古诀云/经书有言/三合派主张」,并加「身份口径」硬约束禁出现人名。

3. **命例库(MetaSight 风格,localStorage)**:
   - 天命页表单上方 → 卡片列表 +「新建八字」弹窗:阳历/阴历两 tab、名称、出生城市(+地图占位)、拨轮日期、时区、性别、标签 chips。卡片=性别图标 + 名称 + 主命 chip + 四柱(五行染色)+ 标签 + 出生日期。
   - 存全文(payload + 完整解读),点卡片瞬间还原,不重耗 Key。免费 3 / 会员 10(前端开关位 `xinyi_member`,预留接口)。搜索过滤、删除 confirm、EN 双语。

4. **解读排版**:前端 `mdRender()` 轻量 markdown 渲染(标题/粗体/列表/分隔线),墨韵样式,不再显示裸 `**`。

## 设计说明
- 本版**维持墨韵水墨定位**。曾试做过一版 MetaSight 极简风(天命+落地页深简化),因不符产品定位已 `git revert` 回滚,不在本快照内。

## 快照内容(public/)
`landing.html`(落地)· `index.html`(天命·命例库)· `fengshui.html`(地运)· `renjiandao.html`(人间道)· `hehun.html`(合参)· `chat.html`(对话)· `preview.html` · `theme.css` · `fx.js` · `ink.js`
> 注:本快照仅含前端 `public/`(设计回滚用);**完整代码(`src/` 引擎/解读/格局、`knowledge/`、`server.js`、测试)以 git 仓库为准**。

## 模型配置(`.env`,已 gitignore,不入快照/仓库)
沿用 V1:`LLM_PROVIDER=openai-compatible` · DashScope 兼容端点 · qwen 系列;视觉须 `qwen-vl-max`/`qwen-vl-plus`(`-latest` 别名 403)。

## 预览图(screenshots/)
01 天命·命例库列表 · 02 天命·新建八字弹窗 · 03 地运 · 04 人间道 · 05 落地页
