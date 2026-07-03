/**
 * 合参 · 双人八字对比引擎
 * ------------------------------------------------------------
 * 两份出生信息 → 各自排盘(复用 bazi.js 的 computeChart) → 查表对比四层关系:
 *   日主生克合 / 十神互看 / 地支合冲刑害 / 五行互补(+ 大运节奏,若两盘都有)
 * → 规则版四块白话(离线即出,无 Key 可用) →(有 Key + 问题)AI 深化。
 * 与天命(紫微)同一套产品原则:不下定论、给视角、说人话、危机优先。
 *
 * 对比层全部为查表纯计算;数据层「白话」字段为中文(与 bazi.js/ziwei.js 一致);
 * summarizeHehun 按 lang 输出中英双语规则版摘要。
 * ⚠️ 合参说的是"互动倾向",不是姻缘生死或合作成败的判决——所有白话均按此红线措辞。
 */
import { computeChart } from './bazi.js';
import { detectCrisis } from './pipeline.js';
import { getKnowledgeContext } from './rag.js';
import { CRISIS_COMFORT, CRISIS_FALLBACK } from './prompts.js';

// ---------- 基础五行/阴阳映射(查表常量,与 bazi.js 保持一致,不改动其导出面) ----------
const GAN_WUXING = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
const GAN_YANG = new Set(['甲', '丙', '戊', '庚', '壬']); // 阳干
const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }; // X 生 SHENG[X]
const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };   // X 克 KE[X]

// 十天干五合:甲己合土 乙庚合金 丙辛合水 丁壬合木 戊癸合火
const WUHE = { 甲己: '土', 乙庚: '金', 丙辛: '水', 丁壬: '木', 戊癸: '火' };

// 地支六合 / 六冲 / 三合局 / 相刑 / 相害(查两字组合,正反都收)
const LIUHE = new Set(['子丑', '寅亥', '卯戌', '辰酉', '巳申', '午未']);
const LIUCHONG = new Set(['子午', '丑未', '寅申', '卯酉', '辰戌', '巳亥']);
const SANHE_JU = { 申子辰: '水', 寅午戌: '火', 巳酉丑: '金', 亥卯未: '木' };
// 三刑:寅巳申(恃势)、丑戌未(无恩)、子卯(无礼);辰午酉亥自刑
const XING_PAIRS = new Set(['寅巳', '巳申', '寅申', '丑戌', '戌未', '丑未', '子卯']);
const ZI_XING = new Set(['辰', '午', '酉', '亥']);
const XIANGHAI = new Set(['子未', '丑午', '寅巳', '卯辰', '申亥', '酉戌']);

function pairIn(set, a, b) { return set.has(a + b) || set.has(b + a); }
function sanheJuOf(a, b) {
  if (a === b) return null;
  const ju = Object.keys(SANHE_JU).find((k) => k.includes(a) && k.includes(b));
  return ju ? SANHE_JU[ju] : null;
}
function isXing(a, b) { return a === b ? ZI_XING.has(a) : pairIn(XING_PAIRS, a, b); }

// ---------- 十神推导(以甲之日主看乙之日干,与 bazi.js 同法) ----------
function shiShen(dayGan, otherGan) {
  const D = GAN_WUXING[dayGan];
  const O = GAN_WUXING[otherGan];
  const samePol = GAN_YANG.has(dayGan) === GAN_YANG.has(otherGan);
  if (O === D) return samePol ? '比肩' : '劫财';
  if (SHENG[D] === O) return samePol ? '食神' : '伤官';
  if (KE[D] === O) return samePol ? '偏财' : '正财';
  if (KE[O] === D) return samePol ? '七杀' : '正官';
  if (SHENG[O] === D) return samePol ? '偏印' : '正印';
  return '未知';
}

