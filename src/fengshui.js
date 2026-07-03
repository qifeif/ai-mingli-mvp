/**
 * 地运 · 户型方位解读(视觉,原「地脉道」)
 * ------------------------------------------------------------
 * 把用户的「本命卦八方位吉凶表」+ 户型图 + 图纸朝向交给视觉模型,
 * 让它识别每个房间的实际方位,套到吉凶上,给出卧室/书房/化解建议。
 *
 * 排盘(本命卦 + 八方位)是纯函数(见 bazhai.js),此处只负责「看图」这一步。
 */
import { STAR_META } from './bazhai.js';
import { getKnowledgeContext } from './rag.js';

const MODEL = process.env.LLM_VISION_MODEL || 'claude-sonnet-4-6'; // 视觉 + 推理,可由 .env 切换国内视觉模型

const SYSTEM = `你是一位严谨克制的阳宅风水顾问,师法倪海厦天纪·地脉道的「八宅 / 东西四命」体系。
你会拿到:① 用户的本命卦与其专属的「八方位吉凶表」;② 一张户型图;③ 图纸正上方对应的真实方位。
你的任务:
1. 先根据「图纸上方=某真实方位」把户型摆正,判断每个主要房间(卧室/客厅/厨房/卫生间/书房/玄关)各落在哪个方位。
2. 把每个房间的方位对照用户的吉凶表,逐间点评(吉/凶 + 一句白话)。
3. 给出明确建议:主卧/老人房/儿童房/书房最该选哪个方位;现有布局里哪些需要化解(尤其卧室落在凶方)。
原则:① 只依据吉凶表、<knowledge> 与常识,不自创命理;看不清的地方直说"图上看不清,建议…",不要编造。
② 不下绝对断语、不制造焦虑,给的是"参考与调整方向",决定权交回用户。
③ 用大白话,术语随手翻译。正文 400–700 字,可用小标题与分点。

# RAG 知识约束
可能为空的 <knowledge> 只作为八宅/户型解释依据。优先采信传入的本命卦和八方位吉凶表,不得因知识片段重新计算方位。`;

function dataUrlToBlock(dataUrl) {
  const m = String(dataUrl).match(/^data:(image\/(png|jpeg|jpg|webp|gif));base64,(.+)$/);
  if (!m) throw new Error('户型图需为 base64 dataURL(png/jpeg/webp/gif)');
  const mediaType = m[1] === 'image/jpg' ? 'image/jpeg' : m[1];
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data: m[3] } };
}

function dirsToTable(dirs) {
  return dirs
    .map((d) => `${d.方位}方 = ${d.星}(${d.吉凶}·${d.主})—— ${STAR_META[d.星].白话}`)
    .join('\n');
}

function buildFengshuiRagQuery({ mingGua, dirs, goal, facing }) {
  return [
    '八宅 东西四命 户型 方位 卧室 书房 办公位',
    mingGua?.卦, mingGua?.命组, mingGua?.本位方位, goal?.名, goal?.star, facing,
    ...(dirs || []).map((d) => `${d.方位} ${d.星} ${d.吉凶} ${d.主}`),
  ].filter(Boolean).join('\n');
}

/**
 * @param {Anthropic} client
 * @param {object} opts { mingGua, dirs, goal, facing, imageDataUrl }
 * @returns {Promise<string>} 户型方位解读正文
 */
export async function analyzeFloorplan(client, { mingGua, dirs, goal, facing, imageDataUrl, lang = 'zh' }) {
  // RAG 检索(失败静默降级为无知识片段,不影响主流程)
  let knowledge = '';
  try {
    ({ knowledge } = await getKnowledgeContext({
      domain: 'fengshui',
      query: buildFengshuiRagQuery({ mingGua, dirs, goal, facing }),
      limit: 5,
    }));
  } catch { /* 知识库不可用时按无知识继续 */ }

  const userText = [
    `<本命卦>\n${mingGua.卦}命 · ${mingGua.命组}(本位 ${mingGua.本位方位})。${mingGua.白话}\n</本命卦>`,
    `<八方位吉凶表>\n${dirsToTable(dirs)}\n</八方位吉凶表>`,
    `<诉求>\n${goal?.名 || '综合居住'}(优先「${goal?.star || '生气'}」方)\n</诉求>`,
    `<图纸朝向>\n图纸正上方对应真实方位:${facing || '北'}\n</图纸朝向>`,
    knowledge ? `<knowledge>\n${knowledge}\n</knowledge>` : '',
    `请据此分析下面这张户型图,给出方位点评与卧室/书房选位建议。`,
  ].filter(Boolean).join('\n\n');

  const langRule = lang === 'en'
    ? '\n\n# Output language\nWrite the entire analysis in natural English; translate 风水/方位 terms and explain them plainly.'
    : '';
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: 'adaptive' },
    system: SYSTEM + langRule,
    messages: [{
      role: 'user',
      content: [dataUrlToBlock(imageDataUrl), { type: 'text', text: userText }],
    }],
  });
  return res.content.find((b) => b.type === 'text')?.text ?? '';
}
