/**
 * 六爻起卦引擎(人间道)
 * ------------------------------------------------------------
 * 模拟「三枚铜钱摇六次」(金钱卦/文王卦)起卦,定本卦 / 动爻 / 变卦,
 * 由二进制爻象查 64 卦名。纯函数,可回归测试。
 *
 * 摇卦规则(背=阳记3,字=阴记2,三枚求和):
 *   9 老阳(○)动·阳→阴   8 少阴(▬▬)静·阴
 *   7 少阳(▬▬▬)静·阳   6 老阴(×)动·阴→阳
 *   爻阴阳:和为奇(7/9)=阳,和为偶(6/8)=阴;动爻:6 或 9。
 *
 * 解读层(renjiandao.js)依据「本卦+动爻+变卦」按周易象数取辞,
 * 知识源:倪海厦《天纪·人间道》六十四卦象解。
 */

// 八经卦(下→上三爻,1=阳 0=阴)→ 索引[乾兑离震巽坎艮坤]
const TRIGRAM_INDEX = {
  '111': 0, '110': 1, '101': 2, '100': 3,
  '011': 4, '010': 5, '001': 6, '000': 7,
};
export const TRIGRAM_NAME = ['乾', '兑', '离', '震', '巽', '坎', '艮', '坤'];
export const TRIGRAM_NATURE = ['天', '泽', '火', '雷', '风', '水', '山', '地'];

// 64 卦名查表 MATRIX[上卦][下卦],卦序均为 [乾兑离震巽坎艮坤]
const MATRIX = [
  ['乾为天', '天泽履', '天火同人', '天雷无妄', '天风姤', '天水讼', '天山遁', '天地否'],
  ['泽天夬', '兑为泽', '泽火革', '泽雷随', '泽风大过', '泽水困', '泽山咸', '泽地萃'],
  ['火天大有', '火泽睽', '离为火', '火雷噬嗑', '火风鼎', '火水未济', '火山旅', '火地晋'],
  ['雷天大壮', '雷泽归妹', '雷火丰', '震为雷', '雷风恒', '雷水解', '雷山小过', '雷地豫'],
  ['风天小畜', '风泽中孚', '风火家人', '风雷益', '巽为风', '风水涣', '风山渐', '风地观'],
  ['水天需', '水泽节', '水火既济', '水雷屯', '水风井', '坎为水', '水山蹇', '水地比'],
  ['山天大畜', '山泽损', '山火贲', '山雷颐', '山风蛊', '山水蒙', '艮为山', '山地剥'],
  ['地天泰', '地泽临', '地火明夷', '地雷复', '地风升', '地水师', '地山谦', '坤为地'],
];

function triIndex(bits3) {
  return TRIGRAM_INDEX[bits3.join('')];
}

/** 由 6 爻阴阳(下→上,1=阳 0=阴)求卦名与上下卦 */
export function hexFromLines(bits) {
  const lower = triIndex(bits.slice(0, 3));
  const upper = triIndex(bits.slice(3, 6));
  return {
    name: MATRIX[upper][lower],
    upper: TRIGRAM_NAME[upper],
    lower: TRIGRAM_NAME[lower],
    symbol: `${TRIGRAM_NATURE[upper]}${TRIGRAM_NATURE[lower]}`, // 如「天地」
    bits: [...bits],
  };
}

/** 掷一爻:三枚铜钱(背=3 阳, 字=2 阴)。可注入 rng 便于测试 */
function tossLine(rng = Math.random) {
  const sum = [0, 0, 0].reduce((s) => s + (rng() < 0.5 ? 2 : 3), 0); // 6..9
  return {
    value: sum,
    yang: sum % 2 === 1, // 7,9 阳;6,8 阴
    moving: sum === 6 || sum === 9, // 老阴/老阳为动
  };
}

const YAO_LABEL = {
  9: '老阳 ○ 动(阳变阴)', 8: '少阴 ▬ ▬ 静',
  7: '少阳 ▬▬▬ 静', 6: '老阴 × 动(阴变阳)',
};
const POS_NAME = ['初', '二', '三', '四', '五', '上']; // 爻位

/**
 * 完整起卦
 * @param {() => number} rng 0~1 随机源(默认 Math.random;测试可注入)
 * @returns 本卦 / 变卦 / 动爻 / 逐爻明细
 */
export function castHexagram(rng = Math.random) {
  const lines = Array.from({ length: 6 }, () => tossLine(rng)); // 初爻→上爻
  const benBits = lines.map((l) => (l.yang ? 1 : 0));
  const bianBits = lines.map((l, i) => (l.moving ? (l.yang ? 0 : 1) : (l.yang ? 1 : 0)));

  const movingPositions = lines
    .map((l, i) => (l.moving ? i + 1 : null))
    .filter((x) => x !== null); // 1-based 爻位

  const ben = hexFromLines(benBits);
  const changed = movingPositions.length > 0;
  const bian = changed ? hexFromLines(bianBits) : null;

  const detail = lines.map((l, i) => ({
    位: `${POS_NAME[i]}爻`,
    爻: YAO_LABEL[l.value],
    动: l.moving,
  }));

  return {
    本卦: ben,
    变卦: bian, // 无动爻时为 null
    动爻: movingPositions, // [] / [3] / [2,5] ...
    取辞规则: ruleHint(movingPositions.length),
    逐爻: detail,
  };
}

/** 周易动爻取辞通则(供解读层与前端提示) */
function ruleHint(n) {
  if (n === 0) return '六爻不动:断本卦卦辞为主。';
  if (n === 1) return '一爻动:断本卦该动爻爻辞为主。';
  if (n === 2) return '二爻动:以上动爻爻辞为主,下动爻为辅。';
  if (n === 3) return '三爻动:本卦卦辞与变卦卦辞合参。';
  if (n === 4) return '四爻动:以变卦二静爻中下爻爻辞为主。';
  if (n === 5) return '五爻动:以变卦唯一静爻爻辞为主。';
  return '六爻皆动:乾坤用九用六,余卦断变卦卦辞。';
}