// 十神互看白话:对方在"我"的盘里是什么角色 → 说的是相处倾向,不是关系定论
const SHISHEN_HUDONG = {
  比肩: '像照镜子:彼此独立、平起平坐,好处是懂对方的骄傲,难处是都不太肯先低头',
  劫财: '有并肩闯的劲,行动上合拍,但在资源与主导权上容易暗暗较劲',
  食神: '对方让你放松、想表达,相处自带滋养感,是能一起把日子过出滋味的搭配',
  伤官: '对方点燃你的表达欲与才华,也容易让你不服管、想挑战对方的规则',
  正财: '你会想认真经营这个人,愿意为TA务实付出;踏实,但留意别把关系过成任务清单',
  偏财: '对方对你有天然吸引力,带来机会与新鲜感;热得快,需要专注来保温',
  正官: '对方让你自觉收敛、讲分寸,既是约束也是敬重,关系里自带秩序感',
  七杀: '对方给你压力也给你推动,张力大:处得好是彼此激励,处不好就互相紧绷',
  正印: '对方像给你托底的人,包容你、给你安全感;暖,但留意别变成单向依赖',
  偏印: '对方接得住你的敏感与心事,默契在暗处;相处需要留出各自的空间',
};

// ---------- 日主关系(天干五合 > 同气 > 相生 > 相克) ----------
function compareDayMasters(ganA, ganB) {
  const wxA = GAN_WUXING[ganA];
  const wxB = GAN_WUXING[ganB];
  const he = WUHE[ganA + ganB] || WUHE[ganB + ganA];
  if (he) {
    return {
      甲: `${ganA}(${wxA})`, 乙: `${ganB}(${wxB})`, 关系: '相合',
      白话: `${ganA}与${ganB}是十天干里的五合(合化${he}),彼此有天然的吸引与默契,遇事容易想到一块去;但"合"也可能互相迁就,重要分歧别憋着不谈`,
    };
  }
  if (wxA === wxB) {
    return {
      甲: `${ganA}(${wxA})`, 乙: `${ganB}(${wxB})`, 关系: '同气',
      白话: `两人日主同属${wxA},气质同频、容易懂彼此;但相似也意味着盲区重合,遇大事记得主动找第三视角`,
    };
  }
  if (SHENG[wxA] === wxB) {
    return {
      甲: `${ganA}(${wxA})`, 乙: `${ganB}(${wxB})`, 关系: '相生', 方向: '甲生乙',
      白话: `${wxA}生${wxB}:甲更像供给方,乙更像被滋养的一方,能量流动是暖的;供给方要留意别单向透支,被滋养的一方记得回流`,
    };
  }
  if (SHENG[wxB] === wxA) {
    return {
      甲: `${ganA}(${wxA})`, 乙: `${ganB}(${wxB})`, 关系: '相生', 方向: '乙生甲',
      白话: `${wxB}生${wxA}:乙更像供给方,甲更像被滋养的一方,能量流动是暖的;供给方要留意别单向透支,被滋养的一方记得回流`,
    };
  }
  if (KE[wxA] === wxB) {
    return {
      甲: `${ganA}(${wxA})`, 乙: `${ganB}(${wxB})`, 关系: '相克', 方向: '甲克乙',
      白话: `${wxA}克${wxB}:相克不等于相冲,克是"管束与被塑造"的互动——甲容易不自觉主导,乙容易感到被约束;把"管"换成"商量",这股劲反而能互相成就`,
    };
  }
  return {
    甲: `${ganA}(${wxA})`, 乙: `${ganB}(${wxB})`, 关系: '相克', 方向: '乙克甲',
    白话: `${wxB}克${wxA}:相克不等于相冲,克是"管束与被塑造"的互动——乙容易不自觉主导,甲容易感到被约束;把"管"换成"商量",这股劲反而能互相成就`,
  };
}

// ---------- 地支两两对照(只报显著项) ----------
const POS_NAMES = ['年', '月', '日', '时'];

/** 一对地支的主关系(冲/合优先,刑害并存时归入"带刑"备注,避免同一对重复吓人) */
function branchPairRel(a, b) {
  const xing = isXing(a, b);
  if (pairIn(LIUCHONG, a, b)) return { 关系: '六冲', 带刑: xing };
  if (pairIn(LIUHE, a, b)) return { 关系: '六合', 带刑: xing };
  const ju = sanheJuOf(a, b);
  if (ju) return { 关系: '三合', 局: ju };
  if (xing) return { 关系: '相刑', 自刑: a === b };
  if (pairIn(XIANGHAI, a, b)) return { 关系: '相害' };
  return null;
}

