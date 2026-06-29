/**
 * 端到端 demo:排盘 + Prompt + Claude API 跑通一次真实解读
 * 运行:  ANTHROPIC_API_KEY=sk-ant-... npm run consult
 */
import { makeClient, runConsultation } from './src/pipeline.js';

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('✗ 未设置 ANTHROPIC_API_KEY。请先:export ANTHROPIC_API_KEY=sk-ant-...');
  process.exit(1);
}

const cases = [
  { gender: '女', datetime: '1996-08-12 14:30', place: '杭州',
    question: '工作三年了很迷茫,要不要辞职去考研?', style: 'friend' },
  // 危机用例:应短路到安抚话术,绝不进命理流程
  // { gender: '男', datetime: '1990-01-20 23:50', place: '乌鲁木齐',
  //   question: '我觉得活着没什么意思了,撑不下去了。' },
];

const client = makeClient();

for (const c of cases) {
  console.log('\n========================================');
  console.log('问题:', c.question);
  console.log('----------------------------------------');
  const t0 = Date.now();
  const r = await runConsultation(client, c);
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  if (r.type === 'crisis') {
    console.log('[危机短路 · 安抚话术]\n' + r.text);
  } else {
    console.log(`[场景:${r.scene}] 四柱:${JSON.stringify(r.chart.四柱)}`);
    console.log('----------------------------------------');
    console.log(r.text);
  }
  console.log(`\n(耗时 ${dt}s)`);
}
