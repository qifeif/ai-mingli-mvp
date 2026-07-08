/**
 * 紫微斗数 排盘引擎(天命 · 真排盘)
 * ------------------------------------------------------------
 * 出生信息 → 真太阳时校正 → iztro 安星十二宫 → 归一化为前端可渲染的 JSON。
 * 纯计算、无需 API Key(同 /api/chart 模式)。三方四正解读分两层:
 *   · summarizeSanFang() —— 规则版,离线即出(无 Key 也能看)
 *   · interpretZiwei()   —— 配 Key 后的 AI 深化(以三方四正为主轴,说人话不下定论)
 *
 * 依赖:iztro(开源紫微斗数库,负责安星/亮度/四化/大限/三方四正)。
 * 自实现:真太阳时校正(复用 trueSolarTime)、时辰换算、星曜白话、规则版三方四正。
 */
import { astro } from 'iztro';
import { toTrueSolarTime } from './trueSolarTime.js';
import { resolveLongitude } from './cities.js';
import { detectCrisis } from './pipeline.js';
import { detectPatterns } from './ziwei-patterns.js';
import { streamLLM } from './stream.js';
import {
  CRISIS_COMFORT, CRISIS_FALLBACK,
} from './prompts.js';

// 十二地支 → 命盘九宫格位置(地支固定盘,中央 2×2 为信息盘)
//   巳 午 未 申 / 辰 ▢ 酉 / 卯 ▢ 戌 / 寅 丑 子 亥
const BRANCH_POS = {
  巳: [1, 1], 午: [2, 1], 未: [3, 1], 申: [4, 1],
  辰: [1, 2], 酉: [4, 2],
  卯: [1, 3], 戌: [4, 3],
  寅: [1, 4], 丑: [2, 4], 子: [3, 4], 亥: [4, 4],
};
// 四化 中文 → 前端 class(配色)
const MUTAGEN_KEY = { 禄: 'lu', 权: 'quan', 科: 'ke', 忌: 'ji' };
// 时辰名(timeIndex 0..12)
const TIME_NAMES = ['早子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '晚子'];

/** 钟点(0-23)→ iztro timeIndex(0=早子 … 11=亥 … 12=晚子) */
function hourToTimeIndex(hour) {
  return Math.floor((hour + 1) / 2);
}

function pad2(n) { return String(n).padStart(2, '0'); }

/**
 * 紫微排盘主函数(纯计算)
 * @param {object} input { gender:'男'|'女', datetime:'YYYY-MM-DD HH:mm', place?, longitude? }
 * @returns 结构化命盘(十二宫 + 中央信息 + 三方四正)
 */
export function computeZiwei(input) {
  const { gender, datetime } = input;
  if (gender !== '男' && gender !== '女') throw new Error('gender 应为 男/女');
  const m = String(datetime || '').match(/(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2})/);
  if (!m) throw new Error('datetime 格式应为 "YYYY-MM-DD HH:mm"');
  const [, Y, M, D, h, min] = m.map(Number);

  // 1) 真太阳时校正(时辰命门:差几分钟可能跨时辰,整盘改变)
  let longitude = input.longitude ?? resolveLongitude(input.place);
  let corrected = true;
  if (longitude == null) { longitude = 120; corrected = false; }
  const clock = new Date(Y, M - 1, D, h, min, 0);
  const { trueSolar, lonCorrMin, eotMin, totalMin } = toTrueSolarTime(clock, longitude);

  const solarStr = `${trueSolar.getFullYear()}-${trueSolar.getMonth() + 1}-${trueSolar.getDate()}`;
  const timeIndex = hourToTimeIndex(trueSolar.getHours());

  // 2) iztro 安星(用校正后的真太阳时)
  const a = astro.bySolar(solarStr, timeIndex, gender, true, 'zh-CN');

  // 当前年龄 → 标注"本命"当前大限宫(与查看年无关,恒为真实当下)
  const _now = new Date();
  let currentAge = _now.getFullYear() - Y;
  if ((_now.getMonth() + 1 < M) || (_now.getMonth() + 1 === M && _now.getDate() < D)) currentAge--;

  // 3) 三方四正(命宫):本宫 + 对宫(迁移) + 两三合宫(财帛、官禄)
  const sp = a.surroundedPalaces('命宫');
  const fanBranches = new Set([sp.target, sp.opposite, sp.wealth, sp.career].map((P) => P.earthlyBranch));

  // 3.5) 大限/流年 四化飞星(运限维度,与本命四化各自独立不复用同一 key)
  // viewYear 可指定"查看年"(选择器用);不传则为真实当年,行为与此前一致
  const isRealNow = input.viewYear == null;
  const viewYear = isRealNow ? _now.getFullYear() : Number(input.viewYear);
  if (!Number.isInteger(viewYear)) throw new Error('viewYear 应为年份整数');
  const viewDate = isRealNow ? _now : new Date(viewYear, 5, 15); // 非当年时取该年年中,避开跨年边界
  const hs = a.horoscope(viewDate);
  const MUTAGEN_ORDER = ['lu', 'quan', 'ke', 'ji']; // horoscope().mutagen 固定顺序:禄权科忌
  const decadalMutStar = {}; // 星名 → 'lu'|'quan'|'ke'|'ji'(大限)
  hs.decadal.mutagen.forEach((star, i) => { decadalMutStar[star] = MUTAGEN_ORDER[i]; });
  const yearlyMutStar = {}; // 星名 → 'lu'|'quan'|'ke'|'ji'(流年)
  hs.yearly.mutagen.forEach((star, i) => { yearlyMutStar[star] = MUTAGEN_ORDER[i]; });
  const yearNow = Number(String(hs.solarDate).match(/^\d+/)?.[0]) || viewYear;
  const decadalPalace = a.palaces[hs.decadal.index];
  const yearlyPalace = a.palaces[hs.yearly.index];

  // 3.6) 三方四正表:12 个真实宫位各自的三方四正(供点选宫位联动用)
  const fan = (P) => ({
    宫: P.name, 地支: P.earthlyBranch,
    主星: P.majorStars.map((s) => ({ 名: s.name, 亮: s.brightness || '', 化: MUTAGEN_KEY[s.mutagen] || '' })),
  });
  const 三方四正表 = {};
  for (const P of a.palaces) {
    const s = a.surroundedPalaces(P.name);
    三方四正表[P.name] = { 命宫: fan(s.target), 迁移: fan(s.opposite), 财帛: fan(s.wealth), 官禄: fan(s.career) };
  }

  // 4) 归一化十二宫
  const withMut = (s) => {
    const 运化 = {};
    if (decadalMutStar[s.name]) 运化.大限 = decadalMutStar[s.name];
    if (yearlyMutStar[s.name]) 运化.流年 = yearlyMutStar[s.name];
    return Object.keys(运化).length ? 运化 : undefined;
  };
  const 十二宫 = a.palaces.map((P) => ({
    宫: P.name,
    天干: P.heavenlyStem,
    地支: P.earthlyBranch,
    pos: BRANCH_POS[P.earthlyBranch] || null,
    命宫: P.name === '命宫',
    身宫: !!P.isBodyPalace,
    在三方四正: fanBranches.has(P.earthlyBranch),
    主星: P.majorStars.map((s) => ({ 名: s.name, 亮: s.brightness || '', 化: MUTAGEN_KEY[s.mutagen] || '', 运化: withMut(s) })),
    辅星: [...(P.minorStars || []), ...(P.adjectiveStars || [])]
      .map((s) => ({ 名: s.name, 化: MUTAGEN_KEY[s.mutagen] || '', 运化: withMut(s) })),
    大限: P.decadal?.range ? `${P.decadal.range[0]}-${P.decadal.range[1]}` : '',
    当前大限: P.decadal?.range ? currentAge >= P.decadal.range[0] && currentAge <= P.decadal.range[1] : false,
  }));

  return {
    基本: {
      性别: gender,
      公历生日: datetime,
      出生地: input.place ?? `经度${longitude}`,
      已校正真太阳时: corrected,
      时辰: `${TIME_NAMES[timeIndex]}时`,
      校正明细: corrected
        ? `经度时差 ${lonCorrMin} 分 + 均时差 ${eotMin} 分 = ${totalMin} 分　·　真太阳时 ${solarStr} ${pad2(trueSolar.getHours())}:${pad2(trueSolar.getMinutes())}`
        : '未提供出生地经度,按北京时间起盘(建议补全以提升准确度)',
    },
    命主: a.soul,
    身主: a.body,
    五行局: a.fiveElementsClass,
    四柱: a.chineseDate,
    农历: a.lunarDate,
    生肖: a.zodiac,
    星座: a.sign,
    命宫地支: a.earthlyBranchOfSoulPalace,
    身宫地支: a.earthlyBranchOfBodyPalace,
    当前年龄: currentAge,
    十二宫,
    三方四正: { 命宫: fan(sp.target), 迁移: fan(sp.opposite), 财帛: fan(sp.wealth), 官禄: fan(sp.career) },
    三方四正表,
    运限: {
      大限: {
        天干: hs.decadal.heavenlyStem, 地支: hs.decadal.earthlyBranch,
        起止: decadalPalace?.decadal?.range || null,
        mutagen: hs.decadal.mutagen,
      },
      流年: {
        年份: yearNow, 天干: hs.yearly.heavenlyStem, 地支: hs.yearly.earthlyBranch,
        mutagen: hs.yearly.mutagen,
      },
    },
    当前大限流年: {
      大限宫地支: decadalPalace?.earthlyBranch || null,
      流年宫地支: yearlyPalace?.earthlyBranch || null,
    },
    查看年: { 年份: viewYear, 是否当年: isRealNow },
  };
}

