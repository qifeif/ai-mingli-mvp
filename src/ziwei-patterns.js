/**
 * 紫微 格局识别(规则版,离线即出,无需 API Key)
 * ------------------------------------------------------------
 * 输入 computeZiwei() 产出的命盘,输出命中的格局标签。
 * 规则移植自开源 ziwei-2.0 的 patterns.ts,但改读本项目的 iztro 数据结构
 * (十二宫[].地支 为地支字符;主星/辅星为 {名, 化:'lu'|'quan'|'ke'|'ji'})。
 *
 * 合规基调:凶格一律读作「这个阶段变动/风险偏大,宜稳」的提示,不作宿命断言。
 * 每条 level: excellent(资源足) | good(有倾向) | neutral | caution(宜留意)。
 */

const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const bIdx = (zhi) => BRANCHES.indexOf(zhi);

// ── 命盘访问小工具(全部基于本项目 chart 结构) ──────────────
function palaceByBranchIdx(chart, idx) {
  const zhi = BRANCHES[((idx % 12) + 12) % 12];
  return chart.十二宫.find((p) => p.地支 === zhi);
}
function majorNames(palace) {
  return palace ? palace.主星.map((s) => s.名) : [];
}
function findMajorPalace(chart, starName) {
  return chart.十二宫.find((p) => p.主星.some((s) => s.名 === starName));
}
function findAnyStarPalace(chart, starName) {
  return chart.十二宫.find(
    (p) => p.主星.some((s) => s.名 === starName) || p.辅星.some((s) => s.名 === starName),
  );
}
// 命宫三方四正的地支索引:命宫 / 财帛(+4) / 官禄(+8) / 迁移(+6 对宫)
function sanFangBranchIdx(chart) {
  const m = bIdx(chart.命宫地支);
  return [m, (m + 4) % 12, (m + 8) % 12, (m + 6) % 12];
}
function sanFangPalaces(chart) {
  const set = new Set(sanFangBranchIdx(chart));
  return chart.十二宫.filter((p) => set.has(bIdx(p.地支)));
}
// 某主星是否带某四化(化值为 'lu'|'quan'|'ke'|'ji')
function starMutagen(palace, starName) {
  return palace?.主星.find((s) => s.名 === starName)?.化 || '';
}

/**
 * 识别命盘格局
 * @param {object} chart computeZiwei() 返回的命盘
 * @returns {Array<{name,level,description,palaces:string[]}>}
 */
