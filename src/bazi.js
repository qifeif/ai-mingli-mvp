/**
 * 八字排盘引擎
 * ------------------------------------------------------------
 * 输入出生信息 → 真太阳时校正 → 起八字 → 算五行/十神/大运/流年
 * → 输出带「白话」字段的结构化 JSON(直接喂给 LLM 解读层,见 ../prompts.md)。
 *
 * 依赖:lunar-javascript(成熟的农历/八字库,负责干支与大运计算)
 * 自实现:真太阳时校正、五行统计、十神推导、旺衰估算、白话翻译。
 *
 * ⚠️ 旺衰为「简化估算」,仅供 MVP;生产应引入藏干权重 + 调候 + 通根,
 *    并用命理师标注的案例集做回归校准。
 */
import { Solar } from 'lunar-javascript';
import { toTrueSolarTime } from './trueSolarTime.js';
import { resolveLongitude } from './cities.js';

// ---------- 基础五行/阴阳映射 ----------
const GAN_WUXING = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
const ZHI_WUXING = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
const GAN_YANG = new Set(['甲', '丙', '戊', '庚', '壬']); // 阳干
const SHENG = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }; // X 生 SHENG[X]
const KE = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };   // X 克 KE[X]

// ---------- 十神推导 ----------
/** 以 dayGan 为日主,求 otherGan 的十神 */
function shiShen(dayGan, otherGan) {
  const D = GAN_WUXING[dayGan];
  const O = GAN_WUXING[otherGan];
  const samePol = GAN_YANG.has(dayGan) === GAN_YANG.has(otherGan);
  if (O === D) return samePol ? '比肩' : '劫财';
  if (SHENG[D] === O) return samePol ? '食神' : '伤官'; // 我生(食伤)
  if (KE[D] === O) return samePol ? '偏财' : '正财';   // 我克(财)
  if (KE[O] === D) return samePol ? '七杀' : '正官';   // 克我(官杀)
  if (SHENG[O] === D) return samePol ? '偏印' : '正印'; // 生我(印)
  return '未知';
}

const SHISHEN_HUAHUA = {
  比肩: '自我意识强、看重独立,易与人较劲',
  劫财: '行动力足、敢拼,但也容易冲动消耗',
  食神: '表达欲与创造力、享受生活,温和有才',
  伤官: '才华外露、思维活跃,但易锋芒过盛/不服管',
  正财: '务实、踏实,看重稳定的获得',
  偏财: '机会感强、活络,擅长在变动中抓资源',
  正官: '重视规则与责任,自律也容易给自己上压力',
  七杀: '行动力与压力并存,有魄力但易紧绷',
  正印: '重视学习与安全感,温厚但有时依赖',
  偏印: '直觉敏锐、想得多,易内耗或想太多',
};

// ---------- 工具 ----------
function ganOf(gz) { return gz.charAt(0); }
function zhiOf(gz) { return gz.charAt(1); }
function countWuxing(gans, zhis) {
  const c = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  gans.forEach((g) => { c[GAN_WUXING[g]]++; });
  zhis.forEach((z) => { c[ZHI_WUXING[z]]++; }); // 简化:只计地支主气
  return c;
}

/** 旺衰简化估算:同类(比劫)+ 生我(印)为「帮身」;得月令再加权 */
function estimateStrength(dayGan, monthZhi, wuxingCount) {
  const D = GAN_WUXING[dayGan];
  const yinElement = Object.keys(SHENG).find((k) => SHENG[k] === D); // 生我者
  const support = wuxingCount[D] + wuxingCount[yinElement];
  const monthEl = ZHI_WUXING[monthZhi];
  const deLing = monthEl === D || monthEl === yinElement; // 得令
  const score = support + (deLing ? 2 : 0);
  let level, hua;
  if (score >= 6) { level = '偏旺'; hua = '能量充沛、行动力强,但容易固执或用力过猛'; }
  else if (score >= 4) { level = '中和偏旺'; hua = '整体较平衡,推进事情时还算有底气'; }
  else if (score === 3) { level = '偏弱'; hua = '本质有主见、认原则,但当前能量不算充沛,容易硬撑'; }
  else { level = '弱'; hua = '内心想法多,但常感力不从心,需要养精蓄锐再发力'; }
  return { level, deLing, hua, _score: score };
}

const STRENGTH_NOTE = '旺衰为简化估算,正式解读建议命理师复核';

/**
 * 排盘主函数
 * @param {object} input
 * @param {string} input.gender '男' | '女'
 * @param {string} input.datetime 出生钟表时间(北京时间),如 '1996-08-12 14:30'
 * @param {string|number} [input.place] 出生地名(查表)或直接给经度
 * @param {number} [input.longitude] 直接指定经度(优先级高于 place)
 * @returns {object} 结构化命盘(含「白话」字段)
 */
