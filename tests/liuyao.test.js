/**
 * 六爻起卦引擎回归测试(人间道)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hexFromLines, castHexagram } from '../src/liuyao.js';

// 已知卦象交叉核对(bits:初→上,1=阳0=阴)
const KNOWN = [
  [[1, 1, 1, 1, 1, 1], '乾为天'],
  [[0, 0, 0, 0, 0, 0], '坤为地'],
  [[1, 1, 1, 0, 0, 0], '地天泰'],
  [[0, 0, 0, 1, 1, 1], '天地否'],
  [[1, 0, 0, 0, 0, 0], '地雷复'],
  [[0, 1, 0, 0, 1, 0], '坎为水'],
  [[1, 0, 1, 1, 0, 1], '离为火'],
  [[1, 0, 0, 0, 1, 0], '水雷屯'],
  [[1, 1, 1, 0, 0, 1], '山天大畜'],
  [[0, 0, 1, 1, 1, 1], '天山遁'],
];

test('64 卦查表正确', () => {
  for (const [bits, name] of KNOWN) {
    assert.equal(hexFromLines(bits).name, name, `${bits.join('')} 应为 ${name}`);
  }
});

test('castHexagram:结构完整 + 变卦仅在有动爻时存在', () => {
  // 注入确定 rng:全 <0.5 → 三枚皆 2(字/阴)= 老阴6,全动;本卦全阴→坤,变卦全阳→乾
  const allYin = castHexagram(() => 0.1);
  assert.equal(allYin.本卦.name, '坤为地');
  assert.equal(allYin.动爻.length, 6);
  assert.equal(allYin.变卦.name, '乾为天');

  // 全 >=0.5 → 三枚皆 3(背/阳)= 老阳9,全动;本卦全阳→乾,变卦全阴→坤
  const allYang = castHexagram(() => 0.9);
  assert.equal(allYang.本卦.name, '乾为天');
  assert.equal(allYang.变卦.name, '坤为地');
});

test('castHexagram:六爻明细与动爻一致', () => {
  const c = castHexagram(() => 0.9); // 全动
  assert.equal(c.逐爻.length, 6);
  assert.ok(c.逐爻.every((y) => y.动 === true));
  assert.equal(c.本卦.bits.length, 6);
});
