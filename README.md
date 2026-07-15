# 心易 V2 · AI 命理决策助手

一个可部署的 Node.js Web 服务，把传统术数拆成天命、地运、人间道与合参四个体验入口。排盘层为本地纯计算，AI 解读层通过环境变量接入 Anthropic 或 OpenAI-compatible 模型。

## 线上入口

`server.js` 会提供以下页面和接口：

- `/`：落地页
- `/app`：天命 · 紫微斗数
- `/diyun`：地运 · 八宅与户型图
- `/renjiandao`：人间道 · 六爻
- `/hehun`：双人八字合参
- `/chat`：多轮对话
- `/login`：登录/注册页
- `/api/*`：排盘、AI 解读、对话、Supabase 数据同步接口

## 本地运行

```bash
npm ci
npm run web
```

打开 `http://localhost:3000`。

## 部署

适合部署到 Render、Railway 等支持 Node.js Web Service 的平台。

推荐配置：

```bash
Build Command: npm ci
Start Command: npm start
```

项目会读取平台注入的 `PORT`；本地未设置时默认使用 `3000`。

## 环境变量

AI 解读需要配置模型。未配置时，纯排盘接口仍可运行，但模型解读会报错。

```ini
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=https://your-provider.example/v1
LLM_API_KEY=sk-...
LLM_TEXT_MODEL=your-text-model
LLM_CLASSIFY_MODEL=your-fast-model
LLM_VISION_MODEL=your-vision-model
LLM_JSON_MODE=off
```

也支持 Anthropic：

```ini
ANTHROPIC_API_KEY=sk-ant-...
```

登录与云端用户数据使用 Supabase：

```ini
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

在 Supabase SQL Editor 执行 `supabase/schema.sql` 创建 `user_data` 表和 RLS 策略。

## 目录

```text
server.js      Node HTTP 服务、页面路由、API 路由
public/        前端页面与静态资源
src/           排盘、AI 解读、RAG、Supabase 代理逻辑
knowledge/     本地 RAG 知识库
supabase/      数据库 schema 与邮件模板
```

## 免责声明

心易输出仅供参考与自我思考，不构成任何预测、医疗、法律或投资建议。
