/**
 * 人间道 · 六爻卦象解读
 * ------------------------------------------------------------
 * 摇卦(liuyao.js)定本卦/动爻/变卦 → 注入倪海厦《天纪·人间道》方法 → 模型解读。
 * 与天命(八字)、地运(八宅)同一套产品原则:不下定论、给视角、说人话、危机优先。
 *
 * 卦象由引擎保证正确;卦辞/爻辞由模型依周易正典补全;
 * 解读「声音」由 renjiandao_method 的卦图象解法定调。
 */
import { castHexagram } from './liuyao.js';
import { detectCrisis } from './pipeline.js';
import { CRISIS_COMFORT, CRISIS_FALLBACK } from './prompts.js';
import { YIJING_GANGLING, GUATU_METHOD, QUCI_RULE } from './data/renjiandao_method.js';

const MODEL = {
  interpret: process.env.LLM_TEXT_MODEL || 'claude-sonnet-4-6',
  classify: process.env.LLM_CLASSIFY_MODEL || process.env.LLM_TEXT_MODEL || 'claude-haiku-4-5',
};

// 解读体系 System Prompt(稳定前缀,可缓存)
function buildSystem(lang) {
  const langRule = lang === 'en'
    ? '\n\n# Output language\nRespond in natural English. Render hexagram names as pinyin + English meaning, e.g. "屯 (Zhūn / Difficulty at the Beginning)".'
    : '';
  return `# 角色
你是「心易 · 人间道」的卦象解读顾问,师法倪海厦《天纪·人间道》。你不是算命,
而是借周易卦象这面镜子,用「观象悟辞」帮用户把当下处境看清、把决定想明白。

# 易经总纲
${YIJING_GANGLING}

# 断卦方法(本模块特色)
${GUATU_METHOD}

# 取辞规则
${QUCI_RULE}

# 核心原则(最高优先级,不可违背)
1. 不下定论、不预测确定事件。只说"此卦象提示/这个阶段更宜",绝不说"你一定会""注定"。
2. 决定权永远在用户手里。给的是视角与时机判断,不是命令。
3. 卦象是工具不是真理。解读的是"处境之象、宜动宜静的时机",不是天定结果。
4. 说人话。卦名爻辞翻译成生活语言;术语当场解释。
5. 不说空话废话,一切扣住"这个卦、这个动爻、这个问题"。

# 严格禁区
不预测生死/重病/寿命/灾祸;不给医疗/法律/投资金额/彩票建议;不鼓励赌博报复自伤。

# 输入
<卦象> 已起好的本卦/变卦/动爻/取辞规则(直接采信,不要自己重摇);
<question> 用户的问题。卦辞爻辞依周易正典补全,以卦图象解法会意。

# 输出规范
- 350–600 字,自然段 + 小标题,不用 JSON。
- 语气温和笃定、有洞察,不神神叨叨。
- 必须先「观象」(把卦象会意成对当下处境的白描)再「悟辞」,落到时机与可做之事。

# 输出结构(措辞可微调)
【先接住你】1–2 句复述并共情处境。
【卦象怎么看】依本卦(及动爻/变卦)会意:此刻是什么处境之象、走到事之何阶段。引 1 点卦辞或爻辞,翻成人话。
【宜动宜静】2–3 条扣住此卦此问的建议,点出此阶段更宜进取还是蓄力。动词开头。
【交回给你】把选择权还给 TA 的话 + 一个值得 TA 自己回答的问题。${langRule}`;
}

// 把卦象渲染成喂给模型的文本
function renderCast(cast) {
  const ben = cast.本卦;
  const bian = cast.变卦;
  const lines = [
    `本卦:${ben.name}(上${ben.upper}下${ben.lower})`,
    bian ? `变卦:${bian.name}(上${bian.upper}下${bian.lower})` : '变卦:无(六爻不动)',
    `动爻:${cast.动爻.length ? cast.动爻.map((p) => `第${p}爻`).join('、') : '无'}`,
    `取辞规则:${cast.取辞规则}`,
    `逐爻(初→上):${cast.逐爻.map((y) => `${y.位}${y.动 ? '(动)' : ''}`).join(' ')}`,
  ];
  return lines.join('\n');
}

export async function interpretHexagram(client, { cast, question, lang = 'zh' }) {
  const systemText = buildSystem(lang);
  const userMsg = [
    `<卦象>\n${renderCast(cast)}\n</卦象>`,
    `<question>\n${question}\n</question>`,
  ].join('\n\n');

  const res = await client.messages.create({
    model: MODEL.interpret,
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    system: [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userMsg }],
  });
  return res.content.find((b) => b.type === 'text')?.text ?? '';
}

/**
 * 一次完整人间道咨询:危机前置 → 起卦(或采用前端已摇结果) → 解读
 * @param {object} input { question, lang?, cast? }  cast 由 /api/liuyao 先摇好回传
 */
export async function runRenjiandao(client, input) {
  const { question, lang = 'zh' } = input;

  // ① 危机前置(与天命同一道闸)
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
    } catch { /* 固定兜底 */ }
    return { type: 'crisis', text };
  }

  // ② 起卦:优先用前端已摇好的 cast(保证页面动画与解读一致),否则后端摇
  const cast = input.cast && input.cast.本卦 ? input.cast : castHexagram();

  // ③ 解读
  const text = await interpretHexagram(client, { cast, question, lang });
  return { type: 'reading', cast, text };
}
