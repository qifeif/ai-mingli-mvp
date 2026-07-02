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

  // 当前年龄 → 标注当前大限宫
  const _now = new Date();
  let currentAge = _now.getFullYear() - Y;
  if ((_now.getMonth() + 1 < M) || (_now.getMonth() + 1 === M && _now.getDate() < D)) currentAge--;

  // 3) 三方四正(命宫):本宫 + 对宫(迁移) + 两三合宫(财帛、官禄)
  const sp = a.surroundedPalaces('命宫');
  const fanBranches = new Set([sp.target, sp.opposite, sp.wealth, sp.career].map((P) => P.earthlyBranch));

  // 3.5) 大限/流年 四化飞星(运限维度,与本命四化各自独立不复用同一 key)
  const hs = a.horoscope(new Date());
  const MUTAGEN_ORDER = ['lu', 'quan', 'ke', 'ji']; // horoscope().mutagen 固定顺序:禄权科忌
  const decadalMutStar = {}; // 星名 → 'lu'|'quan'|'ke'|'ji'(大限)
  hs.decadal.mutagen.forEach((star, i) => { decadalMutStar[star] = MUTAGEN_ORDER[i]; });
  const yearlyMutStar = {}; // 星名 → 'lu'|'quan'|'ke'|'ji'(流年)
  hs.yearly.mutagen.forEach((star, i) => { yearlyMutStar[star] = MUTAGEN_ORDER[i]; });
  const yearNow = Number(String(hs.solarDate).match(/^\d+/)?.[0]) || new Date().getFullYear();
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
    ? `Triad & Opposition · read from ${palaceName === '命宫' ? 'the Life palace' : palaceName}${mingMajors[0] ? ` (${starName(mingMajors[0].名, true)})` : ''}`
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

// ---------- AI 深化解读(配 Key 后,以三方四正为主轴) ----------
const ZIWEI_SYSTEM = `你是「心易·天命」的紫微斗数解读助手。请以**三方四正**为主轴,用大白话为用户解读,严格遵守:
- 不下定论、不预测确定事件、不替用户做决定;只给"倾向/这个阶段/可参考的角度"。
- 把紫微术语(主星/四化/庙旺/三方四正)当场翻译成生活语言,看得懂才用得上。
- 结构:① 命宫底色(主星+四化说性格与当下能量)② 三方四正合看(迁移=外部、财帛=资源、官禄=事业落点,如何互相影响)③ 落到用户所问(给视角与时机判断,不给命令)④ 一句温和提醒,把决定权交回用户。
- 350–600 字,温度克制,不堆砌吉凶,不吓唬。`;

export async function interpretZiwei(client, { chart, question, lang = 'zh' }) {
  const langRule = lang === 'en'
    ? '\n\n# Output language\nWrite the entire reading in natural, warm English; translate every 紫微 term into plain English.'
    : '';
  const compact = {
    命主: chart.命主, 身主: chart.身主, 五行局: chart.五行局, 时辰: chart.基本?.时辰,
    三方四正: chart.三方四正,
    身宫地支: chart.身宫地支,
  };
  const userMsg = [
    `<紫微三方四正>\n${JSON.stringify(compact, null, 2)}\n</紫微三方四正>`,
    `<question>\n${question}\n</question>`,
  ].join('\n\n');
  const res = await client.messages.create({
    model: process.env.LLM_TEXT_MODEL || 'claude-sonnet-4-6',
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    system: [{ type: 'text', text: ZIWEI_SYSTEM + langRule, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userMsg }],
  });
  return res.content.find((b) => b.type === 'text')?.text ?? '';
}

/**
 * 天命紫微 编排:危机前置 → 排盘(纯) → 规则版三方四正(12 宫全量) →(有 Key+问题)AI 深化
 * 无 Key 时也返回完整命盘 + 规则版解读,不报错。
 * @returns {Promise<{type:'crisis',text}|{type:'ziwei',chart,sanfang,三方四正解读表,text?}>}
 */
export async function runZiwei(client, input) {
  const chart = computeZiwei(input);
  const sanfang = summarizeSanFang(chart, input.lang);
  // 12 宫全量规则版解读(供前端点选宫位联动,纯同步计算,不涉及 AI)
  const 三方四正解读表 = {};
  for (const 宫名 of Object.keys(chart.三方四正表)) {
    三方四正解读表[宫名] = summarizeSanFang(chart, input.lang, 宫名);
  }

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
