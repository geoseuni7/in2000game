

const $=id=>document.getElementById(id);const won=n=>'₩'+Math.round(n||0).toLocaleString('ko-KR');
let assets=[],assetById=new Map(),monthFiles=new Map(),priceCache=new Map(),priceIndex=new Map(),month='2000-01',cash=100000,initial=100000,holdings={},history=[],selected=null,months=[],allRows=0,gameFinished=false,finalRevealList=[],finalRevealIndex=0;
function parseCSV(text){let rows=[],row=[],s='',q=false;for(let i=0;i<text.length;i++){let c=text[i];if(q){if(c==='"'&&text[i+1]==='"'){s+='"';i++}else if(c==='"')q=false;else s+=c}else{if(c==='"')q=true;else if(c===','){row.push(s);s=''}else if(c==='\n'){row.push(s.replace(/\r$/,''));if(row.some(x=>x!==''))rows.push(row);row=[];s=''}else s+=c}}if(s!==''||row.length){row.push(s.replace(/\r$/,''));rows.push(row)}if(!rows.length)return[];let h=rows.shift();return rows.map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])))}
function monthKey(s){return String(s||'').slice(0,7)}
const CLASS_LABELS={US_STOCK:'미국 주식',KR_STOCK:'한국 주식',US_ETF:'미국 ETF',KR_ETF:'한국 ETF',US_ETN:'미국 ETN',CRYPTO_SPOT:'가상자산 · 현물',CRYPTO_PERP_FUTURES:'가상자산 · 선물/무기한',INDEX:'시장 지수',FX:'환율',METAL_PROXY:'금속 관련'};
function classLabel(c){return CLASS_LABELS[c]||c||'기타'}
function priceKRW(p){let n=Number(p.close);if(!Number.isFinite(n))return 0;return String(p.currency||'USD').toUpperCase()==='KRW'?n:n*1000}
function priceFor(id,m=month){return m===month?(priceIndex.get(id)||null):null}
function currentPrice(id){let p=priceFor(id);if(p&&Number(p.close)>0)return priceKRW(p);let h=holdings[id];return h?.lastPrice||0}
function totalEquity(){return cash+Object.entries(holdings).reduce((s,[id,h])=>s+h.qty*currentPrice(id),0)}
function monthAssets(){return assets.filter(a=>monthKey(a.first_valid_month)<=month&&monthKey(a.first_valid_month)>='2000-01')}

// 가상 미래 뉴스 생성기: 현재 월의 실제 가격 기록이 있는 종목에서 20개를 무작위 선택한다.
let monthlyNews=new Map();
const newsTopics={
  US_STOCK:[
    {type:'실적 전망',pos:'주요 사업부의 주문 흐름이 예상보다 견조하다는 분석이 나오며, 시장은 다음 분기 매출 가이던스 상향 가능성을 주시하고 있다.',neg:'주요 고객사의 발주 시점이 늦춰질 수 있다는 관측이 나오며, 시장은 다음 분기 매출 가이던스의 하향 위험을 점검하고 있다.',neutral:'시장 컨센서스가 엇갈리는 가운데 투자자들은 다음 분기 실적 발표에서 매출 구성과 이익률 추이를 확인하려는 분위기다.'},
    {type:'애널리스트 코멘트',pos:'일부 분석가는 제품 믹스 개선과 비용 통제를 근거로 수익성 회복 여지가 있다고 평가했다.',neg:'일부 분석가는 경쟁 심화와 비용 부담을 이유로 이익 추정치가 추가 조정될 가능성을 제기했다.',neutral:'분석가들은 현 주가에 반영된 기대 수준이 높아졌는지와 향후 실적 가시성을 함께 살펴야 한다고 언급했다.'},
    {type:'수요 동향',pos:'유통 채널의 재고가 정상화되고 재주문 문의가 늘어나는 조짐이 포착돼 수요 회복 기대가 부각됐다.',neg:'유통 채널의 재고 조정이 길어질 수 있다는 전망이 나오면서 단기 출하량에 대한 경계감이 커졌다.',neutral:'수요 지표가 지역별로 엇갈려 회복 여부를 단정하기 어렵다는 신중론이 우세하다.'},
    {type:'비용·공급망',pos:'핵심 부품 조달 여건이 개선될 경우 납기 단축과 마진 회복으로 이어질 수 있다는 전망이 나왔다.',neg:'원재료·물류비 변동성이 커지면서 비용 전가 능력이 향후 수익성의 핵심 변수로 꼽혔다.',neutral:'공급망 상황은 안정과 불안 요인이 공존해 실제 비용 영향은 다음 실적에서 확인될 전망이다.'},
    {type:'신제품·사업 확장',pos:'신규 제품군 또는 유통 채널 확장이 가시화될 경우 추가 매출원이 될 수 있다는 기대가 형성됐다.',neg:'신규 사업 투자 비용이 예상보다 커질 경우 손익분기점 도달이 늦어질 수 있다는 우려가 나왔다.',neutral:'신규 사업의 상업적 성과는 초기 주문과 반복 구매 지표가 확인된 뒤 평가해야 한다는 의견이 제시됐다.'}
  ],
  KR_STOCK:[
    {type:'실적 전망',pos:'주요 거래처의 주문 회복 가능성이 거론되며, 시장에서는 다음 분기 실적 개선 여부에 관심이 모이고 있다.',neg:'내수 회복 속도가 기대에 못 미칠 수 있다는 관측이 나오며, 매출과 영업이익 전망에 신중론이 확산됐다.',neutral:'실적 전망이 업황과 환율 변수에 따라 달라질 수 있어 투자자들은 다음 분기 공시를 기다리는 모습이다.'},
    {type:'업황·수주',pos:'업계의 신규 발주 문의가 늘고 있다는 관측이 나오며 수주 잔고 확대 기대가 부각됐다.',neg:'고객사의 투자 일정 조정 가능성이 거론되면서 신규 수주 인식 시점이 늦어질 수 있다는 우려가 나왔다.',neutral:'수주 흐름은 업종과 고객사별 차이가 커 아직 뚜렷한 방향성을 판단하기 어렵다는 분석이다.'},
    {type:'원가·환율',pos:'원재료 가격 안정이 이어질 경우 원가 부담 완화와 수익성 개선에 도움이 될 수 있다는 전망이 제기됐다.',neg:'원재료 가격과 환율 변동이 겹칠 경우 원가 부담이 커질 수 있어 가격 전가 능력이 주목받고 있다.',neutral:'환율과 원재료 움직임이 서로 다른 방향을 보여 실질적인 손익 영향은 추가 확인이 필요하다.'},
    {type:'투자·설비',pos:'설비 효율화와 자동화 투자가 계획대로 진행되면 중장기 생산성 개선이 가능하다는 관측이 나왔다.',neg:'설비투자 확대가 단기 현금흐름을 압박할 수 있다는 지적이 나오며 투자 집행 속도가 관심사로 떠올랐다.',neutral:'투자 계획은 성장 기회와 자금 부담을 함께 고려해야 하며, 집행 일정이 향후 변수로 꼽혔다.'}
  ],
  ETF:[
    {type:'자금 흐름',pos:'관련 자산군에 대한 자금 유입이 이어질 경우 기초자산 수요와 거래량이 함께 늘어날 수 있다는 전망이 나왔다.',neg:'위험 회피 심리가 강해질 경우 자금 유출이 확대될 수 있다는 경계가 제기됐다.',neutral:'자금 흐름은 단기 수급에 민감하게 반응하고 있어 유입·유출 추세가 지속되는지 확인이 필요하다.'},
    {type:'추적·구성 변화',pos:'구성 종목의 실적 모멘텀이 개선되면 해당 ETF의 상대 성과에도 우호적으로 작용할 수 있다는 분석이다.',neg:'주요 편입 자산의 변동성이 커질 경우 ETF 가격 변동과 추적 오차에 대한 관심이 높아질 수 있다.',neutral:'구성 종목 변경과 비용 구조를 확인해야 하며, 단기 수익률만으로 전략의 성과를 단정하기 어렵다.'}
  ],
  CRYPTO:[
    {type:'네트워크·거래 활동',pos:'네트워크 활동과 거래 참여가 늘어나는 시나리오가 부각되며 위험 선호 회복 기대가 형성됐다.',neg:'거래 활동 둔화와 변동성 확대 가능성이 함께 거론되며 단기 유동성 위험에 대한 경계가 커졌다.',neutral:'온체인·거래 지표가 엇갈려 추세 확인 전까지 변동성이 높게 유지될 수 있다는 관측이다.'},
    {type:'시장 유동성',pos:'유동성이 개선될 경우 매수·매도 호가 간격이 좁아지고 가격 발견이 원활해질 수 있다는 전망이 나왔다.',neg:'레버리지 포지션 청산이 집중될 경우 급격한 가격 변동이 발생할 수 있다는 경고가 나왔다.',neutral:'유동성 변화가 가격 방향을 결정할 수 있어 거래량과 미결제약정 추이를 함께 볼 필요가 있다.'}
  ],
  OTHER:[
    {type:'시장 전망',pos:'관련 지표가 개선되는 시나리오가 제시되며 향후 몇 달간 투자심리 회복 가능성이 주목받고 있다.',neg:'불확실성이 이어질 경우 위험자산 선호가 약해질 수 있다는 분석이 나왔다.',neutral:'관련 지표가 혼조를 보여 뚜렷한 방향성보다는 추가 데이터 확인이 중요하다는 의견이 우세하다.'}
  ]
};
const newsPositive=['시장 기대 상회 가능성','회복 시나리오 부각','수익성 개선 기대','수요 반등 관측'];
const newsNegative=['하방 위험 점검','실적 눈높이 조정 가능성','비용 부담 우려','수요 둔화 경계'];
const newsNeutral=['방향성 탐색 국면','실적 확인 필요','불확실성 지속','관망 심리'];
const newsSources=['마켓 인사이트 데스크','산업 동향 리서치','기업분석 브리프','수급 모니터','게임 내 애널리스트 노트'];
function randInt(min,max){return Math.floor(Math.random()*(max-min+1))+min}
function pick(arr){return arr[Math.floor(Math.random()*arr.length)]}
function addMonthsKey(m,n){let [y,mo]=m.split('-').map(Number);let d=new Date(Date.UTC(y,mo-1+n,1));return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')}
function horizonText(m){return m+'년 '+Number(m.slice(5,7))+'월'}
function topicGroup(a){let c=String(a.asset_class||'').toUpperCase();if(c.includes('ETF')||c.includes('ETN'))return 'ETF';if(c.includes('CRYPTO'))return 'CRYPTO';if(c==='KR_STOCK')return 'KR_STOCK';if(c==='US_STOCK')return 'US_STOCK';return 'OTHER'}
function eraAngle(m){let y=Number(m.slice(0,4));if(y<=2002)return pick(['인터넷 서비스 확산','통신·반도체 투자 사이클','신규 사업의 수익성 검증']);if(y<=2007)return pick(['글로벌 수요 확대','원자재 비용과 생산능력','해외 시장 진출']);if(y<=2012)return pick(['신용 경색과 자금 조달','비용 절감과 현금흐름','경기 회복 속도']);if(y<=2019)return pick(['모바일·온라인 전환','글로벌 공급망 효율화','규제 변화와 경쟁 심화']);if(y<=2021)return pick(['비대면 수요와 공급 병목','물류 지연과 재고 확보','디지털 전환 투자']);if(y<=2023)return pick(['금리와 자금 조달 비용','재고 정상화와 수요 둔화','원가 부담과 가격 결정력']);return pick(['인공지능·데이터 인프라 투자','금리 경로와 자금 조달','공급망 재편과 자동화','규제·경쟁 환경 변화'])}
function buildNewsItem(a,sourceMonth,index){let group=topicGroup(a),pool=newsTopics[group]||newsTopics.OTHER,topic=pick(pool),tone=pick(['pos','neg','neutral','pos','neg']),horizon=randInt(1,6),target=addMonthsKey(sourceMonth,horizon),name=(a.name||a.symbol||a.asset_id).trim(),symbol=a.symbol||a.asset_id,angle=eraAngle(sourceMonth),impact=tone==='pos'?'긍정':tone==='neg'?'부정':'중립',titles=tone==='pos'?newsPositive:tone==='neg'?newsNegative:newsNeutral,percent=randInt(4,22),confidence=randInt(42,78);let prefix=tone==='pos'?'상승 시나리오':tone==='neg'?'하방 리스크':'중립 전망';let headline=pick([
`${name}, ${topic.type} 관련 ${pick(titles)}…${horizon}개월 후 변수 주목`,
`${symbol} 전망 점검: ${angle}이(가) 향후 실적의 관건`,
`${name} 관련 업황 신호 엇갈려…${horizon}개월 뒤 확인할 핵심 변수`,
`${name}, ${topic.type} 변화 가능성에 시장 관심 집중`,
`${symbol} 리서치 노트: ${pick(titles)} 시나리오 부상`
]);let body=`[${horizonText(target)} 전망] ${name}(${symbol})를 둘러싼 ${angle} 관련 변수가 ${horizon}개월 안에 주목받을 수 있다는 가상 시나리오다. ${topic[tone]} 시장에서는 관련 지표가 전월 대비 약 ${percent}% 움직이는 경우를 가정해 민감도를 점검하고 있으나, 이는 실측치나 실제 컨센서스가 아닌 게임용 임의 수치다. 실제 방향은 실적 발표와 업황 데이터에 따라 달라질 수 있다.`;if(group==='ETF')body=`[${horizonText(target)} 전망] ${name}(${symbol})의 기초자산 흐름과 자금 유입·유출이 향후 ${horizon}개월간 성과의 주요 변수가 될 수 있다는 가상 시나리오다. ${topic[tone]} 관련 지표가 약 ${percent}% 변하는 상황을 가정했으며, 이는 실제 자금 흐름이나 공식 전망이 아니다.`;if(group==='CRYPTO')body=`[${horizonText(target)} 전망] ${name}(${symbol})는 거래 활동과 유동성 변화에 따라 ${horizon}개월 내 변동성이 확대 또는 완화될 수 있다는 가상 시나리오가 제시됐다. ${topic[tone]} 임의 시나리오 수치는 실제 온체인 데이터나 시장 전망이 아니며, 급격한 가격 변동 가능성을 배제하지 않는다.`;return {id:`${sourceMonth}-${index}-${Math.random().toString(36).slice(2,8)}`,symbol,name,assetClass:a.asset_class||'기타',sourceMonth,target,horizon,tone,impact,headline,body,source:pick(newsSources),confidence,angle,topic:topic.type}}
function generateMonthlyNews(m){if(monthlyNews.has(m))return monthlyNews.get(m);let rows=priceCache.get(m)||[];let candidates=[];let seen=new Set();for(let row of rows){if(!row.asset_id||seen.has(row.asset_id))continue;let a=assetById.get(row.asset_id);if(!a)continue;seen.add(row.asset_id);candidates.push(a)}if(candidates.length<20)candidates=assets.filter(a=>monthKey(a.first_valid_month)<=m&&(!a.last_valid_month||monthKey(a.last_valid_month)>=m));for(let i=candidates.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]]}let selectedAssets=candidates.slice(0,Math.min(20,candidates.length));let items=selectedAssets.map((a,i)=>buildNewsItem(a,m,i));items.sort((a,b)=>a.horizon-b.horizon);monthlyNews.set(m,items);return items}
function renderNews(){let list=$('newsList');if(!list)return;let items=generateMonthlyNews(month),filter=$('newsHorizon')?.value||'all';let shown=filter==='all'?items:items.filter(n=>String(n.horizon)===filter);$('newsCount').textContent=`${items.length}개 전망`;if(!items.length){list.innerHTML='<p class="muted small">이번 달에는 뉴스 대상 종목이 없습니다.</p>';return}list.innerHTML=shown.map(n=>`<article class="news-card"><div class="news-head"><div class="news-title">${esc(n.headline)}</div><span class="news-tag ${n.tone==='pos'?'up':n.tone==='neg'?'down':''}">${n.impact}</span></div><div class="news-meta"><span class="news-tag">${n.horizon}개월 후 · ${horizonText(n.target)}</span><span class="news-tag">${esc(n.topic)}</span><span class="news-tag">가상 전망</span></div><div class="small muted" style="margin-bottom:6px"><b>${esc(n.symbol)}</b> · ${esc(n.name)} · ${esc(n.assetClass)}</div><div class="news-body">${esc(n.body)}</div><div class="news-foot"><span>${esc(n.source)}</span><span>시나리오 신뢰도 ${n.confidence}%</span></div></article>`).join('')||'<p class="muted small">선택한 전망 시점에 해당하는 뉴스가 없습니다.</p>'}

