const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const preferenceLabels = new Map();
const facilityLabels = new Map();
let currentUser = null;
let places = [];
let currentStops = [];
let latestCourseId = null;
let courseMap = null;
let mapPromise = null;

const state = {
  step: 0,
  region: '',
  date: new Date().toISOString().slice(0, 10),
  origin: '',
  transport: 'car',
  adults: 1,
  children: 0,
  age: 0,
  mobilityAid: 'none',
  prefs: [],
  start: '10:00',
  end: '17:00',
  budget: ''
};

const visitorId = (() => {
  const key = 'airang_visitor_id';
  let value = localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(key, value);
  }
  return value;
})();

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin', ...options,
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

function trackView(pageKey, pageTitle) {
  fetch('/api/events', {
    method: 'POST', credentials: 'same-origin', keepalive: true,
    headers: {'content-type': 'application/json'},
    body: JSON.stringify({visitorId, pageKey, pageTitle, path: location.pathname + location.search, referrer: document.referrer})
  }).catch(() => {});
}

function show(id) {
  $$('.view').forEach(view => view.classList.add('hidden'));
  $(id).classList.remove('hidden');
  scrollTo({top: 0, behavior: 'smooth'});
  const pages = {'#home-view': ['home', '홈'], '#wizard-view': [`course_step_${state.step + 1}`, `코스 만들기 ${state.step + 1}단계`], '#result': ['course_result', '추천 코스 결과']};
  if (pages[id]) trackView(...pages[id]);
}

function requireLogin(message = '로그인 후 저장 기능을 사용할 수 있어요.') {
  if (currentUser) return true;
  $('#login-note').textContent = message;
  $('#login-modal').classList.remove('hidden');
  return false;
}

