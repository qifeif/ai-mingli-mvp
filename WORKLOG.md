# 心易 · 工作日志

> 倒序记录每日进展。设计快照见 `versions/`,长期事实见 Claude 记忆 `xinyi-project`。

---

## 2026-07-01 — 营销区双语补全(定价/FAQ/CTA + chat.html) + 移动端截图核验

### 做了什么
- **`landing.html` 补双语**:`#pricing`(三档定价卡含权益列表)、`#faq`(四条问答)、`.cta-band` 三个转化区块全部打上 `data-i18n`,`I18N.zh`/`I18N.en` 字典补齐对应词条。范围收敛在关键转化区,装饰性 section(三道合一介绍/为什么心易/易理为用/气韵 band)按拍板保留纯中文,不铺开改。
- **`chat.html`(V2 对话页)从 0 个 `data-i18n` 到完整双语**:新增顶栏 `langtog` 按钮(复用 landing 同款视觉);静态 UI(侧栏空状态、模式四按钮、设置生辰按钮、输入框 placeholder、修改生辰弹窗全部字段)与动态 JS 文案(`renderWelcome()` 的欢迎语×有无命盘两版、`allChips` 四组快捷问、模式 placeholder 映射)全部接入 `I18N` 字典;`send()` 请求体 `lang` 字段从硬编码 `'zh'` 改为跟随 `LANG` 状态透传——后端 `server.js`→`src/chat.js`(`buildSystem`/`summarizeSanFang`)早已支持按 `lang` 输出英文,前端只是没接上。语言切换后若在初始欢迎屏会重绘生效;已发送的历史 AI 回复不追溯翻译。
- **Playwright 截图核验**(375×812、390×844 两档,五页:landing/天命/地运/人间道/chat):发现 `chat.html` 顶栏在窄屏挤爆——`hbg + 模式四按钮 + 设置生辰 + EN` 四组元素塞不进一行,新加的 `langtog` 被推出视口不可见;切到英文后模式按钮文案变长(Ren Jian Dao/Di Yun)导致整行溢出。修复:窄屏下模式行改横向可滑动(`overflow-x:auto` + 按钮 `flex:none`,不再挤压/换行)、设置生辰按钮收窄为图标态、`langtog` 缩小 padding。修复后中英文两态在两档视口下均无横向溢出(`document.documentElement.scrollWidth` 校验)。landing/天命/地运/人间道四页移动端排版本身工整,无需改动。
- **`npm test` 24/24 ✓**(排盘引擎回归无受影响,本次改动全在 `public/` 前端)。

### 关键决策 / 注意
- 双语范围按用户拍板收敛到"关键转化区",不是全站铺开;若后续要继续扩大双语覆盖(三道合一介绍等),需另行确认范围。
- 工作区里另有一份未提交的 RAG 检索增强改动(`server.js`/`src/fengshui.js`/`src/pipeline.js`/`src/renjiandao.js`/新增 `src/rag.js`/`knowledge/`/`tests/rag.test.js`),**不是本次改动产生**,本次未触碰、未一并提交,仅顺带确认它未破坏 `npm test`(测试含 RAG 相关用例且通过)。

### 下一步推荐动作
1. **[P1]** 紫微解读深化(大限/流年/四化飞星;命盘点选宫位联动)——WORKLOG 里挂了多轮,仍未开始。
2. **[P2]** 部署上线出内测链接。
3. 若要继续扩大双语覆盖面(三道合一/为什么心易等装饰性 section),需先与用户确认范围。

---

## 2026-06-29 — 🏁 心易 V1 定版(首个端到端可用)+ 上 GitHub

