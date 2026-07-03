/**
 * 统一大模型适配层
 * ------------------------------------------------------------
 * 默认兼容现有 Anthropic 接入；当 LLM_PROVIDER=openai-compatible 时，
 * 使用 OpenAI-compatible Chat Completions 协议接入国内模型平台：
 * DeepSeek / 通义百炼 / 火山方舟豆包 / 智谱 GLM 等。
 *
 * 推荐 .env：
 *   LLM_PROVIDER=openai-compatible
 *   LLM_BASE_URL=https://api.deepseek.com
 *   LLM_API_KEY=sk-...
 *   LLM_TEXT_MODEL=deepseek-chat
 *   LLM_VISION_MODEL=qwen-vl-max-latest
 *
 * 保留 Anthropic：
 *   ANTHROPIC_API_KEY=sk-ant-...
 */
import Anthropic from '@anthropic-ai/sdk';

function stripTrailingSlash(url) {
  return String(url || '').replace(/\/+$/, '');
}

function chatCompletionsUrl(baseURL) {
  return baseURL.endsWith('/v1')
    ? `${baseURL}/chat/completions`
    : `${baseURL}/v1/chat/completions`;
}

function getSystemText(system) {
  if (!system) return '';
  if (typeof system === 'string') return system;
  if (Array.isArray(system)) {
    return system.map((b) => (typeof b === 'string' ? b : b?.text || '')).filter(Boolean).join('\n\n');
  }
  return String(system);
}

function anthropicBlockToOpenAI(block) {
  if (typeof block === 'string') return { type: 'text', text: block };
  if (block?.type === 'text') return { type: 'text', text: block.text || '' };
  if (block?.type === 'image' && block.source?.type === 'base64') {
    const mediaType = block.source.media_type || 'image/png';
    return { type: 'image_url', image_url: { url: `data:${mediaType};base64,${block.source.data}` } };
  }
  if (block?.type === 'image_url') return block;
  return { type: 'text', text: JSON.stringify(block) };
}

function convertMessages(messages) {
  return messages.map((msg) => ({
    role: msg.role,
    content: Array.isArray(msg.content)
      ? msg.content.map(anthropicBlockToOpenAI)
      : msg.content,
  }));
}

function modelFor(requestedModel, messages) {
  const hasImage = messages.some((m) => Array.isArray(m.content)
    && m.content.some((b) => b?.type === 'image' || b?.type === 'image_url'));
  // 调用方显式请求的是本平台已配置的模型(如分类用的 LLM_CLASSIFY_MODEL 小模型)时尊重调用方
  const configured = [process.env.LLM_TEXT_MODEL, process.env.LLM_CLASSIFY_MODEL, process.env.LLM_VISION_MODEL]
    .filter(Boolean);
  if (requestedModel && configured.includes(requestedModel)) return requestedModel;
  // 请求的是未配置平台上的模型名(如 Anthropic 默认的 claude-*)时,回落到本平台模型:带图优先视觉模型
  if (hasImage && process.env.LLM_VISION_MODEL) return process.env.LLM_VISION_MODEL;
  if (process.env.LLM_TEXT_MODEL) return process.env.LLM_TEXT_MODEL;
  return requestedModel;
}

function schemaInstruction(outputConfig) {
  const schema = outputConfig?.format?.schema;
  if (!schema) return '';
  return `\n\n你必须只输出一个合法 JSON 对象，不要 Markdown，不要解释。JSON Schema:\n${JSON.stringify(schema)}`;
}

class OpenAICompatibleClient {
  constructor() {
    this.baseURL = stripTrailingSlash(process.env.LLM_BASE_URL || 'https://api.deepseek.com');
    this.apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
    if (!this.apiKey) throw new Error('未配置 LLM_API_KEY 或 OPENAI_API_KEY');
    this.messages = { create: (args) => this.createMessage(args) };
  }

  async createMessage(args) {
    const systemText = getSystemText(args.system) + schemaInstruction(args.output_config);
    const sourceMessages = args.messages || [];
    const messages = [];
    if (systemText) messages.push({ role: 'system', content: systemText });
    messages.push(...convertMessages(sourceMessages));

    const payload = {
      model: modelFor(args.model, sourceMessages),
      messages,
      max_tokens: args.max_tokens,
      temperature: Number(process.env.LLM_TEMPERATURE ?? 0.6),
    };

    if (args.output_config && process.env.LLM_JSON_MODE !== 'off') {
      payload.response_format = { type: 'json_object' };
    }

    const res = await fetch(chatCompletionsUrl(this.baseURL), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`LLM 请求失败 ${res.status}: ${body.slice(0, 500)}`);
    }

    const json = await res.json();
    const text = json.choices?.[0]?.message?.content ?? '';
    return { content: [{ type: 'text', text }], raw: json };
  }
}

export function makeClient() {
  const provider = process.env.LLM_PROVIDER || (process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai-compatible');
  if (provider === 'anthropic') return new Anthropic();
  if (provider === 'openai-compatible') return new OpenAICompatibleClient();
  throw new Error(`不支持的 LLM_PROVIDER: ${provider}`);
}

export function hasModelConfig() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY);
}
