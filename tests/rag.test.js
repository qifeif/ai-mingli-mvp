import test from 'node:test';
import assert from 'node:assert/strict';
import { retrieveKnowledge, formatKnowledge, knowledgeStats } from '../src/rag.js';

test('RAG: loads local knowledge and reports domains', async () => {
  const stats = await knowledgeStats();
  assert.ok(stats.total >= 4);
  assert.ok(stats.domains.bazi >= 1);
  assert.ok(stats.domains.liuyao >= 1);
});

test('RAG: retrieves bazi career knowledge', async () => {
  const chunks = await retrieveKnowledge({ domain: 'bazi', query: '换工作 正官 事业 大运', limit: 3 });
  assert.ok(chunks.length >= 1);
  assert.equal(chunks[0].domain, 'bazi');
  assert.match(formatKnowledge(chunks), /正官|事业|八字/);
});

test('RAG: retrieves liuyao and renjiandao knowledge together', async () => {
  const chunks = await retrieveKnowledge({ domains: ['liuyao', 'renjiandao'], query: '动爻 变卦 宜动宜静', limit: 4 });
  assert.ok(chunks.length >= 1);
  assert.ok(chunks.some((c) => ['liuyao', 'renjiandao'].includes(c.domain)));
});