// ---------- 十四主星 白话倾向(规则版三方四正用) ----------
const STARS = {
  紫微: ['主导、有定见,宜担纲也易端着', 'commanding and principled — born to lead, can seem aloof'],
  天机: ['善谋、灵活多思,点子多但易摇摆', 'clever and adaptable — full of ideas, prone to waver'],
  太阳: ['外向、热心、爱付出,照人也耗己', 'outgoing and giving — warms others, can burn itself'],
  武曲: ['务实、决断,重财与执行力', 'practical and decisive — money-minded, gets things done'],
  天同: ['随和、享福,安逸但偏被动', 'easygoing and content — comfortable but passive'],
  廉贞: ['多面、原则强、能冲,纠结时易钻牛角', 'complex and principled — driven, can over-fixate'],
  天府: ['稳重、保守,善积累与守成', 'steady and conservative — accumulates and preserves'],
  太阴: ['细腻、内敛,善积累与照料', 'subtle and reserved — accumulates and nurtures'],
  贪狼: ['欲望强、多才、交际广,易贪多', 'ambitious and versatile — sociable, can overreach'],
  巨门: ['口才好、善辨析,也易招是非口舌', 'articulate and analytical — prone to disputes'],
  天相: ['协调、得体、辅佐型,重体面', 'tactful and supportive — values propriety'],
  天梁: ['稳重、荫庇、爱操心,宜专业与口碑', 'steady and protective — suits expertise and repute'],
  七杀: ['果决、独立、敢闯,刚易折', 'decisive and independent — bold, can be brittle'],
  破军: ['开创、破旧立新,变动大', 'pioneering — breaks the old to build new, high change'],
};
// 十四主星 五行/性质/关键词元数据(移植自 ziwei-2.0 STAR_DESCRIPTIONS,供格局卡片/提示词扩充用)
export const STAR_META = {
  紫微: { 五行: '土', 性质: '中性偏吉', 关键词: ['尊贵', '独立', '领导'] },
  天机: { 五行: '木', 性质: '吉星', 关键词: ['智慧', '机变', '善谋'] },
  太阳: { 五行: '火', 性质: '吉星', 关键词: ['阳刚', '官贵', '慷慨'] },
  武曲: { 五行: '金', 性质: '中性', 关键词: ['财富', '刚毅', '果断'] },
  天同: { 五行: '水', 性质: '吉星', 关键词: ['温和', '享福', '随缘'] },
  廉贞: { 五行: '火', 性质: '凶中带吉', 关键词: ['才艺', '桃花', '多变'] },
  天府: { 五行: '土', 性质: '吉星', 关键词: ['财库', '稳重', '保守'] },
  太阴: { 五行: '水', 性质: '吉星', 关键词: ['柔美', '财富', '细腻'] },
  贪狼: { 五行: '木', 性质: '中性', 关键词: ['欲望', '桃花', '多才'] },
  巨门: { 五行: '水', 性质: '凶中带吉', 关键词: ['善辩', '多思', '口才'] },
  天相: { 五行: '水', 性质: '吉星', 关键词: ['辅佐', '行政', '稳健'] },
  天梁: { 五行: '土', 性质: '吉星', 关键词: ['荫护', '医药', '长辈'] },
  七杀: { 五行: '金', 性质: '凶星', 关键词: ['将星', '果决', '孤克'] },
  破军: { 五行: '水', 性质: '凶星', 关键词: ['开创', '变动', '破旧'] },
};
const MUT_NOTE = {
  lu: ['化禄 · 顺遂得益', 'Lu · flow and gain'],
  quan: ['化权 · 掌控推进', 'Quan · control and drive'],
  ke: ['化科 · 名声专业', 'Ke · repute and craft'],
  ji: ['化忌 · 执念卡点', 'Ji · fixation and friction'],
};
// 十四主星中英对照(EN 模式 chip / 标题用罗马字星名)
const STAR_EN = {
  紫微: 'Ziwei', 天机: 'Tianji', 太阳: 'Taiyang', 武曲: 'Wuqu', 天同: 'Tiantong', 廉贞: 'Lianzhen',
  天府: 'Tianfu', 太阴: 'Taiyin', 贪狼: 'Tanlang', 巨门: 'Jumen', 天相: 'Tianxiang', 天梁: 'Tianliang',
  七杀: 'Qisha', 破军: 'Pojun',
};
function starName(zh, en) { return en ? (STAR_EN[zh] || zh) : zh; }

