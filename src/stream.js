/**
 * 心易 · 流式推理共享层
 * --------------------------------------------------
 * 把「按 provider 走流式吐 token」这件事抽出来,供 chat.js(对话)
 * 与 ziwei.js(天命深化)复用,避免两处各写一份 streamAnthropic/streamOpenAI。
 *
 * export streamLLM({client, system, messages, model, maxTokens}) — async generator,每次 yield 一段文字
 *
 * provider 选择与 llm.js/makeClient 一致:
 *   LLM_PROVIDER=anthropic         → client.messages.stream(...)
 *   LLM_PROVIDER=openai-compatible → 直接 fetch /chat/completions (stream:true)
 */

async function* streamAnthropic(client, system, messages, model, maxTokens) {
  const stream = client.messages.stream({
    model,
    max_tokens: maxTokens,
    system,
    messages,
  });
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      yield event.delta.text;
    }
  }
}

async function* streamOpenAI(system, messages, model, maxTokens) {
  const baseURL = String(process.env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
  const url     = baseURL.endsWith('/v1') ? `${baseURL}/chat/completions` : `${baseURL}/v1/chat/completions`;
  const apiKey  = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;

  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, ...messages],
      max_tokens:  maxTokens,
      temperature: Number(process.env.LLM_TEMPERATURE ?? 0.7),
      stream:      true,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`LLM ${res.status}: ${body.slice(0, 400)}`);
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let   buf     = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const chunk = line.slice(6).trim();
      if (chunk === '[DONE]') return;
      try {
        const json = JSON.parse(chunk);
        const text = json.choices?.[0]?.delta?.content;
        if (text) yield text;
      } catch (_) { /* partial JSON, skip */ }
    }
  }
}

/**
 * streamLLM — 按当前 provider 流式生成文本。
 * @param {object} opts
 *   .client     llm.js 创建的 client(anthropic 时用其 .messages.stream)
 *   .system     系统提示(字符串)
 *   .messages   OpenAI 形态消息数组 [{role:'user'|'assistant', content}]
 *   .model      模型名
 *   .maxTokens  最大 token(对话 ~1024,天命深化 ~8000)
 */
export async function* streamLLM({ client, system, messages, model, maxTokens = 1024 }) {
  const provider = process.env.LLM_PROVIDER || (process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai-compatible');
  if (provider === 'anthropic') {
    yield* streamAnthropic(client, system, messages, model, maxTokens);
  } else {
    yield* streamOpenAI(system, messages, model, maxTokens);
  }
}
