/**
 * 端到端解读管线
 * ------------------------------------------------------------
 * 用户输入 → ① 危机检测(前置短路) → ② 场景分类 → 排盘
 *          → ③ 主解读(注入 chart) → 返回
 *
 * 模型选择(遵循 Anthropic 官方建议 + prompts.md 设计意图):
 *  · 主解读:claude-sonnet-4-6 + adaptive thinking(性价比主力,匹配订阅经济)
 *  · 危机检测 / 场景分类:claude-haiku-4-5(prompts.md 明确"可用小模型",
 *    这是又快又省的分类任务,符合产品设计)
 *
 * 缓存:interpret() 把稳定指令(体系+风格+场景模板+示范)放进带 cache_control
 * 的 system 块,可变的命盘/知识/问题留在 user 消息。当前稳定前缀约 670 tokens,
 * 低于 Sonnet 4.6 的 2048 最小可缓存阈值,暂不命中;接入 RAG 或扩充体系后自动生效。
 */
import { makeClient as makeLLMClient } from './llm.js';
import { computeChart } from './bazi.js';
import { getKnowledgeContext } from './rag.js';
import {
  SYSTEM_PROMPT, STYLE, SCENE_TEMPLATES, FEWSHOT,
  CRISIS_TRIAGE, CRISIS_COMFORT, CRISIS_FALLBACK,
} from './prompts.js';

const MODEL = {
  interpret: process.env.LLM_TEXT_MODEL || 'claude-sonnet-4-6', // 主解读:可由 .env 切换国内模型
  classify: process.env.LLM_CLASSIFY_MODEL || process.env.LLM_TEXT_MODEL || 'claude-haiku-4-5', // 分类/危机:默认用小模型
};

function buildBaziRagQuery({ chart, question, scene }) {
  const tenGods = (chart?.十神要点 || []).map((x) => x.十神).join(' ');
  return [
    question, scene, chart?.日主?.天干, chart?.日主?.五行, chart?.日主?.旺衰, tenGods,
    chart?.当前大运?.干支, chart?.当前大运?.主十神,
    chart?.今年流年?.干支, chart?.今年流年?.主十神,
    Object.entries(chart?.五行分布 || {}).flat().join(' '),
  ].filter(Boolean).join('\n');
}

// ---------- ① 危机检测(前置短路) ----------
export async function detectCrisis(client, question) {
  try {
    const res = await client.messages.create({
      model: MODEL.classify,
      max_tokens: 256,
      system: CRISIS_TRIAGE,
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              level: { type: 'string', enum: ['normal', 'risk'] },
              reason: { type: 'string' },
            },
            required: ['level', 'reason'],
            additionalProperties: false,
          },
        },
      },
      messages: [{ role: 'user', content: question }],
    });
    const text = res.content.find((b) => b.type === 'text')?.text ?? '{}';
    return JSON.parse(text);
  } catch (e) {
    // 检测失败时从严:当作 risk,走安抚兜底,绝不漏拦
    return { level: 'risk', reason: `检测异常,从严处理:${e.message}` };
  }
}

// ---------- ② 场景分类 ----------
export async function classifyScene(client, question) {
  try {
    const res = await client.messages.create({
      model: MODEL.classify,
      max_tokens: 256,
      system: '把用户的命理咨询问题归到四类之一:decision(决策)/emotion(情感)/timing(时机)/self(自我认知)。只输出分类。',
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: { scene: { type: 'string', enum: ['decision', 'emotion', 'timing', 'self'] } },
            required: ['scene'],
            additionalProperties: false,
          },
        },
      },
      messages: [{ role: 'user', content: question }],
    });
    const text = res.content.find((b) => b.type === 'text')?.text ?? '{}';
    return JSON.parse(text).scene;
  } catch {
    return 'decision'; // 兜底:默认决策类
  }
}

// ---------- ③ 主解读 ----------
export async function interpret(client, { chart, question, scene, style = 'friend', knowledge = '', lang = 'zh' }) {
  // 稳定前缀(跨用户、同 style+scene+lang 复用):体系 + 风格 + 场景模板 + 同类示范。
  // 放进带 cache_control 的 system 块,作为可缓存的共享前缀。
  const langRule = lang === 'en'
    ? '\n\n# Output language\nWrite the entire reading in natural, warm English. Keep the section structure; translate any 命理 terms and explain them in plain English.'
    : '';
  const systemText = [
    SYSTEM_PROMPT + (STYLE[style] || STYLE.friend) + langRule,
    `[场景指令]\n${SCENE_TEMPLATES[scene] || SCENE_TEMPLATES.decision}`,
    `[同类示范,供参考语气与结构,不要照抄内容]\n${FEWSHOT[scene] || FEWSHOT.decision}`,
  ].join('\n\n');

  // 可变后缀(每次不同,不可缓存):命盘 / 知识 / 问题。
  const userMsg = [
    `<chart>\n${JSON.stringify(chart, null, 2)}\n</chart>`,
    knowledge ? `<knowledge>\n${knowledge}\n</knowledge>` : '',
    `<question>\n${question}\n</question>`,
  ].filter(Boolean).join('\n\n');

  const res = await client.messages.create({
    model: MODEL.interpret,
    max_tokens: 8000, // 给 adaptive thinking 留足空间;正文仅 350–600 字
    thinking: { type: 'adaptive' }, // 让模型自行决定思考深度
    system: [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userMsg }],
  });
  return res.content.find((b) => b.type === 'text')?.text ?? '';
}

// ---------- 编排:一次完整咨询 ----------
/**
 * @param {Anthropic} client
 * @param {object} input { gender, datetime, place|longitude, question, style? }
 * @returns {Promise<{type:'crisis'|'reading', scene?, chart?, text}>}
 */
export async function runConsultation(client, input) {
  const { question } = input;

  // ① 危机前置:命中直接短路,不进命理流程
  const crisis = await detectCrisis(client, question);
  if (crisis.level === 'risk') {
    let text = CRISIS_FALLBACK;
    try {
      const res = await client.messages.create({
        model: MODEL.interpret, max_tokens: 512,
        system: CRISIS_COMFORT,
        messages: [{ role: 'user', content: question }],
      });
      text = res.content.find((b) => b.type === 'text')?.text ?? CRISIS_FALLBACK;
    } catch { /* 用固定兜底文案 */ }
    return { type: 'crisis', text };
  }

  // ② 分类 + 排盘(可并行)
  const [scene, chart] = await Promise.all([
    classifyScene(client, question),
    Promise.resolve(computeChart(input)),
  ]);

  // ③ RAG 检索 + 主解读
  const { chunks, knowledge } = await getKnowledgeContext({
    domain: 'bazi',
    query: buildBaziRagQuery({ chart, question, scene }),
    limit: input.ragLimit || 5,
  });
  const text = await interpret(client, { chart, question, scene, style: input.style, knowledge, lang: input.lang });
  return { type: 'reading', scene, chart, rag: chunks.map(({ id, title, source, score }) => ({ id, title, source, score })), text };
}

export function makeClient() {
  return makeLLMClient();
}
