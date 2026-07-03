import test from 'node:test';
import assert from 'node:assert/strict';
import { makeClient } from '../src/llm.js';

// 模型选择单测:stub fetch 拦截请求体,零真实外呼、不依赖 API Key
const ENV_KEYS = ['LLM_PROVIDER', 'LLM_BASE_URL', 'LLM_API_KEY', 'LLM_TEXT_MODEL', 'LLM_CLASSIFY_MODEL', 'LLM_VISION_MODEL'];

async function withStubbedLLM(fn) {
  const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  const savedFetch = globalThis.fetch;
  process.env.LLM_PROVIDER = 'openai-compatible';
  process.env.LLM_BASE_URL = 'https://dashscope.invalid';
  process.env.LLM_API_KEY = 'dummy';
  process.env.LLM_TEXT_MODEL = 'qwen-plus';
  process.env.LLM_CLASSIFY_MODEL = 'qwen-turbo';
  process.env.LLM_VISION_MODEL = 'qwen-vl-max-latest';

  const captured = [];
  globalThis.fetch = async (url, init) => {
    captured.push({ url, payload: JSON.parse(init.body) });
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'ok' } }] }),
    };
  };
  try {
    await fn(captured);
  } finally {
    globalThis.fetch = savedFetch;
    for (const k of ENV_KEYS) {
      if (savedEnv[k] === undefined) delete process.env[k];
      else process.env[k] = savedEnv[k];
    }
  }
}

test('LLM: 显式请求已配置的分类小模型(qwen-turbo)被尊重,不被 TEXT 模型覆盖', async () => {
  await withStubbedLLM(async (captured) => {
    const client = makeClient();
    await client.messages.create({
      model: 'qwen-turbo',
      max_tokens: 256,
      messages: [{ role: 'user', content: '我该不该换工作?' }],
    });
    assert.equal(captured.length, 1);
    assert.equal(captured[0].payload.model, 'qwen-turbo');
  });
});

test('LLM: 请求未配置平台的模型名(claude-*)时回落到 LLM_TEXT_MODEL', async () => {
  await withStubbedLLM(async (captured) => {
    const client = makeClient();
    await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      messages: [{ role: 'user', content: '解读一下这个命盘' }],
    });
    assert.equal(captured[0].payload.model, 'qwen-plus');
  });
});

test('LLM: 消息带图时优先选 LLM_VISION_MODEL', async () => {
  await withStubbedLLM(async (captured) => {
    const client = makeClient();
    await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'aGk=' } },
          { type: 'text', text: '看看这张户型图' },
        ],
      }],
    });
    assert.equal(captured[0].payload.model, 'qwen-vl-max-latest');
  });
});