export function detectPatterns(chart) {
  const patterns = [];
  const mIdx = bIdx(chart.命宫地支);
  const mingPalace = palaceByBranchIdx(chart, mIdx);
  const mingStars = majorNames(mingPalace);
  const sanFang = sanFangPalaces(chart);
  const sanFangStars = sanFang.flatMap(majorNames);

  // 1. 紫府同宫
  const ziwei = findMajorPalace(chart, '紫微');
  const tianfu = findMajorPalace(chart, '天府');
  if (ziwei && tianfu && ziwei.地支 === tianfu.地支) {
    patterns.push({
      name: '紫府同宫',
      level: 'excellent',
      description: '紫微天府同宫,帝相并临,福禄偏稳厚。倾向品行端正、衣食少忧,有担纲要职的资源与定见——把它当底色,别当保证。',
      palaces: [ziwei.宫],
    });
  }

  // 2. 杀破狼(三方见其二)
  const shaPo = ['七杀', '破军', '贪狼'];
  if (shaPo.filter((s) => sanFangStars.includes(s)).length >= 2) {
    patterns.push({
      name: '杀破狼格',
      level: 'good',
      description: '七杀破军贪狼入命三方,偏开创进取、变动多、爱闯荡,适合创业/军警/业务等需要冲劲的路径;这个基调下晚年更宜守成,别一路猛冲到底。',
      palaces: sanFang.filter((p) => majorNames(p).some((s) => shaPo.includes(s))).map((p) => p.宫),
    });
  }

  // 3. 机月同梁(三方见其三)
  const jyl = ['天机', '太阴', '天同', '天梁'];
  if (jyl.filter((s) => sanFangStars.includes(s)).length >= 3) {
    patterns.push({
      name: '机月同梁格',
      level: 'good',
      description: '天机太阴天同天梁聚于命迁财官,偏聪慧善谋、文质温和,适合公教/学术/文艺/服务,稳中求发展多为上策。',
      palaces: sanFang.filter((p) => majorNames(p).some((s) => jyl.includes(s))).map((p) => p.宫),
    });
  }

  // 4. 廉贞天相同宫
  const lian = findMajorPalace(chart, '廉贞');
  const xiang = findMajorPalace(chart, '天相');
  if (lian && xiang && lian.地支 === xiang.地支) {
    patterns.push({
      name: '廉贞天相',
      level: 'good',
      description: '廉贞天相同宫,印绶格局,偏秉公处事,宜行政/管理/法务类路径,常有贵人相助。',
      palaces: [lian.宫],
    });
  }

  // 5. 武曲七杀同宫
  const wuqu = findMajorPalace(chart, '武曲');
  const qisha = findMajorPalace(chart, '七杀');
  if (wuqu && qisha && wuqu.地支 === qisha.地支) {
    const inSanFang = sanFang.some((p) => p.地支 === wuqu.地支);
    patterns.push({
      name: '武曲七杀',
      level: inSanFang ? 'excellent' : 'good',
      description: '武曲七杀同宫,将星配财星,偏果决刚毅、理财力强,适合金融/军警/创业,多在奋斗中积财。',
      palaces: [wuqu.宫],
    });
  }

  // 6. 天同天梁同宫
  const tong = findMajorPalace(chart, '天同');
  const liang = findMajorPalace(chart, '天梁');
  if (tong && liang && tong.地支 === liang.地支) {
    patterns.push({
      name: '天同天梁',
      level: 'good',
      description: '天同天梁同宫,偏宽厚和善、乐于助人,宜医疗/教育/公益等荫庇他人的方向。',
      palaces: [tong.宫],
    });
  }

  // 7. 日月同宫 / 日月夹命
  const sun = findMajorPalace(chart, '太阳');
  const moon = findMajorPalace(chart, '太阴');
  if (sun && moon) {
    if (sun.地支 === moon.地支) {
      patterns.push({
        name: '日月同宫',
        level: 'good',
        description: '太阳太阴同宫,阴阳并照,偏文武兼备、异性缘佳,做事较易左右逢源。',
        palaces: [sun.宫],
      });
    } else if ((bIdx(sun.地支) + 6) % 12 === bIdx(moon.地支)) {
      const inMing = bIdx(sun.地支) === mIdx || bIdx(moon.地支) === mIdx;
      if (inMing) {
        patterns.push({
          name: '日月夹命',
          level: 'excellent',
          description: '太阳太阴分居命宫两侧夹照,偏光明磊落、贵人相助,事业与家运多有托底。',
          palaces: [sun.宫, moon.宫],
        });
      }
    }
  }

  // 8. 紫微入命(独坐,不与天府同宫)
  if (mingStars.includes('紫微') && !mingStars.includes('天府')) {
    patterns.push({
      name: '紫微入命',
      level: 'excellent',
      description: '紫微独坐命宫,帝王之星,偏有领导魅力、自尊心强,适合独当一面;高处易孤,记得听人言。',
      palaces: ['命宫'],
    });
  }

  // 9. 贪狼化禄
  const tan = findMajorPalace(chart, '贪狼');
  if (tan && starMutagen(tan, '贪狼') === 'lu') {
    patterns.push({
      name: '贪狼化禄',
      level: bIdx(tan.地支) === mIdx ? 'excellent' : 'good',
      description: '贪狼化禄,桃花带财,偏魅力出众、才艺多样、人脉旺,事业多由人际拓展——借势也别贪多。',
      palaces: [tan.宫],
    });
  }

  // 10. 化忌入命 / 入迁(caution:读作"宜留意",非坏运)
  const qianIdx = (mIdx + 6) % 12;
  for (const p of chart.十二宫) {
    const idx = bIdx(p.地支);
    if (idx === mIdx || idx === qianIdx) {
      const ji = p.主星.find((s) => s.化 === 'ji');
      if (ji) {
        patterns.push({
          name: `${ji.名}化忌入${p.宫.replace('宫', '')}`,
          level: 'caution',
          description:
            idx === mIdx
              ? `${ji.名}化忌坐命宫,提示自身个性上易有固执或心结,凡事宜退一步想清再动。化忌不等于坏,是这颗星的能量需要你特别照看。`
              : `${ji.名}化忌坐迁移(对冲命宫),提示外出/异地/人际上易有波折,这个阶段宜守不宜躁。化忌是需要留意的信号,不是定数。`,
          palaces: [p.宫],
        });
      }
    }
  }

  // 11. 左辅右弼夹命
  const zuo = findAnyStarPalace(chart, '左辅');
  const you = findAnyStarPalace(chart, '右弼');
  if (zuo && you) {
    const left = (mIdx + 1) % 12;
    const right = (mIdx + 11) % 12;
    const zi = bIdx(zuo.地支);
    const yi = bIdx(you.地支);
    if ((zi === left && yi === right) || (yi === left && zi === right)) {
      patterns.push({
        name: '辅弼夹命',
        level: 'excellent',
        description: '左辅右弼夹命宫,偏贵人不断、逢凶化吉,适合走组织/大企业/仕途,常有人提携。',
        palaces: ['命宫', zuo.宫, you.宫],
      });
    }
  }

  return patterns;
}
