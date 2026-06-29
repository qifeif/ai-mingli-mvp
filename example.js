/**
 * 排盘引擎演示
 * 运行:  npm install && npm run demo
 */
import { computeChart } from './src/bazi.js';

const cases = [
  { gender: '女', datetime: '1996-08-12 14:30', place: '杭州' },
  { gender: '男', datetime: '1990-01-20 23:50', place: '乌鲁木齐' }, // 测时区+时辰交界
  { gender: '男', datetime: '1988-05-05 06:15', longitude: 116.41 }, // 直接给经度
];

for (const c of cases) {
  console.log('\n========================================');
  console.log('输入:', JSON.stringify(c));
  console.log('----------------------------------------');
  const chart = computeChart(c);
  console.log(JSON.stringify(chart, null, 2));
}