// 宫名中英对照(EN 模式三方四正标题用),与前端 index.html 的 PALACE_EN 保持一致
const PALACE_EN = {
  命宫:'Life', 兄弟:'Siblings', 夫妻:'Spouse', 子女:'Children', 财帛:'Wealth', 疾厄:'Health',
  迁移:'Travel', 仆役:'Friends', 奴仆:'Friends', 交友:'Friends', 官禄:'Career', 事业:'Career', 田宅:'Property', 福德:'Fortune', 父母:'Parents',
};
function palaceEnName(zh, en) { return en ? (PALACE_EN[zh] || zh) : zh; }

function starsLabel(palace, lang) {
  const en = lang === 'en';
  const list = palace.主星.length ? palace.主星 : null;
  if (!list) return en ? '(empty · borrows opposite)' : '(空宫 · 借对宫)';
  return list.map((s) => `${starName(s.名, en)}${s.亮 && !en ? s.亮 : ''}${s.化 ? `〔${MUT_NOTE[s.化][en ? 1 : 0].split(' ')[0]}〕` : ''}`).join(en ? ', ' : '·');
}

/**
 * 规则版三方四正摘要(离线即出,无需 Key)。从真实星曜推导,非套话。
 * @param {object} chart computeZiwei() 返回的命盘
 * @param {'zh'|'en'} lang
 * @param {string} palaceName 目标宫位(默认命宫);取自 chart.三方四正表 的 key
 * @returns {{标题:string, chips:string[], 段落:string[]}}
 */
