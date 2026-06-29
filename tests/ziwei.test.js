/**
 * 紫微斗数 排盘引擎回归测试(天命 · 真排盘,纯计算无需 Key)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeZiwei, summarizeSanFang } from '../src/ziwei.js';

// 固定经度(120.15≈杭州)使结果可复现,绕开城市表
const SAMPLE = { gender: '女', datetime: '1996-08-12 14:30', longitude: 120.15 };

test('computeZiwei:十二宫结构完整 + 命宫/身宫各一', () => {
  const c = computeZiwei(SAMPLE);
  assert.equal(c.十二宫.length, 12, '应为十二宫');
  assert.equal(c.十二宫.filter((p) => p.命宫).length, 1, '命宫唯一');
  assert.equal(c.十二宫.filter((p) => p.身宫).length, 1, '身宫唯一');
  // 每宫都有九宫格落位,且十二地支不重复
  const branches = c.十二宫.map((p) => p.地支);
  assert.equal(new Set(branches).size, 12, '十二地支不重复');
  c.十二宫.forEach((p) => assert.ok(Array.isArray(p.pos) && p.pos.length === 2, `${p.地支} 应有 pos`));
});

test('computeZiwei:中央信息盘(命主/身主/五行局/时辰)齐备', () => {
  const c = computeZiwei(SAMPLE);
  assert.ok(c.命主 && c.身主 && c.五行局, '命主/身主/五行局非空');
  assert.equal(c.基本.时辰, '未时', '14:30 → 未时');
  assert.equal(c.基本.已校正真太阳时, true, '给了经度应已校正');
});

test('computeZiwei:三方四正 = 命·迁·财·官,四宫地支互异且含命宫', () => {
  const c = computeZiwei(SAMPLE);
  const S = c.三方四正;
  assert.deepEqual(Object.keys(S), ['命宫', '迁移', '财帛', '官禄']);
  const zhis = [S.命宫.地支, S.迁移.地支, S.财帛.地支, S.官禄.地支];
  assert.equal(new Set(zhis).size, 4, '三方四正四宫地支互异');
  // 三方四正的命宫 应与十二宫里标记 命宫 的那一宫一致
  const mingPalace = c.十二宫.find((p) => p.命宫);
  assert.equal(S.命宫.地支, mingPalace.地支, '三方四正命宫 ↔ 十二宫命宫 一致');
  // 标了「在三方四正」的宫恰好 4 个
  assert.equal(c.十二宫.filter((p) => p.在三方四正).length, 4, '高亮宫恰为 4');
});

test('summarizeSanFang:规则版三方四正(中/英)结构正确', () => {
  const c = computeZiwei(SAMPLE);
  for (const lang of ['zh', 'en']) {
    const s = summarizeSanFang(c, lang);
    assert.ok(s.标题 && typeof s.标题 === 'string');
    assert.equal(s.chips.length, 4, '四枚 chip(命迁财官)');
    assert.equal(s.段落.length, 3, '三段解读');
  }
});

test('computeZiwei:坏输入抛错(性别/格式)', () => {
  assert.throws(() => computeZiwei({ gender: 'x', datetime: '1996-08-12 14:30' }), /gender/);
  assert.throws(() => computeZiwei({ gender: '女', datetime: 'bad' }), /datetime/);
});