function branchHua(a, b, rel) {
  switch (rel.关系) {
    case '六合':
      return `${a}与${b}六合,这两股能量天然亲近、好商量${rel.带刑 ? ';合中带刑,亲近里偶尔夹一点小别扭,说破就散' : ''}`;
    case '六冲':
      return `${a}与${b}六冲,节奏与立场容易对撞——往往是一个要快、一个要稳${rel.带刑 ? ';冲中带刑,对撞时更容易翻旧账,记得就事论事' : ''}`;
    case '三合':
      return `${a}与${b}同属${rel.局}局(半合),同气相求,搭配起来顺手省力`;
    case '相刑':
      return rel.自刑
        ? `两人${a}见${a}自刑,同款的别扭叠在一起,情绪容易自我消耗,需要外部出口`
        : `${a}与${b}相刑,相处易有说不清的别扭与内耗,越沉默越拧,越坦白越松`;
    case '相害':
      return `${a}与${b}相害,大事未必,小事最磨——日常细节处容易互相妨碍,提前分好工就顺了`;
    default:
      return '';
  }
}

/** 两盘四柱地支 4×4 对照 → 去重、按显著度排序、只留显著项(日支权重最高) */
function compareBranches(zhisA, zhisB) {
  const found = [];
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const a = zhisA[i];
      const b = zhisB[j];
      const rel = branchPairRel(a, b);
      if (!rel) continue;
      // 显著度 = 位置权重(日支为婚姻宫/自我宫最重) + 关系权重(冲/合最显)
      const posW = (i === 2 && j === 2) ? 5 : (i === 2 || j === 2) ? 3 : (i === j) ? 2 : 1;
      const relW = (rel.关系 === '六冲' || rel.关系 === '六合') ? 3 : 2;
      const isDayDay = i === 2 && j === 2;
      found.push({
        对: `${a}-${b}`,
        关系: rel.关系,
        位: `甲${POS_NAMES[i]}支-乙${POS_NAMES[j]}支`,
        白话: branchHua(a, b, rel) + (isDayDay ? '。这一组落在两人日支上,对朝夕相处的体感影响最直接' : ''),
        _w: posW + relW,
      });
    }
  }
  // 同一「关系 + 无序地支对」只留显著度最高的一条
  const seen = new Map();
  for (const item of found.sort((x, y) => y._w - x._w)) {
    const key = `${item.关系}:${item.对.split('-').sort().join('')}`;
    if (!seen.has(key)) seen.set(key, item);
  }
  return [...seen.values()]
    .filter((item) => item._w >= 4) // 只报显著项:涉日支、同柱位、或跨柱的冲/合
    .slice(0, 6)
    .map(({ _w, ...rest }) => rest);
}

// ---------- 五行互补(一方偏弱 ≤1 且对方偏旺 ≥3 记一处互补) ----------
const WUXING_KEYS = ['木', '火', '土', '金', '水'];

function compareWuxing(wxA, wxB) {
  const 明细 = {};
  const hits = [];
  for (const k of WUXING_KEYS) {
    const a = wxA[k] ?? 0;
    const b = wxB[k] ?? 0;
    let 互补 = null;
    if (a <= 1 && b >= 3) { 互补 = '乙补甲'; hits.push(`甲的${k}偏弱而乙${k}旺(乙补甲)`); }
    else if (b <= 1 && a >= 3) { 互补 = '甲补乙'; hits.push(`乙的${k}偏弱而甲${k}旺(甲补乙)`); }
    明细[k] = 互补 ? { 甲: a, 乙: b, 互补 } : { 甲: a, 乙: b };
  }
  const 互补度 = hits.length >= 2 ? '高' : hits.length === 1 ? '中' : '低';
  const 白话 = hits.length
    ? `五行互补度${互补度}:${hits.join(';')}。一方的短板恰好是另一方的长项,分工与互相搭手时可以顺着这个来`
    : '五行互补度低:两人的五行长短板比较接近,是"同款节奏"的组合——共鸣多,但短板也容易一起缺位,重要事务记得引入外部视角补位';
  return { 互补度, 白话, 明细 };
}