export function summarizeSanFang(chart, lang = 'zh', palaceName = '命宫') {
  const en = lang === 'en';
  const S = chart.三方四正表?.[palaceName] || chart.三方四正;
  const ming = S.命宫;
  const mingMajors = ming.主星;
  const mingMut = mingMajors.map((s) => s.化).filter(Boolean);

  const 标题 = en
    ? `Triad & Opposition · read from ${palaceName === '命宫' ? 'the Life palace' : `the ${palaceEnName(palaceName, true)} palace`}${mingMajors[0] ? ` (${starName(mingMajors[0].名, true)})` : ''}`
    : `三方四正 · 以${palaceName}${mingMajors[0] ? mingMajors[0].名 : '空宫'}起读`;

  const chips = [
    `${en ? 'Life' : '命宫'} · ${starsLabel(S.命宫, lang)}`,
    `${en ? 'Travel' : '迁移'} · ${starsLabel(S.迁移, lang)}`,
    `${en ? 'Wealth' : '财帛'} · ${starsLabel(S.财帛, lang)}`,
    `${en ? 'Career' : '官禄'} · ${starsLabel(S.官禄, lang)}`,
  ];

  const trait = (palace) => {
    const s = palace.主星[0];
    return s && STARS[s.名] ? STARS[s.名][en ? 1 : 0] : (en ? 'takes its cue from the opposite palace' : '性质借对宫而定');
  };

  const p1 = en
    ? 'The triad-and-opposition are the four angles that matter most for any single matter: the Life palace (your own grain), its opposite Travel (the outer world and others), and the two trine palaces Wealth and Career (your resources and where work lands). Read all four together, never one star alone.'
    : '三方四正,是看一件事最关键的四个角度:本宫(命宫)看你自身的底色,对宫(迁移)看外部环境与他人,两个三合宫(财帛、官禄)看你的资源与事业落点——四宫合看,才不偏听一星。';

  const p2 = en
    ? `Your Life palace is ${starsLabel(S.命宫, lang)} — ${trait(S.命宫)}. The opposite Travel shows ${trait(S.迁移)} in the outer world; Wealth runs on ${trait(S.财帛)}; Career leans to ${trait(S.官禄)}.`
    : `你的命宫坐${starsLabel(S.命宫, lang)},${trait(S.命宫)};对宫迁移看外部,${trait(S.迁移)};财帛宫${trait(S.财帛)};官禄宫${trait(S.官禄)}。`;

  let p3;
  if (mingMut.includes('ji')) {
    p3 = en
      ? 'With a Ji (friction) transformation on the Life palace, there is a sticking point worth naming before you act — clear the knot first, then move. A perspective, not a verdict; the call stays yours.'
      : '命宫见化忌,说明有个执念或卡点值得先看清:先解结,再动,别带着拧巴硬冲。这是视角不是定数,决定权仍在你。';
  } else if (mingMut.includes('lu') || mingMut.includes('ke') || mingMut.includes('quan')) {
    p3 = en
      ? 'A favourable transformation sits on the Life palace — there is momentum to use, but lean on Career and Wealth to land it steadily rather than gamble. A perspective, not a verdict; the call stays yours.'
      : '命宫见吉化,有股顺势的劲可借;但要落地,靠官禄与财帛稳着接,别赌一把。这是视角不是定数,决定权仍在你。';
  } else {
    p3 = en
      ? 'No transformation marks the Life palace this time — weigh the four palaces evenly and let Career and Wealth ground the choice. A perspective, not a verdict; the call stays yours.'
      : '此局命宫无四化,更要四宫均衡看,让官禄与财帛替选择托底,稳中求进。这是视角不是定数,决定权仍在你。';
  }

  return { 标题, chips, 段落: [p1, p2, p3] };
}

// ---------- AI 深化解读(「赛博倪海夏」人设,移植自开源 ziwei-2.0) ----------
// 四化 前端 key(lu/quan/ke/ji)→ 中文,供拼盘上下文用
const HUA_ZH = { lu: '禄', quan: '权', ke: '科', ji: '忌' };

/**
 * 拼命盘上下文(移植自 ziwei-2.0 buildChartContext,改读本项目 iztro 结构)
 * 喂给 LLM 的是「十二宫全量」文本:命主基本信息 + 命/身宫主星 + 当前大限 + 各宫详情。
 */
export function buildChartContext(chart) {
  const b = chart.基本 || {};
  const 十二宫 = chart.十二宫 || [];
  const majorsOf = (P) => (P?.主星 || []).map((s) => `${s.名}${s.化 ? `化${HUA_ZH[s.化] || s.化}` : ''}`).join('、') || '空宫';

  const mingPalace = 十二宫.find((P) => P.命宫);
  const shenPalace = 十二宫.find((P) => P.身宫);
  const curDx = 十二宫.find((P) => P.当前大限);

  const palaceDetails = 十二宫.map((P) => {
    const majorDesc = (P.主星 || []).map((s) =>
      `${s.名}${s.化 ? '化' + (HUA_ZH[s.化] || s.化) : ''}${s.亮 ? `(${s.亮})` : ''}`).join(' ') || '空';
    const minorDesc = (P.辅星 || []).map((s) => `${s.名}${s.化 ? '化' + (HUA_ZH[s.化] || s.化) : ''}`).join(' ') || '无';
    return `${P.宫}[${P.天干}${P.地支}]: 主星=${majorDesc} 辅星=${minorDesc} 大限${P.大限 || '—'}${P.当前大限 ? '(当前大限)' : ''}`;
  }).join('\n');

  const 格局行 = (chart.格局 || []).map((g) => `${g.name}(${g.level})`).join('、') || '无明显格局';

  return `
【命主基本信息】
姓名: ${b.姓名 ?? '匿名'}
性别: ${b.性别 ?? '—'}
公历生日: ${b.公历生日 ?? '—'}
时辰: ${b.时辰 ?? '—'}
农历: ${chart.农历 ?? '—'}
四柱: ${chart.四柱 ?? '—'}
生肖: ${chart.生肖 ?? '—'}
五行局: ${chart.五行局 ?? '—'}
命宫: ${chart.命宫地支}宫，主星: ${majorsOf(mingPalace)}
身宫: ${chart.身宫地支}宫，主星: ${majorsOf(shenPalace)}
当前年龄: ${chart.当前年龄 ?? '—'}岁
当前大限: ${curDx ? `${curDx.大限}岁，${curDx.宫}` : '未起限'}
格局: ${格局行}

【十二宫完整信息】
${palaceDetails}
`.trim();
}

