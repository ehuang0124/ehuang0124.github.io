/* Shared, dependency-free historical context layer. Locations are representative sites,
   not battlefield extents. Kept separate from itinerary IDs and saved stamps. */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const EVENTS = [
    {id:'honnoji',map:'east-japan',region:'kinki',year:'1582',title:'本能寺之變',site:'京都・本能寺跡',lat:35.0065,lng:135.7525,dx:-24,dy:-22,note:'明智光秀襲擊織田信長。標記為當年本能寺所在的舊址，不是今日移建後的本能寺。',source:'https://ja.wikipedia.org/wiki/本能寺の変'},
    {id:'sekigahara',map:'east-japan',region:'chubu',year:'1600',title:'關原之戰',site:'岐阜・關原古戰場',lat:35.3734,lng:136.4546,dx:0,dy:-25,note:'德川家康的東軍擊敗石田三成等西軍，奠定德川政權的基礎。標記為決戰地一帶的代表點，並非整個戰場範圍。',source:'https://sekigahara.pref.gifu.lg.jp/'},
    {id:'osaka',map:'east-japan',region:'kinki',year:'1615',title:'大坂夏之陣',site:'大阪・大阪城',lat:34.6873,lng:135.5262,dx:10,dy:22,note:'德川軍與豐臣軍交戰，豐臣家滅亡。大阪城是事件的代表位置；戰鬥也發生在城外多處。',source:'https://www.osakacastle.net/'},
    {id:'perry',map:'east-japan',region:'kanto',year:'1853',title:'黑船來航',site:'神奈川・久里濱',lat:35.2221,lng:139.7154,dx:24,dy:23,note:'培里率艦隊進入浦賀，並在久里濱登陸遞交美國國書。此處標記久里濱登陸地一帶，不是下田的後續談判地。',source:'https://ja.wikipedia.org/wiki/黒船来航'},
    {id:'edo-opening',map:'east-japan',region:'kanto',year:'1868',title:'江戶城無血開城',site:'東京・江戶城跡',lat:35.6861,lng:139.7545,dx:22,dy:-22,note:'勝海舟與西鄉隆盛的談判促成江戶城交接。標記是江戶城跡，而非兩人談判的地點。',source:'https://ja.wikipedia.org/wiki/江戸開城'},
    {id:'shiroyama',map:'kyushu',region:'south',year:'1877',title:'城山之戰',site:'鹿兒島・城山',lat:31.5963,lng:130.5507,dx:-25,dy:-25,note:'西南戰爭的最後戰鬥，西鄉隆盛在此役身亡。以城山一帶為代表位置。',source:'https://ja.wikipedia.org/wiki/城山の戦い'},
    {id:'nagasaki-bomb',map:'kyushu',region:'north',year:'1945',title:'長崎原爆',site:'長崎・原爆落下中心地',lat:32.7736,lng:129.8632,dx:25,dy:-22,note:'8 月 9 日長崎遭原子彈攻擊，造成大量平民傷亡。標記為原爆落下中心地公園，不是南側的出島。',source:'https://nagasakipeace.jp/'},
    {id:'shuri-battle',map:'okinawa',region:'naha',view:'main',year:'1945',title:'沖繩戰役・首里戰線',site:'那霸・首里城一帶',lat:26.2170,lng:127.7190,dx:27,dy:-25,note:'首里一帶是沖繩戰役的重要戰線。首里城下設有日軍第 32 軍司令部壕；此點代表首里戰線，不代表整場沖繩戰役的範圍。',source:'https://www.peace-museum.okinawa.jp/'},
    {id:'mabuni',map:'okinawa',region:'south',view:'main',year:'1945',title:'沖繩戰役・摩文仁',site:'糸滿・摩文仁之丘',lat:26.0890,lng:127.7260,dx:28,dy:22,note:'6 月下旬日軍有組織抵抗在南部走向終結，平民傷亡慘重。6 月 23 日為沖繩「慰靈之日」，不表示當天所有戰鬥皆已停止。',source:'https://www.peace-museum.okinawa.jp/'}
  ];
  // Gateways along historical travel routes, NOT a claimed Kanto/Kansai shared border.
  const GATEWAYS = [
    {title:'箱根峠',label:'關東 ↔ 中部',lat:35.1895,lng:139.0120,dx:30,dy:28},
    {title:'不破關・關原',label:'中部 ↔ 近畿',lat:35.3500,lng:136.4630,dx:-45,dy:10},
    {title:'鈴鹿峠',label:'三重 ↔ 滋賀',lat:34.9005,lng:136.2970,dx:-42,dy:12}
  ];
  function node(tag, attrs, text) {
    const n = document.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([key, value]) => n.setAttribute(key, value));
    if (text) n.textContent = text;
    return n;
  }
  window.AtlasHistory = {
    events: EVENTS,
    mount(config) {
      const {svg, map, project, region, view, frame} = config;
      let historyOn = true, gatewaysOn = map === 'east-japan', selected = null;
      const layer = node('g', {'class':'history-layer', 'aria-label':'重大事件與地區過渡參考'});
      svg.append(layer);
      const panel = document.createElement('section');
      panel.className = 'history-panel';
      panel.setAttribute('aria-label', '歷史與地區參考');
      panel.innerHTML = '<h3>歷史與地區參考</h3><div class="history-controls">'
        + '<button type="button" data-history-toggle aria-pressed="true">◆ 重大事件（共九處）</button>'
        + (map === 'east-japan' ? '<button type="button" data-gateway-toggle aria-pressed="true">◇ 地區過渡參考</button>' : '')
        + '</div>'
        + '<div class="history-list"></div><div class="history-detail" role="status" aria-live="polite"></div>';
      config.host.append(panel);
      const toggle = panel.querySelector('[data-history-toggle]');
      const gatewayToggle = panel.querySelector('[data-gateway-toggle]');
      const detail = panel.querySelector('.history-detail');
      function available() {
        return EVENTS.filter(e => e.map === map && (!e.view || e.view === view()) && (region() === 'all' || e.region === region()));
      }
      function select(e, move) {
        selected = e.id;
        historyOn = true;
        toggle.setAttribute('aria-pressed', 'true');
        if (move) frame(e);
        update();
      }
      function marker(e, index, upp) {
        const [x, y] = project(e), vb=svg.viewBox.baseVal;
        let bx=x+e.dx*upp,by=y+e.dy*upp;
        // Keep callout badges inside the current frame only when their true site is visible.
        if(x>=vb.x&&x<=vb.x+vb.width&&y>=vb.y&&y<=vb.y+vb.height){
          bx=Math.max(vb.x+16*upp,Math.min(bx,vb.x+vb.width-16*upp));
          by=Math.max(vb.y+16*upp,Math.min(by,vb.y+vb.height-16*upp));
        }
        const labelLeft=bx+200*upp>vb.x+vb.width;
        const g = node('g', {'class':'history-marker', 'data-history-id':e.id, role:'button', tabindex:'0', 'aria-label':e.year+' '+e.title+'，'+e.site, 'aria-pressed':String(selected === e.id)});
        g.append(node('title', {}, e.year+' '+e.title+'｜'+e.site));
        g.append(node('line', {x1:x,y1:y,x2:bx,y2:by,'class':'history-leader'}));
        g.append(node('circle', {cx:x,cy:y,r:2*upp,'class':'history-origin'}));
        const badge = node('g', {transform:'translate('+bx+','+by+') scale('+upp+')'});
        badge.append(node('path', {d:'M0,-13 L13,0 L0,13 L-13,0 Z', 'class':'history-diamond'}));
        badge.append(node('text', {x:0,y:4,'text-anchor':'middle','class':'history-number'}, String(index+1)));
        badge.append(node('text', {x:labelLeft?-18:18,y:4,'text-anchor':labelLeft?'end':'start','class':'history-map-label'},e.year+' '+e.title));
        g.append(badge);
        // Stop map panning/capture so keyboard and pointer activation behave identically.
        g.addEventListener('pointerdown', ev => ev.stopPropagation());
        g.addEventListener('click', ev => {ev.stopPropagation();select(e,false);});
        g.addEventListener('keydown', ev => {if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();ev.stopPropagation();select(e,false);}});
        return g;
      }
      function update() {
        const focusedMarker=document.activeElement?.getAttribute('data-history-id');
        const focusedPick=document.activeElement?.getAttribute('data-history-pick');
        const entries = available();
        if (!entries.some(e => e.id === selected)) selected = null;
        layer.replaceChildren();
        const rect = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
        const upp = Math.max(vb.width/(rect.width||700),vb.height/(rect.height||500));
        if(gatewaysOn)[['關西（近畿）',35.95,135.9],['中部（東海）',35.95,137.6],['關東',35.95,139.7]].forEach(([label,lat,lng])=>{
          const [x,y]=project({lat,lng});
          layer.append(node('text',{x,y,'text-anchor':'middle','font-size':13*upp,'class':'gateway-label gateway-area'},label));
        });
        if (gatewaysOn) GATEWAYS.forEach(e => {
          const [x,y] = project(e);
          const g = node('g', {'class':'gateway-marker', 'pointer-events':'none'});
          g.append(node('line', {x1:x,y1:y,x2:x+e.dx*upp,y2:y+e.dy*upp,'class':'gateway-leader'}));
          g.append(node('path', {d:'M0,-6 L6,0 L0,6 L-6,0 Z',transform:'translate('+x+','+y+') scale('+upp+')','class':'gateway-diamond'}));
          const label = node('text', {x:x+e.dx*upp,y:y+e.dy*upp,'text-anchor':e.dx<0?'end':'start','font-size':11*upp,'class':'gateway-label'});
          label.append(node('tspan', {}, e.title));
          label.append(node('tspan', {x:x+e.dx*upp,dy:14*upp},e.label));
          g.append(label);layer.append(g);
        });
        if (historyOn) entries.forEach(e => layer.append(marker(e, EVENTS.indexOf(e), upp)));
        const list = panel.querySelector('.history-list');
        list.replaceChildren();
        entries.forEach(e => {
          const button = document.createElement('button');
          button.type='button';button.dataset.historyPick=e.id;
          button.setAttribute('aria-pressed',String(selected===e.id));
          button.textContent=(EVENTS.indexOf(e)+1)+'. '+e.year+'｜'+e.title+' · '+e.site;
          button.onclick=()=>select(e,true);
          list.append(button);
        });
        if (!entries.length) list.textContent='目前區域／地圖範圍沒有這九處精選事件，請選「全部區域」或切回沖繩本島。';
        detail.replaceChildren();
        const e = entries.find(e => e.id === selected);
        if (e) {
          const title=document.createElement('h4');title.textContent=e.year+'｜'+e.title;
          const body=document.createElement('p');body.textContent=e.site+'：'+e.note;
          const source=document.createElement('a');source.href=e.source;source.target='_blank';source.rel='noopener noreferrer';source.textContent='延伸閱讀 ↗';
          const maps=document.createElement('a');maps.href='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(e.lat+','+e.lng);maps.target='_blank';maps.rel='noopener noreferrer';maps.textContent='開啟代表位置 ↗';
          detail.append(title,body,source,document.createTextNode(' · '),maps);
        }
        if(focusedMarker)layer.querySelector('[data-history-id="'+focusedMarker+'"]')?.focus({preventScroll:true});
        else if(focusedPick)list.querySelector('[data-history-pick="'+focusedPick+'"]')?.focus({preventScroll:true});
      }
      toggle.onclick=()=>{historyOn=!historyOn;toggle.setAttribute('aria-pressed',String(historyOn));update();};
      if (gatewayToggle) gatewayToggle.onclick=()=>{gatewaysOn=!gatewaysOn;gatewayToggle.setAttribute('aria-pressed',String(gatewaysOn));update();};
      new ResizeObserver(update).observe(svg);
      update();
      return {update};
    }
  };
})();