// ---------- 大运节奏对比(bazi.js 已产出当前大运,两盘都有才给) ----------
function compareDayun(chartA, chartB) {
  const a = chartA.当前大运;
  const b = chartB.当前大运;
  if (!a || !b) return null;
  const same = a.主十神 === b.主十神;
  return {
    甲: { 干支: a.干支, 主十神: a.主十神 },
    乙: { 干支: b.干支, 主十神: b.主十神 },
    白话: same
      ? `两人当前大运主题同为「${a.主十神}」,这个阶段关注点相近,容易同频共振,也容易同时钻进同一个牛角尖`
      : `两人当前大运主题不同(甲偏「${a.主十神}」,乙偏「${b.主十神}」),阶段节奏有差;多问一句"你现在最在意什么",很多摩擦就化掉了`,
  };
}

// ---------- 输入校验 ----------
function checkPerson(p, label) {
  if (!p || typeof p !== 'object') throw new Error(`缺少${label}的出生信息(gender / datetime / place)`);
  if (p.gender !== '男' && p.gender !== '女') throw new Error(`${label}的 gender 应为 男/女`);
  if (!p.datetime) throw new Error(`${label}缺少出生时间 datetime(格式 "YYYY-MM-DD HH:mm")`);
}

/**
 * 合参纯计算:两盘排盘 + 四层对比(无需 Key)
 * @param {object} input { personA, personB, relation:'love'|'partner' }
 * @returns {{relation, personA:{label,gender,chart}, personB:{label,gender,chart}, compare}}
 */
export function computeHehun(input) {
  const { personA, personB, relation } = input || {};
  checkPerson(personA, '甲方(personA)');
  checkPerson(personB, '乙方(personB)');
  if (relation !== 'love' && relation !== 'partner') {
    throw new Error('relation 应为 love(婚恋合参)或 partner(合伙合参)');
  }

  let chartA, chartB;
  try { chartA = computeChart(personA); } catch (e) { throw new Error(`甲方排盘失败:${e.message}`); }
  try { chartB = computeChart(personB); } catch (e) { throw new Error(`乙方排盘失败:${e.message}`); }

  const dayGanA = chartA.日主.天干;
  const dayGanB = chartB.日主.天干;
  const zhisA = ['年', '月', '日', '时'].map((k) => chartA.四柱[k].charAt(1));
  const zhisB = ['年', '月', '日', '时'].map((k) => chartB.四柱[k].charAt(1));

  const ssAB = shiShen(dayGanA, dayGanB); // 以甲日主看乙日干
  const ssBA = shiShen(dayGanB, dayGanA); // 以乙日主看甲日干
  const compare = {
    日主: compareDayMasters(dayGanA, dayGanB),
    十神: {
      甲视乙: { 十神: ssAB, 白话: `在甲的盘里,乙是「${ssAB}」——${SHISHEN_HUDONG[ssAB] || ''}` },
      乙视甲: { 十神: ssBA, 白话: `在乙的盘里,甲是「${ssBA}」——${SHISHEN_HUDONG[ssBA] || ''}` },
    },
    地支: compareBranches(zhisA, zhisB),
    五行互补: compareWuxing(chartA.五行分布, chartB.五行分布),
  };
  const 大运节奏 = compareDayun(chartA, chartB);
  if (大运节奏) compare.大运节奏 = 大运节奏;

  return {
    relation,
    personA: { label: '甲', gender: personA.gender, chart: chartA },
    personB: { label: '乙', gender: personB.gender, chart: chartB },
    compare,
  };
}

// ---------- 规则版四块白话(离线即出,love/partner 两套措辞,中英双语) ----------
const REL_EN = { 相生: 'generating (one nourishes the other)', 相克: 'controlling (one steers, one is shaped)', 相合: 'combining (natural affinity)', 同气: 'same-element (kindred temperaments)' };
const DIR_EN = { 甲生乙: 'A nourishes B', 乙生甲: 'B nourishes A', 甲克乙: 'A tends to steer B', 乙克甲: 'B tends to steer A' };
const SHISHEN_EN = {
  比肩: 'Peer (bijian)', 劫财: 'Rival Peer (jiecai)', 食神: 'Gourmet Output (shishen)', 伤官: 'Maverick Output (shangguan)',
  正财: 'Steady Wealth (zhengcai)', 偏财: 'Windfall Wealth (piancai)', 正官: 'Proper Authority (zhengguan)', 七杀: 'Fierce Authority (qisha)',
  正印: 'Nurturing Seal (zhengyin)', 偏印: 'Uncanny Seal (pianyin)',
};
const ZHI_REL_EN = { 六合: 'six-harmony (natural closeness)', 六冲: 'clash (pace and stance collide)', 三合: 'trine (effortless teamwork)', 相刑: 'punishment (nagging friction)', 相害: 'harm (small daily hindrances)' };
const WUXING_EN = { 木: 'Wood', 火: 'Fire', 土: 'Earth', 金: 'Metal', 水: 'Water' };
/** '辛(金)' → '辛 (Metal)':EN 摘要里把日主五行当场翻译 */
const dayMasterEn = (s) => `${s.charAt(0)} (${WUXING_EN[s.charAt(2)] || s.charAt(2)})`;