### 做了什么
- **三道全链路 e2e 跑通**(通义千问):天命 `/api/ziwei`(真紫微 + AI 深化 + 危机前置)、人间道 `/api/renjiandao`、地运 `/api/fengshui` 视觉(`qwen-vl-max`)。
- **修 EN 小瑕**:规则版三方四正 chip 主星名加中英对照(`STAR_EN` / `starName()`),EN 模式显示罗马字(Tianliang / Taiyang…)。`npm test` 21/21 ✓。
- **快照** → `versions/心易V1·真紫微引擎/`(public 7 + VERSION.md + screenshots ×5)。
- **README 重写**为「心易 V1」项目说明(中文,三道/技术栈/快速开始/架构/设计原则);清理临时脚本,补 `.gitignore`(`.DS_Store`/`_*.cjs`/`_*.mjs`)。
- **首次入 git + 推 GitHub 私有仓库 `xinyi-v1`**(账号 qicui-netizen,描述含「心易V1」中文)。`.env` 经 `.gitignore` 不入仓库。

### 下一步
1. 紫微解读深化(大限/流年/四化飞星;命盘点选宫位联动)。
2. landing/preview 移动端细过;营销区 EN i18n。
3. 部署上线出内测链接。

---

## 2026-06-29(三)— 天命接 iztro 真紫微引擎(替换 Mock)

### 做了什么
- **天命排盘 静态 Mock → 真实紫微斗数**:接开源 `iztro`(`npm i iztro`,已入 package.json deps)。
- **`src/ziwei.js`**(新增,纯计算无需 Key):
  - `computeZiwei(input)` —— 真太阳时校正(复用 `trueSolarTime`/`cities`)→ 钟点换 timeIndex(`floor((h+1)/2)`,0 早子…12 晚子)→ `astro.bySolar()` 安星 → 归一化十二宫(**地支固定盘** pos、主星{名,亮度,四化}、辅星、大限、命宫/身宫)+ 中央信息(命主/身主/五行局/四柱/时辰)+ **三方四正**(`surroundedPalaces('命宫')` → 命/迁/财/官)。
  - `summarizeSanFang()` 规则版三方四正:从**真实星曜**推导(十四主星白话 + 四化提示,中英),离线即出。
  - `interpretZiwei()` 配 Key 的 AI 深化(三方四正为主轴、说人话、不下定论);`runZiwei()` 编排:**危机前置** → 排盘 → 规则版 →(有 Key+问题)AI。
- **`/api/ziwei`**(server.js):纯排盘+规则版**无需 Key**(参照 `/api/chart`);带 `question`+Key 时叠加危机前置 + AI 深化。
- **前端 `index.html`**:submit 改调 `/api/ziwei`;`renderZiwei(chart)`/`renderSanFang(sanfang,question)` 消费真数据;**删** 写死的 `ZW_PALACES`/`sfszHtml` Mock + 八字 `renderChart`/`fetchChartOnly`/`sceneLabel`;命盘标「✦ 已做真太阳时校正」(去 DEMO)。
- **`tests/ziwei.test.js`** +5 用例(十二宫/命身宫唯一/三方四正互异含命宫/规则版中英/坏输入)。**`npm test` 21/21 ✓**。
- 桌面 + 移动端截图核验:命宫 子·天梁庙、三方四正(命迁财官)高亮、四化色标(禄绿/权金/科黛/忌赭)、身宫、空宫、真太阳时校正均正确;无 JS 报错。

### 注意 / 决策
- **过渡态已消除**:天命前后端均紫微(`/api/ziwei`)。八字引擎(`bazi.js`/`pipeline.js`/`/api/consult`/`/api/chart`)**保留未删**,其中 `pipeline.detectCrisis` + `prompts.CRISIS_*` 被紫微复用;天命前端不再调八字。
- 残留八字命盘 CSS(`.chart-panel/.pillars/.wx-*` 等)仍在 index.html,无害,可后续清。

### 下一步
1. **[P0] 配 Key 端到端实测**:`/api/ziwei` 的 AI 深化 + 危机前置、人间道、地运视觉三链路从没真 Key 验过;配 `.env` 跑通验质量 + 中英双语。
2. **[P1] 紫微解读深化**:叠大限/流年、四化飞星;命盘可点选宫位看三方四正联动。
3. **[P0/P1]** landing/preview 移动端细过;营销区 EN i18n;部署上线出内测链接。

