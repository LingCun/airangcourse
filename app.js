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
let courseMarkers = [];
let courseInfoWindow = null;
let pendingPlaceIndex = null;
let courseRouteLine = null;

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

function navigationUrl(place) {
  const appName = encodeURIComponent('https://lingcun.github.io/airangcourse/');
  const destination = `dlat=${place.lat}&dlng=${place.lng}&dname=${encodeURIComponent(place.name)}&appname=${appName}`;
  if (/Android/i.test(navigator.userAgent)) {
    return `intent://navigation?${destination}#Intent;scheme=nmap;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;package=com.nhn.android.nmap;end`;
  }
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return `nmap://navigation?${destination}`;
  return 'https://map.naver.com/p/search/' + encodeURIComponent(place.name);
}

function addNavigationButtons() {
  const navigationLegs = [
    {article: 0, destination: coursePlaces[1], label: '정성카츠로 길안내'},
    {article: 1, destination: coursePlaces[2], label: '박물관으로 길안내'},
    {article: 3, destination: coursePlaces[0], label: '마들역으로 길안내'}
  ];
  navigationLegs.forEach(({article, destination, label}) => {
    const container = document.querySelectorAll('.timeline article')[article].querySelector('div');
    const button = document.createElement('a');
    button.className = 'naver-navigation-link';
    button.href = navigationUrl(destination);
    button.innerHTML = `<span class="navigation-emoji" aria-hidden="true">🧭</span><span>${label}<small>네이버지도 앱</small></span><span class="navigation-arrow" aria-hidden="true">→</span>`;
    button.setAttribute('aria-label', `네이버지도 앱에서 ${label}`);
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
      button.addEventListener('click', event => {
        event.preventDefault();
        const clickedAt = Date.now();
        window.location.href = button.href;
        window.setTimeout(() => {
          if (Date.now() - clickedAt < 2000) window.location.href = 'https://itunes.apple.com/app/id311867728?mt=8';
        }, 1500);
      });
    } else if (!/Android/i.test(navigator.userAgent)) {
      button.target = '_blank';
      button.rel = 'noopener';
      button.title = 'PC에서는 목적지의 네이버지도 화면을 엽니다';
    }
    container.append(button);
  });
}

function addTimelinePlaceBadges() {
  const timelineStops = [
    {article: 0, place: 0, badge: '1', name: '출발지 마들역'},
    {article: 1, place: 1, badge: '2', name: '점심 정성카츠 공릉점'},
    {article: 2, place: 2, badge: '3-A', name: '서울생활사박물관'},
    {article: 3, place: 2, badge: '3-B', name: '어린이체험실 옴팡'},
    {article: 4, place: 0, badge: '↩1', name: '귀가 마들역'}
  ];
  const articles = document.querySelectorAll('.timeline article');
  timelineStops.forEach(({article, place, badge, name}) => {
    const item = articles[article];
    const heading = item.querySelector('h3');
    const badgeElement = document.createElement('span');
    badgeElement.className = 'timeline-place-badge';
    badgeElement.textContent = badge;
    heading.prepend(badgeElement);
    item.dataset.placeIndex = place;
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.setAttribute('aria-label', `${name} 지도에서 보기`);
    const activate = event => {
      if (event.type === 'click' && event.target.closest('a,button')) return;
      if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
      event.preventDefault();
      focusCoursePlace(place);
    };
    item.addEventListener('click', activate);
    item.addEventListener('keydown', activate);
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
  courseRouteLine = new window.naver.maps.Polyline({
    map: courseMap,
    path: [positions[0], positions[1], positions[2], positions[0]],
    strokeColor: '#20a9df',
    strokeOpacity: 0.82,
    strokeWeight: 6,
    strokeLineCap: 'round',
    strokeLineJoin: 'round'
  });
  courseMarkers = positions.map((position, index) => {
    bounds.extend(position);
    const marker = new window.naver.maps.Marker({
      map: courseMap,
      position,
      title: coursePlaces[index].name,
      icon: {
        content: `<div class="course-map-marker"><span>${index + 1}</span><b>${coursePlaces[index].name.replace(' · 옴팡', '')}</b></div>`,
        anchor: new window.naver.maps.Point(20, 42)
      }
    });
    window.naver.maps.Event.addListener(marker, 'click', () => focusCoursePlace(index));
    return marker;
  });
  courseMap.fitBounds(bounds, {top: 48, right: 48, bottom: 48, left: 48});
  $('#map-status').textContent = '3곳 · 출발지 포함';
  $('#map-status').classList.add('ready');
  if (pendingPlaceIndex !== null) {
    const placeIndex = pendingPlaceIndex;
    pendingPlaceIndex = null;
    focusCoursePlace(placeIndex);
  }
}

function focusCoursePlace(index) {
  if (!courseMap || !courseMarkers[index]) {
    pendingPlaceIndex = index;
    loadCourseMap();
    return;
  }
  const place = coursePlaces[index];
  const marker = courseMarkers[index];
  courseMap.panTo(marker.getPosition());
  courseMap.setZoom(16);
  document.querySelectorAll('.timeline article').forEach(article => {
    article.classList.toggle('map-selected', Number(article.dataset.placeIndex) === index);
  });
  if (!courseInfoWindow) courseInfoWindow = new window.naver.maps.InfoWindow({borderWidth: 0, backgroundColor: 'transparent'});
  courseInfoWindow.setContent(`<div class="course-map-info"><strong><span>${index + 1}</span>${place.name}</strong><a href="${navigationUrl(place)}"><i aria-hidden="true">🧭</i> 이곳으로 길안내</a></div>`);
  courseInfoWindow.open(courseMap, marker);
  $('#course-map').scrollIntoView({behavior: 'smooth', block: 'center'});
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
addNavigationButtons();
addTimelinePlaceBadges();
