/**
 * 排盘引擎回归测试
 * 运行:  npm test   (Node 内置 test runner,无需额外依赖)
 *
 * 测试分三层:
 *  A. 自研逻辑硬断言 —— 真太阳时数学、十神推导(可手算验证的确定性逻辑)
 *  B. 全盘黄金快照   —— 锁定已核对的四柱,防止后续改动悄悄破坏排盘
 *  C. 结构不变量     —— 五行求和、日主一致性、大运有序等
 *
 * 说明:干支本身由 lunar-javascript(成熟库)负责,我们不重复测它;
 *      我们测的是"自研的校正/统计/推导"以及"接线没接错"。
 *      生产应持续往 GOLDEN 里追加命理师核对过的案例,目标 ≥20 例。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeChart } from '../src/bazi.js';
import { longitudeCorrection, toTrueSolarTime, equationOfTime } from '../src/trueSolarTime.js';

// ---------- A. 真太阳时数学 ----------
test('经度时差:中央经线 120° 校正为 0', () => {
  assert.equal(longitudeCorrection(120), 0);
});

test('经度时差:每偏 1 经度 = 4 分钟,偏西为负', () => {
  assert.equal(longitudeCorrection(116.41), (116.41 - 120) * 4); // 北京 ≈ -14.36
  assert.ok(Math.abs(longitudeCorrection(87.62) - -129.52) < 0.01); // 乌鲁木齐
});

test('均时差全年绝对值不超过 ~17 分钟', () => {
  for (let m = 0; m < 12; m++) {
    const eot = equationOfTime(new Date(2000, m, 15));
    assert.ok(Math.abs(eot) < 17, `month ${m} eot=${eot}`);
  }
});

test('真太阳时:乌鲁木齐 23:50 校正后跨回前一时辰区间(<23:00)', () => {
  const clock = new Date(1990, 0, 20, 23, 50);
  const { trueSolar, totalMin } = toTrueSolarTime(clock, 87.62);
  assert.ok(totalMin < -120, `校正应明显为负,实际 ${totalMin}`);
  assert.ok(trueSolar.getHours() < 23, `应跨出子时,实际 ${trueSolar.getHours()}时`);
});

// ---------- A. 十神推导(以日主 辛=金/阴 手算验证)----------
// shiShen 未对外导出,改用整盘间接验证十神接线正确
test('十神:辛日主的官/财推导正确(通过整盘验证)', () => {
  // 杭州案例日主为辛;年干丙(正官)、时干乙(偏财)已手算核对
  const chart = computeChart({ gender: '女', datetime: '1996-08-12 14:30', place: '杭州' });
  assert.equal(chart.日主.天干, '辛');
  const byPos = Object.fromEntries(chart.十神要点.map((p) => [p.位, p.十神]));
  assert.equal(byPos['年干'], '正官'); // 丙(火)克辛(金),异性 → 正官
  assert.equal(byPos['时干'], '偏财'); // 辛(金)克乙(木),同阴 → 偏财
});

// ---------- B. 全盘黄金快照 ----------
// 追加新案例时:先人工(或命理师)核对四柱,再把正确值写进这里。
const GOLDEN = [
  {
    name: '杭州·女·1996',
    input: { gender: '女', datetime: '1996-08-12 14:30', place: '杭州' },
    四柱: { 年: '丙子', 月: '丙申', 日: '辛巳', 时: '乙未' },
    日主五行: '金',
  },
  {
    name: '乌鲁木齐·男·1990(跨时辰边界)',
    input: { gender: '男', datetime: '1990-01-20 23:50', place: '乌鲁木齐' },
    四柱: { 年: '己巳', 月: '丁丑', 日: '乙酉', 时: '丁亥' }, // 时支为亥,非子 —— 校正生效
    日主五行: '木',
  },
  {
    name: '北京经度·男·1988(直接给经度)',
    input: { gender: '男', datetime: '1988-05-05 06:15', longitude: 116.41 },
    四柱: { 年: '戊辰', 月: '丙辰', 日: '庚申', 时: '己卯' },
    日主五行: '金',
  },
];

for (const g of GOLDEN) {
  test(`黄金快照:${g.name}`, () => {
    const c = computeChart(g.input);
    assert.deepEqual(c.四柱, g.四柱, `四柱不符:${JSON.stringify(c.四柱)}`);
    assert.equal(c.日主.五行, g.日主五行);
  });
}

// ---------- C. 结构不变量(对所有案例通用)----------
for (const g of GOLDEN) {
  test(`不变量:${g.name}`, () => {
    const c = computeChart(g.input);

    // 五行八字共 8 个字
    const sum = ['木', '火', '土', '金', '水'].reduce((s, k) => s + c.五行分布[k], 0);
    assert.equal(sum, 8, '五行总数应为 8');

    // 日主天干 === 日柱第一个字
    assert.equal(c.日主.天干, c.四柱.日.charAt(0));

    // 大运非空且起运年递增
    assert.ok(c.大运.length > 0, '大运不应为空');
    const years = c.大运.map((d) => Number(d.起讫.split('-')[0]));
    for (let i = 1; i < years.length; i++) {
      assert.ok(years[i] > years[i - 1], '大运起运年应递增');
    }

    // 旺衰为枚举之一
    assert.ok(['偏旺', '中和偏旺', '偏弱', '弱'].includes(c.日主.旺衰));

    // 十神要点 3 条且都解析出白话
    assert.equal(c.十神要点.length, 3);
    c.十神要点.forEach((p) => assert.ok(p.白话.length > 0, `${p.位} 缺白话`));
  });
}

// ---------- C. 校正开关与降级 ----------
test('未提供出生地:降级为北京时间且标记未校正', () => {
  const c = computeChart({ gender: '男', datetime: '1988-05-05 06:15' });
  assert.equal(c.基本.已校正真太阳时, false);
  assert.match(c.基本.校正明细, /未提供/);
});

test('非法 datetime 抛错', () => {
  assert.throws(() => computeChart({ gender: '男', datetime: '不是日期' }));
});