let monthTransitionBusy=false,turnAdvanceBusy=false;
function openNewsPopup(){
  renderNews();
  const source=$('newsList'),target=$('popupNewsList');
  target.innerHTML=source?source.innerHTML:'<p class="muted">이번 달 뉴스가 없습니다.</p>';
  $('newsPopupTitle').textContent=`${month.slice(0,4)}년 ${Number(month.slice(5,7))}월 · 이번 달 가상 뉴스`;
  $('newsPopup').classList.add('open');
}
function closeNewsPopup(){$('newsPopup').classList.remove('open');}
async function showMonthTransitionAndNews(){
  if(monthTransitionBusy)return;
  monthTransitionBusy=true;
  const [year,mon]=month.split('-');
  $('monthSplashYear').textContent=`${year}년`;
  $('monthSplashMonth').textContent=`${Number(mon)}월`;
  $('monthSplash').classList.add('open');
  await new Promise(resolve=>setTimeout(resolve,1000));
  $('monthSplash').classList.remove('open');
  openNewsPopup();
  monthTransitionBusy=false;
}
$('closeNewsPopup').onclick=closeNewsPopup;
$('closeNewsPopupBottom').onclick=closeNewsPopup;
function render(){renderNews();$('nextBtn').textContent=gameFinished?'정산 완료':(months.length&&month===months[months.length-1]?'최종 정산 및 순위 공개':'다음 달 ▶');$('nextBtn').disabled=gameFinished;let equity=totalEquity();$('equity').textContent=won(equity);$('cash').textContent=won(cash);$('holdingCount').textContent=Object.values(holdings).filter(h=>h.qty>1e-8).length;$('profit').textContent=`수익률 ${((equity/initial-1)*100).toFixed(2)}%`;$('profit').className='small '+(equity>=initial?'positive':'negative');$('monthStatus').textContent=`${month.slice(0,4)}년 ${Number(month.slice(5,7))}월 · 거래 기준: 월봉 종가`;$('unlockedCount').textContent=monthAssets().length.toLocaleString()+'개';$('dataBadge').textContent=`데이터 준비 완료 · ${assets.length.toLocaleString()}개 종목`;$('jumpMonth').value=month;renderResults();renderHoldings();renderHistory()}
function renderResults(){let q=$('search').value.trim().toLowerCase(),cl=$('classFilter').value,locked=$('showLocked').checked;let filtered=assets.filter(a=>{let available=monthKey(a.first_valid_month)<=month;return(locked||available)&&(!cl||a.asset_class===cl)&&(!q||[a.symbol,a.name,a.asset_id,a.exchange].join(' ').toLowerCase().includes(q))});filtered.sort((a,b)=>{let aa=monthKey(a.first_valid_month)<=month,bb=monthKey(b.first_valid_month)<=month;return Number(bb)-Number(aa)||String(a.symbol).localeCompare(String(b.symbol))});$('searchCount').textContent=`${filtered.length.toLocaleString()}개 표시`;let shown=filtered.slice(0,100);$('results').innerHTML=shown.map(a=>{let open=monthKey(a.first_valid_month)<=month,p=priceFor(a.asset_id),pr=p?won(priceKRW(p)):'월 가격 없음';return `<div class="result"><div><strong class="stock-title" title="눌러서 차트 열기/닫기" onclick="toggleStockChart('${esc(a.asset_id)}')">${esc(a.symbol)} · ${esc(a.name||'')}</strong><div class="small muted">${esc(classLabel(a.asset_class))} · ${esc(a.exchange)} · ${open?'해금 '+a.first_valid_month:'🔒 '+a.first_valid_month+' 해금'}</div></div><div style="text-align:right"><div class="price">${open?pr:'잠김'}</div><div class="row" style="gap:5px;justify-content:flex-end;margin-top:5px"><button class="secondary small" style="padding:6px 9px" ${!open?'disabled':''} onclick="selectAsset('${esc(a.asset_id)}')">선택</button><button class="secondary small" style="padding:6px 9px" ${!open?'disabled':''} onclick="toggleStockChart('${esc(a.asset_id)}')">그래프</button></div></div></div>`}).join('')+(filtered.length>100?`<p class="muted small">검색 결과가 많아 상위 100개만 표시합니다. 티커나 종목명으로 더 좁혀 검색하세요.</p>`:'')||'<p class="muted">검색 결과가 없습니다.</p>'}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function tradeAvailableAmount(side){if(!selected)return 0;const p=priceFor(selected.asset_id);if(!p)return 0;const price=priceKRW(p);if(side==='buy')return Math.max(0,cash);const h=holdings[selected.asset_id];return h&&h.qty>0?Math.max(0,h.qty*price):0}
function syncTradeAmount(value,source='input'){const side=tradeAmountMode||'buy',max=tradeAvailableAmount(side);let amount=Math.max(0,Number(value)||0);amount=Math.min(amount,max);if(source!=='input')$('tradeAmount').value=String(Math.floor(amount));else if(Number($('tradeAmount').value)!==amount)$('tradeAmount').value=String(Math.floor(amount));const pct=max>0?amount/max*100:0;$('tradeSlider').value=String(Math.round(pct*10));$('tradeAmountLabel').textContent=won(amount);$('tradePercentLabel').textContent=`${pct.toFixed(1)}%`;document.querySelectorAll('.trade-pct').forEach(b=>b.classList.toggle('active',Math.abs(Number(b.dataset.pct)-pct)<0.6));$('tradeBudgetCaption').textContent=(side==='buy'?'매수 가능 현금 ':'매도 가능 평가액 ')+won(max);const p=selected&&priceFor(selected.asset_id);const qty=p&&priceKRW(p)>0?amount/priceKRW(p):0;$('tradeQtyEstimate').textContent=qty>0?qty.toLocaleString('ko-KR',{maximumFractionDigits:8})+'주/단위':'—'}
let tradeAmountMode='buy';
function setTradeMode(side){tradeAmountMode=side;$('amountBuyMode').classList.toggle('secondary',side!=='buy');$('amountSellMode').classList.toggle('secondary',side!=='sell');syncTradeAmount(Math.min(Number($('tradeAmount').value)||0,tradeAvailableAmount(side)),'button')}
window.selectAsset=id=>{selected=assetById.get(id);if(!selected)return;$('tradeBox').classList.remove('hidden');$('tradeName').textContent=selected.symbol+' · '+selected.name;let p=priceFor(id);$('tradeMeta').textContent=`${classLabel(selected.asset_class)} · ${selected.exchange} · ${p?won(priceKRW(p)):'이 달 가격 없음'} · 최초 데이터월 ${selected.first_valid_month}`;$('tradeMsg').textContent=p?'거래는 월봉 종가 기준입니다. 금액은 슬라이더·퍼센트·직접 입력으로 지정할 수 있으며, 모든 종목은 소수점 수량으로 매매됩니다.':'현재 월의 거래 가격 데이터가 없습니다.';$('buyBtn').disabled=!p||cash<=0;$('sellBtn').disabled=!(holdings[id]?.qty>0&&p);$('allInBtn').disabled=!p||cash<=0;$('sellAllBtn').disabled=!(holdings[id]?.qty>0&&p);setTradeMode('buy');syncTradeAmount(Math.min(Number($('tradeAmount').value)||10000,cash),'button')};
function trade(side){if(gameFinished){$('tradeMsg').textContent='게임 최종 정산이 완료되어 추가 거래할 수 없습니다.';return}if(!selected)return;let p=priceFor(selected.asset_id);if(!p){$('tradeMsg').textContent='이 달의 가격 데이터가 없어 거래할 수 없습니다.';return}let price=priceKRW(p),amount=Number($('tradeAmount').value);if(!(amount>0)){ $('tradeMsg').textContent='주문 금액을 확인하세요.';return}let h=holdings[selected.asset_id]||{qty:0,lastPrice:price,avgCost:0};if(side==='buy'){amount=Math.min(amount,cash);if(amount<=0){$('tradeMsg').textContent='현금이 부족합니다.';return}let qty=amount/price;const oldQty=h.qty,oldAvg=Number(h.avgCost)||Number(h.lastPrice)||price;cash-=amount;h.avgCost=(oldQty*oldAvg+amount)/(oldQty+qty);h.qty+=qty;h.lastPrice=price;holdings[selected.asset_id]=h;history.unshift({month,side:'매수',symbol:selected.symbol,qty,amount,price});$('tradeMsg').textContent=`${won(amount)} 매수 · ${qty.toLocaleString('ko-KR',{maximumFractionDigits:8})}주/단위`;}else{let available=h.qty*price;amount=Math.min(amount,available);if(amount<=0){$('tradeMsg').textContent='매도할 보유분이 없습니다.';return}let qty=amount/price;h.qty-=qty;h.lastPrice=price;cash+=amount;if(h.qty<1e-8)delete holdings[selected.asset_id];else holdings[selected.asset_id]=h;history.unshift({month,side:'매도',symbol:selected.symbol,qty,amount,price});$('tradeMsg').textContent=`${won(amount)} 매도 · ${qty.toLocaleString('ko-KR',{maximumFractionDigits:8})}주/단위`;}render();selectAsset(selected.asset_id);if(chartAssetId===selected.asset_id&&stockChartInstance)chartHoldingMetrics(chartRenderedData)}
function renderHoldings(){let entries=Object.entries(holdings).filter(([id,h])=>h.qty>1e-8);$('holdings').innerHTML=entries.length?`<table class="table"><thead><tr><th>종목</th><th>수량</th><th>평가액</th></tr></thead><tbody>${entries.map(([id,h])=>{let a=assetById.get(id);return `<tr><td>${esc(a?.symbol||id)}<div class="small muted">${esc(a?.name||'')}</div></td><td>${h.qty.toLocaleString('ko-KR',{maximumFractionDigits:8})}</td><td>${won(h.qty*currentPrice(id))}</td></tr>`}).join('')}</tbody></table>`:'<p class="muted small">아직 보유 종목이 없습니다.</p>'}
function renderHistory(){$('history').innerHTML=history.length?history.slice(0,100).map(h=>`<div class="result"><div><strong>${esc(h.side)} · ${esc(h.symbol)}</strong><div class="small muted">${h.month} · ${h.qty.toLocaleString('ko-KR',{maximumFractionDigits:8})} 단위</div></div><div class="price">${won(h.amount)}</div></div>`).join(''):'<p class="muted small">거래 기록이 없습니다.</p>'}
async function loadMonth(m){if(priceCache.has(m)){month=m;return priceCache.get(m)}$('loadMsg').textContent=`${m} 가격 파일 불러오는 중…`;$('loadProgress').style.width='30%';const res=await fetch(`/data/prices/${m}.json`,{cache:'force-cache'});if(!res.ok)throw Error(`${m}.json 파일을 불러오지 못했습니다 (HTTP ${res.status}). 서버의 public/data/prices 폴더를 확인하세요.`);const rows=await res.json();priceCache.clear();priceIndex=new Map(rows.map(p=>[p.asset_id,p]));priceCache.set(m,rows);month=m;allRows=rows.length;$('loadProgress').style.width='100%';return rows}
$('loadBtn').onclick=async()=>{try{$('loadBtn').disabled=true;$('loadMsg').textContent='종목 목록과 데이터 인덱스 확인 중…';const ir=await fetch('/data/index.json',{cache:'force-cache'});if(!ir.ok)throw Error('data/index.json을 불러오지 못했습니다. 배포 파일에 public/data가 포함됐는지 확인하세요.');const idx=await ir.json();const ur=await fetch('/data/universe.json',{cache:'force-cache'});if(!ur.ok)throw Error('data/universe.json을 불러오지 못했습니다.');assets=await ur.json();if(assets.length!==idx.assets)throw Error(`종목 수 검증 실패: 목록 ${assets.length}개 / 인덱스 ${idx.assets}개`);assets=assets.map(a=>({...a,first_valid_month:monthKey(a.first_valid_month),last_valid_month:monthKey(a.last_valid_month)}));assetById=new Map(assets.map(a=>[a.asset_id,a]));if(assetById.size!==assets.length)throw Error('중복 asset_id가 발견됐습니다. 데이터 파일을 확인하세요.');months=idx.months;if(months.length!==321||months[0]!=='2000-01'||months[months.length-1]!=='2026-09')throw Error(`월별 데이터 범위 검증 실패: ${months[0]}~${months[months.length-1]} (${months.length}개월)`);$('classFilter').innerHTML='<option value="">모든 종류</option>'+Object.keys(CLASS_LABELS).filter(c=>assets.some(a=>a.asset_class===c)).map(c=>`<option value="${c}">${CLASS_LABELS[c]}</option>`).join('');const unknown=[...new Set(assets.map(a=>a.asset_class).filter(c=>c&&!CLASS_LABELS[c]))];if(unknown.length)$('classFilter').insertAdjacentHTML('beforeend',unknown.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join(''));$('jumpMonth').innerHTML=months.map(m=>`<option value="${m}">${m}</option>`).join('');month='2000-01';await loadMonth(month);$('setup').classList.add('hidden');$('game').classList.remove('hidden');render();$('loadMsg').textContent='';}catch(e){$('loadMsg').textContent='오류: '+e.message;$('loadProgress').style.width='0%'}finally{$('loadBtn').disabled=false}};
$('newsHorizon').onchange=()=>{renderNews();if($('newsPopup').classList.contains('open'))$('popupNewsList').innerHTML=$('newsList').innerHTML};$('rerollNewsBtn').onclick=()=>{monthlyNews.delete(month);renderNews();if($('newsPopup').classList.contains('open'))$('popupNewsList').innerHTML=$('newsList').innerHTML};$('search').oninput=renderResults;$('classFilter').onchange=renderResults;$('showLocked').onchange=renderResults;$('amountBuyMode').onclick=()=>setTradeMode('buy');$('amountSellMode').onclick=()=>setTradeMode('sell');$('buyBtn').onclick=()=>{setTradeMode('buy');syncTradeAmount($('tradeAmount').value,'input');trade('buy')};$('sellBtn').onclick=()=>{setTradeMode('sell');syncTradeAmount($('tradeAmount').value,'input');trade('sell')};$('allInBtn').onclick=()=>{setTradeMode('buy');syncTradeAmount(tradeAvailableAmount('buy'),'button');trade('buy')};$('sellAllBtn').onclick=()=>{setTradeMode('sell');syncTradeAmount(tradeAvailableAmount('sell'),'button');trade('sell')};$('tradeSlider').oninput=()=>{syncTradeAmount(tradeAvailableAmount(tradeAmountMode)*Number($('tradeSlider').value)/1000,'button')};$('tradeAmount').oninput=()=>{syncTradeAmount($('tradeAmount').value,'input')};document.querySelectorAll('.trade-pct').forEach(b=>b.onclick=()=>{syncTradeAmount(tradeAvailableAmount(tradeAmountMode)*Number(b.dataset.pct)/100,'button')});$('jumpMonth').onchange=async()=>{if(gameFinished||turnAdvanceBusy)return;let m=$('jumpMonth').value;if(m===month)return;turnAdvanceBusy=true;$('nextBtn').disabled=true;$('jumpMonth').disabled=true;try{await loadMonth(m);month=m;for(let [id,h] of Object.entries(holdings)){let p=priceFor(id);if(p)h.lastPrice=priceKRW(p)}selected=null;$('tradeBox').classList.add('hidden');render();await showMonthTransitionAndNews()}finally{turnAdvanceBusy=false;$('jumpMonth').disabled=gameFinished;$('nextBtn').disabled=gameFinished;render()}};$('nextBtn').onclick=async()=>{if(gameFinished||turnAdvanceBusy)return;let i=months.indexOf(month);if(i<0)return;if(i>=months.length-1){await finalizeGame();return}turnAdvanceBusy=true;$('nextBtn').disabled=true;$('jumpMonth').disabled=true;try{month=months[i+1];await loadMonth(month);for(let [id,h] of Object.entries(holdings)){let p=priceFor(id);if(p)h.lastPrice=priceKRW(p)}render();await showMonthTransitionAndNews()}finally{turnAdvanceBusy=false;$('jumpMonth').disabled=gameFinished;$('nextBtn').disabled=gameFinished;render()}};$('resetBtn').onclick=async()=>{if(!confirm('현금·보유종목·거래기록·가상 뉴스를 모두 초기화하고 2000년 1월부터 다시 시작할까요?'))return;month='2000-01';cash=initial;holdings={};history=[];gameFinished=false;monthlyNews.clear();selected=null;$('tradeBox').classList.add('hidden');$('nextBtn').disabled=false;$('jumpMonth').disabled=false;$('finalResultsPanel').classList.add('hidden');finalRevealList=[];finalRevealIndex=0;if(onlineToken){try{await api('/api/game/finish',{method:'DELETE',body:'{}'});}catch{}}render()};$('demoBtn').onclick=()=>alert('규칙: 시작 현금 ₩100,000 / $1=₩1,000 고정 / 최초 가격 데이터 월부터 해금 / 월봉 종가 거래 / 한 달씩 진행 / 16,013개 종목과 321개월 데이터. 턴을 넘길 때 해당 월 JSON 파일만 불러오며 매매·평가는 브라우저에서 계산합니다.');