### 补:配 Key 端到端实测(同日)
- **`.env` 配通义千问**(阿里云 DashScope · OpenAI 兼容):`LLM_PROVIDER=openai-compatible` / `LLM_BASE_URL=…/compatible-mode/v1` / `qwen-plus`(主解读)/ `qwen-turbo`(危机&分类)/ `qwen-vl-max-latest`(视觉)。`.env` 已 gitignore。
- **天命 `/api/ziwei` 端到端实测 ✅**:正常问句 → 危机检测判 normal → AI 深化(qwen-plus)产出约 645 字三方四正解读,紧扣真盘(天梁庙坐命/迁移太阳/财帛天机化权…),结构与产品原则到位,~12s;**危机问句 → 正确短路为 `crisis`、不排盘、给陪伴+求助**。前端 AI 解读块渲染正常,无 JS 报错。
- **三链路全部 e2e 通过(同日续测)**:人间道 `/api/renjiandao` ~769 字(火水未济→雷山小过,~13s);地运 `/api/fengshui` 视觉 ~1569 字(读图划九宫逐间点评,~33s);EN 路径 AI 正文英文 OK。
- **视觉模型踩坑**:`qwen-vl-max-latest` / `qwen-vl-plus-latest` 在该账号 **403 access_denied** → 改用 **`qwen-vl-max`**(已落 `.env`;`qwen-vl-plus` 亦可)。遗留小瑕:EN 规则版三方四正 chips 主星名仍中文(AI 正文已英文)。

---

## 2026-06-29(二)— 工具页双栏重做 + 天命紫微化 + 页面一览

### 做了什么
- **三工具页 单列→双栏「工作台」+ 自适应**(天命 / 地运 / 人间道):编辑式 hero + 左主列表单卡 + 右 sticky 侧栏(「这一道是什么」/ 编号三步「怎么用」/ **三道互参**交叉导航卡)+ **结果整宽**;≤900px 单列堆叠**表单优先**,≤560px 收敛。新增内容补 EN i18n;补回人间道导航「人间道」自链接。
- **Logo 贯彻四页**:nav 左上统一为落地页「朱砂『易』印 + 心易」锁定标。
- **天命「紫微化」(前端/定位层,后端未动)**:
  - badge `子平八字`→**`紫薇八字`**;侧栏介绍同步改紫微/三方四正口径;**去塔罗与西方占卜**(全站零残留)。
  - **功能键仿命理排盘 App**(文墨天机 男/女 切换):性别、解读风格改 **分段切换 `.seg`**(墨色风)。
  - **结果 = 静态 Mock 紫微十二宫命盘 + 三方四正解读**(`renderZiwei`/`sfszHtml`,写死数据,标注「示例 DEMO · 静态盘」):4×4 宫格+中央信息盘(随表单回填)、主星亮度+四化色标+副星+宫名+大限+干支、**命宫朱砂框 / 三方四正(命·迁·财·官)高亮 / 身宫标记 / 图例**、三方四正解读面板(中英双文案)。AI 文字仍走 `/api/consult`(无 Key 降级)。
- **/preview 加「页面一览」`#pages`**:iframe 实时嵌四页,页面 tab + 桌面/手机 390 视口切换 + 「全部」2×2 缩略图网格(可点开)。
- **快照** → `versions/天命紫微·工具页双栏/`(public 7 文件 + VERSION.md + screenshots ×6)。

### 关键决策 / 注意
- 第 5 项「紫微排盘」按用户选「**先做静态 Mock 看效果**」:命盘数据写死,**后端仍是子平八字**(`/api/consult` 返回八字)——前端紫微盘 × 后端八字,是**过渡演示态**,名实暂不符已在页面标 DEMO。
- `index.html` 八字 `renderChart`/`fetchChartOnly` 已删(被 `renderZiwei` 取代);残留八字命盘 CSS(`.chart-panel/.pillars/.wx-*`)未清,无害。
- 全部改动只动 `public/` 前端;表单 `name`/元素 ID/`data-i18n`/API 契约一字未动。

