/**
 * 心易 · 对话引擎
 * --------------------------------------------------
 * 把用户命盘（紫微）/ 卦象（六爻）/ 本命卦（八宅）
 * 注入 system prompt，以流式多轮对话方式回答任意命理问题。
 *
 * export streamChat(client, opts) — async generator，每次 yield 一段文字
 */

import { computeZiwei, summarizeSanFang } from './ziwei.js';
import { recommendDirections }             from './bazhai.js';
import { castHexagram }                    from './liuyao.js';
import { detectCrisis }                    from './pipeline.js';
import { CRISIS_COMFORT }                  from './prompts.js';

const CHAT_MODEL    = process.env.LLM_TEXT_MODEL     || 'claude-sonnet-4-6';
const CLASSIFY_MODEL = process.env.LLM_CLASSIFY_MODEL || process.env.LLM_TEXT_MODEL || 'claude-haiku-4-5';

// ── 1. 构建 System Prompt ──────────────────────────────────────────────────

function buildSystem(profile, mode, lang = 'zh', extras = {}) {
  let chartCtx = '', hexCtx = '', fsCtx = '';

  // 紫微命盘
  if (profile?.datetime && profile?.gender) {
    try {
      const chart = computeZiwei(profile);
      const sf    = summarizeSanFang(chart, lang);
      const sp    = chart.三方四正;
      const mingStars = sp?.命宫?.主星?.map(s => `${s.名}${s.化 ? `·${s.化}` : ''}`).join('、') || '空宫';

      chartCtx = `
## 用户命盘（紫微斗数·真太阳时已校正）
- 五行局：${chart.五行局}　命主：${chart.命主}　身主：${chart.身主}
- 生肖：${chart.生肖}　命宫（${chart.命宫地支}）坐：${mingStars}
- 三方四正：
  · 命宫 ${sf.chips[0]}
  · 迁移 ${sf.chips[1]}
  · 财帛 ${sf.chips[2]}
  · 官禄 ${sf.chips[3]}
- 命盘要点：${sf.段落[1]}
`;
    } catch (e) {
      chartCtx = `\n（命盘计算异常：${e.message}，可忽略命盘作通识解读）\n`;
    }
  }

  // 六爻卦象（人间道 mode，由 extras.hexagram 传入）
  if (extras.hexagram) {
    const h = extras.hexagram;
    hexCtx = `
## 当前六爻卦象（已起好，直接采信，无需重摇）
- 本卦：${h.本卦?.name}（上${h.本卦?.upper} 下${h.本卦?.lower}）
- 变卦：${h.变卦?.name || '无（六爻不动）'}
- 动爻：${h.动爻?.length ? h.动爻.map(p => `第${p}爻`).join('、') : '无'}
- 取辞规则：${h.取辞规则 || ''}
`;
  }

  // 八宅本命卦（地运 mode）
  if (mode === 'diyun' && profile?.datetime && profile?.gender) {
    try {
      const rec = recommendDirections(profile);
      fsCtx = `
## 用户本命卦（八宅风水）
- 本命卦：${rec.命卦}
- 吉方：${rec.吉方?.join('、')}
- 凶方：${rec.凶方?.join('、')}
- 首选方位：${rec.首选}
`;
    } catch (_) { /* ignore */ }
  }

  const hasProfile = !!(chartCtx || fsCtx);

  const modeTip = {
    suiwen: hasProfile
      ? '综合易理对话：优先结合用户命盘，从易理角度回答各类问题。'
      : '综合易理对话：从周易、命理、人生智慧角度回答用户问题，无需命盘也能给出有价值的视角。',
    tianming: hasProfile
      ? '深解紫微命盘：聚焦三方四正、主星特质、大限流年，帮用户读懂天命底色。'
      : '紫微斗数知识问答：解释星曜含义、宫位逻辑、四化规则等通识性问题。',
    renjiandao: '六爻起卦解事：依卦象观象悟辞，帮用户把当下这件事看清、时机想明白。',
    diyun: hasProfile
      ? '八宅风水问答：以本命卦为基，解读居所方位、空间布局与格局能量。'
      : '风水方位问答：解释八宅理论、本命卦逻辑和方位吉凶基本规律。',
  };

  const langRule = lang === 'en'
    ? '\n\n# Output language\nRespond in natural English. Render Chinese terms with pinyin + meaning.'
    : '';

  return `你是「心易」AI 易理顾问，用自然流畅的对话，从易理（周易、紫微斗数、六爻、八宅风水等东方智慧）角度帮用户看清处境、想明白选择。
${chartCtx}${hexCtx}${fsCtx}
# 当前解读角度
${modeTip[mode] || modeTip.suiwen}

# 核心原则
1. ${hasProfile ? '优先结合上方命盘/卦象数据作答，不捏造数据。' : '无命盘时，依易理通识和处境分析作答，不捏造排盘数据。'}
2. 不下定论：说"此象提示…""易理来看更宜…"，绝不说"你一定会/注定"。
3. 命理术语当场翻译成生活语言，让普通人看得懂。
4. 对话式：每次 120–350 字，自然段落，不用标题列表，语气温和笃定。
5. 把决定权交还用户，可以留一个值得对方自己想的问题。
6. 若问题需要生辰才能精准解答，可温和提示"告诉我你的出生日期和性别，我可以给出更个性化的解读"——不强求。

# 禁止
不预测生死/重病；不给彩票/赌博/具体金额建议；不恐吓用户。${langRule}`;
}