// Final-turn settlement and sequential podium reveal. Rank image placeholders can be replaced later.
async function finalizeGame(){
  if(gameFinished)return;
  if(month!==months[months.length-1])return;
  const finalMonth=month, sold=[];
  for(const [id,h] of Object.entries(holdings)){
    const px=currentPrice(id); const amount=Math.max(0,Number(h.qty)||0)*Math.max(0,px);
    if(amount>0){cash+=amount;sold.push({month:finalMonth,side:'최종 강제 현금화',symbol:assetById.get(id)?.symbol||id,qty:h.qty,amount,price:px});}
  }
  holdings={}; history=[...sold,...history]; gameFinished=true;selected=null;$('tradeBox').classList.add('hidden');$('nextBtn').disabled=true;$('jumpMonth').disabled=true;
  render();
  if(onlineToken){
    try{await saveCloudState();await api('/api/game/finish',{method:'POST',body:JSON.stringify({month:finalMonth,cash,equity:cash,returnPct:(cash/initial-1)*100})});}
    catch(e){$('finalSummary').textContent='최종 자산은 계산했지만 서버 최종 기록 저장에 실패했습니다: '+e.message;}
  }
  await showFinalResults();
}
async function showFinalResults(){
  $('finalResultsPanel').classList.remove('hidden');
  $('finalSummary').textContent=`최종 월 ${month} · 강제 현금화 완료 · 최종 현금 ${won(cash)} · 수익률 ${((cash/initial-1)*100).toFixed(2)}%`;
  let board=[];
  if(onlineToken){try{const r=await api('/api/game/final-leaderboard');board=r.leaderboard||[];}catch(e){$('finalSummary').textContent+=' · 서버 순위 조회 실패';}}
  if(!board.length)board=[{rank:1,username:onlineUser?.username||'현재 플레이어',month,cash,equity:cash,returnPct:(cash/initial-1)*100,finishedAt:new Date().toISOString()}];
  finalRevealList=board;finalRevealIndex=0;renderFinalBoard();
}
function renderFinalBoard(){
  const list=finalRevealList||[];
  $('finalRankTable').innerHTML=list.length?`<table class="table"><thead><tr><th>순위</th><th>유저</th><th>최종 자산</th><th>수익률</th></tr></thead><tbody>${list.map(x=>`<tr><td>${x.rank}</td><td>${esc(x.username)}</td><td>${won(x.equity)}</td><td class="${x.returnPct>=0?'positive':'negative'}">${x.returnPct>=0?'+':''}${Number(x.returnPct).toFixed(2)}%</td></tr>`).join('')}</tbody></table>`:'<p class="muted small">완료된 게임 기록이 아직 없습니다.</p>';
  $('finalRevealCard').innerHTML='<p class="muted small">순위 공개 버튼을 눌러 1위부터 차례대로 확인하세요.</p>';
  $('revealNextRankBtn').textContent='1위 공개';$('revealNextRankBtn').disabled=!list.length;$('showAllRanksBtn').disabled=!list.length;
}
function revealNextRank(){
  if(finalRevealIndex>=finalRevealList.length)return;
  const x=finalRevealList[finalRevealIndex],rank=x.rank||finalRevealIndex+1;
  const imageSlot=`<div class="rank-image-slot" data-rank-image-slot="${rank}">RANK ${rank} IMAGE SLOT<br><span class="small">추후 이 영역에 순위별 이미지를 연결</span></div>`;
  $('finalRevealCard').innerHTML=`<article class="rank-reveal"><div class="rank-place">${rank}위</div>${imageSlot}<h3>${esc(x.username)}</h3><div>최종 자산 <strong>${won(x.equity)}</strong></div><div>수익률 <strong class="${x.returnPct>=0?'positive':'negative'}">${x.returnPct>=0?'+':''}${Number(x.returnPct).toFixed(2)}%</strong></div></article>`;
  finalRevealIndex++;
  $('revealNextRankBtn').textContent=finalRevealIndex<finalRevealList.length?`${finalRevealList[finalRevealIndex].rank||finalRevealIndex+1}위 공개`:'순위 공개 완료';
  $('revealNextRankBtn').disabled=finalRevealIndex>=finalRevealList.length;
}
$('revealNextRankBtn').onclick=revealNextRank;
$('showAllRanksBtn').onclick=()=>{finalRevealIndex=finalRevealList.length;const list=finalRevealList;$('finalRevealCard').innerHTML=list.map(x=>`<article class="rank-reveal"><div class="rank-place">${x.rank}위</div><div class="rank-image-slot" data-rank-image-slot="${x.rank}">RANK ${x.rank} IMAGE SLOT<br><span class="small">추후 이미지 연결</span></div><h3>${esc(x.username)}</h3><div>최종 자산 <strong>${won(x.equity)}</strong></div><div>수익률 <strong>${Number(x.returnPct).toFixed(2)}%</strong></div></article>`).join('');$('revealNextRankBtn').disabled=true;$('revealNextRankBtn').textContent='순위 공개 완료';};