/**
 * 规则版摘要:关系画像 / 互补与分工 / 摩擦提醒 / 相处建议(四块,lang 感知)
 * love 讲相处与沟通;partner 讲角色分工、决策风格与合作摩擦。
 * 红线:不判"能不能结婚/必成必败/克夫克妻";摩擦项一律配"怎么办"。
 * @param {object} compare computeHehun().compare
 * @param {'love'|'partner'} relation
 * @param {'zh'|'en'} lang
 */
export function summarizeHehun(compare, relation, lang = 'zh') {
  const en = lang === 'en';
  const isLove = relation !== 'partner';
  const rz = compare.日主;
  const ss = compare.十神;
  const wx = compare.五行互补;
  const zhi = compare.地支 || [];
  const frictions = zhi.filter((z) => z.关系 === '六冲' || z.关系 === '相刑' || z.关系 === '相害');
  const bonds = zhi.filter((z) => z.关系 === '六合' || z.关系 === '三合');
  const wxHitsEn = Object.entries(wx.明细 || {})
    .filter(([, v]) => v.互补)
    .map(([k, v]) => `${WUXING_EN[k]} (${v.互补 === '甲补乙' ? 'A supplements B' : 'B supplements A'})`);

  // ① 关系画像
  const 关系画像 = en
    ? `Day masters ${dayMasterEn(rz.甲)} and ${dayMasterEn(rz.乙)} form a "${REL_EN[rz.关系] || rz.关系}" pairing${rz.方向 ? ` — ${DIR_EN[rz.方向] || rz.方向}` : ''}. Seen through the Ten Gods: in A's chart, B carries the "${SHISHEN_EN[ss.甲视乙.十神] || ss.甲视乙.十神}" quality; in B's chart, A reads as "${SHISHEN_EN[ss.乙视甲.十神] || ss.乙视甲.十神}". ${isLove
      ? 'This sketches how you two tend to feel and act around each other — it is a portrait of interaction, never a verdict on the relationship.'
      : 'This sketches how you two tend to operate as partners — a portrait of working styles, never a forecast of the venture.'}`
    : `两人日主${rz.甲}与${rz.乙},属「${rz.关系}」${rz.方向 ? `(${rz.方向})` : ''}——${rz.白话}。十神互看:在甲眼中,乙偏「${ss.甲视乙.十神}」;在乙眼中,甲偏「${ss.乙视甲.十神}」。${isLove
      ? '这说的是两人相处的底色与倾向,是画像不是判决,感情走向始终在两个人手里。'
      : '这说的是两人搭档的底色与倾向,是画像不是预言,合作成色靠机制与磨合。'}`;

  // ② 互补与分工
  const 互补与分工 = en
    ? `${wxHitsEn.length
      ? `Five-element complementarity is ${wx.互补度 === '高' ? 'high' : 'moderate'}: ${wxHitsEn.join('; ')}. One side's blind spot is the other's strong suit.`
      : 'Five-element complementarity is low: your strengths and gaps largely overlap — plenty of resonance, but shared blind spots too.'} ${isLove
      ? (wxHitsEn.length
        ? 'In daily life, let each of you own what comes naturally, and say thank you instead of keeping score.'
        : 'As a same-rhythm couple, invite an outside view (a friend, a checklist) before big decisions, so shared blind spots do not decide for you.')
      : (wxHitsEn.length
        ? 'For the partnership, divide roles along this line: let the stronger energy own that lane — one drives expansion, the other holds the base.'
        : 'As same-type players, deliberately outsource or hire for the lanes you both lack (finance, legal, operations), rather than assuming the other has it covered.')}${compare.大运节奏 ? ` Current luck-cycle themes: A runs on "${SHISHEN_EN[compare.大运节奏.甲.主十神] || compare.大运节奏.甲.主十神}", B on "${SHISHEN_EN[compare.大运节奏.乙.主十神] || compare.大运节奏.乙.主十神}" — ask what stage the other is in before judging their pace.` : ''}`
    : `${wx.白话}。${isLove
      ? '放到感情里,互补不是谁迁就谁,而是把"我不擅长的"放心交给对方,并记得说声谢谢;'
      : '落到合伙分工:能量旺的一方主扛对应的事,一个主攻开拓、一个稳住底盘,边界越清楚配合越顺;'}${compare.大运节奏 ? compare.大运节奏.白话 + '。' : ''}`;

  // ③ 摩擦提醒(每一项都配"怎么办")
  const adviceZh = {
    六冲: isLove
      ? '遇分歧先对齐节奏再谈对错,把"现在必须有结论"换成"各自想一晚再聊"'
      : '重要决策前先各自写下方案再碰头,别在会议桌上即兴顶牛',
    相刑: isLove
      ? '别扭别攒着,用"我感到…"开头把话说破,比冷战省力得多'
      : '把责任与边界白纸黑字写清楚,别赌默契',
    相害: isLove
      ? '最磨人的是小事:家务、花钱这类日常,先约定好谁主谁辅'
      : '流程衔接处最容易掉球,在交接环节设一个明确的检查点',
  };
  const adviceEn = {
    六冲: isLove
      ? 'when you disagree, sync pace before debating right and wrong — swap "we must decide now" for "let us each sleep on it"'
      : 'before big decisions, write down your proposals separately, then compare — do not improvise a standoff in the meeting',
    相刑: isLove
      ? 'do not stockpile grudges; open with "I feel…" and say it plainly — far cheaper than a cold war'
      : 'put responsibilities and boundaries in writing instead of betting on chemistry',
    相害: isLove
      ? 'small things grind the most: agree in advance who leads on chores, money and daily logistics'
      : 'handoffs are where balls get dropped — set an explicit checkpoint at every process seam',
  };
  const fzh = [];
  const fen = [];
  if (rz.关系 === '相克') {
    fzh.push(`日主相克(${rz.方向}):被"管"的一方容易憋屈——怎么办:${isLove ? '主导的一方多问少断,被主导的一方保留自己的小领地' : '明确各自的最终决定域,谁的领域谁拍板,不越界复议'}`);
    fen.push(`day masters in a controlling relation (${DIR_EN[rz.方向] || rz.方向}): the steered side can feel boxed in — what to do: ${isLove ? 'the steering side asks more and decrees less; the steered side keeps a small territory of their own' : 'define each person\'s final-say domain and do not re-litigate across the line'}`);
  }
  for (const f of frictions.slice(0, 3)) {
    fzh.push(`${f.对}${f.关系}(${f.位}):${f.白话.split('。')[0].split(';')[0]}——怎么办:${adviceZh[f.关系]}`);
    fen.push(`${f.对} ${ZHI_REL_EN[f.关系] || f.关系} (${f.位}) — what to do: ${adviceEn[f.关系]}`);
  }
  const 摩擦提醒 = en
    ? (fen.length
      ? `Points worth watching: ${fen.join('; ')}. Clashes and punishments only mark where friction tends to arise — they are ${isLove ? 'not a death sentence for the relationship' : 'not a verdict on the partnership'}; a plan in advance defuses most of it.`
      : `No prominent clash or punishment shows up between the two charts — which does not mean zero friction. Most of it will come from everyday habit gaps; what to do: ${isLove ? 'name small irritations early instead of archiving them' : 'agree on a working rhythm and review cadence early, before habits harden'}.`)
    : (fzh.length
      ? `盘面上值得留意的点:${fzh.join(';')}。冲刑害说的是"摩擦容易发生在哪类事上",${isLove ? '不是感情的死刑' : '不是合作成败的定论'};提前有预案,大多能化掉。`
      : `两盘之间没有明显的冲刑害——但这不等于零摩擦,日常习惯差异才是主要来源。怎么办:${isLove ? '小别扭当天说开,别归档攒着' : '尽早约定协作节奏与复盘频率,别等习惯固化再谈'}。`);

  // ④ 相处建议
  const 相处建议 = en
    ? (isLove
      ? `Three moves for this relationship: 1) keep a weekly slot of "no problem-solving" time — talk feelings, not verdicts; 2) pick one behaviour of theirs you most often misread, and ask what it actually means to them; 3) ${wx.互补度 !== '低' ? 'on big matters, divide by strength — the abler one leads, the other plays devil\'s advocate' : 'never assume the other thinks like you; before big decisions, each restates the other\'s view first'}. Whether the rhythm fits is something you two build — the charts only light the terrain, the walking is yours.`
      : `Three moves for this partnership: 1) before starting, write a one-page charter — who owns what, who has final say at which level, and who breaks a deadlock; 2) hold a monthly review that discusses mechanisms, not blame; 3) ${wx.互补度 === '高' ? 'assign roles along the complementarity line: the expansive energy takes the front, the steady one holds the base' : 'since your profiles overlap, bring in outside capability (advisor, hire, outsourcing) for the lanes you both lack'}. Partnerships last on mechanisms, not on charts — the decision stays with you two.`)
    : (isLove
      ? `给这段关系的三个动作:① 每周留一段"不解决问题"的相处时间,只聊感受不谈对错;② 挑一个你最常误读对方的行为,拿去问问TA本来的意思;③ ${wx.互补度 !== '低' ? '大事按互补分工——谁擅长谁牵头,另一个负责提问和兜底' : '别默认对方跟你想的一样,重要决定前先互相复述一遍对方的观点'}。节奏合不合,是两个人处出来的;命盘只照亮地形,路还是你们自己走。`
      : `给这对搭档的三个动作:① 开工前写一页"分工与决策协议"——谁管什么、什么级别的事谁拍板、僵持不下听谁的;② 每月一次只谈机制不谈对错的复盘会;③ ${wx.互补度 === '高' ? '顺着五行互补排角色:开拓型能量主外主攻,沉稳型能量主内守成' : '两人画像相近,给短板环节主动找外部补位(顾问/合伙人/外包)'}。合伙走多远,拼的是机制不是命盘;决定权始终在你们两个人手里。`);

  return { 关系画像, 互补与分工, 摩擦提醒, 相处建议 };
}

