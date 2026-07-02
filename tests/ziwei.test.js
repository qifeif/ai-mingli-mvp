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

test('computeZiwei:运限(大限/流年)四化各 4 颗星', () => {
  const c = computeZiwei(SAMPLE);
  assert.equal(c.运限.大限.mutagen.length, 4, '大限四化应有 4 颗星(禄权科忌)');
  assert.equal(c.运限.流年.mutagen.length, 4, '流年四化应有 4 颗星(禄权科忌)');
  assert.ok(Array.isArray(c.运限.大限.起止) && c.运限.大限.起止.length === 2, '大限应有起止年龄区间');
  assert.ok(Number.isInteger(c.运限.流年.年份), '流年应带年份');
});

test('computeZiwei:三方四正表 覆盖全部十二宫,各宫四正地支互异', () => {
  const c = computeZiwei(SAMPLE);
  const 宫名列表 = c.十二宫.map((p) => p.宫);
  assert.deepEqual(Object.keys(c.三方四正表).sort(), 宫名列表.slice().sort(), '三方四正表应覆盖十二宫全部宫名');
  for (const 宫名 of 宫名列表) {
    const S = c.三方四正表[宫名];
    const zhis = [S.命宫.地支, S.迁移.地支, S.财帛.地支, S.官禄.地支];
    assert.equal(new Set(zhis).size, 4, `${宫名} 的三方四正四宫地支应互异`);
  }
});

test('computeZiwei:当前大限流年 地支能在十二宫中找到匹配', () => {
  const c = computeZiwei(SAMPLE);
  const branches = new Set(c.十二宫.map((p) => p.地支));
  assert.ok(branches.has(c.当前大限流年.大限宫地支), '大限宫地支应能匹配到某个本命宫位');
  assert.ok(branches.has(c.当前大限流年.流年宫地支), '流年宫地支应能匹配到某个本命宫位');
});

test('summarizeSanFang:可对任意宫位生成解读,含空宫(借对宫)回退文案', () => {
  const c = computeZiwei(SAMPLE);
  for (const 宫名 of Object.keys(c.三方四正表)) {
    for (const lang of ['zh', 'en']) {
      const s = summarizeSanFang(c, lang, 宫名);
      assert.equal(s.chips.length, 4, `${宫名}(${lang}) 应有 4 枚 chip`);
      assert.equal(s.段落.length, 3, `${宫名}(${lang}) 应有 3 段解读`);
    }
  }
});

test('computeZiwei:不传 viewYear 默认当年,标记 是否当年=true', () => {
  const c = computeZiwei(SAMPLE);
  assert.equal(c.查看年.是否当年, true, '不传 viewYear 应视为查看当年');
  assert.equal(c.查看年.年份, new Date().getFullYear());
});

test('computeZiwei:viewYear 可查看任意年份的大限/流年,不影响本命当前大限', () => {
  const c2010 = computeZiwei({ ...SAMPLE, viewYear: 2010 });
  const c2035 = computeZiwei({ ...SAMPLE, viewYear: 2035 });
  const cNow = computeZiwei(SAMPLE);

  assert.equal(c2010.查看年.是否当年, false);
  assert.equal(c2010.查看年.年份, 2010);
  assert.equal(c2035.查看年.年份, 2035);

  // 不同查看年 → 流年天干地支应不同(大限跨度更长,不强求必然不同)
  assert.notEqual(c2010.运限.流年.地支 + c2010.运限.流年.天干, c2035.运限.流年.地支 + c2035.运限.流年.天干);

  // 本命"当前大限"(十二宫 P.当前大限 标记)与 viewYear 无关,恒基于真实当下
  const curGong2010 = c2010.十二宫.find((p) => p.当前大限)?.宫;
  const curGong2035 = c2035.十二宫.find((p) => p.当前大限)?.宫;
  const curGongNow = cNow.十二宫.find((p) => p.当前大限)?.宫;
  assert.equal(curGong2010, curGongNow, '切换查看年不应改变本命当前大限宫');
  assert.equal(curGong2035, curGongNow, '切换查看年不应改变本命当前大限宫');

  // 三方四正表/十二宫结构不受 viewYear 影响(仍是同一张本命盘)
  assert.deepEqual(Object.keys(c2010.三方四正表).sort(), Object.keys(cNow.三方四正表).sort());
});

test('computeZiwei:viewYear 非整数抛错', () => {
  assert.throws(() => computeZiwei({ ...SAMPLE, viewYear: 'abc' }), /viewYear/);
});