function labelForPreference(code) { return preferenceLabels.get(code) || code; }
function money(value) { return Number(value || 0).toLocaleString('ko-KR') + '원'; }
function timeAt(index) {
  const [hour, minute] = state.start.split(':').map(Number);
  const total = hour * 60 + minute + index * 90;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

const steps = [
  {title: '어디로 갈까요?', html: () => `<p class="step-copy">지역과 출발지를 입력해주세요. 장소는 DB에서 불러옵니다.</p><div class="form-grid"><label>여행 지역<input data-key="region" value="${state.region}" placeholder="예: 노원구"></label><label>여행 날짜<input data-key="date" type="date" value="${state.date}"></label><label>출발지<input data-key="origin" value="${state.origin}" placeholder="예: 마들역"></label><label>이동수단<select data-key="transport"><option value="car">자가용</option><option value="public_transit">대중교통</option><option value="walk">도보</option><option value="mixed">혼합</option></select></label></div>`},
  {title: '우리 가족을 확인해주세요', html: () => `<p class="step-copy">로그인 계정에 저장된 가족 프로필을 사용합니다.</p><div class="summary-list"><p><span>가족</span><b>성인 ${state.adults}명 · 아이 ${state.children}명${state.children ? ` · ${state.age}세` : ''}</b></p><p><span>이동 보조수단</span><b>${{wagon:'웨건',stroller:'유모차',none:'없음'}[state.mobilityAid]}</b></p><p><span>선호</span><b>${state.prefs.map(labelForPreference).join(' · ') || '아직 선택하지 않음'}</b></p></div><button type="button" class="text-button" id="wizard-family-edit">가족 프로필 수정</button>`},
  {title: '시간과 예산을 정해주세요', html: () => `<p class="step-copy">가능한 시간과 예산 범위 안에서 장소를 조합합니다.</p><div class="form-grid compact"><label>출발 시간<input data-key="start" type="time" value="${state.start}"></label><label>귀가 시간<input data-key="end" type="time" value="${state.end}"></label><label>가족 전체 예산<input data-key="budget" type="number" min="0" value="${state.budget}" placeholder="예: 50000"></label></div>`},
  {title: '이 조건으로 코스를 만들까요?', html: () => `<p class="step-copy">장소 DB의 최신 정보로 코스를 구성합니다.</p><div class="summary-list"><p><span>지역·날짜</span><b>${state.region || '지역 미입력'} · ${state.date}</b></p><p><span>출발지</span><b>${state.origin || '출발지 미입력'}</b></p><p><span>시간</span><b>${state.start} ~ ${state.end}</b></p><p><span>예산</span><b>${state.budget ? money(state.budget) : '제한 없음'}</b></p></div>`}
];

function capture() {
  $$('[data-key]').forEach(element => { state[element.dataset.key] = element.value; });
}

function renderStep() {
  const current = steps[state.step];
  $('#step-title').textContent = current.title;
  $('#step-number').textContent = state.step + 1;
  $('#progress-fill').style.width = `${(state.step + 1) * 25}%`;
  $('#step-panel').innerHTML = current.html();
  $('#prev-step').style.visibility = state.step ? 'visible' : 'hidden';
  $('#next-step').textContent = state.step === 3 ? '코스 만들기' : '다음';
  const transport = $('[data-key="transport"]');
  if (transport) transport.value = state.transport;
  $('#wizard-family-edit')?.addEventListener('click', openFamily);
}

function openFamily() {
  if (!requireLogin('가족 프로필은 로그인 후 저장할 수 있어요.')) return;
  $('#drawer-layer').classList.add('hidden');
  $('#family-modal').classList.remove('hidden');
}

async function loadFamily() {
  if (!currentUser) return;
  const {family} = await apiRequest('/api/family');
  if (!family) return;
  state.adults = Number(family.adult_count);
  state.children = family.children.length;
  state.age = family.children[0]?.birth_year ? new Date().getFullYear() - Number(family.children[0].birth_year) : 0;
  state.mobilityAid = family.mobility_aid || 'none';
  state.prefs = family.preferences.map(item => item.code);
  $('#adults').value = state.adults;
  $('#children').value = state.children;
  $('#child-age').value = state.age;
  $('#mobility-aid').value = state.mobilityAid;
  renderPreferenceOptions();
  $('#family-summary').textContent = `성인 ${state.adults}명 · 아이 ${state.children}명${state.children ? ` · ${state.age}세` : ''}`;
  $('#family-preferences').textContent = state.prefs.map(labelForPreference).join(' · ') || '선호 활동을 선택해주세요';
}

function renderPreferenceOptions() {
  const container = $('#family-preference-options');
  container.replaceChildren(...[...preferenceLabels].map(([code, label]) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = `choice ${state.prefs.includes(code) ? 'selected' : ''}`;
    button.dataset.preference = code; button.textContent = label;
    button.onclick = () => button.classList.toggle('selected');
    return button;
  }));
}

async function loadReferenceData() {
  const [catalog, placeData] = await Promise.all([apiRequest('/api/catalog'), apiRequest('/api/places')]);
  catalog.preferences.forEach(item => preferenceLabels.set(item.code, item.label));
  catalog.facilities.forEach(item => facilityLabels.set(item.code, item.label));
  places = placeData.places.map(place => ({...place, lat: Number(place.latitude), lng: Number(place.longitude)}));
  renderPreferenceOptions();
}

function chooseStops() {
  const budget = state.budget === '' ? Infinity : Number(state.budget);
  const origin = places.find(place => place.category === '출발지' && (!state.origin || place.name.includes(state.origin))) || places.find(place => place.category === '출발지') || places[0];
  const candidates = places.filter(place => place.id !== origin?.id && Number(place.price_min || 0) <= budget);
  const selected = candidates.slice(0, 3);
  if (origin) selected.unshift(origin);
  currentStops = selected.map((place, index) => ({
    placeId: place.id, kind: index === 0 ? 'origin' : 'place', name: place.name,
    latitude: place.lat, longitude: place.lng, arrivalAt: timeAt(index),
    estimatedCost: Number(place.price_min || 0), category: place.category,
    facilities: place.facilities || []
  }));
  if (origin && selected.length > 1) currentStops.push({...currentStops[0], kind: 'destination', arrivalAt: state.end});
}

