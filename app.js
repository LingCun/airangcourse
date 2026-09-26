const $ = selector => document.querySelector(selector);

const state = {
  step: 0,
  region: '노원구',
  date: '2026-09-27',
  origin: '마들역',
  transport: '자가용',
  adults: 2,
  children: 1,
  age: 5,
  prefs: ['실내 중심', '가성비', '역할놀이'],
  start: '12:00',
  end: '19:00',
  budget: '50000'
};

const steps = [
  {title: '어디로 갈까요?', html: () => `<p class="step-copy">출발 정보를 알려주시면 이동이 편한 순서로 짜드려요.</p><div class="form-grid"><label>여행 지역<input data-key="region" value="${state.region}"></label><label>여행 날짜<input data-key="date" type="date" value="${state.date}"></label><label>출발지<input data-key="origin" value="${state.origin}"></label><label>이동수단<select data-key="transport"><option>자가용</option><option>대중교통</option><option>도보</option></select></label></div>`},
  {title: '누구와 가나요?', html: () => `<p class="step-copy">아이의 나이와 이동 환경에 맞춰 장소를 골라드려요.</p><div class="form-grid"><label>성인 인원<input data-key="adults" type="number" value="${state.adults}"></label><label>아이 인원<input data-key="children" type="number" value="${state.children}"></label><label>아이 나이<input data-key="age" type="number" value="${state.age}"></label><label>이동 보조수단<select><option>웨건</option><option>유모차</option><option>없음</option></select></label></div>`},
  {title: '어떤 하루를 원하나요?', html: () => `<p class="step-copy">원하는 분위기를 골라주세요. 여러 개를 선택할 수 있어요.</p><div class="choice-grid">${['실내 중심','야외 활동','가성비','무료 중심','역할놀이','특별한 체험'].map(value => `<button class="choice ${state.prefs.includes(value) ? 'selected' : ''}" data-choice="${value}">${value}</button>`).join('')}</div><div class="form-grid compact"><label>출발 시간<input data-key="start" type="time" value="${state.start}"></label><label>귀가 시간<input data-key="end" type="time" value="${state.end}"></label><label>가족 전체 예산<input data-key="budget" type="number" value="${state.budget}"></label></div>`},
  {title: '이대로 만들어볼까요?', html: () => `<p class="step-copy">선택한 내용을 확인한 뒤 맞춤 코스를 만들어주세요.</p><div class="summary-list"><p><span>지역·날짜</span><b>${state.region} · ${state.date}</b></p><p><span>가족</span><b>성인 ${state.adults}명 · ${state.age}세 아이 ${state.children}명</b></p><p><span>선호</span><b>${state.prefs.join(' · ')}</b></p><p><span>출발</span><b>${state.origin} · ${state.transport}</b></p></div>`}
];

const coursePlaces = [
  {name: '마들역', lat: 37.66472, lng: 127.05778},
  {name: '정성카츠 공릉점', lat: 37.62318, lng: 127.07632},
  {name: '서울생활사박물관 · 옴팡', lat: 37.6202, lng: 127.0765}
];

let courseMap = null;
let mapLoadPromise = null;

function show(id) {
  document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
  $(id).classList.remove('hidden');
  scrollTo({top: 0, behavior: 'smooth'});
  if (id === '#result') loadCourseMap();
}

function capture() {
  document.querySelectorAll('[data-key]').forEach(element => { state[element.dataset.key] = element.value; });
}

function start(preset) {
  if (preset === 'indoor') state.prefs = ['실내 중심', '가성비'];
  if (preset === 'free') state.prefs = ['무료 중심', '실내 중심'];
  if (preset === 'play') state.prefs = ['역할놀이', '특별한 체험'];
  if (preset === 'half') state.end = '16:00';
  state.step = 0;
  render();
  show('#wizard-view');
}

function render() {
  const currentStep = steps[state.step];
  $('#step-title').textContent = currentStep.title;
  $('#step-number').textContent = state.step + 1;
  $('#progress-fill').style.width = (state.step + 1) * 25 + '%';
  $('#step-panel').innerHTML = currentStep.html();
  $('#prev-step').style.visibility = state.step ? 'visible' : 'hidden';
  $('#next-step').textContent = state.step === 3 ? '코스 만들기' : '다음';
  document.querySelectorAll('[data-choice]').forEach(button => {
    button.onclick = () => {
      button.classList.toggle('selected');
      state.prefs = button.classList.contains('selected')
        ? [...new Set([...state.prefs, button.dataset.choice])]
        : state.prefs.filter(value => value !== button.dataset.choice);
    };
  });
}