export function computeChart(input) {
  const { gender, datetime } = input;
  const m = datetime.match(/(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{1,2})/);
  if (!m) throw new Error('datetime 格式应为 "YYYY-MM-DD HH:mm"');
  const [, Y, M, D, h, min] = m.map(Number);

  // 1) 真太阳时校正
  let longitude = input.longitude ?? resolveLongitude(input.place);
  let corrected = true;
  if (longitude == null) { longitude = 120; corrected = false; } // 查不到则退回标准时
  const clock = new Date(Y, M - 1, D, h, min, 0);
  const { trueSolar, lonCorrMin, eotMin, totalMin } = toTrueSolarTime(clock, longitude);

  // 2) 用校正后的真太阳时起八字
  const solar = Solar.fromYmdHms(
    trueSolar.getFullYear(), trueSolar.getMonth() + 1, trueSolar.getDate(),
    trueSolar.getHours(), trueSolar.getMinutes(), 0
  );
  const lunar = solar.getLunar();
  const ec = lunar.getEightChar();
  const pillars = { 年: ec.getYear(), 月: ec.getMonth(), 日: ec.getDay(), 时: ec.getTime() };
  const dayGan = ganOf(pillars.日);
  const monthZhi = zhiOf(pillars.月);

  // 3) 五行分布
  const gans = [ganOf(pillars.年), ganOf(pillars.月), dayGan, ganOf(pillars.时)];
  const zhis = [zhiOf(pillars.年), zhiOf(pillars.月), zhiOf(pillars.日), zhiOf(pillars.时)];
  const wx = countWuxing(gans, zhis);
  const lacking = Object.keys(wx).filter((k) => wx[k] === 0);
  const overMax = Math.max(...Object.values(wx));
  const over = Object.keys(wx).filter((k) => wx[k] === overMax && overMax >= 3);

  // 4) 旺衰
  const strength = estimateStrength(dayGan, monthZhi, wx);

  // 5) 十神要点(取年/月/时三干,日主自身不算)
  const shiShenPoints = [
    { 位: '年干', 干: gans[0] }, { 位: '月干', 干: gans[1] }, { 位: '时干', 干: gans[3] },
  ].map(({ 位, 干 }) => {
    const ss = shiShen(dayGan, 干);
    return { 位, 十神: ss, 白话: SHISHEN_HUAHUA[ss] || '' };
  });

  // 6) 大运 + 当前所处大运
  const nowYear = new Date().getFullYear();
  const yun = ec.getYun(gender === '男' ? 1 : 0);
  const daYunList = yun.getDaYun().filter((d) => d.getGanZhi()); // 过滤童限空运
  const dayunOut = daYunList.map((d) => ({
    干支: d.getGanZhi(),
    起讫: `${d.getStartYear()}-${d.getEndYear()}`,
    起止岁: `${d.getStartAge()}-${d.getEndAge()}岁`,
  }));
  const cur = daYunList.find((d) => nowYear >= d.getStartYear() && nowYear <= d.getEndYear());
  let curDaYun = null;
  if (cur) {
    const dyGan = ganOf(cur.getGanZhi());
    const ss = shiShen(dayGan, dyGan);
    curDaYun = {
      干支: cur.getGanZhi(),
      起讫: `${cur.getStartYear()}-${cur.getEndYear()}`,
      主十神: ss,
      白话: `这十年偏向「${SHISHEN_HUAHUA[ss] || ss}」的主题,适合顺着这个能量做选择`,
    };
  }

  // 7) 当年流年(按立春)
  const nowLunar = Solar.fromDate(new Date()).getLunar();
  const liuNianGZ = nowLunar.getYearInGanZhiByLiChun();
  const lnSS = shiShen(dayGan, ganOf(liuNianGZ));
  const liuNian = {
    干支: liuNianGZ,
    主十神: lnSS,
    白话: `今年整体能量偏「${SHISHEN_HUAHUA[lnSS] || lnSS}」,做决定时留意这股劲是助力还是干扰`,
  };

  // 8) 组装(对齐 prompts.md 的 <chart> 结构)
  return {
    基本: {
      性别: gender,
      公历生日: datetime,
      出生地: input.place ?? `经度${longitude}`,
      已校正真太阳时: corrected,
      校正明细: corrected
        ? `经度时差 ${lonCorrMin} 分 + 均时差 ${eotMin} 分 = ${totalMin} 分`
        : '未提供出生地经度,按北京时间起盘(建议补全以提升准确度)',
    },
    四柱: pillars,
    日主: {
      天干: dayGan,
      五行: GAN_WUXING[dayGan],
      旺衰: strength.level,
      得令: strength.deLing,
      白话: strength.hua,
      备注: STRENGTH_NOTE,
    },
    五行分布: { ...wx, 缺: lacking.length ? lacking : '无', 过旺: over.length ? over : '无' },
    十神要点: shiShenPoints,
    大运: dayunOut,
    当前大运: curDaYun,
    今年流年: liuNian,
  };
}
