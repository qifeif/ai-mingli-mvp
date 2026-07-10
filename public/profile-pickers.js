(() => {
  const CITY_DATA = [
    ['北京市', ['北京市']],
    ['上海市', ['上海市']],
    ['天津市', ['天津市']],
    ['重庆市', ['重庆市']],
    ['浙江省', ['杭州', '宁波', '温州', '绍兴', '嘉兴', '湖州', '金华', '台州']],
    ['江苏省', ['南京', '苏州', '无锡', '常州', '南通', '扬州', '徐州']],
    ['广东省', ['广州', '深圳', '佛山', '东莞', '珠海', '汕头']],
    ['福建省', ['福州', '厦门', '泉州', '漳州', '莆田']],
    ['山东省', ['济南', '青岛', '烟台', '潍坊', '临沂']],
    ['四川省', ['成都', '绵阳', '德阳', '乐山', '宜宾']],
    ['湖北省', ['武汉', '宜昌', '襄阳', '荆州']],
    ['湖南省', ['长沙', '株洲', '湘潭', '衡阳', '岳阳']],
    ['河南省', ['郑州', '洛阳', '开封', '南阳']],
    ['河北省', ['石家庄', '唐山', '保定', '邯郸']],
    ['安徽省', ['合肥', '芜湖', '蚌埠', '安庆']],
    ['江西省', ['南昌', '九江', '赣州', '景德镇']],
    ['陕西省', ['西安', '咸阳', '宝鸡', '渭南']],
    ['山西省', ['太原', '大同', '临汾', '运城']],
    ['辽宁省', ['沈阳', '大连', '鞍山', '锦州']],
    ['吉林省', ['长春', '吉林市', '延吉']],
    ['黑龙江省', ['哈尔滨', '齐齐哈尔', '牡丹江']],
    ['云南省', ['昆明', '大理', '丽江', '曲靖']],
    ['贵州省', ['贵阳', '遵义', '安顺']],
    ['广西壮族自治区', ['南宁', '桂林', '柳州', '北海']],
    ['海南省', ['海口', '三亚']],
    ['甘肃省', ['兰州', '天水', '酒泉']],
    ['青海省', ['西宁']],
    ['内蒙古自治区', ['呼和浩特', '包头', '鄂尔多斯']],
    ['宁夏回族自治区', ['银川']],
    ['新疆维吾尔自治区', ['乌鲁木齐', '喀什', '伊犁']],
    ['西藏自治区', ['拉萨', '日喀则']],
    ['香港', ['香港']],
    ['澳门', ['澳门']],
    ['台湾', ['台北', '高雄', '台中', '台南']],
    ['海外', ['洛杉矶', '纽约', '伦敦', '东京', '新加坡', '悉尼']],
  ];

  const state = { input: null, province: 4, city: 0 };
  const labels = () => {
    const en = (document.documentElement.lang || '').startsWith('en');
    return en
      ? { title: 'Birth City', search: 'Search province/city', cancel: 'Cancel', manual: 'Type myself', ok: 'Done', pick: 'Pick', manualPrompt: 'Type a city name' }
      : { title: '出生城市', search: '输入省市关键词快速定位', cancel: '取消', manual: '手工输入', ok: '确定', pick: '选择', manualPrompt: '请输入城市名称' };
  };

  function injectStyle() {
    if (document.getElementById('xy-city-style')) return;
    const css = document.createElement('style');
    css.id = 'xy-city-style';
    css.textContent = `
      .xy-city-field{display:block;width:100%;}
      .xy-city-field>input[data-city-picker]{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important;clip:rect(0 0 0 0)!important;}
      .xy-city-btn{width:100%;min-height:46px;border:1px solid var(--line);border-radius:11px;background:rgba(250,251,249,.72);color:var(--muted);font:inherit;font-size:15px;cursor:pointer;text-align:center;padding:0 16px;transition:border-color var(--dur-1,.18s) var(--ease,ease),color var(--dur-1,.18s) var(--ease,ease),background var(--dur-1,.18s) var(--ease,ease);}
      .xy-city-btn.has-city{background:var(--bg-2);color:var(--ink);font-family:var(--serif,"Songti SC",serif);font-size:17px;text-align:left;}
      .xy-city-btn:hover{color:var(--ink);border-color:rgba(166,64,47,.38);background:rgba(250,251,249,.92);}
      .xy-city-ov{position:fixed;inset:0;z-index:320;display:none;align-items:center;justify-content:center;padding:22px;background:rgba(31,43,49,.42);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);}
      .xy-city-ov.open{display:flex;}
      .xy-city-panel{width:min(680px,100%);border:1px solid var(--line);border-radius:18px;background:rgba(247,249,246,.94);box-shadow:0 22px 70px -42px rgba(31,43,49,.75);padding:22px;}
      .xy-city-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;}
      .xy-city-head h3{margin:0;font-family:var(--serif,"Songti SC",serif);font-size:20px;letter-spacing:3px;color:var(--ink-strong);}
      .xy-city-x{width:34px;height:34px;border-radius:50%;border:1px solid var(--line);background:var(--bg-2);color:var(--muted);font-size:18px;cursor:pointer;}
      .xy-city-search{display:flex;gap:10px;margin-bottom:14px;}
      .xy-city-search input{width:100%;border:1px solid var(--line);border-radius:10px;background:var(--bg-2);color:var(--ink);font:inherit;font-size:15px;padding:12px 14px;}
      .xy-city-search button{flex:none;min-width:54px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--muted);font:inherit;cursor:pointer;}
      .xy-city-wheels{position:relative;display:grid;grid-template-columns:1fr 1.2fr;gap:0;border:1px solid var(--line);border-radius:15px;background:rgba(225,232,231,.78);overflow:hidden;box-shadow:inset 0 18px 32px rgba(255,255,255,.38),inset 0 -18px 32px rgba(38,52,59,.08);}
      .xy-city-wheels::before,.xy-city-wheels::after{content:"";position:absolute;left:0;right:0;height:1px;background:rgba(166,64,47,.42);z-index:2;}
      .xy-city-wheels::before{top:82px}.xy-city-wheels::after{top:123px}
      .xy-city-col{height:205px;overflow:auto;scroll-snap-type:y mandatory;padding:82px 0;scrollbar-width:none;border-right:1px solid var(--line);}
      .xy-city-col:last-child{border-right:0;}
      .xy-city-col::-webkit-scrollbar{display:none;}
      .xy-city-item{height:41px;display:flex;align-items:center;justify-content:center;text-align:center;padding:0 12px;color:var(--faint);font-size:15px;scroll-snap-align:center;cursor:pointer;white-space:nowrap;}
      .xy-city-item.on{color:var(--ink-strong);font-family:var(--serif,"Songti SC",serif);font-size:19px;}
      .xy-city-actions{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:16px;}
      .xy-city-actions button{min-height:46px;border-radius:11px;border:1px solid var(--line);font:inherit;font-size:15px;letter-spacing:2px;cursor:pointer;background:var(--card);color:var(--muted);}
      .xy-city-actions .ok{background:var(--ink-strong);color:#F4F1EA;border-color:transparent;}
      @media(max-width:560px){.xy-city-ov{padding:14px}.xy-city-panel{padding:18px}.xy-city-btn{min-height:42px}.xy-city-item.on{font-size:17px}.xy-city-actions{grid-template-columns:1fr;}}
    `;
    document.head.appendChild(css);
  }

  function buildModal() {
    if (document.getElementById('xy-city-ov')) return;
    const L = labels();
    const ov = document.createElement('div');
    ov.className = 'xy-city-ov';
    ov.id = 'xy-city-ov';
    ov.innerHTML = `
      <div class="xy-city-panel" role="dialog" aria-modal="true" aria-labelledby="xy-city-title">
        <div class="xy-city-head"><h3 id="xy-city-title">${L.title}</h3><button type="button" class="xy-city-x" aria-label="Close">×</button></div>
        <div class="xy-city-search"><input id="xy-city-search" type="text" placeholder="${L.search}"/><button type="button" id="xy-city-find">⌕</button></div>
        <div class="xy-city-wheels">
          <div class="xy-city-col" id="xy-prov" tabindex="0" role="listbox"></div>
          <div class="xy-city-col" id="xy-city" tabindex="0" role="listbox"></div>
        </div>
        <div class="xy-city-actions">
          <button type="button" id="xy-city-cancel">${L.cancel}</button>
          <button type="button" id="xy-city-manual">${L.manual}</button>
          <button type="button" class="ok" id="xy-city-ok">${L.ok}</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
    ov.querySelector('.xy-city-x').addEventListener('click', close);
    ov.querySelector('#xy-city-cancel').addEventListener('click', close);
    ov.querySelector('#xy-city-manual').addEventListener('click', () => {
      const input = state.input;
      const value = window.prompt(labels().manualPrompt, input?.value || '');
      if (value != null && value.trim() && input) setInputValue(input, value.trim());
      close();
    });
    ov.querySelector('#xy-city-ok').addEventListener('click', commit);
    ov.querySelector('#xy-city-find').addEventListener('click', search);
    ov.querySelector('#xy-city-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ov.classList.contains('open')) close(); });
  }

  function col(id) { return document.getElementById(id); }
  function renderProv() {
    col('xy-prov').innerHTML = CITY_DATA.map((p, i) => `<div class="xy-city-item${i === state.province ? ' on' : ''}" data-i="${i}">${p[0]}</div>`).join('');
    bindCol(col('xy-prov'), (i) => { state.province = i; state.city = 0; renderProv(); renderCity(); snap('xy-prov', i); });
    snap('xy-prov', state.province);
  }
  function renderCity() {
    const cities = CITY_DATA[state.province][1];
    col('xy-city').innerHTML = cities.map((c, i) => `<div class="xy-city-item${i === state.city ? ' on' : ''}" data-i="${i}">${c}</div>`).join('');
    bindCol(col('xy-city'), (i) => { state.city = i; renderCity(); snap('xy-city', i); });
    snap('xy-city', state.city);
  }
  function bindCol(el, set) {
    el.onclick = (e) => { const item = e.target.closest('.xy-city-item'); if (item) set(Number(item.dataset.i)); };
    let timer = null;
    el.onscroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const idx = Math.max(0, Math.min(el.children.length - 1, Math.round(el.scrollTop / 41)));
        set(idx);
      }, 120);
    };
  }
  function snap(id, idx) {
    const el = col(id);
    if (!el) return;
    el.scrollTop = idx * 41;
  }
  function locate(value) {
    const text = String(value || '');
    for (let p = 0; p < CITY_DATA.length; p++) {
      const [prov, cities] = CITY_DATA[p];
      const c = cities.findIndex((name) => text.includes(name) || name.includes(text));
      if (text.includes(prov) || c >= 0) return { p, c: c >= 0 ? c : 0 };
    }
    return { p: 4, c: 0 };
  }
  function search() {
    const q = document.getElementById('xy-city-search').value.trim();
    if (!q) return;
    const found = locate(q);
    state.province = found.p; state.city = found.c;
    renderProv(); renderCity();
  }
  function open(input) {
    state.input = input;
    const found = locate(input.value);
    state.province = found.p; state.city = found.c;
    const L = labels();
    document.getElementById('xy-city-title').textContent = L.title;
    document.getElementById('xy-city-search').placeholder = L.search;
    document.getElementById('xy-city-cancel').textContent = L.cancel;
    document.getElementById('xy-city-manual').textContent = L.manual;
    document.getElementById('xy-city-ok').textContent = L.ok;
    renderProv(); renderCity();
    document.getElementById('xy-city-ov').classList.add('open');
    setTimeout(() => document.getElementById('xy-city-search')?.focus(), 20);
  }
  function close() {
    document.getElementById('xy-city-ov')?.classList.remove('open');
  }
  function updateButton(input) {
    const btn = document.querySelector(`[data-city-target="${input.id}"]`);
    if (!btn) return;
    const value = input.value.trim();
    btn.textContent = value || labels().pick;
    btn.classList.toggle('has-city', !!value);
  }
  function setInputValue(input, value) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    updateButton(input);
  }
  function commit() {
    if (!state.input) return close();
    setInputValue(state.input, CITY_DATA[state.province][1][state.city]);
    close();
  }
  function init() {
    injectStyle();
    buildModal();
    document.querySelectorAll('[data-city-picker]').forEach((input) => {
      const btn = document.querySelector(`[data-city-target="${input.id}"]`);
      if (!btn) return;
      btn.removeAttribute('data-i18n');
      updateButton(input);
      input.addEventListener('input', () => updateButton(input));
      input.addEventListener('change', () => updateButton(input));
      btn.addEventListener('click', () => open(input));
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  window.XYCityPicker = { open };
})();
