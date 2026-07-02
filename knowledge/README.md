# 心易 RAG 知识库

把你的资料按领域放到这里，服务会自动读取 `.md` / `.txt` / `.json` 文件并切块检索。

```text
knowledge/
  bazi/        八字、十神、五行、大运流年、案例
  liuyao/      六爻、用神、世应、动爻、变卦、案例
  fengshui/    八宅、东西四命、方位、户型图规则
  renjiandao/  人间道方法、卦象解读口径、案例
```

推荐格式：

```md
---
tags: 正官, 事业, 规则, 压力
---

# 正官在事业问题中的解释

正官代表规则、责任、秩序感，也对应制度、职位、考核和外部评价。

适合这样讲：用户在事业问题上更容易被责任、规则、稳定性牵引。

不要这样讲：你一定会升官。
```

调试：

```bash
curl -s http://localhost:3000/api/rag/search \
  -H 'Content-Type: application/json' \
  -d '{"domain":"bazi","query":"换工作 正官 大运 事业"}'
```