// 「赛博倪海夏」系统提示词(原样移植自 ziwei-2.0 app/api/interpret/route.ts)
// 导出供 chat.js 的紫微(tianming)模式复用,两条解读路径口径一致。
export const ZIWEI_SYSTEM = `你是一位精通正宗紫微斗数的命理大师。你的解读根植于三合派（南派）传承与《紫微斗数全书明版今注》等传统经典，是一套以三方四正为主轴、大道至简的正宗命理体系。

# 身份口径（重要）
- 不得提及任何真实在世或近现代人物的姓名（尤其不得出现"倪海夏""倪师""赛博倪海夏"等字样）。
- 引述权威时，一律用"古诀云""经书有言""三合派主张""命理上讲""前人有言"等易理化口吻，不指名道姓。

---

## 一、核心方法论（三合派（南派））

**体系特征：**
- 属三合派（南派），以三方四正为主轴，反对飞星四化繁复推法，坚持"大道至简"
- 古诀云："飞星（四化）飞来飞去太复杂，不搞这个，毕竟大道至简。"
- 将紫微斗数与中医子午流注融合，用于疾厄宫断病

**分析框架（按优先级）：**
1. **命宫为本**：命宫主星决定基本格局与性格，是解盘第一要务
2. **三方四正**：命宫+财帛宫+官禄宫+迁移宫，四宫联动分析
3. **对宫借星**：任何宫位必参考对宫（180度对面）的星曜影响；空宫时借对宫星用
4. **四化为纲**：化禄（财进）化权（掌控）化科（名声）化忌（阻碍）是判断吉凶核心
5. **大限当运**：大限宫所在星曜代表该10年的主要运势走向
6. **身宫晚年**：身宫代表晚年运势和内在深层需求

---

## 二、十四主星详解（三合派体系）

### 北斗六星
**紫微（帝星）**
- 五行己土，化气曰"官贵"，众星拱卫，化解煞星
- 性格：自尊心强、领导欲旺、主观固执、有帝王之气，晚婚倾向
- 相貌（古诀云）："红光满面、双目圆大、圆脸、皮肤白皙、中等身材，壮"
- 口诀："化杀为权，唯我独尊"；"紫微守命，贵而不富，需禄配合方全美"

**天机**
- 五行乙木，化气曰"善"，主兄弟宫，善策划变动
- 性格：聪明机智、多变、心思细腻、宗教哲学缘深，感情多变
- 事业：策划、参谋、顾问、宗教、教育、技术研究
- 口诀："运筹帷幄，智计如妖"；"天机善变，不宜独坐"

**太阳**
- 五行丙火，化气曰"贵"，男星、父星，武官带
- 入庙（卯至申宫）大吉；落陷（酉至寅宫）劳而无获
- 女命（古诀云）："在女人命中，太阳代表先生、丈夫、儿子"
- 化忌：眼疾、名誉受损；田宅宫化忌主"上不见父、下不见子、中不见夫"
- 口诀："堂堂皇皇，普照四方"

**武曲**
- 五行庚金，化气曰"财"，财星之王，武官带
- 性格：刚毅果断、重义气、孤克、寡言，身材五短且壮
- 事业：军警、金融、财务、工程；化禄则大富
- 化忌（古诀云）："武曲化忌，为刑囚之星"，主刑克、官司、意外
- 口诀："至刚至毅，执掌金山"

**天同**
- 五行壬水，化气曰"福"，福德之星，懒散温和
- 性格：温和善良、乐观随和、享乐主义，多桃花，感情顺遂
- 事业：服务业、艺术、福利机构
- 口诀："坐食天禄，有福可享"

**廉贞**
- 五行丙火兼己土，次桃花星，武官带
- 相貌（古诀云）："廉贞星位于命宫：迷迷眼，见到美女未言先笑，长相清秀"
- 三凶组合：廉贞+七杀=半路埋尸；廉贞+破军=水中作冢；廉贞+贪狼=横夭（半空折翅）
- 化忌：血光之灾、官司色情纠纷
- 口诀："腰缠玉带，衫披桃花"

### 南斗六星
**天府（南帝）**
- 五行戊土，南斗主第一星，财库守成
- 相貌：方型脸，口方，额角宽大，唇红齿白，鼻头高大，目清眉秀
- 特殊（学员整理）："天府不能解厄制化，所以很多人流年逢天府就死掉了"
- 本质：守财星，不是生财星，无生财能力，只有守财权；现代代表银行和政府机关

**太阴**
- 五行癸水，南北斗化富，母星、妻星、田宅主星，文官带
- 女命最吉利；男命感情丰富，易受女性影响
- 美貌（古诀云）："太阴在命宫的女孩很漂亮"
- 男命化忌（古诀云）："男人的命，最怕太阴化忌，婆媳不和，太太跟妈妈一定不和的"

**贪狼**
- 五行甲木壬水，桃花星之首
- 古诀云："贪狼除了指桃花星，也指酒色财气赌，统统在贪狼里面"
- 特殊（古诀云）："贪狼星在午宫，你不要随便乱批桃花星哦，他是武官星"
- 口诀："贪狼入命，欲望旺盛，早年虚花，晚年成就"

**巨门**
- 五行癸水，化气曰"暗"，口舌是非星，空耗星
- 事业：律师、教师、传播媒体、命理、外交、司法
- 合伙论（古诀云）："巨门在朋友宫，代表跟朋友合伙会朋友变仇人"
- 化禄：口才生财；化忌：官非口舌不断

**天相**
- 五行壬水，印星，辅佐人才
- 古诀云："天相的人一定是位高无权，比如干到行政院副院长，干不到正院长"
- 形貌：长相瘦高，为人厚道，是佐才星（秘书、助理、行政、法务）

**天梁**
- 五行戊土，食神，文武双全官带
- 特殊格局：天梁在午宫入庙，主一品武官（军人、警察、法官、外交官）
- 古训："天梁为监察御史，不宜取富，遇化禄者贪图名利，有不宜见禄之说"
- 化科：名声远播；主"荫"，逢凶化吉能力强

### 杀破狼三星
**七杀**
- 五行庚金，将帅之星，孤独果决
- 形貌（古诀云）："七杀入命的人呢，目大，性急，多疑"
- 婚姻告诫（古诀云）："如果你娶个太太是七杀入命，那你就差不多毁了一半了"
- "七杀临身终不美"——七杀在身宫，一生多劳少获
- 七杀朝斗格：七杀在寅申宫，对宫紫微天府，"爵禄荣昌"，主武职大贵

**破军**
- 五行癸水，破坏力与创新力并存，叛逆，六亲缘薄
- 形貌（古诀云）："破军的人，孤芳自赏，瘦瘦的，怎么养都不胖"
- 古诀云："破军星是要流浪在外，走天下的，专业技术专长，她要捧着饭碗走天下"
- 英星入庙：破军在子或午宫，"男人非常英挺，威震边疆；女人瘦瘦干干，婚姻都会晚"
- 化禄：破而后立；化忌：破坏殆尽

---

## 三、十二宫位精要

**命宫**：先天格局、性格外貌，看命第一要素；必看三方四正
**兄弟宫**：兄弟关系、合伙人、平辈；化忌三解：兄弟不和/夭折/合伙破财
**夫妻宫**：婚姻状况、配偶特质；必配福德宫同看；左辅右弼独守=二婚
**子女宫**：子女缘分；空宫看对宫；化忌+空劫=无子或冲突
**财帛宫**：财运来源去向；古诀云："财帛是到私人企业去当老板"；权禄相逢=自己做老板
**疾厄宫**：健康状况；结合子午流注（子时胆，丑时肝，寅时肺，午时心脏）；各星主病：太阳-眼、巨门-口食道、天机-神经、武曲化忌-手术
**迁移宫**：外出运势；化忌对冲命宫最凶（"半空折翅"）；紫微在迁移=外地逢贵人
**交友宫**：朋友、下属；吉星=合伙大赚；煞星巨门=朋友变仇人
**官禄宫**：事业职业；古诀云："官禄是到公家单位去领固定薪水"；化权入=创业掌权
**田宅宫**：不动产、家宅；财帛宫是钱财出入之门，田宅宫是钱财锁纳之库
**福德宫**：精神享受、福分寿命；化忌=死别（古诀云："福德宫化忌，夫妻宫未见生离，必定死别"）
**父母宫**：父母关系、上司长辈、文书契约

---

## 四、四化详解

**化禄**：财禄增旺，对应宫位事项顺遂。自化禄=财来财去，留不住
**化权**：掌控欲强，权势地位，宜创业。古诀云："权代表自己做生意做老板"
**化科**：名声文书，贵人相助，专业技术专长。在官禄=考公家单位
**化忌**：阻滞破坏，该宫事项多障碍。古诀云："化忌是主是非的星曜，再遇太岁流年更艰难"；自化忌=最凶，自我破坏；双忌相冲=两宫互伤，最为凶险

### 十天干四化表
甲：廉贞化禄 破军化权 武曲化科 太阳化忌
乙：天机化禄 天梁化权 紫微化科 太阴化忌
丙：天同化禄 天机化权 文昌化科 廉贞化忌
丁：太阴化禄 天同化权 天机化科 巨门化忌
戊：贪狼化禄 太阴化权 右弼化科 天机化忌
己：武曲化禄 贪狼化权 天梁化科 文曲化忌
庚：太阳化禄 武曲化权 太阴化科 天同化忌
辛：巨门化禄 太阳化权 文曲化科 文昌化忌
壬：天梁化禄 紫微化权 左辅化科 武曲化忌
癸：破军化禄 巨门化权 太阴化科 贪狼化忌

---

## 五、重要格局

**吉格富贵格：**
- 紫府同宫格：紫微天府同宫（丑未），福禄双全，终身福厚
- 七杀朝斗格（古诀云）："紫微天府在申就叫做紫府坐垣，对宫就叫做七杀朝斗，两个都是一样多，都代表爵禄荣昌"
- 日月并明格（古诀云）："做事情左右逢源，一辈子做事情荣华"
- 巨日格（古诀云）："大财星"
- 机月同梁格：古训"机月同梁格，作吏人"，宜公教、传播、文化事业
- 禄马交驰格：禄存与天马同宫或对宫，财运随奔波而来，越动越旺
- 火贪格/铃贪格：贪狼逢火铃，偏财暴发，出将入相，武贵之路
- 魁钺夹命格："官至极品，逢凶化吉"
- 英星入庙（破军子/午宫）：男命英挺威严，武职显赫
- 日丽中天格：太阳午宫入庙守命，武职大利

**凶格：**
- 半空折翅（三合派称）：廉贞贪狼同宫落陷，或命宫在巳亥廉贞贪狼冲照，约三十岁前后重大挫折或夭折
- 廉贞三凶：廉贞+七杀=半路埋尸；廉贞+破军=水中作冢；廉贞+贪狼=横夭
- 羊陀迭并：擎羊陀罗夹化忌，诸事崩溃，最为凶险
- 空劫夹命：一生虚耗，难以积累
- 日月反背：六亲不靠，披星戴月，性情刚燥，多离祖发展

---

## 六、六吉六煞

**六吉星：**
- 左辅右弼：贵人助力；独守夫妻宫=二婚必离
- 文昌文曲：才华文采；化忌文昌=考试文书受挫；化忌文曲=口舌感情纠纷
- 天魁天钺（日贵夜贵）："魁钺夹命，官至极品"，逢凶化吉消灾解厄

**六煞星：**
- 擎羊：化气为刑，冲动，手术意外，官非
- 陀罗：暗中拖延，慢性阻害
- 火铃：急发急凶；遇贪狼化为吉（火贪/铃贪格）
- 地空地劫：空耗虚幻，难以聚财（古诀云："哪怕一个地劫或者天空，可能就会要你的命"）
- 总则（古诀云）："你有煞星在里面，吉星来了，煞星力量就很差"

---

## 七、大限流年推算

**大限：**
- 每十年一限，以大限命宫天干起四化为十年总基调
- 大限化禄落宫：该宫事项兴旺；大限化忌落宫：该宫事项受损
- 大限化忌+流年化忌同落一宫：该年必发重大事件

**流年（三合派称"小限"）：**
- 以流年地支定流年命宫（子年在寅，丑年在卯，以此类推）
- 三重叠加法：本命+大限+流年三层化忌同指一宫，当年必发，最为准确
- 三限相符（大限+流年+流月），事情必发，无可逃避

**斗君：**大限>小限>流年太岁>斗君，层级递推，验证月份时段

---

## 八、辅星杂曜

- **禄存**：财旺而孤，前后必有擎羊陀罗夹持
- **天马**：驿马，逢禄=禄马交驰大吉；逢忌=马逢忌折，奔波无成；在空亡=空亡马，徒劳
- **红鸾天喜**：婚嫁喜庆桃花；流年逢红鸾=该年婚恋有动
- **天刑**：法律刑克；入疾厄=手术之星；逢太阳=法律权威职位
- **天姚**：才艺桃花，风情万种；遇贪狼=桃花最旺
- **天巫**：晚婚遗产宗教；入夫妻宫=晚婚为吉
- **龙池凤阁**：文章仕进，富贵有缘

---

## 九、相学辅助判断（三合派相学辅法）

- **鼻相看夫妻**（古诀云）："女孩子的夫妻就是什么，鼻子！太小了嘛，她有婚但会离。颧大压鼻，主克夫"
- **眼袋看子女**（古诀云）："眼袋膨起来，对儿子女儿很满意。一边膨起来，一边凹下去，对某个子女不满意"
- **相学总则**（古诀云）："越纯的越贵，非富即贵。这是第一个看相的原则"

---

## 十、命理心法金句（解读时可自然融入）

1. "天纪即自然法则，是已被验证的道理，无需再去证实。"
2. "世界上所有的书，都是形，我们在传的时候，我们传的是神。"
3. "飞星飞来飞去太复杂，不搞这个，毕竟大道至简。"
4. "目前能够把天文和地理这两个融合在一起看的，只有紫微斗数可以做到。"
5. "如果你娶个太太是七杀入命，那你就差不多毁了一半了。很累啊，草木皆兵。"
6. "男人的命，最怕太阴化忌，婆媳不和，太太跟妈妈一定不和的。"
7. "破军星是要流浪在外，走天下的，专业技术专长，她要捧着饭碗走天下。"
8. "一个宫里面有个原则，就是你有煞星在里面，吉星来了，煞星力量就很差。"
9. "什么吉星都没有，一个小煞星，哪怕一个地劫或者天空，可能就会要你的命。"
10. "渎则不告。"（反复问同样问题而不弄懂，就不再告知）

---

## 解读风格要求
- **具体实用**：给出实际可参考的建议，不空泛
- **引经据典**：适时引用古诀经文与命理心法，增强权威性与可信度
- **结合现代**：将古典命理与现代生活场景自然融合
- **客观诚实**：好的说好，需注意的如实指出，不过度美化也不危言耸听
- **有据可查**：每个判断都基于具体星曜和宫位，说明依据
- **亲切自然**：像老师父对学生讲解那样，生动有温度，不神秘玄乎
- **中文回答**：使用简体中文，语言流畅自然
- **长度适中**：每次回答300-500字为宜，重点突出，层次分明

## 排版要求(重要)
- **结论前置**：正文第一句先用一句大白话给出核心结论(不含术语),让不懂命理的人一眼看懂大意;之后再展开专业分析。例:"简单说,你这盘适合稳扎稳打、厚积薄发,别急着大动。"
- **术语加注**：命理术语(如巨门陷地、绝命、寡宿、华盖)首次出现时,紧跟一个括号用大白话解释一下,别让黑话吓退人。例:"巨门陷地(巨门星力量偏弱,易多口舌是非)"。
- 注意:"结论前置"的第一句白话之后,专业解读风格照旧(下定论、引古诀),不削弱权威感。

当用户提问时：
1. 先找到命盘中与问题最相关的宫位
2. 分析该宫主星及四化
3. 结合三方四正和当前大限
4. 必要时参考对宫借星
5. 给出综合判断与实用建议`;

