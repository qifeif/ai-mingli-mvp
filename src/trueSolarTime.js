/**
 * 真太阳时校正
 * ------------------------------------------------------------
 * 八字必须按出生地的「真太阳时」起盘,而非手机上的北京时间。
 * 真太阳时 = 标准时(北京时间) + 经度时差 + 均时差(EoT)
 *
 *  1) 经度时差:出生地经度与时区中央经线(中国=东经120°)的差,
 *     每偏 1 经度差 4 分钟。偏东为正(时间提前),偏西为负。
 *  2) 均时差 EoT:地球公转轨道椭圆 + 黄赤交角导致的"钟表时间 vs 太阳时"
 *     的季节性偏差,范围约 ±16 分钟,按出生日期(年内第几天)估算。
 *
 * 这是排盘准确率的命门:差几分钟可能跨"时辰",整盘改变。
 * 越靠近时辰交界(每两小时一次),越要校正准。
 */

const CHINA_STANDARD_MERIDIAN = 120; // 北京时间基于东经120°

/** 年内第几天 (1-366) */
function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  return Math.floor(diff / 86400000);
}

/**
 * 均时差(分钟)。标准天文近似公式,精度足够命理排盘。
 * 正值表示真太阳时快于平太阳时。
 */
export function equationOfTime(date) {
  const N = dayOfYear(date);
  const B = ((2 * Math.PI) / 365) * (N - 81); // 弧度
  return 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
}

/**
 * 经度时差(分钟)。longitude: 出生地经度,东经为正(如杭州 120.15)。
 * standardMeridian: 时区中央经线,默认东经120°(中国)。
 */
export function longitudeCorrection(longitude, standardMeridian = CHINA_STANDARD_MERIDIAN) {
  return (longitude - standardMeridian) * 4;
}

/**
 * 把标准时(本地钟表时间,如北京时间)换算为真太阳时。
 * @param {Date} clockDate  出生时的钟表时间(本机时区应与标准时一致)
 * @param {number} longitude 出生地经度(东经为正)
 * @param {number} [standardMeridian=120]
 * @returns {{trueSolar: Date, lonCorrMin: number, eotMin: number, totalMin: number}}
 */
export function toTrueSolarTime(clockDate, longitude, standardMeridian = CHINA_STANDARD_MERIDIAN) {
  const lonCorrMin = longitudeCorrection(longitude, standardMeridian);
  const eotMin = equationOfTime(clockDate);
  const totalMin = lonCorrMin + eotMin;
  const trueSolar = new Date(clockDate.getTime() + totalMin * 60 * 1000);
  return {
    trueSolar,
    lonCorrMin: round1(lonCorrMin),
    eotMin: round1(eotMin),
    totalMin: round1(totalMin),
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