// ── 2. 流式推理 ───────────────────────────────────────────────────────────

async function* streamAnthropic(client, system, messages, model) {
  const stream = client.messages.stream({
    model,
    max_tokens: 1024,
    system,
    messages,
  });
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      yield event.delta.text;
    }
  }
}

async function* streamOpenAI(system, messages, model) {
  const baseURL = String(process.env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const url     = baseURL.endsWith('/v1') ? `${baseURL}/chat/completions` : `${baseURL}/v1/chat/completions`;
  const apiKey  = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, ...messages],
      max_tokens:  1024,
      temperature: Number(process.env.LLM_TEMPERATURE ?? 0.7),
      stream:      true,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`LLM ${res.status}: ${body.slice(0, 400)}`);
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let   buf     = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const chunk = line.slice(6).trim();
      if (chunk === '[DONE]') return;
      try {
        const json = JSON.parse(chunk);
        const text = json.choices?.[0]?.delta?.content;
        if (text) yield text;
      } catch (_) { /* partial JSON, skip */ }
    }
  }
}

// ── 3. 主入口 ─────────────────────────────────────────────────────────────

/**
 * streamChat — async generator，每次 yield 一段文字（流式 token）
 *
 * @param {object} client     llm.js 创建的 client
 * @param {object} opts
 *   .messages  [{role:'user'|'ai', content:string}]
 *   .profile   {datetime, gender, name?, location?}
 *   .mode      'suiwen'|'tianming'|'renjiandao'|'diyun'
 *   .lang      'zh'|'en'
 *   .extras    {hexagram?}  — 人间道时由调用方传入已起好的卦
 */
export async function* streamChat(client, { messages, profile, mode = 'suiwen', lang = 'zh', extras = {} }) {
  // ① 危机前置
  const lastUser = [...messages].reverse().find(m => m.role === 'user')?.content || '';
  try {
    const crisis = await detectCrisis(client, lastUser);
    if (crisis.level === 'risk') { yield CRISIS_COMFORT; return; }
  } catch (_) { /* 检测失败从宽 */ }

  // ② 构建 system + 转换消息格式
  const system   = buildSystem(profile, mode, lang, extras);
  const llmMsgs  = messages.map(m => ({
    role:    m.role === 'ai' ? 'assistant' : 'user',
    content: m.content,
  }));

  // ③ 按 provider 走流式
  const provider = process.env.LLM_PROVIDER || (process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai-compatible');
  if (provider === 'anthropic') {
    yield* streamAnthropic(client, system, llmMsgs, CHAT_MODEL);
  } else {
    yield* streamOpenAI(system, llmMsgs, CHAT_MODEL);
  }
}

/** 人间道首问时起卦，供 server.js 在调用 streamChat 前调用 */
export { castHexagram };
