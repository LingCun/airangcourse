const $ = selector => document.querySelector(selector);
const fmt = value => new Intl.NumberFormat('ko-KR').format(value || 0);
const dateTime = value => value ? new Intl.DateTimeFormat('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(value)) : '-';
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
let data = null;

async function load() {
  $('#loading').classList.remove('hidden'); $('#error').classList.add('hidden'); $('#dashboard').classList.add('hidden');
  try {
    const response = await fetch(`/api/admin?days=${$('#range').value}`, {credentials:'same-origin'});
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error === 'admin_required' ? '관리자 허용목록에 등록된 계정이 아닙니다.' : payload.error === 'authentication_required' ? '관리자 계정 로그인이 필요합니다.' : payload.error || '서버 오류가 발생했습니다.');
    data = payload; render();
    $('#dashboard').classList.remove('hidden');
  } catch (error) { $('#error-message').textContent = error.message; $('#error').classList.remove('hidden'); }
  finally { $('#loading').classList.add('hidden'); }
}

function render() {
  const {summary,admin} = data;
  $('#metric-views').textContent=fmt(summary.views); $('#metric-visitors').textContent=fmt(summary.visitors);
  $('#metric-logins').textContent=fmt(summary.logins); $('#metric-failures').textContent=fmt(summary.failures);
  $('#admin-name').textContent=admin.name || '관리자'; $('#admin-email').textContent=admin.email || '';
  $('#admin-initial').textContent=(admin.name || admin.email || 'A').slice(0,1).toUpperCase();
  renderChart(); renderRanking(); renderViews(); renderLogins();
}

function renderChart() {
  const max = Math.max(1,...data.trend.map(row => row.views));
  $('#trend-chart').innerHTML = data.trend.length ? data.trend.map(row => `<div class="chart-day" title="조회 ${row.views} · 방문자 ${row.visitors}"><i class="bar-views" style="height:${Math.max(2,row.views/max*100)}%"></i><i class="bar-visitors" style="height:${Math.max(2,row.visitors/max*100)}%"></i><small>${String(row.day).slice(5,10)}</small></div>`).join('') : '<p class="empty">아직 조회 데이터가 없습니다.</p>';
}

function renderRanking() {
  $('#page-ranking').innerHTML = data.pages.slice(0,6).map((row,index)=>`<div class="rank-row"><b>${index+1}</b><div><strong>${escapeHtml(row.page_title)}</strong><small>방문자 ${fmt(row.visitors)}명</small></div><em>${fmt(row.views)}</em></div>`).join('') || '<p class="empty">조회 데이터가 없습니다.</p>';
}

function renderViews() {
  const query=$('#page-search').value.trim().toLowerCase();
  const rows=data.recentViews.filter(row=>!query || `${row.page_title} ${row.page_key} ${row.path}`.toLowerCase().includes(query));
  $('#view-rows').innerHTML=rows.map(row=>`<tr><td>${dateTime(row.viewed_at)}</td><td><b>${escapeHtml(row.page_title || row.page_key)}</b><br><small>${escapeHtml(row.page_key)}</small></td><td class="secondary">${escapeHtml(row.path)}</td><td class="secondary">${escapeHtml(row.visitor_id.slice(0,12))}…</td><td class="secondary">${escapeHtml(row.ip_address || '-')}</td></tr>`).join('') || '<tr><td class="empty" colspan="5">조건에 맞는 조회 이력이 없습니다.</td></tr>';
}

function renderLogins() {
  const filter=$('#login-filter').value;
  const labels={success:'성공',failure:'실패',started:'시작',logout:'로그아웃'};
  const rows=data.logins.filter(row=>!filter || row.result===filter);
  $('#login-rows').innerHTML=rows.map(row=>`<tr><td>${dateTime(row.occurred_at)}</td><td>${escapeHtml(row.email_snapshot || '비로그인')}</td><td>${escapeHtml((row.provider || '-').toUpperCase())}</td><td><span class="badge ${row.result}">${labels[row.result] || row.result}</span></td><td class="secondary">${escapeHtml(row.ip_address || '-')}</td><td class="secondary">${escapeHtml(row.failure_reason || '-')}</td></tr>`).join('') || '<tr><td class="empty" colspan="6">조건에 맞는 로그인 이력이 없습니다.</td></tr>';
}

document.querySelectorAll('nav button').forEach(button=>button.onclick=()=>{document.querySelectorAll('nav button').forEach(item=>item.classList.remove('active'));button.classList.add('active');document.body.dataset.section=button.dataset.section;$('#section-title').textContent={overview:'운영 현황',pages:'화면 조회 이력',logins:'로그인 이력'}[button.dataset.section]});
$('#range').onchange=load; $('#refresh').onclick=load; $('#page-search').oninput=()=>data&&renderViews(); $('#login-filter').onchange=()=>data&&renderLogins();
document.body.dataset.section='overview'; load();