// Online MVP integration: account, cloud save, leaderboard.
let onlineToken = localStorage.getItem('retroGameToken') || '';
let onlineUser = null;
let pendingCloudState = null;
const api = async (url, options={}) => {
  const headers = { 'Content-Type':'application/json', ...(options.headers||{}) };
  if (onlineToken) headers.Authorization = `Bearer ${onlineToken}`;
  const res = await fetch(url, {...options, headers});
  const body = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(body.error || `요청 실패 (${res.status})`);
  return body;
};
function onlineMessage(t){ $('onlineMsg').textContent=t; }
async function sendPresenceHeartbeat(){ if(!onlineToken)return; try{await api('/api/presence/heartbeat',{method:'POST',body:'{}'});}catch(e){/* transient connection loss: server grace period handles it */} }
setInterval(sendPresenceHeartbeat,10000);
function updateOnlineUi(){
  $('onlineStatus').textContent = onlineUser ? `로그인: ${onlineUser.username}` : '로그인하지 않음 · 로컬 플레이 가능';
  $('logoutBtn').classList.toggle('hidden', !onlineUser);
  $('loginBtn').classList.toggle('hidden', !!onlineUser);
  $('registerBtn').classList.toggle('hidden', !!onlineUser);
}
async function authenticate(mode){
  try {
    const username=$('onlineUsername').value.trim(), password=$('onlinePassword').value;
    const r=await api(`/api/auth/${mode}`,{method:'POST',body:JSON.stringify({username,password})});
    onlineToken=r.token; onlineUser=r.user; localStorage.setItem('retroGameToken',onlineToken); updateOnlineUi(); sendPresenceHeartbeat();
    onlineMessage('로그인 완료. 저장된 게임을 확인합니다.');
    try { const st=await api('/api/state'); pendingCloudState=st.state; if (assets.length) await applyCloudState(); }
    catch(e){ onlineMessage('계정 연결은 완료했지만 저장된 게임을 불러오지 못했습니다: '+e.message); }
    await refreshLeaderboard(); await refreshDaytrade();
  } catch(e){ onlineMessage(e.message); }
}
async function applyCloudState(){
  if(!pendingCloudState || !assets.length) return;
  const st=pendingCloudState; pendingCloudState=null;
  if(!st) { onlineMessage('새 계정입니다. 현재 게임을 시작하면 서버에 저장됩니다.'); await saveCloudState(); return; }
  const target=String(st.month||'2000-01').slice(0,7);
  if(months.includes(target)) { await loadMonth(target); month=target; } else { await loadMonth('2000-01'); month='2000-01'; }
  cash=Number(st.cash); holdings=st.holdings||{}; history=Array.isArray(st.history)?st.history:[]; gameFinished=st.finished===true;
  for(const [id,h] of Object.entries(holdings)) { const pr=priceFor(id); if(pr) h.lastPrice=priceKRW(pr); }
  selected=null; $('tradeBox').classList.add('hidden'); if(gameFinished){$('nextBtn').disabled=true;$('jumpMonth').disabled=true;showFinalResults().catch(()=>{});} render();
  onlineMessage(`서버 저장 데이터 복원 완료 · ${month}`);
}
let saveTimer=null;
async function saveCloudState(){
  if(!onlineToken || !assets.length) return;
  const equity=totalEquity();
  try {
    await api('/api/state',{method:'PUT',body:JSON.stringify({month,cash,holdings,history,equity,returnPct:(equity/initial-1)*100,finished:gameFinished})});
    onlineMessage(`서버 저장 완료 · ${new Date().toLocaleTimeString('ko-KR')}`);
    refreshLeaderboard();
  } catch(e){ onlineMessage('서버 저장 실패: '+e.message); }
}
function queueCloudSave(){ clearTimeout(saveTimer); saveTimer=setTimeout(saveCloudState,250); }
async function refreshLeaderboard(){
  try {
    const r=await api('/api/leaderboard');
    $('leaderboardList').innerHTML = r.leaderboard.length ? `<table class="table"><thead><tr><th>순위</th><th>유저</th><th>진행 월</th><th>총자산</th><th>수익률</th></tr></thead><tbody>${r.leaderboard.map(x=>`<tr><td>${x.rank}</td><td>${esc(x.username)}</td><td>${esc(x.month)}</td><td>${won(x.equity)}</td><td class="${x.returnPct>=0?'positive':'negative'}">${x.returnPct>=0?'+':''}${x.returnPct.toFixed(2)}%</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">아직 등록된 점수가 없습니다.</p>';
  } catch(e){ $('leaderboardList').innerHTML=`<p class="muted small">서버 연결 필요: ${esc(e.message)} · Render 배포 후 확인하세요.</p>`; }
}
$('registerBtn').onclick=()=>authenticate('register'); $('loginBtn').onclick=()=>authenticate('login');
$('logoutBtn').onclick=async()=>{if(activeRoom){try{await api(`/api/rooms/${activeRoom.id}/leave`,{method:'POST',body:'{}'});}catch{}}renderRoom(null);onlineToken='';onlineUser=null;pendingCloudState=null;localStorage.removeItem('retroGameToken');updateOnlineUi();refreshRooms();refreshDaytrade();onlineMessage('로그아웃했습니다. 이 브라우저에서 로컬 플레이는 계속할 수 있습니다.');};
$('refreshBoardBtn').onclick=refreshLeaderboard;
// Restore a login session on page reload.
(async()=>{ updateOnlineUi(); refreshLeaderboard(); if(onlineToken){try{const r=await api('/api/me');onlineUser=r.user;updateOnlineUi();sendPresenceHeartbeat();const st=await api('/api/state');pendingCloudState=st.state;onlineMessage('로그인 세션 확인 완료. 게임 데이터를 불러오면 저장 내용이 복원됩니다.');}catch(e){onlineToken='';localStorage.removeItem('retroGameToken');updateOnlineUi();}} })();
// Hook the existing local game actions to cloud persistence.
const originalLoadClick=$('loadBtn').onclick;
$('loadBtn').onclick=async function(){await originalLoadClick();if(assets.length){if(pendingCloudState)await applyCloudState();else queueCloudSave();}};
const originalTrade=trade;
trade=function(side){originalTrade(side);queueCloudSave();};
for(const id of ['nextBtn','jumpMonth','resetBtn']){const el=$(id), old=el.onclick;el.onclick=async function(...args){const out=old.apply(this,args);if(out&&typeof out.then==='function')await out;queueCloudSave();};}
// Room lobby UI: server-backed membership and short polling keep all clients in sync.
let activeRoom = null;
let roomPollTimer = null;
let roomHeartbeatTimer = null;
function roomMessage(t){ $('roomMsg').textContent=t; }
function renderRoom(room){
  activeRoom = room || null;
  $('currentRoom').classList.toggle('hidden',!room);
  if(!room) return;
  $('currentRoomName').textContent=room.name;
  $('currentRoomMeta').textContent=`${room.has_password?'🔒 비밀번호 방':'🌐 공개방'} · ${room.player_count ?? room.playerCount ?? room.members?.length ?? 0}/${room.max_players}명 · 방장 ${room.owner_name}`;
  $('currentRoomMembers').innerHTML=(room.members||[]).map(m=>`<span class="pill">${esc(m.username)}${String(m.userId)===String(room.owner_id)?' 👑':''}</span>`).join('') || '<span class="small muted">접속 인원 확인 중…</span>';
}
async function refreshRooms(){
  if(!onlineToken){$('roomList').innerHTML='<p class="muted small">방을 만들거나 참가하려면 먼저 회원가입 또는 로그인하세요.</p>';return;}
  try{
    const r=await api('/api/rooms');
    $('roomList').innerHTML=r.rooms.length?r.rooms.map(room=>`<div class="result"><div><strong>${esc(room.name)} ${room.hasPassword?'🔒':'🌐'}</strong><div class="small muted">방장 ${esc(room.owner_name)} · ${room.playerCount}/${room.max_players}명</div></div><button class="joinRoomBtn" data-room="${room.id}" ${room.playerCount>=room.max_players?'disabled':''}>${room.hasPassword?'비밀번호 입장':'참가'}</button></div>`).join(''):'<p class="muted small">현재 공개된 대기방이 없습니다. 첫 방을 만들어 보세요.</p>';
    document.querySelectorAll('.joinRoomBtn').forEach(b=>b.onclick=()=>joinRoom(b.dataset.room));
  }catch(e){$('roomList').innerHTML=`<p class="muted small">방 목록 오류: ${esc(e.message)}</p>`;}
}
async function createRoom(){
  if(!onlineToken)return roomMessage('먼저 로그인하세요.');
  try{const name=$('roomName').value.trim(), password=$('roomPassword').value, maxPlayers=Number($('roomCapacity').value);
    const r=await api('/api/rooms',{method:'POST',body:JSON.stringify({name,password,maxPlayers})});
    renderRoom(r.room); $('roomPassword').value=''; roomMessage('방을 만들었습니다. 다른 플레이어의 참가를 기다리는 중입니다.'); await refreshRooms();
  }catch(e){roomMessage(e.message);}
}
async function joinRoom(id){
  if(!onlineToken)return roomMessage('먼저 로그인하세요.');
  try{const listing=await api('/api/rooms'); const item=listing.rooms.find(x=>String(x.id)===String(id));
    const password=item?.hasPassword?prompt('이 방의 비밀번호를 입력하세요:'):''; if(item?.hasPassword && password===null)return;
    const r=await api(`/api/rooms/${id}/join`,{method:'POST',body:JSON.stringify({password:password||''})}); renderRoom(r.room); roomMessage('방에 참가했습니다. 인원은 자동으로 갱신됩니다.'); await refreshRooms();
  }catch(e){roomMessage(e.message);}
}
async function leaveRoom(){if(!activeRoom)return;const id=activeRoom.id;try{await api(`/api/rooms/${id}/leave`,{method:'POST',body:'{}'});renderRoom(null);roomMessage('방에서 나왔습니다.');await refreshRooms();}catch(e){roomMessage(e.message);}}
async function pollActiveRoom(){
  if(!onlineToken||!activeRoom)return;
  try{const r=await api(`/api/rooms/${activeRoom.id}/heartbeat`,{method:'POST',body:'{}'});renderRoom(r.room);}
  catch(e){renderRoom(null);roomMessage('방 연결이 종료되었습니다. 방 목록을 새로고침하세요.');}
  await refreshRooms();
}
$('createRoomBtn').onclick=createRoom;
$('leaveRoomBtn').onclick=leaveRoom;
$('refreshRoomsBtn').onclick=refreshRooms;
setInterval(()=>{if(onlineToken){refreshRooms();pollActiveRoom();}},5000);
// Day-trading popup. The popup overlays monthly news and follows server-authoritative event timing.
let daytradeEvent = null;
let daytradePopupEventId = null;
let daytradePopupMode = null;
let daytradePopupTimeout = null;
const daytradePopupHandled = new Set();
function fmtToken(n){return Number(n||0).toLocaleString('ko-KR',{maximumFractionDigits:4})+' 토큰';}
function hideDaytradePopup(){ $('daytradePopup').classList.remove('open'); daytradePopupMode=null; daytradePopupEventId=null; if(daytradePopupTimeout){clearTimeout(daytradePopupTimeout);daytradePopupTimeout=null;} }
function openDaytradePopup(){ $('daytradePopup').classList.add('open'); }
function renderDaytradePopup(e){
  const body=$('daytradePopupContent'), mine=e.myEntry;
  if(e.status==='active'){
    const remaining=Math.max(0,Math.ceil((new Date(e.endsAt).getTime()-Date.now())/1000));
    $('daytradePopupTimer').textContent=`${remaining}초`;
    const value=mine?(mine.finalValue===null?mine.tokenCash+mine.shares*e.price:mine.finalValue):0;
    const ret=mine?(mine.returnPct===null?(value/e.tokenGrant-1)*100:mine.returnPct):0;
    body.innerHTML=`<p class="muted">모두 같은 가격 경로로 30초간 대결합니다. 풀매수·풀매도만 가능하며 종료 시 자동 정산됩니다.</p>
      <div class="dt-popup-stats"><div class="dt-popup-stat"><div class="metric-label">가상 종목</div><strong>${esc(e.assetName)}</strong></div><div class="dt-popup-stat"><div class="metric-label">공통 가격</div><strong>${fmtToken(e.price)}</strong></div><div class="dt-popup-stat"><div class="metric-label">내 평가액 · 수익률</div><strong>${mine?fmtToken(value):'미참가'}</strong><div class="small ${ret>=0?'positive':'negative'}">${mine?`${ret>=0?'+':''}${ret.toFixed(3)}%`:''}</div></div></div>
      ${mine?`<div class="dt-popup-actions"><button id="dtPopupBuy" ${mine.tokenCash<=0?'disabled':''}>풀매수</button><button id="dtPopupSell" class="secondary" ${mine.shares<=0?'disabled':''}>풀매도</button></div><p class="small muted">현금 ${fmtToken(mine.tokenCash)} · 보유 수량 ${Number(mine.shares).toLocaleString('ko-KR',{maximumFractionDigits:8})} · 시작 토큰 ${fmtToken(e.tokenGrant)}</p>`:'<p class="status">이번 이벤트 참가자로 등록되지 않았습니다.</p>'}
      <div class="small muted">현재 순위 (임시)</div>${e.leaderboard.length?`<div class="scroll"><table class="table"><thead><tr><th>순위</th><th>유저</th><th>수익률</th></tr></thead><tbody>${e.leaderboard.slice(0,10).map(x=>`<tr><td>${x.rank}</td><td>${esc(x.username)}</td><td class="${x.returnPct>=0?'positive':'negative'}">${x.returnPct>=0?'+':''}${Number(x.returnPct).toFixed(3)}%</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted small">참가자 데이터를 기다리는 중입니다.</p>'}`;
    const buy=$('dtPopupBuy'),sell=$('dtPopupSell'); if(buy)buy.onclick=()=>daytradeOrder('buy');if(sell)sell.onclick=()=>daytradeOrder('sell');
  }else{
    $('daytradePopupTimer').textContent='정산 완료';
    body.innerHTML=`<div class="dt-result-banner">🏁 단타 종료 · 최종 순위 발표<br><span class="small muted">5초 후 자동으로 닫힙니다</span></div>
      ${e.leaderboard.length?`<div class="scroll"><table class="table"><thead><tr><th>순위</th><th>유저</th><th>최종 평가액</th><th>수익률</th><th>현금 보상</th></tr></thead><tbody>${e.leaderboard.map(x=>`<tr><td>${x.rank===1?'🥇 1위':x.rank===2?'🥈 2위':x.rank===3?'🥉 3위':`${x.rank}위`}</td><td>${esc(x.username)}</td><td>${fmtToken(x.finalValue)}</td><td class="${x.returnPct>=0?'positive':'negative'}">${x.returnPct>=0?'+':''}${Number(x.returnPct).toFixed(3)}%</td><td>${won(x.rewardCash)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">참가 기록이 없습니다.</p>'}
      <p class="small muted">단타 토큰은 회수되었습니다. 공동 1등은 각자 경기 시작 전 총자산의 50%를 게임 현금으로 받습니다.</p>`;
  }
}
async function refreshDaytrade(){
  if(!onlineToken){$('daytradeStatus').textContent='단타 이벤트를 보려면 로그인하세요.';$('daytradeControls').classList.add('hidden');$('daytradeBoard').innerHTML='<p class="muted small">로그인 후 확인할 수 있습니다.</p>';return;}
  try{
    const r=await api('/api/daytrade/current');daytradeEvent=r.event;
    if(!daytradeEvent){$('daytradeStatus').textContent='현재 진행 중이거나 최근 종료된 단타 이벤트가 없습니다.';$('daytradeControls').classList.add('hidden');$('daytradeBoard').innerHTML='<p class="muted small">관리자가 이벤트를 시작하면 단타 팝업이 자동으로 열립니다.</p>';return;}
    const e=daytradeEvent, mine=e.myEntry;
    $('daytradeStatus').textContent=e.status==='active'?`진행 중 · ${Math.max(0,Math.ceil((new Date(e.endsAt).getTime()-Date.now())/1000))}초 남음 · 참가자 자동 등록`:`종료 완료 · 상금 지급 정산 완료`;
    $('daytradeControls').classList.toggle('hidden',!mine);$('dtAsset').textContent=e.assetName;$('dtPrice').textContent=fmtToken(e.price);
    if(mine){const value=mine.finalValue===null?mine.tokenCash+mine.shares*e.price:mine.finalValue;const ret=mine.returnPct===null?(value/e.tokenGrant-1)*100:mine.returnPct;$('dtValue').textContent=fmtToken(value);$('dtReturn').textContent=`수익률 ${ret>=0?'+':''}${ret.toFixed(4)}%`;$('dtPosition').textContent=`보유 현금 ${fmtToken(mine.tokenCash)} · 보유 수량 ${Number(mine.shares).toLocaleString('ko-KR',{maximumFractionDigits:8})} · 시작 토큰 ${fmtToken(e.tokenGrant)}${e.status==='settled'?` · 현금 보상 ${won(mine.rewardCash)}`:''}`;$('dtBuyBtn').disabled=e.status!=='active'||mine.tokenCash<=0;$('dtSellBtn').disabled=e.status!=='active'||mine.shares<=0;}else{$('dtPosition').textContent='이번 이벤트 참가자로 등록되지 않았습니다.';}
    $('daytradeBoard').innerHTML=e.leaderboard.length?`<table class="table"><thead><tr><th>순위*</th><th>유저</th><th>평가액</th><th>수익률</th><th>보상</th></tr></thead><tbody>${e.leaderboard.map(x=>`<tr><td>${x.rank}</td><td>${esc(x.username)}</td><td>${fmtToken(x.finalValue)}</td><td class="${x.returnPct>=0?'positive':'negative'}">${x.returnPct>=0?'+':''}${Number(x.returnPct).toFixed(3)}%</td><td>${e.status==='settled'?won(x.rewardCash):'—'}</td></tr>`).join('')}</tbody></table><p class="small muted">*진행 중 순위는 현재 평가 기준의 임시 순위입니다.</p>`:'<p class="muted small">참가자 데이터가 없습니다.</p>';
    if(e.status==='active'){
      if(!daytradePopupHandled.has(String(e.id))){daytradePopupEventId=String(e.id);daytradePopupMode='active';renderDaytradePopup(e);openDaytradePopup();}
    }else{
      const id=String(e.id);
      if(!daytradePopupHandled.has(id)&&daytradePopupMode!=='results'){
        daytradePopupEventId=id;daytradePopupMode='results';renderDaytradePopup(e);openDaytradePopup();
        if(daytradePopupTimeout)clearTimeout(daytradePopupTimeout);
        daytradePopupTimeout=setTimeout(()=>{daytradePopupHandled.add(id);hideDaytradePopup();},5000);
      }else if(daytradePopupMode==='results'&&daytradePopupEventId===id){renderDaytradePopup(e);}
    }
  }catch(e){$('daytradeStatus').textContent='단타 이벤트 조회 실패: '+e.message;}
}
async function daytradeOrder(action){try{const r=await api('/api/daytrade/order',{method:'POST',body:JSON.stringify({action})});$('daytradeStatus').textContent=`${action==='buy'?'풀매수':'풀매도'} 완료 · 체결 가격 ${fmtToken(r.price)}`;await refreshDaytrade();}catch(e){$('daytradeStatus').textContent=e.message;}}
$('refreshDaytradeBtn').onclick=refreshDaytrade;$('dtBuyBtn').onclick=()=>daytradeOrder('buy');$('dtSellBtn').onclick=()=>daytradeOrder('sell');
setInterval(()=>{if(onlineToken)refreshDaytrade();},1000);

updateOnlineUi();
refreshRooms(); refreshDaytrade();


// Single-stock Lightweight Charts module. Only the pinned Lightweight Charts CDN is used.
const STOCK_CHART_COLORS={up:'#ef5350',down:'#2962ff',ma5:'#f2c14e',ma20:'#4fc3f7',ma60:'#ce93d8',ma120:'#81c784'};
let stockChartInstance=null, volumeChartInstance=null, chartAssetId=null, chartMode='month', chartTurn='2005-03', chartMonthData=[], chartRenderedData=[], chartSeries={}, chartResizeObserver=null, chartSyntheticCache=new Map();
const chartNum=n=>Number(n||0).toLocaleString('ko-KR',{maximumFractionDigits:2});
function seededRandom(seed){let x=seed>>>0;return()=>{x=(1664525*x+1013904223)>>>0;return x/4294967296}}
function stockSeed(id){let h=2166136261;for(let i=0;i<String(id).length;i++){h^=String(id).charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
// Replace this function with fetch(`/api/stocks/${encodeURIComponent(stockId)}/history?to=${chartTurn}`) later.
async function loadStockData(stockId){if(chartSyntheticCache.has(stockId))return chartSyntheticCache.get(stockId);const rand=seededRandom(stockSeed(stockId));let prev=35+rand()*180;const data=[];for(let i=0;i<125;i++){const d=new Date(Date.UTC(2000, i, 1));const time=d.toISOString().slice(0,7)+'-01';const open=prev*(.96+rand()*.08);const close=Math.max(.5,open*(.88+rand()*.24));const high=Math.max(open,close)*(1+rand()*.08);const low=Math.max(.1,Math.min(open,close)*(1-rand()*.08));const volume=Math.round(50000+rand()*4500000);data.push({time,open:+open.toFixed(2),high:+high.toFixed(2),low:+low.toFixed(2),close:+close.toFixed(2),volume}) ;prev=close;}chartSyntheticCache.set(stockId,data);return data}
function monthTime(m){return m+'-01'}
function averageLine(data,period,key){return data.map((d,i)=>{if(i+1<period)return {time:d.time};let sum=0;for(let j=i-period+1;j<=i;j++)sum+=Number(data[j][key]||0);return {time:d.time,value:sum/period}}).filter(p=>p.value!==undefined)}
function aggregateYears(data){const groups=new Map();for(const d of data){const y=d.time.slice(0,4);if(!groups.has(y))groups.set(y,{time:y+'-01-01',open:d.open,high:d.high,low:d.low,close:d.close,volume:0});const g=groups.get(y);g.high=Math.max(g.high,d.high);g.low=Math.min(g.low,d.low);g.close=d.close;g.volume+=d.volume}return [...groups.values()]}
function chartDataThroughTurn(){const visible=chartMonthData.filter(d=>d.time.slice(0,7)<=chartTurn);return chartMode==='year'?aggregateYears(visible):visible}
function makeChartOptions(el,height){return {width:Math.max(280,el.clientWidth||600),height,layout:{background:{type:'solid',color:getComputedStyle(document.querySelector('.chart-shell')||document.body).backgroundColor||'#fff'},textColor:getComputedStyle(document.body).color},grid:{vertLines:{color:'rgba(130,145,160,.12)'},horzLines:{color:'rgba(130,145,160,.18)'}},rightPriceScale:{borderColor:'rgba(130,145,160,.35)'},timeScale:{borderColor:'rgba(130,145,160,.35)',timeVisible:false,secondsVisible:false},crosshair:{mode:LightweightCharts.CrosshairMode.Normal,vertLine:{labelBackgroundColor:'#526273'},horzLine:{labelBackgroundColor:'#526273'}}}}
function disposeStockCharts(){if(chartResizeObserver){chartResizeObserver.disconnect();chartResizeObserver=null}if(stockChartInstance){stockChartInstance.remove();stockChartInstance=null}if(volumeChartInstance){volumeChartInstance.remove();volumeChartInstance=null}chartSeries={}}
function chartHoldingMetrics(data){const h=chartAssetId?holdings[chartAssetId]:null;const box=$('chartPurchaseMetrics');const legend=$('chartPurchaseLineLegend');if(!h||h.qty<=1e-8){box.classList.add('no-position');box.innerHTML='<div class="purchase-metric"><div class="label">보유 상태</div><div class="value">미보유</div><div class="sub">이 종목을 매수하면 평균 매수가·평가손익·수익률이 표시됩니다.</div></div>';legend.classList.add('hidden');if(chartSeries.purchaseLine&&chartSeries.candle){try{chartSeries.candle.removePriceLine(chartSeries.purchaseLine)}catch{}chartSeries.purchaseLine=null}return}box.classList.remove('no-position');const avg=Number(h.avgCost)||Number(h.lastPrice)||0;const current=currentPrice(chartAssetId)||(data.length?data[data.length-1].close:0);const qty=h.qty;const value=qty*current;const cost=qty*avg;const pnl=value-cost;const pct=cost?pnl/cost*100:0;const cls=pnl>=0?'positive':'negative';box.innerHTML=`<div class="purchase-metric"><div class="label">평균 매수가</div><div class="value">${won(avg)}</div><div class="sub">가중평균 매입 단가</div></div><div class="purchase-metric"><div class="label">현재가</div><div class="value">${won(current)}</div><div class="sub">게임 현재 턴 종가</div></div><div class="purchase-metric"><div class="label">주당 손익</div><div class="value ${cls}">${pnl/qty>=0?'+':''}${won(pnl/qty)}</div><div class="sub">현재가 − 평균 매수가</div></div><div class="purchase-metric"><div class="label">평가손익 / 수익률</div><div class="value ${cls}">${pnl>=0?'+':''}${won(pnl)}</div><div class="sub ${cls}">${pct>=0?'+':''}${pct.toFixed(2)}%</div></div><div class="purchase-metric"><div class="label">보유 평가액</div><div class="value">${won(value)}</div><div class="sub">${qty.toLocaleString('ko-KR',{maximumFractionDigits:6})}주/단위 · 매입금 ${won(cost)}</div></div>`;legend.classList.remove('hidden');if(chartSeries.candle){if(chartSeries.purchaseLine){try{chartSeries.candle.removePriceLine(chartSeries.purchaseLine)}catch{}}chartSeries.purchaseLine=chartSeries.candle.createPriceLine({price:avg,color:'#ffb74d',lineWidth:2,lineStyle:LightweightCharts.LineStyle.Dashed,axisLabelVisible:true,title:'평균 매수가'});}}
function drawStockCharts(initial=false){if(!stockChartInstance||!volumeChartInstance)return;const data=chartDataThroughTurn();chartRenderedData=data;const candles=data.map(d=>({time:d.time,open:d.open,high:d.high,low:d.low,close:d.close}));const bars=data.map(d=>({time:d.time,value:d.volume,color:d.close>=d.open?STOCK_CHART_COLORS.up:STOCK_CHART_COLORS.down}));if(initial){chartSeries.candle.setData(candles);chartSeries.volume.setData(bars);for(const period of [5,20,60,120]){chartSeries['priceMa'+period].setData(averageLine(data,period,'close'));chartSeries['volumeMa'+period].setData(averageLine(data,period,'volume'))}}else{const last=data[data.length-1];if(last){chartSeries.candle.update({time:last.time,open:last.open,high:last.high,low:last.low,close:last.close});chartSeries.volume.update({time:last.time,value:last.volume,color:last.close>=last.open?STOCK_CHART_COLORS.up:STOCK_CHART_COLORS.down});for(const period of [5,20,60,120]){const price=averageLine(data,period,'close').slice(-1)[0];if(price&&price.value!==undefined)chartSeries['priceMa'+period].update(price);const vol=averageLine(data,period,'volume').slice(-1)[0];if(vol&&vol.value!==undefined)chartSeries['volumeMa'+period].update(vol)}}}const last=data[data.length-1],prior=data[data.length-2];if(last){chartSeries.candle.applyOptions({lastValueVisible:true,priceLineVisible:true,priceLineColor:last.close>=last.open?STOCK_CHART_COLORS.up:STOCK_CHART_COLORS.down});chartSeries.volume.applyOptions({lastValueVisible:true,priceLineVisible:false});$('chartLastPrice').textContent=chartNum(last.close);const diff=prior?last.close-prior.close:0,pct=prior?diff/prior.close*100:0;$('chartChange').textContent=`전월 대비 ${diff>=0?'+':''}${chartNum(diff)} (${pct>=0?'+':''}${pct.toFixed(2)}%)`;$('chartChange').className='small '+(diff>=0?'positive':'negative');$('chartTurnLabel').textContent=`차트 턴: ${chartTurn} · 표시 ${data.length}개 캔들`}const fake=2650+data.length*1.7;$('dummyIndexName').textContent=`KOSPI · ${fake.toLocaleString('ko-KR',{maximumFractionDigits:2})}`;$('dummyIndexChange').textContent='+12.50 (+0.47%)';chartSeries.candle.setMarkers(makeExtremeMarkers(data));chartHoldingMetrics(data);}
function makeExtremeMarkers(data){if(!data.length)return[];const range=stockChartInstance.timeScale().getVisibleLogicalRange();let from=0,to=data.length-1;if(range){from=Math.max(0,Math.floor(range.from));to=Math.min(data.length-1,Math.ceil(range.to))}if(to<from)return[];let hi=from,lo=from;for(let i=from+1;i<=to;i++){if(data[i].high>data[hi].high)hi=i;if(data[i].low<data[lo].low)lo=i}const last=data[data.length-1];const highPct=(data[hi].high/last.close-1)*100,lowPct=(data[lo].low/last.close-1)*100;return [{time:data[hi].time,position:'aboveBar',color:STOCK_CHART_COLORS.up,shape:'arrowDown',text:`최고 ${chartNum(data[hi].high)} (${highPct>=0?'+':''}${highPct.toFixed(2)}%, ${data[hi].time.slice(0,7)})`},{time:data[lo].time,position:'belowBar',color:STOCK_CHART_COLORS.down,shape:'arrowUp',text:`최저 ${chartNum(data[lo].low)} (${lowPct>=0?'+':''}${lowPct.toFixed(2)}%, ${data[lo].time.slice(0,7)})`}].filter(m=>m.time)}
function setChartMode(mode){chartMode=mode;$('chartMonthTab').classList.toggle('active',mode==='month');$('chartYearTab').classList.toggle('active',mode==='year');const data=chartDataThroughTurn();chartSeries.candle.setData(data.map(d=>({time:d.time,open:d.open,high:d.high,low:d.low,close:d.close})));chartSeries.volume.setData(data.map(d=>({time:d.time,value:d.volume,color:d.close>=d.open?STOCK_CHART_COLORS.up:STOCK_CHART_COLORS.down})));for(const period of [5,20,60,120]){chartSeries['priceMa'+period].setData(averageLine(data,period,'close'));chartSeries['volumeMa'+period].setData(averageLine(data,period,'volume'))}drawStockCharts(true);stockChartInstance.timeScale().fitContent();}
async function toggleStockChart(id){const modal=$('stockChartModal');if(!modal.classList.contains('hidden')&&chartAssetId===id){closeStockChart();return}const asset=assetById.get(id);if(!asset)return;chartAssetId=id;chartTurn=month||'2005-03';if(chartTurn<'2000-01')chartTurn='2000-01';modal.classList.remove('hidden');$('chartAssetName').textContent=(asset.name||asset.symbol||id);$('chartAssetMeta').textContent=`${asset.symbol||id} · ${asset.asset_class||''} · ${asset.exchange||''}`;disposeStockCharts();chartMonthData=await loadStockData(id);chartMode='month';$('chartMonthTab').classList.add('active');$('chartYearTab').classList.remove('active');const ph=$('stockPriceChart'),vh=$('stockVolumeChart');stockChartInstance=LightweightCharts.createChart(ph,makeChartOptions(ph,330));volumeChartInstance=LightweightCharts.createChart(vh,makeChartOptions(vh,150));chartSeries.candle=stockChartInstance.addCandlestickSeries({upColor:STOCK_CHART_COLORS.up,downColor:STOCK_CHART_COLORS.down,borderUpColor:STOCK_CHART_COLORS.up,borderDownColor:STOCK_CHART_COLORS.down,wickUpColor:STOCK_CHART_COLORS.up,wickDownColor:STOCK_CHART_COLORS.down,lastValueVisible:true,priceLineVisible:true});for(const [period,color] of [[5,STOCK_CHART_COLORS.ma5],[20,STOCK_CHART_COLORS.ma20],[60,STOCK_CHART_COLORS.ma60],[120,STOCK_CHART_COLORS.ma120]]){chartSeries['priceMa'+period]=stockChartInstance.addLineSeries({color,lineWidth:1,priceLineVisible:false,lastValueVisible:false});chartSeries['volumeMa'+period]=volumeChartInstance.addLineSeries({color,lineWidth:1,priceLineVisible:false,lastValueVisible:false})}chartSeries.volume=volumeChartInstance.addHistogramSeries({priceFormat:{type:'volume'},priceScaleId:'right',lastValueVisible:true,priceLineVisible:false});stockChartInstance.priceScale('right').applyOptions({scaleMargins:{top:.12,bottom:.08}});volumeChartInstance.priceScale('right').applyOptions({scaleMargins:{top:.1,bottom:.05}});stockChartInstance.timeScale().subscribeVisibleLogicalRangeChange(()=>{if(chartSeries.candle&&chartRenderedData.length)chartSeries.candle.setMarkers(makeExtremeMarkers(chartRenderedData));});stockChartInstance.subscribeCrosshairMove(param=>{if(!param||!param.time){$('chartOhlc').textContent='십자선을 올리거나 터치하면 OHLC가 표시됩니다.';return}const d=chartRenderedData.find(x=>x.time===param.time);$('chartOhlc').textContent=d?`${String(d.time).slice(0,7)} · 시 ${chartNum(d.open)} · 고 ${chartNum(d.high)} · 저 ${chartNum(d.low)} · 종 ${chartNum(d.close)} · 거래량 ${chartNum(d.volume)}`:''});stockChartInstance.timeScale().subscribeVisibleLogicalRangeChange(range=>{if(range)volumeChartInstance.timeScale().setVisibleLogicalRange(range)});volumeChartInstance.timeScale().subscribeVisibleLogicalRangeChange(range=>{if(range)stockChartInstance.timeScale().setVisibleLogicalRange(range)});drawStockCharts(true);stockChartInstance.timeScale().fitContent();volumeChartInstance.timeScale().fitContent();chartResizeObserver=new ResizeObserver(()=>{if(stockChartInstance&&volumeChartInstance){stockChartInstance.applyOptions({width:Math.max(280,ph.clientWidth)});volumeChartInstance.applyOptions({width:Math.max(280,vh.clientWidth)})}});chartResizeObserver.observe(ph);chartResizeObserver.observe(vh);}
function closeStockChart(){$('stockChartModal').classList.add('hidden');disposeStockCharts();chartAssetId=null;chartMonthData=[];chartRenderedData=[]}
window.toggleStockChart=toggleStockChart;$('chartCloseBtn').onclick=closeStockChart;$('stockChartModal').addEventListener('click',e=>{if(e.target===$('stockChartModal'))closeStockChart()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('stockChartModal').classList.contains('hidden'))closeStockChart()});$('chartMonthTab').onclick=()=>setChartMode('month');$('chartYearTab').onclick=()=>setChartMode('year');$('chartNextMonthBtn').onclick=()=>{const next=addMonthsKey(chartTurn,1);if(!chartMonthData.some(d=>d.time.slice(0,7)===next)){if(next>chartMonthData[chartMonthData.length-1].time.slice(0,7)){$('chartTurnLabel').textContent='더미 데이터 범위(2000-01~2010-05) 끝';return}}chartTurn=next;const visible=chartDataThroughTurn();if(visible.length>=chartRenderedData.length&&visible.length){const d=visible[visible.length-1];chartSeries.candle.update({time:d.time,open:d.open,high:d.high,low:d.low,close:d.close});chartSeries.volume.update({time:d.time,value:d.volume,color:d.close>=d.open?STOCK_CHART_COLORS.up:STOCK_CHART_COLORS.down});for(const period of [5,20,60,120]){const p=averageLine(visible,period,'close').slice(-1)[0],v=averageLine(visible,period,'volume').slice(-1)[0];if(p?.value!==undefined)chartSeries['priceMa'+period].update(p);if(v?.value!==undefined)chartSeries['volumeMa'+period].update(v)}chartRenderedData=visible;chartSeries.candle.setMarkers(makeExtremeMarkers(visible))}else{drawStockCharts(true)}const last=visible[visible.length-1],prev=visible[visible.length-2];if(last){$('chartLastPrice').textContent=chartNum(last.close);const diff=prev?last.close-prev.close:0,pct=prev?diff/prev.close*100:0;$('chartChange').textContent=`전월 대비 ${diff>=0?'+':''}${chartNum(diff)} (${pct>=0?'+':''}${pct.toFixed(2)}%)`;$('chartChange').className='small '+(diff>=0?'positive':'negative')}$('chartTurnLabel').textContent=`차트 턴: ${chartTurn} · 표시 ${visible.length}개 캔들`;chartHoldingMetrics(visible)};



// Bottom navigation is a shortcut to existing sections; no new game features are added.
document.querySelectorAll('.bottom-tabs [data-target]').forEach(btn=>btn.addEventListener('click',()=>{
 document.querySelectorAll('.bottom-tabs button').forEach(b=>b.classList.toggle('active',b===btn));
 const target=document.getElementById(btn.dataset.target); if(target)target.scrollIntoView({behavior:'smooth',block:'start'});
}));
