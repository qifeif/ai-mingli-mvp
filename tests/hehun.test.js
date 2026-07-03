/**
 * 合参 · 双人八字对比引擎回归测试(纯计算,无需 Key、不碰网络)
 * 日柱采用固定经度 + 正午起盘,确保干支可复现:
 *   1990-02-28 12:00 → 日柱 甲子    1990-01-04 12:00 → 日柱 己巳
 *   1990-02-10 12:00 → 日柱 丙午    1990-01-05 12:00 → 日柱 庚午
 *   1990-01-29 12:00 → 日柱 甲午    1990-02-22 12:00 → 日柱 戊午
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeHehun, summarizeHehun, runHehun } from '../src/hehun.js';

const P = (datetime, gender = '男') => ({ gender, datetime, longitude: 120 });
const JIAZI = P('1990-02-28 12:00');        // 日主 甲(木),日支 子
const JISI = P('1990-01-04 12:00', '女');   // 日主 己(土),日支 巳
const BINGWU = P('1990-02-10 12:00', '女'); // 日主 丙(火),日支 午
const GENGWU = P('1990-01-05 12:00', '女'); // 日主 庚(金),日支 午
const JIAWU = P('1990-01-29 12:00', '女');  // 日主 甲(木),日支 午
const WUWU = P('1990-02-22 12:00', '女');   // 日主 戊(土),日支 午

test('computeHehun:双盘四柱齐全,label 甲/乙 + 契约固定字段', () => {
  const r = computeHehun({ personA: JIAZI, personB: BINGWU, relation: 'love' });
  assert.equal(r.relation, 'love');
  assert.equal(r.personA.label, '甲');
  assert.equal(r.personB.label, '乙');
  for (const p of [r.personA, r.personB]) {
    assert.ok(p.gender === '男' || p.gender === '女');
    for (const k of ['年', '月', '日', '时']) {
      assert.match(p.chart.四柱[k], /^[一-龥]{2}$/, `${k}柱应为两字干支`);
    }
    assert.ok(p.chart.日主?.天干, '日主非空');
    assert.ok(p.chart.五行分布, '五行分布非空');
  }
});

test('computeHehun:日主关系判定——甲己相合 / 甲丙相生(方向) / 甲庚相克 / 甲甲同气', () => {
  const he = computeHehun({ personA: JIAZI, personB: JISI, relation: 'love' }).compare.日主;
  assert.equal(he.关系, '相合', '甲己为十天干五合');

  const sheng = computeHehun({ personA: JIAZI, personB: BINGWU, relation: 'love' }).compare.日主;
  assert.equal(sheng.关系, '相生');
  assert.equal(sheng.方向, '甲生乙', '木生火:甲为供给方');
  const shengRev = computeHehun({ personA: BINGWU, personB: JIAZI, relation: 'love' }).compare.日主;
  assert.equal(shengRev.方向, '乙生甲', '换位后方向应反转');

  const ke = computeHehun({ personA: JIAZI, personB: GENGWU, relation: 'love' }).compare.日主;
  assert.equal(ke.关系, '相克');
  assert.equal(ke.方向, '乙克甲', '金克木:庚为主导方');

  const tong = computeHehun({ personA: JIAZI, personB: JIAWU, relation: 'love' }).compare.日主;
  assert.equal(tong.关系, '同气');
});

test('computeHehun:十神互看方向正确(甲日主见庚为七杀,庚日主见甲为偏财)', () => {
  const ss = computeHehun({ personA: JIAZI, personB: GENGWU, relation: 'partner' }).compare.十神;
  assert.equal(ss.甲视乙.十神, '七杀', '庚金克甲木、同为阳干 → 七杀');
  assert.equal(ss.乙视甲.十神, '偏财', '庚金克甲木属"我克"、同为阳干 → 偏财');
  assert.ok(ss.甲视乙.白话 && ss.乙视甲.白话, '互看均应有白话');
});

test('computeHehun:两盘日支六冲(子-午)能检出且标为最显著', () => {
  const zhi = computeHehun({ personA: JIAZI, personB: BINGWU, relation: 'love' }).compare.地支;
  assert.ok(Array.isArray(zhi) && zhi.length > 0, '地支对照非空');
  const chong = zhi.find((z) => z.关系 === '六冲' && /子/.test(z.对) && /午/.test(z.对));
  assert.ok(chong, '应检出子午六冲');
  assert.match(chong.白话, /怎么|对撞|节奏|快|稳/, '六冲应有白话解释');
  assert.equal(zhi[0].关系, '六冲', '双日支六冲权重最高,应排在首位');
  assert.match(zhi[0].位, /日支/, '首位应涉及日支');
});

test('computeHehun:五行互补度为合法枚举且带白话与明细', () => {
  for (const [a, b] of [[JIAZI, BINGWU], [JIAZI, JISI], [GENGWU, WUWU]]) {
    const wx = computeHehun({ personA: a, personB: b, relation: 'partner' }).compare.五行互补;
    assert.ok(['高', '中', '低'].includes(wx.互补度), `互补度应为 高/中/低,得到 ${wx.互补度}`);
    assert.ok(wx.白话.length > 10, '互补白话非空');
    assert.deepEqual(Object.keys(wx.明细).sort(), ['木', '火', '土', '金', '水'].sort(), '明细覆盖五行');
  }
});

test('summarizeHehun:规则版四块中英齐全,love 与 partner 文案不同,无定论式表述', () => {
  const r = computeHehun({ personA: JIAZI, personB: BINGWU, relation: 'love' });
  const KEYS = ['关系画像', '互补与分工', '摩擦提醒', '相处建议'];
  const all = {};
  for (const relation of ['love', 'partner']) {
    for (const lang of ['zh', 'en']) {
      const s = summarizeHehun(r.compare, relation, lang);
      assert.deepEqual(Object.keys(s), KEYS, '四块字段名与契约一致');
      for (const k of KEYS) assert.ok(s[k].length > 30, `${relation}/${lang}/${k} 非空`);
      all[`${relation}:${lang}`] = s;
    }
  }
  // love 与 partner 两套措辞必须不同(中英各查一块)
  assert.notEqual(all['love:zh'].相处建议, all['partner:zh'].相处建议);
  assert.notEqual(all['love:en'].相处建议, all['partner:en'].相处建议);
  assert.notEqual(all['love:zh'].摩擦提醒, all['partner:zh'].摩擦提醒);
  // 红线:不许出现定论式/宿命式话术
  const joined = Object.values(all).map((s) => Object.values(s).join('')).join('');
  for (const bad of ['克夫', '克妻', '必成', '必散', '必发', '必败', '注定', '命中注定']) {
    assert.ok(!joined.includes(bad), `摘要不得出现定论式表述「${bad}」`);
  }
});

test('computeHehun:坏输入抛带中文信息的错(缺人/性别/日期/relation)', () => {
  assert.throws(() => computeHehun({ personA: JIAZI, relation: 'love' }), /乙方/);
  assert.throws(() => computeHehun({ personB: JIAZI, relation: 'love' }), /甲方/);
  assert.throws(() => computeHehun({ personA: { ...JIAZI, gender: 'x' }, personB: BINGWU, relation: 'love' }), /gender/);
  assert.throws(() => computeHehun({ personA: { gender: '男' }, personB: BINGWU, relation: 'love' }), /datetime/);
  assert.throws(() => computeHehun({ personA: { ...JIAZI, datetime: 'bad' }, personB: BINGWU, relation: 'love' }), /排盘失败/);
  assert.throws(() => computeHehun({ personA: JIAZI, personB: BINGWU, relation: 'xx' }), /relation/);
});

test('computeHehun:compare 字段名与契约一致(日主/十神/地支/五行互补)', () => {
  const c = computeHehun({ personA: JIAZI, personB: GENGWU, relation: 'love' }).compare;
  for (const k of ['日主', '十神', '地支', '五行互补']) assert.ok(k in c, `compare 应含「${k}」`);
  assert.ok(c.日主.甲 && c.日主.乙 && c.日主.关系 && c.日主.白话, '日主含 甲/乙/关系/白话');
  assert.ok(['相生', '相克', '相合', '同气'].includes(c.日主.关系), '日主关系为合法枚举');
  assert.deepEqual(Object.keys(c.十神), ['甲视乙', '乙视甲']);
  for (const z of c.地支) {
    assert.match(z.对, /^[一-龥]-[一-龥]$/, '地支对形如「子-丑」');
    assert.ok(['六合', '六冲', '三合', '相刑', '相害'].includes(z.关系), '地支关系为合法枚举');
    assert.ok(z.白话, '地支项有白话');
  }
});

test('runHehun:无 Key(client=null)返回 type=hehun + 规则版 summary,不含 AI 正文', async () => {
  const out = await runHehun(null, { personA: JIAZI, personB: BINGWU, relation: 'partner', question: '我们适合合伙吗', lang: 'zh' });
  assert.equal(out.type, 'hehun');
  assert.equal(out.relation, 'partner');
  assert.ok(out.personA.chart && out.personB.chart && out.compare, '纯计算结果齐全');
  assert.ok(out.summary?.关系画像 && out.summary?.相处建议, '规则版 summary 齐全');
  assert.equal(out.text, undefined, '无 Key 不应有 AI 正文');
  assert.equal(out.rag, undefined, '无 Key 不应有 rag 元数据');
});