// ---------- AI 深化解读(配 Key 后,以 compare 结构为依据) ----------
const HEHUN_SYSTEM = `你是「心易 · 合参」的双人八字对比解读顾问。你会收到两人的命盘要点与程序已算好的对比结构(<合参>),任务是帮两个人把这段关系里的互动模式看清,严格遵守:
- 不下定论:不判姻缘生死、不说"必成/必散/必发/必败"、不算"能不能结婚/该不该散伙",更不预测盈亏金额或具体时间点;只说倾向、互动模式与可参考的做法。
- 以 <合参> 的 compare 结构为唯一命理依据,直接采信,不要自己重排命盘、重算干支或引入盘外的断语。
- 术语(十神/六合六冲/五行生克/大运)当场翻译成生活语言,看得懂才用得上;"克"必须解释为互动张力,严禁写成"克夫/克妻/克伴"式的宿命话术。
- 每一个摩擦点都必须配一条"可以怎么做",不渲染吉凶、不吓唬、不和稀泥。
- 结构:① 两人底色与关系画像(日主+十神互看)② 互补与摩擦(逐条对应 compare 的发现,先互补后摩擦)③ 落到用户所问(给视角与做法,不替任何一方做决定)④ 一句温和收尾,把关系的主动权交回两个人。
- 400–700 字,温度克制,像一位见过很多搭档与伴侣的明白人,不油腻、不神神叨叨。`;

