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
  {id: '10000000-0000-0000-0000-000000000001', name: '마들역', lat: 37.66472, lng: 127.05778},
  {id: '10000000-0000-0000-0000-000000000002', name: '정성카츠 공릉점', lat: 37.62318, lng: 127.07632},
  {id: '10000000-0000-0000-0000-000000000003', name: '서울생활사박물관 · 옴팡', lat: 37.6202, lng: 127.0765}
];

async function loadPlaces() {
  try {
    const {places} = await apiRequest('/api/places');
    const order = coursePlaces.map(place => place.id);
    const byId = new Map(places.map(place => [place.id, place]));
    const loaded = order.map(id => byId.get(id)).filter(Boolean).map(place => ({
      id: place.id, name: place.name, lat: Number(place.latitude), lng: Number(place.longitude)
    }));
    if (loaded.length === order.length) coursePlaces.splice(0, coursePlaces.length, ...loaded);
  } catch (error) { console.warn('Places unavailable', error); }
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: {'content-type': 'application/json', ...(options.headers || {})}
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'request_failed');
    error.status = response.status;
    throw error;
  }
  return data;
}

let courseMap = null;
let mapLoadPromise = null;
let courseMarkers = [];
let courseInfoWindow = null;
let pendingPlaceIndex = null;
let courseRouteLines = [];

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
    button.innerHTML = `<span class="navigation-icon" aria-hidden="true">N</span><span>${label}</span><span class="navigation-chevron" aria-hidden="true">›</span>`;
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

