# 心易设计系统 · 墨韵 Ink Luxe（全站唯一真源）

> 概念:山水为底、宣纸为面、墨为骨、**朱砂为魂**。液态玻璃卡片浮于雾气之上,一点朱砂是全站唯一暖色(印章红);一切交互如墨入水——柔、匀、有余韵。
> 本文件是全站视觉唯一真源。改任何页面前先读这里;页面级例外写进 `design-system/pages/<页名>.md`。

## 0. 铁律(违反即打回)

1. **功能不变**:表单 name/id、fetch 调用、API 契约、i18n 键与切换逻辑、四化/吉凶/动爻等功能色语义、危机态文案展示——一律不动。只允许:加 class、加装饰性节点(aria-hidden)、改样式、引入 `/fx.js`。
2. **对比度**:正文 ≥4.5:1;玻璃卡在浅色底上背景不透明度 ≥.70;禁用 --faint 之下更浅的正文色。
3. **动效**:只用 transform/opacity;150–300ms 微交互、320ms 显现、560ms 仪式感(hero/落印);全部受 `prefers-reduced-motion` 约束(fx.js 已处理,CSS 侧动画要带 @media 关)。
4. **禁 emoji 当图标**,一律内联 SVG(stroke=currentColor, viewBox 24, aria-hidden="true")。
5. 触控目标 ≥44px;所有可点元素 cursor:pointer + 可见 focus-visible 环。
6. 移动端 375px 无横向溢出;z-index 走刻度:-2 山水 / -1 纹理雾 / 10 内容 / 30 nav / 50 弹层 / 60 墨迹画布。

## 1. Token(theme.css 已定义,landing/chat 内联时抄同值)

- 底:`--bg #EDF1EF` `--bg-2 #E1E8E7`;墨字分层 `--ink #26343B` `--ink-strong #1F2B31` `--muted #526872` `--faint #697B82`
- **朱砂(全站唯一暖色)**:`--cinnabar #A6402F`,soft `rgba(166,64,47,.10)`;仅用于:印章、主 CTA、focus 环、激活态、命宫框、关键角标。大面积禁用。
- 金线(极少量):`--gilt #A8834C`,只做 hover 发丝线与分隔线提亮,不做底色。
- 玻璃:`--glass rgba(250,251,249,.74)` + `backdrop-filter: blur(14px) saturate(1.05)`;发丝线 `--line`。
- 动效:`--ease cubic-bezier(.22,.61,.36,1)`;`--dur-1 .18s` `--dur-2 .32s` `--dur-3 .56s`。
- 字体/圆角/阴影沿用 theme.css 现值。

## 2. 组件规范(theme.css 已实现,类名即约定)

- **主按钮 `.btn-ink`**:墨玉底(--ink-strong)白字、胶囊、文字前**朱砂印点**(::before 8px 圆点);hover 微升 1px + 光泽扫过(sheen);active 缩 .985 + **墨晕涟漪**(fx.js 写 --rx/--ry,.rippling 触发);loading 态加 `.loading`(三墨点跳动,自动禁点)。
- **次按钮 `.btn-paper`**:宣纸底发丝描边,hover 墨染 6%。
- **幽灵 `.btn-ghost2`**:无底,hover 出发丝线。
- **玻璃卡 `.glass`**:玻璃底+发丝线+`--shadow-soft`;hover(可选加 `.lift`)升 3px、线转金。
- **输入 `.field` 内 input/select/textarea**:focus 时**朱砂底线从左扫满**(background-size 过渡)+ 1px 朱砂外环。
- **滚动显现**:元素加 `.reveal`(初始下移 14px 透明,入视口 .in);父容器加 `.reveal-group` 子元素自动 70ms 级差。fx.js 负责。
- **印章 `.seal-pulse`**:入场一次"落印"(scale 1.08→1 + 透明度),用于 hero 朱砂印。
- 骨架/等待:`.ink-dots`(三点墨跳)可独立用于结果区等待占位。

## 3. 每道专属纹样(SVG,currentColor,页内 hero 或侧栏「这一道」卡用)

- 天命/紫微:**星环**——同心双圆 + 12 刻度点 + 三连星线。
- 地运/八宅:**罗盘玫瑰**——八向罗盘针 + 内八角。
- 人间道/六爻:**卦爻**——六横爻(两断四连随意错落)。
- 合参:**双环相扣**——两圆相交,交叠区加一点朱砂。
- 对话:**墨滴涟漪**——同心三弧。
线宽 1.5,尺寸 56–88px,颜色 var(--muted),hover 转 var(--cinnabar),装饰性一律 aria-hidden。

## 4. 页面骨架约定

- nav:玻璃霜化 sticky;滚动 >24px 后 fx.js 加 `.scrolled`(阴影+底线出现)。
- landing hero:山水上 1/3 做底,主标逐字浮现(span 级差 60ms),朱砂印 `.seal-pulse` 落印,副文/三才行 reveal 级差。
- 工具页:hero 编辑式标题 + 道纹样;表单卡玻璃化;结果区出现时整块 reveal;提交按钮统一 `.btn-ink`(loading 态接现有禁用逻辑,不改 JS 流程,只加视觉)。
- chat:侧栏与气泡玻璃化;AI 气泡等待 = `.ink-dots`;发送键 `.btn-ink` 圆形变体。

## 5. 验收清单(每页)

- [ ] 1280 与 375 双视口无横向溢出、console 零错误
- [ ] 主流程可跑(该页核心提交/交互)
- [ ] focus-visible 环可见;reduced-motion 下页面静止但完整
- [ ] 玻璃卡内文字对比度目测过关(疑虑就加纱)
- [ ] 无 emoji 图标;装饰 SVG aria-hidden