const HEHUN_SCENE = {
  love: `

# 场景:婚恋合参
聚焦"相处与沟通":两人的情感表达方式差在哪、谁习惯进谁习惯退、吵架容易卡在哪个环节、怎么把互补用成默契而不是分工冷漠。绝不评判"配不配",绝不预测结婚/分手/复合的结果;落点永远是"你们可以怎么相处得更舒服"。`,
  partner: `

# 场景:合伙合参
聚焦"角色分工、决策风格与合作摩擦":谁适合主外开拓谁适合主内守成、两人对钱与规则的态度差异(财星/官星/比劫的口吻要翻译成"对资源和规矩的本能反应")、决策僵持时容易怎么耗、机制上怎么破。不预测项目盈亏与金额,不给投资建议;落点永远是"机制怎么搭、边界怎么划"。`,
};

/** 按 relation 构造 RAG 检索 query(love:婚恋/十神/日柱/六合六冲;partner:合伙/财官/比劫/分工) */
function buildHehunRagQuery({ result, question }) {
  const c = result.compare || {};
  const sceneWords = result.relation === 'partner'
    ? '合伙 合作 分工 决策 财星 官星 比肩 劫财 角色 摩擦 机制'
    : '夫妻 婚恋 相处 沟通 日柱 十神 六合 六冲 情感 互补';
  return [
    question,
    c.日主?.关系, c.日主?.方向,
    c.十神?.甲视乙?.十神, c.十神?.乙视甲?.十神,
    (c.地支 || []).map((z) => `${z.对} ${z.关系}`).join(' '),
    `五行互补 ${c.五行互补?.互补度 || ''}`,
    sceneWords,
  ].filter(Boolean).join('\n');
}

