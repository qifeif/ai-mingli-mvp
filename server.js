/**
 * 最小 Web UI 服务(零依赖,Node 内置 http)
 * ------------------------------------------------------------
 * GET  /              → 落地页 public/landing.html(营销 + 定价)
 * GET  /app           → 解读工具 public/index.html
 * POST /api/consult   → 调用 runConsultation,返回解读 JSON
 *
 * 运行:  ANTHROPIC_API_KEY=sk-ant-... npm run web
 *        然后浏览器打开 http://localhost:3000
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { runConsultation } from './src/pipeline.js';
import { makeClient, hasModelConfig } from './src/llm.js';
import { computeChart } from './src/bazi.js';
import { recommendDirections, GOALS } from './src/bazhai.js';
import { analyzeFloorplan } from './src/fengshui.js';
import { castHexagram } from './src/liuyao.js';
import { runRenjiandao } from './src/renjiandao.js';
import { runZiwei, streamZiwei } from './src/ziwei.js';
import { runHehun } from './src/hehun.js';
import { streamChat, castHexagram as castHex } from './src/chat.js';
import { retrieveKnowledge, formatKnowledge, knowledgeStats } from './src/rag.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

// 复用同一个 client(避免每请求新建)
const client = hasModelConfig() ? makeClient() : null;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 12e6) req.destroy(); }); // 12MB,容户型图
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function sendJSON(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

// 简单静态路由表(只服务 public 下的 .html,零依赖)
const PAGES = {
  '/': 'landing.html',
  '/index.html': 'landing.html',
  '/landing.html': 'landing.html',
  '/app': 'index.html',
  '/app.html': 'index.html',
  // 地运(原地脉道):/diyun 为新名,/fengshui 保留为别名
  '/diyun': 'fengshui.html',
  '/diyun.html': 'fengshui.html',
  '/fengshui': 'fengshui.html',
  '/fengshui.html': 'fengshui.html',
  // 人间道(六爻)
  '/renjiandao': 'renjiandao.html',
  '/renjiandao.html': 'renjiandao.html',
  // 对话页
  '/chat': 'chat.html',
  '/chat.html': 'chat.html',
  // 登录 / 注册(前端占位,暂无真实后端账号体系)
  '/login': 'login.html',
  '/login.html': 'login.html',
  '/register': 'login.html',
  // 合参(双人八字对比)
  '/hehun': 'hehun.html',
  '/hehun.html': 'hehun.html',
  // 新中式风格预览(临时,定稿前不动 landing)
  '/preview': 'preview.html',
  '/preview.html': 'preview.html',
  // 全屏太极 + 光圈扩散预览(临时,转正前不动 landing)
  '/preview-taiji': 'preview-taiji.html',
  '/preview-taiji.html': 'preview-taiji.html',
  // 液态玻璃全流程预览(临时,转正前不动现役页)
  '/preview-app': 'preview-app.html',
  '/preview-app.html': 'preview-app.html',
  '/preview-diyun': 'preview-diyun.html',
  '/preview-diyun.html': 'preview-diyun.html',
  '/preview-renjiandao': 'preview-renjiandao.html',
  '/preview-renjiandao.html': 'preview-renjiandao.html',
  '/preview-chat': 'preview-chat.html',
  '/preview-chat.html': 'preview-chat.html',
  '/preview-hehun': 'preview-hehun.html',
  '/preview-hehun.html': 'preview-hehun.html',
  // 摇卦龟甲动效(800x800,3秒循环,白描黑底)
  '/preview-yaogua': 'preview-yaogua.html',
  '/preview-yaogua.html': 'preview-yaogua.html',
  // 星云太极流转(WebGL,中轴不动·星云内流,天然无缝循环)
  '/preview-nebula': 'preview-nebula.html',
  '/preview-nebula.html': 'preview-nebula.html',
  // 录制版:固定尺寸+外部逐帧驱动,用于导出无缝 mp4
  '/preview-nebula-record': 'preview-nebula-record.html',
  '/preview-nebula-record.html': 'preview-nebula-record.html',
  // 竖版长条背景(阴/阳两变体,9:16,WebGL 实时)
  '/preview-strip': 'preview-strip.html',
  '/preview-strip.html': 'preview-strip.html',
  // 星云太极滚动首页(阴/阳两版,?tone=yin|yang,固定背景+液态玻璃长页)
  '/preview-scroll': 'preview-scroll.html',
  '/preview-scroll.html': 'preview-scroll.html',
  // 竖版长条阴/阳对照页(现配置 vs 加强版,审查产出)
  '/preview-strip-compare': 'preview-strip-compare.html',
  '/preview-strip-compare.html': 'preview-strip-compare.html',
  // 预览索引页(汇总所有 preview-* 的导航入口)
  '/previews': 'previews-index.html',
  '/previews.html': 'previews-index.html',
  // anime.js 风格三道卡片动效(stagger 入场/spring 弹性/网格波纹/SVG 描边)
  '/preview-anime': 'preview-anime.html',
  '/preview-anime.html': 'preview-anime.html',
};

const server = createServer(async (req, res) => {
  try {
    // 页面路由匹配时剥掉查询串(?mode=&q=… 由前端读取),否则 /chat?x=y 不命中 PAGES['/chat']
    const pathOnly = req.url.split('?')[0];
    if (req.method === 'GET' && PAGES[pathOnly]) {
      const html = await readFile(join(__dirname, 'public', PAGES[pathOnly]));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    // 静态资源(css/svg/png/mp4 等),限定 public 目录,防目录穿越
    // 支持 GET/HEAD;视频等大文件支持 HTTP Range(206 分段),避免重播时缓冲卡顿
    if ((req.method === 'GET' || req.method === 'HEAD') && /^\/[\w./-]+\.(css|js|svg|png|jpe?g|webp|mp4|ico|woff2?)$/.test(req.url)) {
      const rel = req.url.replace(/^\/+/, '');
      const full = join(__dirname, 'public', rel);
      if (full.startsWith(join(__dirname, 'public'))) {
        try {
          const st = await stat(full);
          const ext = rel.split('.').pop();
          const TYPES = { css: 'text/css', js: 'text/javascript', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', mp4: 'video/mp4', ico: 'image/x-icon', woff: 'font/woff', woff2: 'font/woff2' };
          const type = TYPES[ext] || 'application/octet-stream';
          const range = req.headers.range;
          // 带 Range 的请求 → 206 分段流(视频 seek / 流式加载靠这个)
          if (range) {
            const m = /^bytes=(\d*)-(\d*)$/.exec(range);
            if (m) {
              let start = m[1] === '' ? null : parseInt(m[1], 10);
              let end = m[2] === '' ? st.size - 1 : parseInt(m[2], 10);
              if (start === null) { start = st.size - end; end = st.size - 1; }   // 后缀范围
              if (start > end || start < 0 || end >= st.size) {
                res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
                return res.end();
              }
              res.writeHead(206, {
                'Content-Type': type,
                'Content-Range': `bytes ${start}-${end}/${st.size}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': end - start + 1,
              });
              if (req.method === 'HEAD') return res.end();
              return createReadStream(full, { start, end }).pipe(res);
            }
          }
          // 无 Range → 整体返回(但仍声明 Accept-Ranges,让浏览器知道可分段)
          res.writeHead(200, {
            'Content-Type': type,
            'Content-Length': st.size,
            'Accept-Ranges': 'bytes',
          });
          if (req.method === 'HEAD') return res.end();
          return createReadStream(full).pipe(res);
        } catch { /* 落到 404 */ }
      }
    }

    // RAG 调试接口:查看资料是否被读取、某个问题能命中哪些知识片段(无需 Key)
    if (req.method === 'GET' && req.url === '/api/rag/stats') {
      return sendJSON(res, 200, await knowledgeStats());
    }

    if (req.method === 'POST' && req.url === '/api/rag/search') {
      const input = JSON.parse(await readBody(req) || '{}');
      const chunks = await retrieveKnowledge({
        domain: input.domain,
        domains: input.domains,
        query: input.query || input.question || '',
        limit: input.limit || 5,
      });
      return sendJSON(res, 200, {
        type: 'rag',
        count: chunks.length,
        chunks: chunks.map(({ id, domain, title, source, tags, score, text }) => ({ id, domain, title, source, tags, score, text })),
        knowledge: formatKnowledge(chunks),
      });
    }

    // 纯排盘接口:只跑 computeChart,零依赖 LLM / API Key,可独立调用
    if (req.method === 'POST' && req.url === '/api/chart') {
      const input = JSON.parse(await readBody(req) || '{}');
      if (!input.datetime || !input.gender) {
        return sendJSON(res, 400, { error: '缺少必填项:性别 / 出生时间' });
      }
      try {
        return sendJSON(res, 200, { type: 'chart', chart: computeChart(input) });
      } catch (e) {
        return sendJSON(res, 400, { error: `排盘失败:${e.message}` });
      }
    }

    // 天命 · 紫微斗数排盘:十二宫 + 三方四正(纯计算,无需 Key);带问题且有 Key 时叠加 AI 深化 + 危机前置
    if (req.method === 'POST' && req.url === '/api/ziwei') {
      const input = JSON.parse(await readBody(req) || '{}');
      if (!input.datetime || !input.gender) {
        return sendJSON(res, 400, { error: '缺少必填项:性别 / 出生时间' });
      }
      try {
        return sendJSON(res, 200, await runZiwei(client, input));
      } catch (e) {
        return sendJSON(res, 400, { error: `排盘失败:${e.message}` });
      }
    }

    // 天命排盘 · 两段式流式(SSE):命盘骨架秒出 → AI 深化逐字吐(审计#3:消解 11–22s 死等)
    if (req.method === 'POST' && req.url === '/api/ziwei/stream') {
      const input = JSON.parse(await readBody(req) || '{}');
      if (!input.datetime || !input.gender) {
        return sendJSON(res, 400, { error: '缺少必填项:性别 / 出生时间' });
      }
      res.writeHead(200, {
        'Content-Type':  'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
      });
      try {
        for await (const ev of streamZiwei(client, input)) {
          res.write(`data: ${JSON.stringify(ev)}\n\n`);
        }
      } catch (e) {
        // 骨架阶段(computeZiwei)抛错走这里:排盘失败当场吐 error 事件
        res.write(`data: ${JSON.stringify({ type: 'error', message: `排盘失败:${e.message}` })}\n\n`);
      }
      return res.end();
    }

    // 合参 · 双人八字对比:两盘四柱 + 日主/十神/地支/五行互补(纯计算,无需 Key);带问题且有 Key 时叠加 AI 深化 + 危机前置
    if (req.method === 'POST' && req.url === '/api/hehun') {
      const input = JSON.parse(await readBody(req) || '{}');
      if (!input.personA || !input.personB) {
        return sendJSON(res, 400, { error: '缺少必填项:两个人的出生信息(personA / personB)' });
      }
      try {
        return sendJSON(res, 200, await runHehun(client, input));
      } catch (e) {
        return sendJSON(res, 400, { error: `合参失败:${e.message}` });
      }
    }

    // 地脉道 · 方位推荐:本命卦+八方位(纯函数,无需Key);带户型图且有Key时叠加视觉解读
    if (req.method === 'POST' && req.url === '/api/fengshui') {
      const input = JSON.parse(await readBody(req) || '{}');
      if (!input.datetime || !input.gender) {
        return sendJSON(res, 400, { error: '缺少必填项:性别 / 出生年月' });
      }
      let rec;
      try {
        rec = recommendDirections(input);
      } catch (e) {
        return sendJSON(res, 400, { error: `排盘失败:${e.message}` });
      }
      const out = {
        type: 'fengshui',
        命卦: rec.命卦, 诉求: rec.诉求, 八方位: rec.八方位,
        吉方: rec.吉方, 凶方: rec.凶方, 首选: rec.首选, 诉求方位: rec.诉求方位, 摘要: rec.摘要,
      };
      // 有户型图 + 有 Key → 叠加视觉解读
      if (input.image && client) {
        try {
          const goal = GOALS.find((g) => g.key === input.goal) || GOALS[0];
          const fp = await analyzeFloorplan(client, {
            mingGua: rec.命卦, dirs: rec.八方位, goal,
            facing: input.facing, imageDataUrl: input.image, lang: input.lang,
          });
          // 解析成功 → 结构化字段(前端渲墨韵卡片);解析降级 → 原文交回老 mdRender 分支
          if (fp._fallback) out.户型解读 = fp.raw;
          else out.户型点评 = fp.vision;
        } catch (e) {
          out.户型解读错误 = `视觉解读失败:${e.message}`;
        }
      } else if (input.image && !client) {
        out.户型解读错误 = '户型图视觉解读需配置 ANTHROPIC_API_KEY 或 LLM_API_KEY;以下为本命卦方位通用指南。';
      }
      return sendJSON(res, 200, out);
    }

    // 人间道 · 起卦:模拟三枚铜钱摇六次(纯函数,无需 Key),返回本卦/动爻/变卦
    if (req.method === 'POST' && req.url === '/api/liuyao') {
      await readBody(req); // 可有可无的 body,读掉即可
      return sendJSON(res, 200, { type: 'liuyao', cast: castHexagram() });
    }

    // 人间道 · 解读:危机前置 → 用前端已摇 cast(或后端摇)→ 模型解读(需 Key)
    if (req.method === 'POST' && req.url === '/api/renjiandao') {
      if (!client) {
        return sendJSON(res, 500, { error: '服务端未配置 ANTHROPIC_API_KEY 或 LLM_API_KEY' });
      }
      const input = JSON.parse(await readBody(req) || '{}');
      if (!input.question) {
        return sendJSON(res, 400, { error: '缺少必填项:你要问的事' });
      }
      const result = await runRenjiandao(client, input);
      return sendJSON(res, 200, result);
    }

    // 对话聊天(流式 SSE)
    if (req.method === 'POST' && req.url === '/api/chat') {
      if (!client) {
        return sendJSON(res, 500, { error: '服务端未配置 LLM API Key' });
      }
      const body = JSON.parse(await readBody(req) || '{}');
      const { messages = [], profile, mode = 'suiwen', lang = 'zh' } = body;
      let { extras = {} } = body;

      // 人间道首轮自动起卦
      if (mode === 'renjiandao' && !extras.hexagram &&
          messages.filter(m => m.role === 'user').length <= 1) {
        extras = { ...extras, hexagram: castHex() };
      }

      res.writeHead(200, {
        'Content-Type':  'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
      });

      // 把起好的卦先发给前端（前端存入 session）
      if (extras.hexagram) {
        res.write(`data: ${JSON.stringify({ type: 'hexagram', data: extras.hexagram })}\n\n`);
      }

      try {
        for await (const chunk of streamChat(client, { messages, profile, mode, lang, extras })) {
          res.write(`data: ${JSON.stringify({ type: 'delta', text: chunk })}\n\n`);
        }
      } catch (e) {
        res.write(`data: ${JSON.stringify({ type: 'error', text: e.message })}\n\n`);
      }

      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      return res.end();
    }

    if (req.method === 'POST' && req.url === '/api/consult') {
      if (!client) {
        return sendJSON(res, 500, { error: '服务端未配置 ANTHROPIC_API_KEY 或 LLM_API_KEY' });
      }
      const input = JSON.parse(await readBody(req) || '{}');
      if (!input.question || !input.datetime || !input.gender) {
        return sendJSON(res, 400, { error: '缺少必填项:性别 / 出生时间 / 问题' });
      }
      const result = await runConsultation(client, input);
      return sendJSON(res, 200, result);
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  } catch (e) {
    console.error(e);
    sendJSON(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`\n  心易 MVP 已启动 →  http://localhost:${PORT}`);
  if (!client) console.warn('  ⚠ 未设置 ANTHROPIC_API_KEY / LLM_API_KEY,模型解读接口会报错。先配置 .env 再启动。\n');
});