function addNaverMapLinks() {
  [['마들역',0],['정성카츠 공릉점',1],['서울생활사박물관',2],['서울생활사박물관 어린이체험실 옴팡',3],['마들역',4]].forEach(([query,index]) => {
    const container = document.querySelectorAll('.timeline article')[index].querySelector('div');
    if (container.querySelector('a')) return;
    const link = document.createElement('a');
    link.className = 'naver-map-link';
    link.target = '_blank';
    link.rel = 'noopener';
    link.href = 'https://map.naver.com/p/search/' + encodeURIComponent(query);
    link.textContent = '네이버지도에서 보기';
    container.append(link);
  });
}

function setMapFailure() {
  $('#map-status').textContent = '지도 연결을 확인해주세요';
  $('#map-fallback').classList.remove('hidden');
}

function loadNaverMapsSdk() {
  if (window.naver?.maps) return Promise.resolve();
  if (mapLoadPromise) return mapLoadPromise;
  mapLoadPromise = new Promise((resolve, reject) => {
    const clientId = window.NAVER_MAP_CLIENT_ID;
    if (!clientId) return reject(new Error('NAVER Maps Client ID is missing'));
    window.initAirangCourseMap = resolve;
    const script = document.createElement('script');
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}&callback=initAirangCourseMap`;
    script.async = true;
    script.onerror = () => reject(new Error('NAVER Maps SDK failed to load'));
    document.head.append(script);
  });
  return mapLoadPromise;
}

function createCourseMap() {
  if (courseMap) {
    window.naver.maps.Event.trigger(courseMap, 'resize');
    return;
  }
  const positions = coursePlaces.map(place => new window.naver.maps.LatLng(place.lat, place.lng));
  courseMap = new window.naver.maps.Map('course-map', {center: positions[1], zoom: 12, scaleControl: false});
  const bounds = new window.naver.maps.LatLngBounds();
  positions.forEach((position, index) => {
    bounds.extend(position);
    new window.naver.maps.Marker({
      map: courseMap,
      position,
      title: coursePlaces[index].name,
      icon: {content: `<div class="course-map-marker"><span>${index + 1}</span></div>`, anchor: new window.naver.maps.Point(17, 34)}
    });
  });
  courseMap.fitBounds(bounds, {top: 48, right: 48, bottom: 48, left: 48});
  $('#map-status').textContent = '3곳 · 출발지 포함';
  $('#map-status').classList.add('ready');
}

function loadCourseMap() {
  $('#map-fallback').classList.add('hidden');
  loadNaverMapsSdk().then(() => requestAnimationFrame(createCourseMap)).catch(setMapFailure);
}

function showResult() {
  capture();
  $('#result-title').textContent = state.region + ' 우리 가족 맞춤 코스가 완성됐어요';
  $('#time-1').textContent = state.start;
  $('#origin-result').textContent = state.origin + ' 출발';
  $('#return-result').textContent = state.origin + '으로 출발';
  $('#return-copy').textContent = '교통상황을 고려해 ' + state.end + ' 전 여유 있게 귀가';
  show('#result');
}

$('.start-course').onclick = () => start();
document.querySelectorAll('[data-preset]').forEach(button => { button.onclick = () => start(button.dataset.preset); });
$('#next-step').onclick = () => { capture(); state.step < 3 ? (state.step++, render()) : showResult(); };
$('#prev-step').onclick = () => { capture(); if (state.step) { state.step--; render(); } };
$('#view-recent').onclick = () => show('#result');
$('#edit-course').onclick = () => { state.step = 3; render(); show('#wizard-view'); };
$('#go-home').onclick = () => show('#home-view');
const drawer = $('#drawer-layer');
$('#open-menu').onclick = () => drawer.classList.remove('hidden');
$('#close-menu').onclick = () => drawer.classList.add('hidden');
drawer.onclick = event => { if (event.target === drawer) drawer.classList.add('hidden'); };
$('[data-nav="home"]').onclick = () => { drawer.classList.add('hidden'); show('#home-view'); };
$('[data-nav="new"]').onclick = () => { drawer.classList.add('hidden'); start(); };
$('[data-nav="recent"]').onclick = () => { drawer.classList.add('hidden'); show('#result'); };
const modal = $('#family-modal');
$('#open-family').onclick = () => { drawer.classList.add('hidden'); modal.classList.remove('hidden'); };
$('#close-family').onclick = () => modal.classList.add('hidden');
$('#save-family').onclick = () => {
  state.adults = $('#adults').value;
  state.children = $('#children').value;
  state.age = $('#child-age').value;
  $('#family-summary').textContent = `성인 ${state.adults}명 · ${state.age}세 아이 ${state.children}명`;
  modal.classList.add('hidden');
};

render();
addNaverMapLinks();
