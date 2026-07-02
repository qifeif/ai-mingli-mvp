/**
 * 本地 RAG 知识库(MVP)
 * ------------------------------------------------------------
 * 读取 knowledge 目录下的 md/txt/json 资料,自动切块、检索并格式化注入 Prompt。
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const KNOWLEDGE_ROOT = process.env.RAG_KNOWLEDGE_DIR || join(PROJECT_ROOT, 'knowledge');
const SUPPORTED_EXT = new Set(['.md', '.txt', '.json']);
const DEFAULT_LIMIT = Number(process.env.RAG_LIMIT || 5);
const MAX_CHARS = Number(process.env.RAG_CHUNK_CHARS || 900);
const OVERLAP_CHARS = Number(process.env.RAG_CHUNK_OVERLAP || 120);
const STOPWORDS = new Set(['的', '了', '和', '是', '在', '我', '你', '他', '她', '吗', '呢', '一个', '这个', '那个', '可以', '怎么', '什么', '如果', 'the', 'and', 'for', 'with', 'this', 'that']);

let cache = { signature: '', chunks: [] };

function normalizeText(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/[\t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function stripMarkdown(text) {
  return normalizeText(text)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[>#*_~|]/g, ' ');
}

function inferDomain(filePath) {
  const rel = relative(KNOWLEDGE_ROOT, filePath).split(/[\\/]/);
  return rel.length > 1 ? rel[0] : 'general';
}

function parseFrontMatter(text) {
  const m = String(text).match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const pair = line.match(/^([\w\u4e00-\u9fa5-]+):\s*(.*)$/);
    if (!pair) continue;
    const value = pair[2].trim();
    meta[pair[1].trim()] = value.includes(',') ? value.split(',').map((v) => v.trim()).filter(Boolean) : value;
  }
  return { meta, body: text.slice(m[0].length) };
}

function parseJsonKnowledge(text, fallbackTitle) {
  try {
    const json = JSON.parse(text);
    const rows = Array.isArray(json) ? json : Array.isArray(json.chunks) ? json.chunks : [json];
    return rows.map((row, i) => ({
      title: row.title || row.标题 || `${fallbackTitle} #${i + 1}`,
      tags: row.tags || row.关键词 || [],
      text: normalizeText(row.text || row.content || row.正文 || JSON.stringify(row, null, 2)),
      meta: row,
    })).filter((row) => row.text);
  } catch {
    return [{ title: fallbackTitle, tags: [], text: normalizeText(text), meta: {} }];
  }
}

function splitLongText(text, maxChars = MAX_CHARS) {
  const clean = normalizeText(text);
  if (clean.length <= maxChars) return [clean];
  const chunks = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(clean.length, start + maxChars);
    const pivot = clean.lastIndexOf('\n\n', end);
    if (pivot > start + maxChars * 0.45) end = pivot;
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = Math.max(0, end - OVERLAP_CHARS);
  }
  return chunks.filter(Boolean);
}

function mdSections(text, fallbackTitle) {
  const { meta, body } = parseFrontMatter(text);
  const lines = normalizeText(body).split('\n');
  const sections = [];
  let currentTitle = meta.title || meta.标题 || fallbackTitle;
  let buffer = [];
  for (const line of lines) {
    const h = line.match(/^(#{1,3})\s+(.+)$/);
    if (h && buffer.join('\n').trim()) {
      sections.push({ title: currentTitle, text: buffer.join('\n'), meta });
      currentTitle = h[2].trim();
      buffer = [];
    } else if (h) {
      currentTitle = h[2].trim();
    } else {
      buffer.push(line);
    }
  }
  if (buffer.join('\n').trim()) sections.push({ title: currentTitle, text: buffer.join('\n'), meta });
  return sections.length ? sections : [{ title: currentTitle, text: body, meta }];
}

function tokenize(text) {
  const clean = stripMarkdown(text).toLowerCase();
  const latin = clean.match(/[a-z0-9_+-]{2,}/g) || [];
  const chinese = clean.match(/[\u4e00-\u9fa5]{2,}/g) || [];
  const chars = clean.match(/[\u4e00-\u9fa5]/g) || [];
  const grams = [];
  for (const seq of chinese) {
    for (let i = 0; i < seq.length - 1; i++) grams.push(seq.slice(i, i + 2));
    for (let i = 0; i < seq.length - 3; i++) grams.push(seq.slice(i, i + 4));
  }
  return [...latin, ...chinese, ...grams, ...chars].filter(Boolean);
}

function uniqueTerms(terms) {
  return [...new Set(terms)].filter((t) => t && !STOPWORDS.has(t));
}

async function walk(dir) {
  const out = [];
  let entries = [];
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else if (SUPPORTED_EXT.has(extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

async function buildSignature(files) {
  const parts = [];
  for (const file of files) {
    const s = await stat(file);
    parts.push(`${file}:${s.mtimeMs}:${s.size}`);
  }
  return parts.sort().join('|');
}

async function loadChunks() {
  const files = await walk(KNOWLEDGE_ROOT);
  const signature = await buildSignature(files);
  if (cache.signature === signature) return cache.chunks;

  const chunks = [];
  for (const file of files) {
    const ext = extname(file).toLowerCase();
    const raw = await readFile(file, 'utf8');
    const rel = relative(PROJECT_ROOT, file);
    const fallbackTitle = rel.replace(/\.[^.]+$/, '');
    const domain = inferDomain(file);
    const docs = ext === '.json' ? parseJsonKnowledge(raw, fallbackTitle) : mdSections(raw, fallbackTitle);
    for (const doc of docs) {
      const tags = Array.isArray(doc.meta?.tags) ? doc.meta.tags : Array.isArray(doc.tags) ? doc.tags : String(doc.meta?.tags || doc.meta?.关键词 || '').split(/[,，、\s]+/).filter(Boolean);
      for (const [idx, piece] of splitLongText(doc.text).entries()) {
        const title = splitLongText(doc.text).length > 1 ? `${doc.title} (${idx + 1})` : doc.title;
        const terms = uniqueTerms(tokenize([title, tags.join(' '), piece].join('\n')));
        chunks.push({ id: `${rel}#${chunks.length + 1}`, domain, title, tags, source: rel, text: piece, terms });
      }
    }
  }
  cache = { signature, chunks };
  return chunks;
}

function domainMatches(chunk, domains) {
  if (!domains || domains.length === 0) return true;
  return domains.includes(chunk.domain) || domains.includes('all');
}

function scoreChunk(chunk, queryTerms, queryText) {
  if (!queryTerms.length) return 0;
  let score = 0;
  const title = chunk.title.toLowerCase();
  const haystack = `${chunk.title}\n${chunk.tags.join(' ')}\n${chunk.text}`.toLowerCase();
  const termSet = new Set(chunk.terms);
  for (const term of queryTerms) {
    if (termSet.has(term)) score += term.length >= 2 ? 3 : 0.6;
    if (title.includes(term)) score += 4;
    if (chunk.tags.some((tag) => String(tag).toLowerCase().includes(term))) score += 3;
    if (haystack.includes(term)) score += term.length >= 2 ? 1.5 : 0.2;
  }
  for (const phrase of queryText.split(/[\n,，。；;、]/).map((s) => s.trim()).filter((s) => s.length >= 2)) {
    if (haystack.includes(phrase.toLowerCase())) score += Math.min(8, phrase.length);
  }
  return score / Math.log2(8 + chunk.text.length / 80);
}

export async function retrieveKnowledge({ domain, domains, query, limit = DEFAULT_LIMIT, minScore = 0.1 } = {}) {
  const all = await loadChunks();
  const domainList = domains || (domain ? [domain] : []);
  const queryText = Array.isArray(query) ? query.filter(Boolean).join('\n') : String(query || '');
  const queryTerms = uniqueTerms(tokenize(queryText));
  return all
    .filter((chunk) => domainMatches(chunk, domainList))
    .map((chunk) => ({ ...chunk, score: scoreChunk(chunk, queryTerms, queryText) }))
    .filter((chunk) => chunk.score >= minScore)
    .sort((a, b) => b.score - a.score || a.text.length - b.text.length)
    .slice(0, limit);
}

export function formatKnowledge(chunks, { maxChars = Number(process.env.RAG_CONTEXT_CHARS || 3200) } = {}) {
  if (!chunks?.length) return '';
  const parts = [];
  let used = 0;
  for (const [i, chunk] of chunks.entries()) {
    const block = `[${i + 1}] ${chunk.title}\n来源:${chunk.source}\n领域:${chunk.domain}${chunk.tags?.length ? `\n标签:${chunk.tags.join('、')}` : ''}\n内容:${normalizeText(chunk.text)}`;
    if (used + block.length > maxChars && parts.length) break;
    parts.push(block);
    used += block.length;
  }
  return parts.join('\n\n---\n\n');
}

export async function getKnowledgeContext(opts) {
  const chunks = await retrieveKnowledge(opts);
  return { chunks, knowledge: formatKnowledge(chunks, opts) };
}

export async function knowledgeStats() {
  const chunks = await loadChunks();
  const domains = {};
  for (const chunk of chunks) domains[chunk.domain] = (domains[chunk.domain] || 0) + 1;
  return { root: KNOWLEDGE_ROOT, total: chunks.length, domains };
}