function addFavoriteButtons() {
  const targets = [{article: 1, place: 1}, {article: 3, place: 2}];
  const articles = document.querySelectorAll('.timeline article');
  targets.forEach(({article, place}) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'favorite-place-button';
    button.textContent = '♡ 찜하기';
    button.onclick = async event => {
      event.stopPropagation();
      button.disabled = true;
      try {
        await apiRequest('/api/favorites', {method: 'POST', body: JSON.stringify({placeId: coursePlaces[place].id})});
        button.textContent = '♥ 찜 완료';
      } catch (error) {
        button.textContent = error.status === 401 ? '로그인 후 찜하기' : '다시 시도해주세요';
      } finally { button.disabled = false; }
    };
    articles[article].querySelector('div').append(button);
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
  loadRoadRoute();
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

async function loadRoadRoute() {
  try {
    const fetchRoadPath = async places => {
      const coordinates = places.map(place => `${place.lng},${place.lat}`).join(';');
      const url = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Road route request failed');
      const data = await response.json();
      const routeCoordinates = data.routes?.[0]?.geometry?.coordinates;
      if (!routeCoordinates?.length) throw new Error('Road route is empty');
      return routeCoordinates.map(([lng, lat]) => new window.naver.maps.LatLng(lat, lng));
    };
    const [outboundPath, returnPath] = await Promise.all([
      fetchRoadPath(coursePlaces),
      fetchRoadPath([coursePlaces[2], coursePlaces[0]])
    ]);
    const routeBounds = new window.naver.maps.LatLngBounds();
    [...outboundPath, ...returnPath].forEach(position => routeBounds.extend(position));
    const drawRoute = (path, color) => {
      const outline = new window.naver.maps.Polyline({
        map: courseMap, path, strokeColor: '#ffffff', strokeOpacity: 0.96,
        strokeWeight: 9, strokeLineCap: 'round', strokeLineJoin: 'round'
      });
      const line = new window.naver.maps.Polyline({
        map: courseMap, path, strokeColor: color, strokeOpacity: 0.95,
        strokeWeight: 5, strokeLineCap: 'round', strokeLineJoin: 'round'
      });
      courseRouteLines.push(outline, line);
    };
    drawRoute(outboundPath, '#20a9df');
    drawRoute(returnPath, '#f39a67');
    if (!document.querySelector('.timeline article.map-selected')) {
      courseMap.fitBounds(routeBounds, {top: 48, right: 48, bottom: 48, left: 48});
    }
    $('#map-status').textContent = '가는 길 · 오는 길';
  } catch (error) {
    console.warn('Road route unavailable', error);
    $('#map-status').textContent = '장소 위치 · 경로 확인 필요';
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
  courseInfoWindow.setContent(`<div class="course-map-info"><strong><span>${index + 1}</span>${place.name}</strong><a href="${navigationUrl(place)}"><i aria-hidden="true">N</i> 이곳으로 길안내</a></div>`);
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
$('#open-family').onclick = async () => {
  drawer.classList.add('hidden');
  modal.classList.remove('hidden');
  try {
    const {family} = await apiRequest('/api/family');
    if (!family) return;
    $('#adults').value = family.adult_count;
    $('#children').value = family.children.length;
    if (family.children[0]?.birth_year) $('#child-age').value = new Date().getFullYear() - family.children[0].birth_year;
    $('#mobility-aid').value = family.mobility_aid || 'none';
  } catch (error) {
    if (error.status !== 401) $('#family-save-status').textContent = '가족 정보를 불러오지 못했습니다.';
  }
};
$('#close-family').onclick = () => modal.classList.add('hidden');
$('#save-family').onclick = async () => {
  const button = $('#save-family');
  button.disabled = true;
  $('#family-save-status').textContent = '저장 중입니다.';
  try {
    const preferenceCodes = {'실내 중심': 'indoor', '야외 활동': 'outdoor', '가성비': 'value', '무료 중심': 'free', '역할놀이': 'role_play', '특별한 체험': 'experience'};
    const input = {
      adultCount: Number($('#adults').value), childCount: Number($('#children').value),
      childAge: Number($('#child-age').value), mobilityAid: $('#mobility-aid').value,
      preferences: state.prefs.map(value => preferenceCodes[value]).filter(Boolean)
    };
    await apiRequest('/api/family', {method: 'PUT', body: JSON.stringify(input)});
    state.adults = input.adultCount; state.children = input.childCount; state.age = input.childAge;
    $('#family-summary').textContent = `성인 ${state.adults}명 · ${state.age}세 아이 ${state.children}명`;
    $('#family-save-status').textContent = '가족 정보를 저장했습니다.';
    window.setTimeout(() => modal.classList.add('hidden'), 500);
  } catch (error) {
    $('#family-save-status').textContent = error.status === 401 ? '로그인 후 저장할 수 있습니다.' : '저장하지 못했습니다. 다시 시도해주세요.';
  } finally { button.disabled = false; }
};

$('#save-course').onclick = async () => {
  const button = $('#save-course');
  button.disabled = true;
  $('#course-save-status').textContent = '코스를 저장하는 중입니다.';
  try {
    const stops = [
      {placeId: coursePlaces[0].id, kind: 'origin', name: coursePlaces[0].name, latitude: coursePlaces[0].lat, longitude: coursePlaces[0].lng, arrivalAt: state.start},
      {placeId: coursePlaces[1].id, kind: 'place', name: coursePlaces[1].name, latitude: coursePlaces[1].lat, longitude: coursePlaces[1].lng, arrivalAt: '12:25', estimatedCost: 28800},
      {placeId: coursePlaces[2].id, kind: 'place', name: coursePlaces[2].name, latitude: coursePlaces[2].lat, longitude: coursePlaces[2].lng, arrivalAt: '13:40', estimatedCost: 0},
      {placeId: coursePlaces[0].id, kind: 'destination', name: coursePlaces[0].name, latitude: coursePlaces[0].lat, longitude: coursePlaces[0].lng, arrivalAt: '17:45'}
    ];
    await apiRequest('/api/courses', {method: 'POST', body: JSON.stringify({
      title: `${state.region} 우리 가족 맞춤 코스`, travelDate: state.date, region: state.region,
      transport: state.transport === '대중교통' ? 'public_transit' : state.transport === '도보' ? 'walk' : 'car',
      startsAt: state.start, endsAt: state.end, budget: state.budget,
      inputSnapshot: {adults: state.adults, children: state.children, age: state.age, preferences: state.prefs}, stops
    })});
    $('#course-save-status').textContent = '코스를 저장했습니다.';
    button.textContent = '저장 완료';
  } catch (error) {
    $('#course-save-status').textContent = error.status === 401 ? '로그인 후 저장할 수 있습니다.' : '코스를 저장하지 못했습니다.';
  } finally { button.disabled = false; }
};
const loginModal = $('#login-modal');
$('#open-login').onclick = () => { drawer.classList.add('hidden'); loginModal.classList.remove('hidden'); };
$('#close-login').onclick = () => loginModal.classList.add('hidden');
$('#continue-as-guest').onclick = () => loginModal.classList.add('hidden');
loginModal.onclick = event => { if (event.target === loginModal) loginModal.classList.add('hidden'); };
document.querySelectorAll('[data-provider]').forEach(button => {
  button.onclick = () => {
    window.location.href = `/api/auth?action=${button.dataset.provider.toLowerCase()}-start`;
  };
});

const favoritesModal = $('#favorites-modal');
$('#open-favorites').onclick = async () => {
  drawer.classList.add('hidden');
  favoritesModal.classList.remove('hidden');
  const list = $('#favorites-list');
  list.replaceChildren();
  const loading = document.createElement('p');
  loading.textContent = '저장한 장소를 불러오는 중입니다.';
  list.append(loading);
  try {
    const {places} = await apiRequest('/api/favorites');
    list.replaceChildren();
    if (!places.length) {
      const empty = document.createElement('p'); empty.textContent = '아직 찜한 장소가 없습니다.'; list.append(empty); return;
    }
    places.forEach(place => {
      const item = document.createElement('article');
      const copy = document.createElement('div');
      const name = document.createElement('strong'); name.textContent = place.name;
      const category = document.createElement('small'); category.textContent = place.category || '장소';
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '삭제';
      copy.append(name, category); item.append(copy, remove); list.append(item);
      remove.onclick = async () => {
        await apiRequest(`/api/favorites?placeId=${encodeURIComponent(place.id)}`, {method: 'DELETE'});
        item.remove();
      };
    });
  } catch (error) {
    list.replaceChildren();
    const message = document.createElement('p');
    message.textContent = error.status === 401 ? '로그인 후 찜한 장소를 볼 수 있습니다.' : '찜한 장소를 불러오지 못했습니다.';
    list.append(message);
  }
};
$('#close-favorites').onclick = () => favoritesModal.classList.add('hidden');
favoritesModal.onclick = event => { if (event.target === favoritesModal) favoritesModal.classList.add('hidden'); };

async function loadSession() {
  try {
    const response = await fetch('/api/auth?action=session', {credentials: 'same-origin'});
    if (!response.ok) return;
    const {user} = await response.json();
    if (!user) return;
    const loginCard = $('#open-login');
    loginCard.classList.add('signed-in');
    loginCard.innerHTML = `<span class="login-avatar">${user.picture ? `<img src="${user.picture}" alt="">` : '✓'}</span><span><strong>${user.name || '로그인 사용자'}</strong><small>${user.provider === 'naver' ? 'NAVER' : 'Google'} 계정으로 로그인됨</small></span><i>›</i>`;
    loginCard.onclick = () => { window.location.href = '/api/auth?action=logout'; };
    loadSavedSummary();
  } catch (error) {
    console.warn('Session unavailable', error);
  }
}

async function loadSavedSummary() {
  try {
    const {courses} = await apiRequest('/api/courses');
    if (!courses.length) return;
    const latest = courses[0];
    const recent = document.querySelector('.recent-card');
    recent.querySelector('h2').textContent = latest.title;
    recent.querySelector('p:last-child').textContent = `${String(latest.travel_date || '').slice(0, 10)} · ${latest.stop_count}곳 · 저장된 코스`;
  } catch (error) {
    if (error.status !== 401) console.warn('Saved courses unavailable', error);
  }
}

loadSession();

render();
addNavigationButtons();
addTimelinePlaceBadges();
addFavoriteButtons();
loadPlaces();