function navigationUrl(stop) { return `https://map.naver.com/p/search/${encodeURIComponent(stop.name)}`; }

function renderResult() {
  chooseStops();
  $('#result-title').textContent = currentStops.length ? `${state.region || '우리 동네'} 가족 맞춤 코스가 완성됐어요` : '등록된 장소가 아직 없어요';
  const total = currentStops.reduce((sum, stop) => sum + Number(stop.estimatedCost || 0), 0);
  $('#estimated-cost').textContent = money(total);
  const timeline = $('#timeline');
  timeline.replaceChildren(...currentStops.map((stop, index) => {
    const article = document.createElement('article');
    if (index > 0 && index < currentStops.length - 1) article.classList.add(index === 2 ? 'featured' : '');
    const details = stop.kind === 'origin' ? '코스 출발지' : stop.kind === 'destination' ? '여유 있게 귀가하세요' : [stop.category, ...stop.facilities.map(code => facilityLabels.get(code) || code)].filter(Boolean).join(' · ');
    article.innerHTML = `<time>${stop.arrivalAt || ''}</time><div><h3><span class="timeline-place-badge">${index + 1}</span>${stop.name}</h3><p>${details || '장소 상세 정보 확인 필요'}</p>${stop.estimatedCost != null ? `<b>${Number(stop.estimatedCost) ? money(stop.estimatedCost) : '무료'}</b>` : ''}<a class="naver-navigation-link" href="${navigationUrl(stop)}" target="_blank" rel="noopener"><span class="navigation-icon">N</span><span>네이버지도에서 보기</span></a>${stop.kind === 'place' ? '<button type="button" class="favorite-place-button">♡ 찜하기</button>' : ''}</div>`;
    const favorite = article.querySelector('.favorite-place-button');
    if (favorite) favorite.onclick = async () => {
      if (!requireLogin('장소 찜은 로그인 후 사용할 수 있어요.')) return;
      favorite.disabled = true;
      try { await apiRequest('/api/favorites', {method:'POST', body:JSON.stringify({placeId:stop.placeId})}); favorite.textContent = '♥ 찜 완료'; }
      catch { favorite.textContent = '다시 시도해주세요'; favorite.disabled = false; }
    };
    return article;
  }));
  $('#course-save-status').textContent = '';
  show('#result');
  loadCourseMap();
}