/**
 * AI 深化:注入 RAG(domains: hehun+bazi,检索失败静默降级)→ 模型解读
 * @returns {Promise<{text:string, rag:Array}>}
 */
export async function interpretHehun(client, { result, question, lang = 'zh' }) {
  let knowledge = '';
  let ragChunks = [];
  try {
    const r = await getKnowledgeContext({
      domains: ['hehun', 'bazi'],
      query: buildHehunRagQuery({ result, question }),
      limit: 6,
    });
    knowledge = r.knowledge;
    ragChunks = r.chunks;
  } catch { /* 检索失败不阻断解读,静默降级为无知识注入 */ }

  const langRule = lang === 'en'
    ? '\n\n# Output language\nWrite the entire reading in natural, warm English; translate every 命理 term into plain English on the spot.'
    : '';
  // 只喂要点,不喂全量大运列表:模型以 compare 为准,不需要重算的原始数据
  const compact = {
    relation: result.relation,
    甲: { 性别: result.personA.gender, 四柱: result.personA.chart.四柱, 日主: result.personA.chart.日主, 五行分布: result.personA.chart.五行分布 },
    乙: { 性别: result.personB.gender, 四柱: result.personB.chart.四柱, 日主: result.personB.chart.日主, 五行分布: result.personB.chart.五行分布 },
    compare: result.compare,
  };
  const userMsg = [
    `<合参>\n${JSON.stringify(compact, null, 2)}\n</合参>`,
    knowledge ? `<knowledge>\n${knowledge}\n</knowledge>` : '',
    `<question>\n${question}\n</question>`,
  ].filter(Boolean).join('\n\n');

  const res = await client.messages.create({
    model: process.env.LLM_TEXT_MODEL || 'claude-sonnet-4-6',
    max_tokens: 8000,
    thinking: { type: 'adaptive' },
    system: [{ type: 'text', text: HEHUN_SYSTEM + (HEHUN_SCENE[result.relation] || HEHUN_SCENE.love) + langRule, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userMsg }],
  });
  const text = res.content.find((b) => b.type === 'text')?.text ?? '';
  return { text, rag: ragChunks.map(({ id, title, source, score }) => ({ id, title, source, score })) };
}

/**
 * 合参编排(仿 runZiwei):纯计算 + 规则版(无 Key 可用)→ 有 Key+问题时危机前置 → AI 深化
 * @returns {Promise<{type:'crisis',text}|{type:'hehun',relation,personA,personB,compare,summary,rag?,text?}>}
 */
export async function runHehun(client, input) {
  const result = computeHehun(input);
  const summary = summarizeHehun(result.compare, result.relation, input.lang);

  // 有问题 + 有 Key 才进 AI 流程(并先做危机前置);否则返回纯对比 + 规则版
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
    const { text, rag } = await interpretHehun(client, { result, question: input.question, lang: input.lang });
    return { type: 'hehun', ...result, summary, rag, text };
  }

  return { type: 'hehun', ...result, summary };
}