### 下一步推荐动作(承接,按优先级)
1. **[P0] 接 iztro 真紫微引擎** —— 用开源 `iztro` 做真实十二宫排盘(主星/辅星/四化/大限/流年/三方四正,纯计算无需 Key),替换天命 Mock;三方四正解读先规则版、配 Key 后 AI 深化。新增 `/api/ziwei`(参照 `/api/chart` 纯排盘模式)。
2. **[P0] 配 Key 跑通端到端** —— consult / 人间道 / 地运视觉三链路从没真 Key 实测;紫微接好后一并验证。
3. **[P0] 移动端逐页核验**(已开头:工具页 390 截图过了,landing / preview 仍需细过)。
4. **[P1]** landing 营销区补 EN i18n;解读质量深化。
5. **[P2]** 部署上线出内测链接。

---

## 2026-06-29 — 「中式美学初版」定稿

### 做了什么
- **全局新中式(山水留白)统一到 4 页**,逐页截图核验(首页 / 天命·`/app` / 地运·`/diyun` / 人间道·`/renjiandao`)。
- **首页 `public/landing.html` 重建为 `/preview` 那套设计**(改为自包含内联样式,与三工具页 `theme.css` 同色值,渲染与 `/preview` 一致):
  - 山水 hero(远山 / 明月 / 飞鸟 / 松)+ 书法「心易」+ 朱砂「心易之印」落款
  - 题签 `EASTERN YI · 东方易理`;tagline「由易入理 · 三才合一」
  - 副文(**长文案版**):承周易之体,演 AI 之用。把「算命」重做成陪你想清楚的决策工具——人生影响,天命占 1/3,地运占 1/3,人事占 1/3。
  - 三才行 **天命 / 地运 / 人间道 每个字可点**,直达 `/app`、`/diyun`、`/renjiandao`(取消了原来那排独立模式按钮)
  - 下接:三道合一卡 / 为什么心易 / 易理为用 01–04 / 定价 / FAQ / 气韵 band
  - 保留中英双语(nav / hero / footer 走 i18n)、鼠标墨迹拖尾(`ink.js`)
- **快照** → `versions/中式美学初版/`(public 7 文件 + `VERSION.md` + `screenshots/` ×5),供回滚对照。
- 记忆 `xinyi-project` 更新 ③「中式美学初版」+ 下一步推荐动作。

### 关键决策
- 首页用自包含内联样式以保证与 `/preview` **完全一致**;三工具页继续用 `theme.css`(同色值)。
- 副文采用**长文案版**(2026-06-29 用户拍板,优先于早前「去掉『把算命重做成』」的指示)。
- 模式入口收敛进三才行文字,hero 更留白。

### 下一步推荐动作(明日,按优先级)
1. **[P0] 配 Key 跑通端到端** —— consult / 人间道解读 / 地运户型视觉,三条链路从没用真 `ANTHROPIC_API_KEY`(或 `LLM_API_KEY`)实测过。配好 `.env` 后跑通并验证输出质量 + 中英双语。MVP 可用性硬门槛。
2. **[P0] 移动端 / 响应式核验** —— 命理产品九成在手机用,目前只在 1280 桌面截图。用 375 / 390 视口逐页过 hero / 卡片 / 表单 / 命盘面板 / 六爻可视,修溢出与点按热区(尤其三才行可点字)。
3. **[P1] 营销区补中英双语** —— landing 下方 三道合一 / 为什么 / 易理为用 / 定价 / FAQ 仍中文,补 `data-i18n` 让 EN 全页一致。
4. **[P1] 解读质量深化(二选一起步)** —— ① 天命:旺衰引入藏干权重 / 通根 / 调候、五行计入地支藏干;② 人间道:293KB 语料逐卦精修注入(现用策划版方法知识)。
5. **[P2] 部署上线** —— 从 localhost 到可访问 URL(Vercel / 轻量服务器),配 env + 域名,先出内测链接。

### 备注
- `_shot.cjs` 是临时截图脚本(Playwright,留作后续视觉核验,可删)。
- `/preview` 路由保留为独立预览页,未动。
