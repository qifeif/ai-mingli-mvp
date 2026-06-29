# 心易 V1 · 真紫微引擎 · 全链路实测通过

> 定稿日期:2026-06-29　·　第一个端到端可用版本(三道全通 + 真排盘 + 真模型)
> 本目录是该版本快照,沿用「中式美学初版」的新中式设计令牌(见 `theme.css`)。

## 这一版的里程碑(相对上一版「天命紫微·工具页双栏」)
1. **天命排盘 静态 Mock → 真实紫微斗数**:接开源 `iztro`(`src/ziwei.js` / `POST /api/ziwei`)。真太阳时校正 → 安星十二宫(主星亮度 + 四化 + 辅星 + 大限 + 命/身宫)→ 三方四正(命·迁·财·官)。规则版三方四正离线即出,配 Key 叠加 AI 深化(以三方四正为主轴、不下定论)。
2. **三链路端到端实测通过**(通义千问 / 阿里云 DashScope):
   - 天命 `/api/ziwei` —— AI 深化 + 危机前置(危机问句正确短路不排盘),~12s。
   - 人间道 `/api/renjiandao` —— 六爻解读,~13s。
   - 地运 `/api/fengshui` 视觉 —— `qwen-vl-max` 读户型图划九宫逐间点评,~33s。
   - 中英双语 EN 路径可用(AI 正文英文;规则版三方四正主星名也已中英对照)。
3. 已修上一版遗留小瑕:EN 规则版三方四正 chip 主星名由中文改为罗马字(`STAR_EN`)。

## 模型配置(`.env`,已 gitignore,不入快照/仓库)
`LLM_PROVIDER=openai-compatible` · DashScope 兼容端点 · `qwen-plus`(主解读)/ `qwen-turbo`(危机&分类)/ **`qwen-vl-max`**(视觉)。
⚠️ 视觉模型须用 `qwen-vl-max` 或 `qwen-vl-plus`;`-latest` 别名在该账号 **403 access_denied**。

## 快照内容(public/)
`landing.html`(首页)· `index.html`(天命·紫微)· `fengshui.html`(地运)· `renjiandao.html`(人间道)· `preview.html`(含页面一览)· `theme.css` · `ink.js`
> 注:本快照仅含前端 `public/`(设计回滚用);**完整代码(含 `src/ziwei.js` 引擎、`server.js`、测试)以 git 仓库为准**。

## 预览图(screenshots/)
01 天命真紫微命盘+三方四正+AI · 02 人间道 · 03 地运 · 04 preview 页面一览 · 05 天命移动端命盘