function loadNaverMapsSdk() {
  if (window.naver?.maps) return Promise.resolve();
  if (mapPromise) return mapPromise;
  mapPromise = new Promise((resolve, reject) => {
    if (!window.NAVER_MAP_CLIENT_ID) return reject(new Error('map_key_missing'));
    window.initAirangCourseMap = resolve;
    const script = document.createElement('script');
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(window.NAVER_MAP_CLIENT_ID)}&callback=initAirangCourseMap`;
    script.async = true; script.onerror = reject; document.head.append(script);
  });
  return mapPromise;
}

async function loadCourseMap() {
  if (!currentStops.length) return;
  try {
    await loadNaverMapsSdk();
    const positions = currentStops.map(stop => new naver.maps.LatLng(stop.latitude, stop.longitude));
    courseMap = new naver.maps.Map('course-map', {center: positions[0], zoom: 12});
    const bounds = new naver.maps.LatLngBounds();
    positions.forEach((position, index) => { bounds.extend(position); new naver.maps.Marker({map: courseMap, position, title: currentStops[index].name}); });
    courseMap.fitBounds(bounds, {top: 40, right: 40, bottom: 40, left: 40});
    $('#map-status').textContent = `${currentStops.length}개 지점`;
  } catch {
    $('#map-status').textContent = '장소별 지도 링크를 이용해주세요';
    $('#map-fallback').classList.remove('hidden');
  }
}

async function showSavedCourse(id) {
  const {course} = await apiRequest(`/api/courses?id=${encodeURIComponent(id)}`);
  state.region = course.region || ''; state.date = String(course.travel_date || '').slice(0, 10); state.transport = course.transport;
  state.start = String(course.starts_at || '10:00').slice(0, 5); state.end = String(course.ends_at || '17:00').slice(0, 5); state.budget = course.budget ?? '';
  currentStops = course.stops.map(stop => ({placeId: stop.place_id, kind: stop.kind, name: stop.name_snapshot, latitude: Number(stop.latitude_snapshot), longitude: Number(stop.longitude_snapshot), arrivalAt: String(stop.arrival_at || '').slice(0, 5), estimatedCost: Number(stop.estimated_cost || 0), facilities: []}));
  $('#result-title').textContent = course.title;
  $('#estimated-cost').textContent = money(currentStops.reduce((sum, stop) => sum + stop.estimatedCost, 0));
  const original = places;
  const timeline = $('#timeline');
  timeline.replaceChildren(...currentStops.map((stop, index) => {
    const article = document.createElement('article');
    article.innerHTML = `<time>${stop.arrivalAt}</time><div><h3><span class="timeline-place-badge">${index + 1}</span>${stop.name}</h3><p>${stop.kind === 'origin' ? '코스 출발지' : stop.kind === 'destination' ? '귀가 지점' : '저장된 장소'}</p><b>${stop.estimatedCost ? money(stop.estimatedCost) : '무료'}</b><a class="naver-navigation-link" href="${navigationUrl(stop)}" target="_blank" rel="noopener"><span class="navigation-icon">N</span><span>네이버지도에서 보기</span></a></div>`;
    return article;
  }));
  void original;
  show('#result'); loadCourseMap();
}

async function loadSavedSummary() {
  if (!currentUser) return;
  const {courses} = await apiRequest('/api/courses');
  if (!courses.length) {
    $('#recent-title').textContent = '아직 저장한 코스가 없어요';
    $('#recent-meta').textContent = '첫 코스를 만들고 다음 나들이에 다시 불러오세요.';
    return;
  }
  const latest = courses[0]; latestCourseId = latest.id;
  $('#recent-title').textContent = latest.title;
  $('#recent-meta').textContent = `${String(latest.travel_date || '').slice(0, 10)} · ${latest.stop_count}곳 · DB에 저장됨`;
  $('#view-recent').classList.remove('hidden');
}

async function loadSession() {
  const {user} = await apiRequest('/api/auth?action=session');
  currentUser = user;
  if (!user) return;
  const card = $('#open-login');
  card.classList.add('signed-in');
  card.innerHTML = `<span class="login-avatar">${user.picture ? `<img src="${user.picture}" alt="">` : '✓'}</span><span><strong>${user.name || '로그인 사용자'}</strong><small>${(user.provider || '').toUpperCase()} 계정 · 로그아웃</small></span><i>›</i>`;
  card.onclick = () => { location.href = '/api/auth?action=logout'; };
  await Promise.all([loadFamily(), loadSavedSummary()]);
}

$('.start-course').onclick = () => { if (!requireLogin('맞춤 코스는 로그인 후 가족 정보와 함께 만들 수 있어요.')) return; state.step = 0; renderStep(); show('#wizard-view'); };
$('#next-step').onclick = () => { capture(); if (state.step < 3) { state.step += 1; renderStep(); } else renderResult(); };
$('#prev-step').onclick = () => { capture(); if (state.step) { state.step -= 1; renderStep(); } };
$('#edit-course').onclick = () => { state.step = 0; renderStep(); show('#wizard-view'); };
$('#save-course').onclick = async () => {
  if (!requireLogin()) return;
  const button = $('#save-course'); button.disabled = true; $('#course-save-status').textContent = 'DB에 저장하는 중입니다.';
  try {
    const payload = {title: `${state.region || '우리 동네'} 가족 맞춤 코스`, travelDate: state.date, region: state.region, transport: state.transport, startsAt: state.start, endsAt: state.end, budget: state.budget, inputSnapshot: {adults: state.adults, children: state.children, age: state.age, mobilityAid: state.mobilityAid, preferences: state.prefs}, stops: currentStops};
    await apiRequest('/api/courses', {method: 'POST', body: JSON.stringify(payload)});
    $('#course-save-status').textContent = '코스를 DB에 저장했습니다.'; button.textContent = '저장 완료'; await loadSavedSummary();
  } catch { $('#course-save-status').textContent = '코스를 저장하지 못했습니다.'; }
  finally { button.disabled = false; }
};

const drawer = $('#drawer-layer');
$('#open-menu').onclick = () => drawer.classList.remove('hidden'); $('#close-menu').onclick = () => drawer.classList.add('hidden');
drawer.onclick = event => { if (event.target === drawer) drawer.classList.add('hidden'); };
$('#go-home').onclick = () => show('#home-view'); $('[data-nav="home"]').onclick = () => { drawer.classList.add('hidden'); show('#home-view'); };
$('[data-nav="new"]').onclick = () => { drawer.classList.add('hidden'); $('.start-course').click(); };
$('[data-nav="recent"]').onclick = () => { drawer.classList.add('hidden'); latestCourseId ? showSavedCourse(latestCourseId) : show('#home-view'); };
$('#open-tutorial').onclick = () => { drawer.classList.add('hidden'); show('#home-view'); $('#tutorial-title').scrollIntoView({behavior:'smooth'}); };
$('#view-recent').onclick = () => latestCourseId && showSavedCourse(latestCourseId);

$('#open-family').onclick = openFamily; $('#close-family').onclick = () => $('#family-modal').classList.add('hidden');
$('#save-family').onclick = async () => {
  const button = $('#save-family'); button.disabled = true; $('#family-save-status').textContent = 'DB에 저장하는 중입니다.';
  try {
    const input = {adultCount: Number($('#adults').value), childCount: Number($('#children').value), childAge: Number($('#child-age').value), mobilityAid: $('#mobility-aid').value, preferences: $$('#family-preference-options .selected').map(item => item.dataset.preference)};
    await apiRequest('/api/family', {method: 'PUT', body: JSON.stringify(input)}); await loadFamily();
    $('#family-save-status').textContent = '가족 프로필을 DB에 저장했습니다.';
  } catch { $('#family-save-status').textContent = '가족 프로필을 저장하지 못했습니다.'; }
  finally { button.disabled = false; }
};

const loginModal = $('#login-modal');
$('#open-login').onclick = () => { drawer.classList.add('hidden'); loginModal.classList.remove('hidden'); };
$('#close-login').onclick = $('#continue-as-guest').onclick = () => loginModal.classList.add('hidden');
$$('[data-provider]').forEach(button => { button.onclick = () => { location.href = `/api/auth?action=${button.dataset.provider}-start`; }; });

const favoritesModal = $('#favorites-modal');
$('#open-favorites').onclick = async () => {
  drawer.classList.add('hidden'); if (!requireLogin('찜한 장소는 로그인 후 확인할 수 있어요.')) return;
  favoritesModal.classList.remove('hidden'); const list = $('#favorites-list'); list.innerHTML = '<p>DB에서 불러오는 중입니다.</p>';
  try {
    const data = await apiRequest('/api/favorites'); list.replaceChildren();
    if (!data.places.length) list.innerHTML = '<p>아직 찜한 장소가 없습니다.</p>';
    data.places.forEach(place => { const item = document.createElement('article'); item.innerHTML = `<div><strong>${place.name}</strong><small>${place.category || '장소'}</small></div><button type="button">삭제</button>`; item.querySelector('button').onclick = async () => { await apiRequest(`/api/favorites?placeId=${encodeURIComponent(place.id)}`, {method:'DELETE'}); item.remove(); }; list.append(item); });
  } catch { list.innerHTML = '<p>찜한 장소를 불러오지 못했습니다.</p>'; }
};
$('#close-favorites').onclick = () => favoritesModal.classList.add('hidden');

async function bootstrap() {
  renderStep(); trackView('home', '홈');
  try { await loadReferenceData(); } catch (error) { console.warn('Reference data unavailable', error); }
  try { await loadSession(); } catch (error) { console.warn('Session unavailable', error); }
}
bootstrap();