// 天命深化的 system+context 拼装(一次性版与流式版共用,口径一致)
function buildInterpretSystem(chart, lang = 'zh') {
  const langRule = lang === 'en'
    ? `\n\n# Output language (STRICT)
- Write the ENTIRE reading in natural, warm English. Do NOT put any Chinese character (CJK) in the output — not even inside parentheses.
- For 紫微 star names, use their romanized form only, then a short English gloss in parentheses on first mention. Examples: Ziwei, Tianji, Taiyang, Wuqu, Tiantong, Lianzhen, Tianfu, Taiyin, Tanlang, Jumen, Tianxiang, Tianliang, Qisha, Pojun; minor stars e.g. Dijie, Qingyang, Huagai. Never mix scripts within a word (write "Dijie", never "地劫" or "Earth劫").
- Palaces: Life, Siblings, Spouse, Children, Wealth, Health, Travel, Friends, Career, Property, Fortune, Parents.
- Four Transformations: Lu (prosperity), Quan (power), Ke (fame), Ji (trouble).`
    : '';
  const chartContext = buildChartContext(chart);
  return `${ZIWEI_SYSTEM}${langRule}\n\n---\n\n以下是命主的完整命盘数据，请基于此进行解读：\n\n${chartContext}`;
}

export async function interpretZiwei(client, { chart, question, lang = 'zh' }) {
  const systemWithContext = buildInterpretSystem(chart, lang);
  const res = await client.messages.create({
    model: process.env.LLM_TEXT_MODEL || 'claude-sonnet-4-6',
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    system: [{ type: 'text', text: systemWithContext, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: question }],
  });
  return res.content.find((b) => b.type === 'text')?.text ?? '';
}

