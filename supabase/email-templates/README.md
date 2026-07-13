# 心易认证邮件中文模板

Supabase 的邮件内容由项目的 Auth 配置发送，不能用 publishable key 在前端或普通服务端接口直接修改。

在 Supabase Dashboard 中打开 `Authentication` → `Email Templates` → `Confirm signup`：

1. 将 Subject 改为 `确认你的心易账号`。
2. 将 [confirm-signup-zh-CN.html](confirm-signup-zh-CN.html) 的全部内容粘贴到邮件正文。
3. 保存后，后续注册确认邮件便会使用中文。

模板中的 `{{ .ConfirmationURL }}` 是 Supabase 自动替换的确认链接，请保留。
