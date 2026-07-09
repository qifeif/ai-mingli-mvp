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
③ 用大白话,术语随手翻译。

# RAG 知识约束
可能为空的 <knowledge> 只作为八宅/户型解释依据。优先采信传入的本命卦和八方位吉凶表,不得因知识片段重新计算方位。

# 输出格式(严格)
只输出一个 JSON 对象,不要 markdown、不要代码块围栏、不要 JSON 前后的任何解释文字。结构:
{
  "rooms": [ { "room": "房间名", "dir": "方位名", "note": "一句白话点评", "advice": "可选·一句摆布建议" } ],
  "overall": { "bedroom": "主卧最该选哪个方位·一句", "study": "书房/办公位建议·一句", "cautions": ["需化解的点·数组·每条一句"], "summary": "一句总述" }
}
硬性约束:
- "dir" 只能取以下八方位名之一(照抄,不得翻译、不得写"东南方/SE/东偏南"等变体):__DIRS__。
- 你不得自行判断吉/凶或星名——服务端会以「八方位吉凶表」为准覆盖,你只负责把每个房间对上正确的 dir。
- 看不清就在 note 里直说"图上此处看不清,建议…",宁缺毋编,rooms 里不要塞你不确定的房间。`;

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

// ---------- 视觉模型返回的结构化 JSON:健壮解析 + 权威表反查覆盖 ----------
// 枚举所有「平衡括号」候选 {…}(仅非字符串态计括号,处理转义与引号内的 })。
// 关键:depth 被 clamp 到 ≥0,一个前置游离 `}` 不会毒化后面的真 JSON;每个顶层 `{` 都产出一个候选,
// 交给调用方逐个 parse+校验取第一个合法的 —— 容 thinking 残句/代码围栏/前后寒暄/散文里的花括号。
function extractJSONCandidates(text) {
  const s = String(text).replace(/```json/gi, '').replace(/```/g, '');
  const out = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') { if (depth === 0) start = i; depth++; }
    else if (c === '}') {
      if (depth > 0) { depth--; if (depth === 0 && start >= 0) { out.push(s.slice(start, i + 1)); start = -1; } }
      // depth 已为 0 时的游离 `}`:忽略,不让 depth 变负、不毒化后续
    }
  }
  return out;
}
// 逐候选尝试 parse(失败去尾逗号重试)。优先返回「带非空 rooms」的对象;
// 若只找到 rooms 为空数组的合法对象,记为次选(供上层判空降级),避免被前置空对象截胡真数据。
function parseVisionJSON(text) {
  let emptyFallback = null;
  for (const cand of extractJSONCandidates(text)) {
    let obj = null;
    try { obj = JSON.parse(cand); } catch { try { obj = JSON.parse(cand.replace(/,\s*([}\]])/g, '$1')); } catch { /* 试下一个候选 */ } }
    if (obj && typeof obj === 'object' && Array.isArray(obj.rooms)) {
      if (obj.rooms.length) return obj;              // 首个带非空 rooms → 直接采用
      if (!emptyFallback) emptyFallback = obj;        // 空 rooms → 暂存,继续找更优
    }
  }
  return emptyFallback;                               // 全为空 rooms(或无候选)→ 交上层判空降级
}
// 归一化 + 用 dirs 反查覆盖 star/luck/吉凶:模型只定 room→dir,吉凶一律以权威吉凶表为准。
function normalizeVision(obj, dirs, en) {
  const norm = (v) => String(v || '').replace(/\s|方|角/g, '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 65248)); // 全角转半角
  const byDir = new Map((dirs || []).map((d) => [norm(d.方位), d]));
  const rooms = (Array.isArray(obj.rooms) ? obj.rooms : [])
    .filter((r) => r && r.room)
    .map((r) => {
      const dir = norm(r.dir);
      const hit = byDir.get(dir);
      if (hit) {
        const luck = String(hit.吉凶).includes('凶') ? 'bad' : 'good';
        return { room: String(r.room), dir: hit.方位, star: hit.星, luck, 吉凶: hit.吉凶, note: String(r.note || ''), ...(r.advice ? { advice: String(r.advice) } : {}) };
      }
      // 方位对不上吉凶表:中性态,绝不误染吉凶
      return { room: String(r.room), dir: String(r.dir || ''), star: '', luck: 'unknown', 吉凶: '', note: (en ? '(direction unverified) ' : '(方位待核)') + String(r.note || '') };
    });
  const ov = obj.overall || {};
  return {
    rooms,
    overall: {
      bedroom: String(ov.bedroom || ''), study: String(ov.study || ''),
      cautions: Array.isArray(ov.cautions) ? ov.cautions.map(String) : [],
      summary: String(ov.summary || ''),
    },
  };
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

  const en = lang === 'en';
  // 把八方位名注入 SYSTEM(dir 枚举白名单),供模型照抄、供 normalizeVision 反查
  const dirNames = (dirs || []).map((d) => d.方位).join('、');
  const langRule = en
    // EN:room/note/advice/overall 全英文(数据层),但 dir 字段永远填中文方位名(key 层,供反查 dirs,不翻译)
    ? '\n\n# Output language\nWrite room / note / advice / overall in natural English and explain terms plainly. BUT the "dir" field MUST stay the original Chinese direction name from the whitelist above — never translate it, it is a lookup key.'
    : '';
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: 'adaptive' },
    system: SYSTEM.replace('__DIRS__', dirNames) + langRule,
    messages: [{
      role: 'user',
      content: [dataUrlToBlock(imageDataUrl), { type: 'text', text: userText }],
    }],
  });
  const rawText = res.content.find((b) => b.type === 'text')?.text ?? '';
  // 健壮解析:剥围栏→枚举所有平衡括号候选→逐个 parse(去尾逗号重试)取首个带 rooms 的对象→归一化+权威覆盖。
  // 任一步失败或空 rooms → _fallback,把原文交回前端老 mdRender 分支(绝不 throw,以免被误报成「视觉失败」)。
  try {
    const parsed = parseVisionJSON(rawText);
    if (!parsed) throw new Error('no-json');
    const vision = normalizeVision(parsed, dirs, en);
    if (!vision.rooms.length) throw new Error('empty-rooms');
    return { vision, raw: rawText, _fallback: false };
  } catch {
    return { raw: rawText, _fallback: true };
  }
}
