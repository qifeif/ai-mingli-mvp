(() => {
  const CITY_DATA = [
    ['北京市', ['北京市']],
    ['上海市', ['上海市']],
    ['天津市', ['天津市']],
    ['重庆市', ['重庆市']],
    ['河北省', ['石家庄', '唐山', '秦皇岛', '邯郸', '邢台', '保定', '张家口', '承德', '沧州', '廊坊', '衡水']],
    ['山西省', ['太原', '大同', '阳泉', '长治', '晋城', '朔州', '晋中', '运城', '忻州', '临汾', '吕梁']],
    ['内蒙古自治区', ['呼和浩特', '包头', '乌海', '赤峰', '通辽', '鄂尔多斯', '呼伦贝尔', '巴彦淖尔', '乌兰察布', '兴安盟', '锡林郭勒盟', '阿拉善盟']],
    ['辽宁省', ['沈阳', '大连', '鞍山', '抚顺', '本溪', '丹东', '锦州', '营口', '阜新', '辽阳', '盘锦', '铁岭', '朝阳', '葫芦岛']],
    ['吉林省', ['长春', '吉林市', '四平', '辽源', '通化', '白山', '松原', '白城', '延边']],
    ['黑龙江省', ['哈尔滨', '齐齐哈尔', '鸡西', '鹤岗', '双鸭山', '大庆', '伊春', '佳木斯', '七台河', '牡丹江', '黑河', '绥化', '大兴安岭']],
    ['江苏省', ['南京', '无锡', '徐州', '常州', '苏州', '南通', '连云港', '淮安', '盐城', '扬州', '镇江', '泰州', '宿迁']],
    ['浙江省', ['杭州', '宁波', '温州', '嘉兴', '湖州', '绍兴', '金华', '衢州', '舟山', '台州', '丽水']],
    ['安徽省', ['合肥', '芜湖', '蚌埠', '淮南', '马鞍山', '淮北', '铜陵', '安庆', '黄山', '滁州', '阜阳', '宿州', '六安', '亳州', '池州', '宣城']],
    ['福建省', ['福州', '厦门', '莆田', '三明', '泉州', '漳州', '南平', '龙岩', '宁德']],
    ['江西省', ['南昌', '景德镇', '萍乡', '九江', '新余', '鹰潭', '赣州', '吉安', '宜春', '抚州', '上饶']],
    ['山东省', ['济南', '青岛', '淄博', '枣庄', '东营', '烟台', '潍坊', '济宁', '泰安', '威海', '日照', '临沂', '德州', '聊城', '滨州', '菏泽']],
    ['河南省', ['郑州', '开封', '洛阳', '平顶山', '安阳', '鹤壁', '新乡', '焦作', '濮阳', '许昌', '漯河', '三门峡', '南阳', '商丘', '信阳', '周口', '驻马店', '济源']],
    ['湖北省', ['武汉', '黄石', '十堰', '宜昌', '襄阳', '鄂州', '荆门', '孝感', '荆州', '黄冈', '咸宁', '随州', '恩施', '仙桃', '潜江', '天门', '神农架']],
    ['湖南省', ['长沙', '株洲', '湘潭', '衡阳', '邵阳', '岳阳', '常德', '张家界', '益阳', '郴州', '永州', '怀化', '娄底', '湘西']],
    ['广东省', ['广州', '韶关', '深圳', '珠海', '汕头', '佛山', '江门', '湛江', '茂名', '肇庆', '惠州', '梅州', '汕尾', '河源', '阳江', '清远', '东莞', '中山', '潮州', '揭阳', '云浮']],
    ['广西壮族自治区', ['南宁', '柳州', '桂林', '梧州', '北海', '防城港', '钦州', '贵港', '玉林', '百色', '贺州', '河池', '来宾', '崇左']],
    ['海南省', ['海口', '三亚', '三沙', '儋州', '五指山', '琼海', '文昌', '万宁', '东方', '定安', '屯昌', '澄迈', '临高', '白沙', '昌江', '乐东', '陵水', '保亭', '琼中']],
    ['四川省', ['成都', '自贡', '攀枝花', '泸州', '德阳', '绵阳', '广元', '遂宁', '内江', '乐山', '南充', '眉山', '宜宾', '广安', '达州', '雅安', '巴中', '资阳', '阿坝', '甘孜', '凉山']],
    ['贵州省', ['贵阳', '六盘水', '遵义', '安顺', '毕节', '铜仁', '黔西南', '黔东南', '黔南']],
    ['云南省', ['昆明', '曲靖', '玉溪', '保山', '昭通', '丽江', '普洱', '临沧', '楚雄', '红河', '文山', '西双版纳', '大理', '德宏', '怒江', '迪庆']],
    ['西藏自治区', ['拉萨', '日喀则', '昌都', '林芝', '山南', '那曲', '阿里']],
    ['陕西省', ['西安', '铜川', '宝鸡', '咸阳', '渭南', '延安', '汉中', '榆林', '安康', '商洛']],
    ['甘肃省', ['兰州', '嘉峪关', '金昌', '白银', '天水', '武威', '张掖', '平凉', '酒泉', '庆阳', '定西', '陇南', '临夏', '甘南']],
    ['青海省', ['西宁', '海东', '海北', '黄南', '海南州', '果洛', '玉树', '海西']],
    ['宁夏回族自治区', ['银川', '石嘴山', '吴忠', '固原', '中卫']],
    ['新疆维吾尔自治区', ['乌鲁木齐', '克拉玛依', '吐鲁番', '哈密', '昌吉', '博尔塔拉', '巴音郭楞', '阿克苏', '克孜勒苏', '喀什', '和田', '伊犁', '塔城', '阿勒泰', '石河子', '阿拉尔', '图木舒克', '五家渠', '北屯', '铁门关', '双河', '可克达拉', '昆玉', '胡杨河', '新星', '白杨']],
    ['香港', ['香港']],
    ['澳门', ['澳门']],
    ['台湾', ['台北', '新北', '桃园', '台中', '台南', '高雄', '基隆', '新竹', '嘉义', '新竹县', '苗栗', '彰化', '南投', '云林', '嘉义县', '屏东', '宜兰', '花莲', '台东', '澎湖', '金门', '连江']],
    ['海外', ['洛杉矶', '纽约', '伦敦', '巴黎', '柏林', '东京', '首尔', '新加坡', '曼谷', '悉尼', '墨尔本', '多伦多', '温哥华']],
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