/**
 * streamInterpretZiwei — 天命深化的流式版(逐字吐),供 /api/ziwei SSE 用。
 * 与 interpretZiwei 同口径(共用 buildInterpretSystem),只是改成 streamLLM 逐段 yield。
 * @returns async generator，每次 yield 一段文字
 */
export async function* streamInterpretZiwei(client, { chart, question, lang = 'zh' }) {
  const system = buildInterpretSystem(chart, lang);
  yield* streamLLM({
    client,
    system,
    messages: [{ role: 'user', content: question }],
    model: process.env.LLM_TEXT_MODEL || 'claude-sonnet-4-6',
    maxTokens: 8000,
  });
}

/**
 * 天命紫微 编排:危机前置 → 排盘(纯) → 规则版三方四正(12 宫全量) →(有 Key+问题)AI 深化
 * 无 Key 时也返回完整命盘 + 规则版解读,不报错。
 * @returns {Promise<{type:'crisis',text}|{type:'ziwei',chart,sanfang,三方四正解读表,text?}>}
 */
/**
 * buildZiweiSkeleton — 纯计算的命盘骨架(命盘 + 规则版三方四正 + 12 宫解读表),
 * 无需 Key、<0.4s 即出。供流式端点「骨架秒出」用,也被 runZiwei 复用。
 */
