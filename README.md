# 心易 V1 · AI 命理决策助手

> 承周易之体,演 AI 之用。把「算命」重做成**陪你想清楚的决策 / 自我认知工具**——给视角不给定论,决定权始终交回用户。

「心易」把传统术数拆成**三道**,一套问答、三面镜子互参;人生影响,天命占 1/3,地运占 1/3,人事占 1/3。每一道的排盘都是**纯计算**(无需任何 API Key 即可看盘),解读层再叠加大模型。**危机信号前置拦截**,优先级高于一切命理流程。

## 三道

| 道 | 路由 | 体系 | 排盘(纯计算) | 解读(需模型) |
|---|---|---|---|---|
| **天命** | `/app` | 紫微斗数(`iztro`)| 真太阳时校正 → 十二宫命盘(主星/亮度/四化/大限)+ **三方四正** | 以三方四正为主轴的 AI 深化 |
| **地运** | `/diyun` | 八宅 · 东西四命 | 本命卦 + 八方位吉凶罗盘 + 诉求方位推荐 | 上传户型图 → 视觉模型逐间方位点评 |
| **人间道** | `/renjiandao` | 周易六爻 | 模拟三铜钱摇卦 → 本卦/动爻/变卦 | 卦图象解读(观象悟辞) |

落地页 `/` 为营销首页(山水 hero + 三道合一 + 定价),`/preview` 为风格预览(含「页面一览」实时嵌四页)。

## 快速开始

```bash
npm install
npm test          # 排盘引擎回归测试(无需 Key,21 用例)
npm run web       # 启动 → http://localhost:3000(自动加载 .env)
```

排盘接口(`/api/ziwei`、`/api/fengshui`、`/api/liuyao`)**纯计算、无需 Key**即可用;AI 解读需在 `.env` 配置模型。

### 配置模型(`.env`)

支持 Anthropic 原生,或任意 OpenAI 兼容平台(DeepSeek / 通义千问 / 豆包 / GLM…)。示例(通义千问 · 阿里云 DashScope):

```ini
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
LLM_API_KEY=sk-...
LLM_TEXT_MODEL=qwen-plus            # 主解读
LLM_CLASSIFY_MODEL=qwen-turbo       # 危机检测 / 场景分类(小模型即可)
LLM_VISION_MODEL=qwen-vl-max        # 地运户型图视觉(注意:别用 -latest 别名,部分账号无权限)
```

> `.env` 已被 `.gitignore`,密钥不会进仓库。Anthropic 用户改填 `ANTHROPIC_API_KEY=sk-ant-...` 即可。

## 架构

```
src/
  ziwei.js        天命 · 紫微斗数引擎(iztro 安星 + 真太阳时 + 三方四正 + 规则版/AI 解读)
  bazhai.js       地运 · 八宅本命卦 + 八方位吉凶(纯函数)
  fengshui.js     地运 · 户型图视觉逐间点评
  liuyao.js       人间道 · 六爻起卦(纯函数,64 卦查表)
  renjiandao.js   人间道 · 卦图象解读管线
  trueSolarTime.js真太阳时校正(经度时差 + 均时差)——排盘准确率命门
  cities.js       出生地经度查表
  pipeline.js     危机检测 / 场景分类 / 八字管线(detectCrisis 被各道复用)
  prompts.js      解读体系 + 危机话术常量
server.js         零依赖 HTTP:页面路由 + /api/ziwei、/api/fengshui、/api/liuyao、/api/renjiandao 等
public/           四页前端(新中式 · 山水留白,共用 theme.css;中英双语 i18n)
tests/            ziwei / bazi / liuyao 回归测试(npm test)
versions/         各设计版本快照(回滚 / 对照)
WORKLOG.md        每日进展日志(倒序)
```

接口契约(改 UI 勿动):`/api/ziwei` body `{gender, place, datetime, question?, style?, lang?}` →
`{type:'ziwei', chart, sanfang, text?}` 或危机时 `{type:'crisis', text}`。

## 设计原则

1. **不下定论**——只说「倾向 / 这个阶段」,不预测确定事件,不替你做决定。
2. **三道互参**——天命看势、地运调场、人间道问时机,一题三面镜子交叉印证。
3. **说人话**——命理术语当场翻译成生活语言(靠排盘的「白话 / 三方四正」字段托底)。
4. **危机前置**——每句话先过安全检测,命中即转温柔陪伴 + 求助资源,绝不把脆弱时刻丢进命理流程。

## 状态

V1 为**首个端到端可用版本**:三道排盘 + 三道 AI 解读 + 危机前置,均已实测跑通(通义千问)。后续:紫微解读深化(大限/流年/四化飞星)、移动端细打磨、营销区双语、部署上线。

> 心易输出仅供参考与自我思考,不构成任何预测、医疗、法律或投资建议。