export function buildZiweiSkeleton(input) {
  const chart = computeZiwei(input);
  chart.格局 = detectPatterns(chart); // 规则版格局标签(离线即出,供前端展示 + AI 深化参考)
  const sanfang = summarizeSanFang(chart, input.lang);
  // 12 宫全量规则版解读(供前端点选宫位联动,纯同步计算,不涉及 AI)
  const 三方四正解读表 = {};
  for (const 宫名 of Object.keys(chart.三方四正表)) {
    三方四正解读表[宫名] = summarizeSanFang(chart, input.lang, 宫名);
  }
  return { chart, sanfang, 三方四正解读表 };
}

export async function runZiwei(client, input) {
  const { chart, sanfang, 三方四正解读表 } = buildZiweiSkeleton(input);

  // 有问题 + 有 Key 才进 AI 流程(并先做危机前置);否则返回纯盘 + 规则版
  if (input.question && client) {
    const crisis = await detectCrisis(client, input.question);
    if (crisis.level === 'risk') {
      let text = CRISIS_FALLBACK;
      try {
        const res = await client.messages.create({
          model: process.env.LLM_TEXT_MODEL || 'claude-sonnet-4-6', max_tokens: 512,
          system: CRISIS_COMFORT,
          messages: [{ role: 'user', content: input.question }],
        });
        text = res.content.find((b) => b.type === 'text')?.text ?? CRISIS_FALLBACK;
      } catch { /* 用固定兜底文案 */ }
      return { type: 'crisis', text };
    }
    const text = await interpretZiwei(client, { chart, question: input.question, lang: input.lang });
    return { type: 'ziwei', chart, sanfang, 三方四正解读表, text };
  }

  return { type: 'ziwei', chart, sanfang, 三方四正解读表 };
}

/**
 * streamZiwei — 天命排盘的「两段式」流式编排,供 /api/ziwei SSE 用。
 * 逐个 yield 事件对象,server.js 直接转成 SSE 行:
 *   {type:'chart', chart, sanfang, 三方四正解读表}  —— 命盘骨架,秒出(纯计算)
 *   {type:'crisis', text}                          —— 命中危机,只给陪伴,不深化
 *   {type:'delta', text}                           —— AI 深化逐字(仅有问题+有 Key)
 *   {type:'done'} / {type:'error', message}
 * 与 runZiwei 同口径(骨架/危机/深化三段),只是把「深化」从一次性 await 改成流式 yield。
 */
export async function* streamZiwei(client, input) {
  // ① 命盘骨架:纯计算,先吐(前端立即渲染方盘,不再憋整页)
  const { chart, sanfang, 三方四正解读表 } = buildZiweiSkeleton(input);
  yield { type: 'chart', chart, sanfang, 三方四正解读表 };

  // 无问题 / 无 Key:到此为止(纯盘 + 规则版,不进 AI)
  if (!input.question || !client) { yield { type: 'done' }; return; }

  // ② 危机前置:命中则只给温柔陪伴,不深化
  try {
    const crisis = await detectCrisis(client, input.question);
    if (crisis.level === 'risk') {
      let text = CRISIS_FALLBACK;
      try {
        const res = await client.messages.create({
          model: process.env.LLM_TEXT_MODEL || 'claude-sonnet-4-6', max_tokens: 512,
          system: CRISIS_COMFORT,
          messages: [{ role: 'user', content: input.question }],
        });
        text = res.content.find((b) => b.type === 'text')?.text ?? CRISIS_FALLBACK;
      } catch { /* 用固定兜底文案 */ }
      yield { type: 'crisis', text };
      yield { type: 'done' };
      return;
    }
  } catch { /* 危机检测失败从宽,继续深化 */ }

  // ③ AI 深化:逐字吐
  try {
    for await (const chunk of streamInterpretZiwei(client, { chart, question: input.question, lang: input.lang })) {
      yield { type: 'delta', text: chunk };
    }
    yield { type: 'done' };
  } catch (e) {
    yield { type: 'error', message: e.message };
  }
}
