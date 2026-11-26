/* ---------- 방문 통계 (GoatCounter, 쿠키 없음) ---------- */
// 이벤트 이름은 대시보드에서 바로 읽히게 한글로. 스크립트가 아직 안 떴거나 막혀 있으면 조용히 넘어감
function track(name) {
  try { window.goatcounter?.count?.({ path: name.slice(0, 200), title: name.slice(0, 200), event: true }); } catch (e) {}
}

/* 데이터 소스: 구글 시트 (링크가 있는 모든 사용자 보기 권한 필요) */
const SHEET_ID = "1grh6Fgcdro-318wagpvrZYaXj7u9OLxEupDwSTikbgk";
const csvUrl = tab => `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(tab)}`;

/* ---------- 타입 정의 (시트 표기 → 내부 키) ---------- */
const TYPES = {
  youtube:   { label: "유튜브",   kind: "app" },
  instagram: { label: "인스타그램", kind: "app" },
  gv:        { label: "GV",      chip: "GV",    cls: "gv" },
  muin:      { label: "무대인사",  chip: "무인",   cls: "muin" },
  book:      { label: "북토크",   chip: "북토크", cls: "book" },
  tv:        { label: "방송",     chip: "방송",   cls: "tv" },
  concert:   { label: "콘서트",   chip: "콘서트", cls: "etc" },
  release:   { label: "개봉",     chip: "개봉",   cls: "rel" },
  fancafe:   { label: "팬카페",   kind: "app" },
  blog:      { label: "블로그",   kind: "app" }
};
const TYPE_BY_LABEL = { "유튜브":"youtube", "인스타그램":"instagram", "GV":"gv", "무대인사":"muin", "북토크":"book", "방송":"tv", "콘서트":"concert", "팬카페":"fancafe", "블로그":"blog", "개봉":"release" };
const PLATFORM_BY_LABEL = { "X":"x", "인스타그램":"instagram", "유튜브":"youtube", "네이버 카페":"cafe", "네이버 블로그":"blog", "오디오":"audio" };
const PLATFORM_LABEL = { x:"X", instagram:"인스타그램", youtube:"유튜브", cafe:"네이버 카페", blog:"네이버 블로그", audio:"오디오" };
const CAT_EMOJI = { "아우터":"🧥", "상의":"👕", "하의":"👖", "신발":"👟", "잡화":"👜", "기타":"✨" };

const APP_ICON = {
  youtube: '<svg class="app" viewBox="0 0 18 18" aria-label="유튜브"><rect x="1" y="3.5" width="16" height="11" rx="3" fill="#e5302a"/><path d="M7.4 6.6v4.8L11.6 9z" fill="#fff"/></svg>',
  instagram: '<svg class="app" viewBox="0 0 18 18" aria-label="인스타그램"><defs><linearGradient id="ig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#f6a13a"/><stop offset=".5" stop-color="#e2336b"/><stop offset="1" stop-color="#7a3fc4"/></linearGradient></defs><rect x="1.5" y="1.5" width="15" height="15" rx="4.2" fill="url(#ig)"/><circle cx="9" cy="9" r="3.3" fill="none" stroke="#fff" stroke-width="1.4"/><circle cx="13" cy="5" r=".9" fill="#fff"/></svg>',
  x: '<svg class="app" viewBox="0 0 18 18" aria-label="X"><rect x="1.5" y="1.5" width="15" height="15" rx="3.5" fill="#000"/><path d="M5.2 5h2.3l5.3 8H10.5zM12.6 5 5.4 13" stroke="#fff" stroke-width="1.1" fill="none"/></svg>'
};
APP_ICON.fancafe = APP_ICON.cafe = '<svg class="app" viewBox="0 0 18 18" aria-label="네이버 카페"><rect x="1.5" y="1.5" width="15" height="15" rx="4" fill="#03c75a"/><path d="M5.5 6.5h6v3.2a3 3 0 0 1-3 3h0a3 3 0 0 1-3-3zM11.5 7.3h.7a1.3 1.3 0 0 1 0 2.6h-.9" stroke="#fff" stroke-width="1.2" fill="none"/></svg>';
APP_ICON.blog = '<svg class="app" viewBox="0 0 18 18" aria-label="네이버 블로그"><rect x="1.5" y="1.5" width="15" height="15" rx="4" fill="#03c75a"/><path d="M6.2 4.8v8.4M6.2 9.6a2.6 2.6 0 1 1 0 .01" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>';
// 사이트가 모르는 종류가 시트에 들어와도 일정이 사라지지 않게 회색 글자 칩으로 표시
function typeKey(label) {
  if (!label) return "";
  if (TYPE_BY_LABEL[label]) return TYPE_BY_LABEL[label];
  const k = "x-" + label;
  TYPES[k] ??= { label, chip: label, cls: "etc" };
  return k;
}
const mark = t => { const T = TYPES[t]; return T.kind === "app" ? APP_ICON[t] : `<span class="chip ${T.cls}">${T.chip}</span>`; };

/* ---------- 유틸 ---------- */
const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DOW = ["일","월","화","수","목","금","토"];
const fmtDate = s => { const d = new Date(s + "T00:00"); return `${d.getFullYear()}.${pad(d.getMonth()+1)}.${pad(d.getDate())} ${DOW[d.getDay()]}`; };
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
const safeUrl = u => /^https?:\/\//i.test(u || "") ? u : "";

function parseCSV(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i+1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i+1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  return body
    .filter(r => r.some(v => v.trim() !== ""))
    .map(r => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}
async function loadTab(tab) {
  const res = await fetch(csvUrl(tab), { cache: "no-store" });
  if (!res.ok) throw new Error(tab);
  const text = await res.text();
  if (text.trimStart().startsWith("<")) throw new Error(tab); // 권한 없으면 로그인 HTML이 옴
  return parseCSV(text);
}

/* ---------- 상태 ---------- */
let EVENTS = [], ITEMS = {}, SOURCES = {}, evById = {}, byDate = {};

/* ---------- 탭 ---------- */
document.querySelectorAll("nav button").forEach(b => b.addEventListener("click", () => {
  if (b.getAttribute("aria-selected") !== "true") track(`탭 · ${b.textContent.trim()}`);
  document.querySelectorAll("nav button").forEach(x => x.setAttribute("aria-selected", x === b));
  $("#view-cal").hidden = b.dataset.view !== "cal";
  $("#view-items").hidden = b.dataset.view !== "items";
  try { localStorage.setItem("pjm-tab", b.dataset.view); } catch (e) {}
}));

/* ---------- 캘린더 ---------- */
const TODAY = new Date();
let cur = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
function renderCal() {
  $("#monthLabel").textContent = `${cur.getFullYear()}.${pad(cur.getMonth() + 1)}`;
  const start = new Date(cur); start.setDate(1 - cur.getDay());
  const last = new Date(cur.getFullYear(), cur.getMonth() + 1, 0);
  const cells = Math.ceil((cur.getDay() + last.getDate()) / 7) * 7;
  let html = "";
  for (let i = 0; i < cells; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const k = ymd(d), evs = byDate[k] || [], out = d.getMonth() !== cur.getMonth();
    const cls = ["day", out && "out", k === ymd(TODAY) && "today", evs.length && "has"].filter(Boolean).join(" ");
    // 같은 종류는 아이콘 하나 + 개수로 묶기
    const groups = [];
    evs.forEach(e => { const g = groups.find(x => x.type === e.type); g ? g.n++ : groups.push({ type: e.type, n: 1 }); });
    const shown = groups.slice(0, 3).map(g => `<span class="mk">${mark(g.type)}${g.n > 1 ? `<b>${g.n}</b>` : ""}</span>`).join("");
    const rest = groups.slice(3).reduce((s, g) => s + g.n, 0);
    const more = rest ? `<span class="more">+${rest}</span>` : "";
    html += evs.length
      ? `<button class="${cls}" data-date="${k}" aria-label="${fmtDate(k)} 일정 ${evs.length}건"><span class="n">${d.getDate()}</span><span class="marks">${shown}${more}</span></button>`
      : `<div class="${cls}"><span class="n">${d.getDate()}</span></div>`;
  }
  $("#grid").innerHTML = html;
}
$("#grid").addEventListener("click", e => { const b = e.target.closest(".day.has"); if (b) openDay(b.dataset.date); });
$("#prev").onclick = () => { cur.setMonth(cur.getMonth() - 1); renderCal(); };
$("#next").onclick = () => { cur.setMonth(cur.getMonth() + 1); renderCal(); };
$("#legend").innerHTML = Object.entries(TYPES).map(([k, T]) => `<span>${mark(k)}${T.label}</span>`).join("");

/* ---------- 아이템 목록 ---------- */
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
};
let brandFilter = store.get("pjm-brand", "");
let sortDir = store.get("pjm-sort", "desc");            // desc 최근 착용순 · asc 오래된순 · most 많이 입은 순
if (!["desc", "asc", "most"].includes(sortDir)) sortDir = "desc";
let period = { from: "", to: "" };                        // "YYYY-MM", 빈 값은 끝 없음
try { Object.assign(period, JSON.parse(store.get("pjm-period", "{}"))); } catch (e) {}

const ym = d => d.slice(0, 7);
const ymLabel = m => m.replace("-", ".");
const addMonths = (m, n) => { const d = new Date(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const thisMonth = () => `${TODAY.getFullYear()}-${pad(TODAY.getMonth() + 1)}`;
const QUICK = {
  all:   () => ({ from: "", to: "" }),
  month: () => ({ from: thisMonth(), to: thisMonth() }),
  m3:    () => ({ from: addMonths(thisMonth(), -2), to: thisMonth() }),
  year:  () => ({ from: `${TODAY.getFullYear()}-01`, to: `${TODAY.getFullYear()}-12` })
};
const inPeriod = date => (!period.from || ym(date) >= period.from) && (!period.to || ym(date) <= period.to);
function periodLabel() {
  const { from, to } = period;
  if (!from && !to) return "전체 기간";
  if (from && from === to) return ymLabel(from);
  return `${from ? ymLabel(from) : "처음"} – ${to ? ymLabel(to) : "지금"}`;
}
function itemIds() { return Object.keys(ITEMS).filter(id => evById[id]); }

function renderPeriodPanel() {
  const months = itemIds().map(id => ym(evById[id].date));
  let lo = months.length ? months.reduce((a, b) => a < b ? a : b) : thisMonth();
  let hi = [thisMonth(), ...months].reduce((a, b) => a > b ? a : b);
  if (period.from && period.from < lo) lo = period.from;
  if (period.to && period.to > hi) hi = period.to;
  const opts = []; for (let m = hi; m >= lo; m = addMonths(m, -1)) opts.push(m);
  $("#pFrom").innerHTML = `<option value="">처음부터</option>` + opts.map(m => `<option value="${m}">${ymLabel(m)}</option>`).join("");
  $("#pTo").innerHTML = `<option value="">지금까지</option>` + opts.map(m => `<option value="${m}">${ymLabel(m)}</option>`).join("");
  $("#pFrom").value = period.from; $("#pTo").value = period.to;
  const active = Object.keys(QUICK).find(k => { const q = QUICK[k](); return q.from === period.from && q.to === period.to; });
  document.querySelectorAll("#periodPanel [data-quick]").forEach(b => b.setAttribute("aria-pressed", b.dataset.quick === active));
  $("#periodLabel").textContent = periodLabel();
  $("#periodBtn").classList.toggle("on", !!(period.from || period.to));
  $("#sortSel").value = sortDir;
}
function setPeriod(p) {
  if (p.from && p.to && p.from > p.to) [p.from, p.to] = [p.to, p.from];
  period = p; store.set("pjm-period", JSON.stringify(period)); renderList();
  if (p.from || p.to) track(`필터 · 기간 ${periodLabel()}`);
}

// 같은 옷을 여러 번 입으면 하나로 묶는다. 기준: 구매 링크가 같거나, 링크가 없으면 브랜드+이름이 같을 때
const normUrl = u => (u || "").trim().replace(/^https?:\/\/(www\.|m\.)?/i, "").replace(/[/#]+$/, "").toLowerCase();
const groupKeyOf = it => normUrl(it.url) ? "u:" + normUrl(it.url) : "n:" + (it.brand || "").trim().toLowerCase() + "|" + (it.name || "").trim().toLowerCase();
let GROUPS = {}, GROUP_OF = {};   // gkey → { key, it, wears:[{id,i,date}] }, "행사ID#순번" → gkey
function buildGroups() {
  GROUPS = {}; GROUP_OF = {};
  itemIds().sort((a, b) => evById[a].date.localeCompare(evById[b].date) || a.localeCompare(b)).forEach(id =>
    ITEMS[id].forEach((it, i) => {
      const k = groupKeyOf(it);
      const g = GROUPS[k] ??= { key: k, it: { ...it }, wears: [] };
      g.wears.push({ id, i, date: evById[id].date });
      g.it = { ...it, img: it.img || g.it.img };   // 가장 최근 기록의 정보를 쓰되 사진은 있는 걸로
      GROUP_OF[`${id}#${i}`] = k;
    }));
}
const lastWear = (g, inRange = () => true) => g.wears.filter(w => inRange(w.date)).at(-1);
const byLatest = (a, b) => { const x = GROUPS[a].wears.at(-1), y = GROUPS[b].wears.at(-1); return x.date.localeCompare(y.date) || x.id.localeCompare(y.id) || x.i - y.i; };
let lastListKeys = [];   // 아이템 탭에 지금 보이는 아이템들 (상세에서 이전/다음 범위)

let catFilter = store.get("pjm-cat", "");
const CATS = ["아우터", "상의", "하의", "신발", "잡화", "기타"];
// 영문으로 저장된 브랜드를 한글로도 찾을 수 있게
const BRAND_ALIAS = {
  "carhartt wip": "칼하트", "prada": "프라다", "pilot": "파이롯트 파일럿", "dickies": "디키즈", "espionage": "에스피오나지",
  "nonymousaa": "넌이머스 논이머스", "kodak": "코닥", "seed": "씨드", "ito-ya": "이토야", "blue elephant": "블루엘리펀트",
  "b-side label": "비사이드라벨", "sylian rail": "실리안레일", "the loose company": "더루즈컴퍼니 루즈컴퍼니", "르무통": "le mouton lemouton", "solid homme": "솔리드옴므 솔리드옴무 솔리드", "uniqlo": "유니클로"
};
const brandMatch = (b, q) => !q || (b + " " + (BRAND_ALIAS[b.toLowerCase()] || "")).toLowerCase().replace(/\s/g, "").includes(q.toLowerCase().replace(/\s/g, ""));

function renderCats(groups) {
  const count = {}; groups.forEach(g => count[g.it.cat] = (count[g.it.cat] || 0) + 1);
  const extra = Object.keys(count).filter(c => !CATS.includes(c));
  $("#catBar").innerHTML = [["", "전체", groups.length], ...[...CATS, ...extra].map(c => [c, c, count[c] || 0])].map(([v, label, n]) =>
    `<button class="bf${n || v === catFilter ? "" : " zero"}" data-cat="${esc(v)}" aria-pressed="${v === catFilter}"${!n && v !== catFilter && v ? " disabled" : ""}>${esc(label)}<span>${n}</span></button>`).join("");
}
let brandCounts = {};
function renderBrandPanel() {
  const q = $("#bSearch").value.trim();
  const all = Object.keys(brandCounts).sort((a, b) => a.localeCompare(b, "ko", { sensitivity: "base" }));
  const freq = all.filter(b => brandCounts[b] >= 2).sort((a, b) => brandCounts[b] - brandCounts[a]);
  const chip = b => `<button class="bf" data-brand="${esc(b)}" aria-pressed="${b === brandFilter}">${esc(b)}<span>${brandCounts[b]}</span></button>`;
  $("#bFreqWrap").hidden = !!q || !freq.length;
  $("#bFreq").innerHTML = freq.map(chip).join("");
  const hits = all.filter(b => brandMatch(b, q));
  $("#bAll").innerHTML = hits.length
    ? hits.map(b => `<li><button data-brand="${esc(b)}" aria-pressed="${b === brandFilter}"><span>${esc(b)}</span><small>${brandCounts[b]}</small></button></li>`).join("")
    : `<li class="none">"${esc(q)}"에 맞는 브랜드가 없어요.</li>`;
}
function renderBrandBtn() {
  $("#brandLabel").textContent = brandFilter || "브랜드";
  $("#brandBtn").classList.toggle("on", !!brandFilter);
  $("#brandClear").hidden = !brandFilter;
}
function setBrand(b) {
  if (b) track(`필터 · 브랜드 ${b}`);
  brandFilter = b; store.set("pjm-brand", b);
  $("#brandPanel").hidden = true; $("#brandBtn").setAttribute("aria-expanded", false);
  renderList();
}
// 상품 사진. 없거나 못 불러오면 카테고리 아이콘 칸으로
function thumb(it, cls = "pthumb") {
  // 외부 주소(http) 또는 저장소에 올린 파일(images/items/...)
  const src = /^images\/items\/[\w.-]+$/.test(it.img || "") ? it.img : safeUrl(it.img);
  const fb = `<span class="fb">${CAT_EMOJI[it.cat] || "✨"}</span>`;
  return `<span class="${cls}${src ? "" : " none"}">${src ? `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ""}${fb}</span>`;
}
function renderList() {
  renderPeriodPanel();
  // 기간 안에 한 번이라도 입은 옷만, 기간 안의 마지막 착용일 기준으로
  const inRange = Object.values(GROUPS).map(g => ({ ...g, at: lastWear(g, inPeriod) })).filter(g => g.at);
  // 카테고리 개수는 브랜드 필터 반영, 브랜드 개수는 카테고리 필터 반영
  renderCats(inRange.filter(g => !brandFilter || g.it.brand === brandFilter));
  brandCounts = {}; inRange.filter(g => !catFilter || g.it.cat === catFilter).forEach(g => g.it.brand && (brandCounts[g.it.brand] = (brandCounts[g.it.brand] || 0) + 1));
  renderBrandBtn(); if (!$("#brandPanel").hidden) renderBrandPanel();
  const chrono = (a, b) => a.at.date.localeCompare(b.at.date) || a.at.id.localeCompare(b.at.id) || a.at.i - b.at.i;
  const pieces = inRange.filter(p => (!brandFilter || p.it.brand === brandFilter) && (!catFilter || p.it.cat === catFilter))
    .map(p => ({ ...p, n: p.wears.filter(w => inPeriod(w.date)).length }))   // 기간 안 착용 횟수
    .sort((a, b) => sortDir === "most" ? (b.n - a.n || chrono(b, a)) : (sortDir === "desc" ? chrono(b, a) : chrono(a, b)));
  lastListKeys = pieces.map(p => p.key);
  if (!pieces.length) {
    const any = itemIds().length;
    $("#pCount").textContent = "0개";
    $("#itemList").innerHTML = `<li class="empty">${any ? "조건에 맞는 아이템 정보가 없어요." : "아직 등록된 아이템 정보가 없어요."}${any ? ` <button class="reset" id="resetFilters">필터 초기화</button>` : ""}</li>`;
    return;
  }
  // 월 구분 없이 아이템당 한 장. 날짜는 (기간 안의) 최근 착용일
  const short = d => d.startsWith(String(TODAY.getFullYear())) ? d.slice(5).replace("-", ".") : d.slice(2).replace(/-/g, ".");   // 올해는 월.일, 지난해는 연.월.일
  const filtered = brandFilter || catFilter || period.from || period.to;
  $("#pCount").innerHTML = `${pieces.length}개${filtered ? `<button class="reset" id="resetFilters">필터 초기화</button>` : ""}`;
  $("#itemList").innerHTML = `<li class="pgrid">` +
    pieces.map(p => `<button class="pcard" data-key="${esc(p.key)}">${thumb(p.it)}
        <span class="pb">${esc(p.it.brand || "")}</span>
        <span class="pn">${esc(p.it.name)}</span>
        <span class="pd">${p.n > 1 ? "최근 " : ""}${short(p.at.date)} · ${esc(p.it.cat)}${p.n > 1 ? ` · <b>착용 ${p.n}회</b>` : ""}</span>
      </button>`).join("") + `</li>`;
}
$("#view-items").addEventListener("click", e => {
  if (e.target.closest("#resetFilters")) { brandFilter = ""; catFilter = ""; store.set("pjm-brand", ""); store.set("pjm-cat", ""); setPeriod({ from: "", to: "" }); return; }
  const b = e.target.closest("button[data-key]"); if (b) openItem(b.dataset.key, lastListKeys);
});
$("#catBar").addEventListener("click", e => {
  const b = e.target.closest("button[data-cat]"); if (!b || b.disabled) return;
  catFilter = b.dataset.cat; store.set("pjm-cat", catFilter); renderList();
  if (catFilter) track(`필터 · 카테고리 ${catFilter}`);
});
// 기간·브랜드 패널은 하나만 열리게
function togglePanel(name) {
  [["period", "#periodPanel", "#periodBtn"], ["brand", "#brandPanel", "#brandBtn"]].forEach(([n, panel, btn]) => {
    const open = n === name && $(panel).hidden;
    $(panel).hidden = !open; $(btn).setAttribute("aria-expanded", open);
  });
  if (!$("#brandPanel").hidden) { $("#bSearch").value = ""; renderBrandPanel(); }
}
$("#periodBtn").addEventListener("click", () => togglePanel("period"));
$("#brandBtn").addEventListener("click", () => togglePanel("brand"));
$("#brandClear").addEventListener("click", () => setBrand(""));
$("#bSearch").addEventListener("input", renderBrandPanel);
$("#brandPanel").addEventListener("click", e => { const b = e.target.closest("button[data-brand]"); if (b) setBrand(b.dataset.brand === brandFilter ? "" : b.dataset.brand); });
$("#periodPanel").addEventListener("click", e => {
  const q = e.target.closest("[data-quick]"); if (q) setPeriod(QUICK[q.dataset.quick]());
});
$("#pFrom").addEventListener("change", () => setPeriod({ from: $("#pFrom").value, to: period.to }));
$("#pTo").addEventListener("change", () => setPeriod({ from: period.from, to: $("#pTo").value }));
$("#sortSel").addEventListener("change", () => { sortDir = $("#sortSel").value; store.set("pjm-sort", sortDir); renderList(); });
// 월 헤더가 상단 고정 메뉴 바로 아래에 붙도록 메뉴 높이를 CSS 변수로
const syncHeader = () => document.documentElement.style.setProperty("--hdr", $("header").offsetHeight + "px");
addEventListener("resize", syncHeader); syncHeader();
document.fonts?.ready.then(syncHeader);   // 웹폰트 로딩 후 높이가 바뀔 수 있어서
if (window.ResizeObserver) new ResizeObserver(syncHeader).observe($("header"));   // 헤더 높이가 바뀌면 언제든 다시 맞춤
// 새로고침 때 브라우저가 이전 스크롤 위치를 되살리면 데이터가 늦게 그려지면서 배너가 헤더 밑으로 밀려 들어가서, 항상 맨 위에서 시작
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
scrollTo(0, 0);

/* ---------- 원본 게시물 임베드 ---------- */
const loaded = {};
function loadScript(src) {
  return loaded[src] ??= new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.async = true; s.onload = ok; s.onerror = no; document.body.appendChild(s); });
}
function ytId(u) { const m = u.match(/(?:youtu\.be\/|v=|shorts\/|embed\/|live\/)([\w-]{11})/); return m && m[1]; }
// 같은 영상이 여러 곳에 올라온 경우: 유튜브 > 인스타그램 > X 순으로 하나만 임베드하고 나머지는 링크로
const SRC_ORDER = { youtube: 0, instagram: 1, x: 2 };
const orderSrcs = list => [...list].sort((a, b) => (SRC_ORDER[a.platform] ?? 9) - (SRC_ORDER[b.platform] ?? 9));
function srcBlock(s, withEmbed = true) {
  const url = safeUrl(s.url); if (!url) return "";
  const link = `<a class="src" href="${esc(url)}" target="_blank" rel="noopener">${APP_ICON[s.platform] || ""}<span class="who"><b>${s.platform === "audio" ? "원본 파일 열기" : /instagram\.com\/(s|stories)\//.test(url) ? "스토리 보기" : "원본 게시물 보기"}</b><small>${PLATFORM_LABEL[s.platform] || ""} · ${esc(s.author)}</small></span><svg class="ext" viewBox="0 0 16 16"><path d="M6 3h7v7M13 3 4 12"/></svg></a>`;
  let embed = "";
  if (s.platform === "x") {
    const tw = url.replace(/^https?:\/\/(www\.)?x\.com/, "https://twitter.com").split("?")[0];
    embed = `<blockquote class="twitter-tweet" data-dnt="true"><a href="${esc(tw)}"></a></blockquote>`;
  } else if (s.platform === "instagram" && /instagram\.com\/(s|stories)\//.test(url)) {
    embed = "";   // 스토리·하이라이트는 인스타그램이 퍼가기를 지원하지 않아 링크로만
  } else if (s.platform === "instagram") {
    embed = `<blockquote class="instagram-media" data-instgrm-permalink="${esc(url.split("?")[0])}" data-instgrm-version="14" style="margin:0;min-width:0;width:100%"></blockquote>`;
  } else if (s.platform === "audio") {
    embed = `<audio controls preload="none" src="${esc(url)}" style="width:100%"></audio>`;   // 라디오 다시듣기 등
  } else if (s.platform === "youtube" && ytId(url)) {
    embed = `<iframe src="https://www.youtube-nocookie.com/embed/${ytId(url)}" title="유튜브 영상" loading="lazy" allowfullscreen></iframe>`;
  }
  return `${embed && withEmbed ? `<div class="embed">${embed}</div>` : ""}${link}`;
}
function hydrateEmbeds() {
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  document.querySelectorAll("#sheetBody .twitter-tweet").forEach(b => dark && b.setAttribute("data-theme", "dark"));
  if ($("#sheetBody .twitter-tweet")) loadScript("https://platform.twitter.com/widgets.js").then(() => window.twttr?.widgets?.load($("#sheetBody"))).catch(() => {});
  if ($("#sheetBody .instagram-media")) loadScript("https://www.instagram.com/embed.js").then(() => window.instgrm?.Embeds?.process()).catch(() => {});
}

/* ---------- 시트(팝업) ---------- */
// 화면: 날짜(day) → 일정 상세(event) → 아이템 상세(item). 스택으로 쌓이고 브라우저 뒤로가기와 연동.
// 이전/다음은 항상 날짜순(‹ 이전, › 다음)으로 이동하고 스택 깊이는 그대로 둔다.
let stack = [], lastFocus = null;
function showSheet() {
  if (!$("#sheet").hidden) return;
  lastFocus = document.activeElement;
  $("#scrim").hidden = false; $("#sheet").hidden = false;
  requestAnimationFrame(() => { $("#scrim").classList.add("on"); $("#sheet").classList.add("on"); });
  document.body.style.overflow = "hidden";
  setTimeout(() => $("#close").focus(), 50);
}
function hideSheet() {
  $("#scrim").classList.remove("on"); $("#sheet").classList.remove("on");
  document.body.style.overflow = "";
  setTimeout(() => { $("#scrim").hidden = true; $("#sheet").hidden = true; lastFocus && lastFocus.focus(); }, 250);
}
const byDateId = (a, b) => evById[a].date.localeCompare(evById[b].date) || a.localeCompare(b);
const hasContent = id => !!(SOURCES[id]?.length || ITEMS[id]?.length);   // 볼 게 있는 일정만 상세 카드로
const contentIds = () => EVENTS.filter(e => hasContent(e.id)).map(e => e.id).sort(byDateId);
function navList(view) {
  if (view.v === "day") return Object.keys(byDate).sort();
  if (view.v === "event") return view.scope || contentIds();
  return view.scope ? view.scope.filter(k => GROUPS[k]) : Object.keys(GROUPS).sort(byLatest);
}
const viewKey = v => v.v === "day" ? v.date : v.v === "event" ? v.id : v.key;
function render(view, dir = 0, log = true) {
  const list = navList(view), i = list.indexOf(viewKey(view));
  $("#prevS").disabled = i <= 0;
  $("#nextS").disabled = i < 0 || i >= list.length - 1;
  $("#sheetPos").textContent = i >= 0 && list.length > 1 ? `${i + 1} / ${list.length}` : "";
  $("#back").style.visibility = stack.length < 2 ? "hidden" : "visible";   // 자리는 유지해서 제목이 가운데 오게
  if (view.v === "day") renderDay(view.date);
  else if (view.v === "event") renderEvent(view.id, view.random);
  else renderItem(view.key);
  if (log) {   // 뒤로가기로 다시 그릴 때는 세지 않음
    if (view.v === "event") track(`일정 · ${evById[view.id]?.title || view.id}`);
    else if (view.v === "item") { const it = GROUPS[view.key]?.it; if (it) track(`아이템 · ${it.brand || ""} ${it.name}`.trim()); }
  }
  const body = $("#sheetBody");
  body.scrollTop = 0;
  body.classList.remove("in-l", "in-r");
  if (dir) { void body.offsetWidth; body.classList.add(dir > 0 ? "in-r" : "in-l"); }
}
function push(view) {
  stack.push(view);
  history.pushState({ pjm: stack.length }, "");
  render(view); showSheet();
}
function go(dir) {
  const view = stack[stack.length - 1]; if (!view) return;
  const list = navList(view), j = list.indexOf(viewKey(view)) + dir;
  if (j < 0 || j >= list.length) return;
  const next = view.v === "day" ? { ...view, date: list[j] } : view.v === "event" ? { ...view, id: list[j], random: false } : { ...view, key: list[j] };
  stack[stack.length - 1] = next;
  render(next, dir);
  if (next.v === "day") { const d = next.date; const m = new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, 1); if (m.getTime() !== cur.getTime()) { cur = m; renderCal(); } }
}
function openDay(date) { stack = []; push({ v: "day", date }); }
function openEvent(id) { push({ v: "event", id }); }
/* ---------- 랜덤 일정 ---------- */
function pickRandom(except) {
  const pool = contentIds().filter(id => id !== except && evById[id].date <= ymd(TODAY));
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}
function openRandom() { const id = pickRandom(); if (id) { stack = []; push({ v: "event", id, random: true }); } }
function reroll() {
  track("랜덤 · 다시 뽑기");
  const view = stack[stack.length - 1], id = pickRandom(view?.id); if (!id) return;
  stack[stack.length - 1] = { ...view, id, random: true };
  render(stack[stack.length - 1], 1);
}
function openItem(key, scope) {
  if (scope) { stack = []; push({ v: "item", key, scope }); }   // 아이템 탭에서: 지금 걸린 필터 결과 안에서 넘기기
  else push({ v: "item", key });                                 // 일정 상세에서: 전체 아이템을 날짜순으로
}
function closeAll() { if (stack.length) history.go(-stack.length); }
addEventListener("popstate", e => {
  const d = e.state?.pjm || 0;
  if (d >= stack.length) return;
  stack.length = d;
  if (!d) hideSheet(); else render(stack[d - 1], 0, false);
});

// 오늘 기준 D-day ("오늘", "D-3", 지난 날은 빈 값)
function dday(date) {
  const diff = Math.round((new Date(date + "T00:00") - new Date(ymd(TODAY) + "T00:00")) / 864e5);
  return diff === 0 ? "오늘" : diff > 0 ? `D-${diff}` : "";
}
const SRC_HINT = { youtube: "영상", instagram: "게시물", x: "게시물", cafe: "카페 글", blog: "블로그 글", audio: "다시듣기" };
function renderDay(date) {
  $("#sheetTitle").textContent = fmtDate(date);
  const dd = dday(date);
  $("#sheetBody").innerHTML = (dd ? `<p class="soon"><b>${dd}</b>${dd === "오늘" ? "오늘 있는 일정이에요" : "예정된 일정이에요"}</p>` : "") + (byDate[date] || []).map(e => {
    const n = ITEMS[e.id]?.length || 0, srcs = orderSrcs(SOURCES[e.id] || []);
    const title = hasContent(e.id)
      ? `<button data-ev="${esc(e.id)}">${esc(e.title)}<svg viewBox="0 0 16 16"><path d="m6 3 5 5-5 5"/></svg></button>`
      : esc(e.title);
    let dl = "";
    if (e.place) dl += `<dt>장소</dt><dd>${esc(e.place)}</dd>`;
    if (e.desc) dl += `<dt>설명</dt><dd>${esc(e.desc)}</dd>`;
    const hints = [srcs.length ? `<span>${SRC_HINT[srcs[0].platform] || "원본"}</span>` : "", n ? `<span class="on">아이템 ${n}</span>` : ""].join("");
    return `<article class="ev"><div class="type">${mark(e.type)}${TYPES[e.type].label}</div><h3>${title}</h3>${dl ? `<dl>${dl}</dl>` : ""}${hints.trim() ? `<div class="hints">${hints}</div>` : ""}</article>`;
  }).join("");
}
function renderEvent(id, random = false) {
  const e = evById[id], list = ITEMS[id] || [], srcs = orderSrcs(SOURCES[id] || []);
  $("#sheetTitle").textContent = fmtDate(e.date);
  let dl = "";
  if (e.place) dl += `<dt>장소</dt><dd>${esc(e.place)}</dd>`;
  if (e.desc) dl += `<dt>설명</dt><dd>${esc(e.desc)}</dd>`;
  $("#sheetBody").innerHTML =
    (random ? `<div class="randbar"><span>🎲 랜덤으로 고른 일정</span><button id="reroll">다시 뽑기</button></div>` : "") +
    `<div class="item-head"><div class="type">${mark(e.type)}${TYPES[e.type].label}</div><h3>${esc(e.title)}</h3>${dl ? `<dl class="evmeta">${dl}</dl>` : ""}` +
    srcs.map((s, i) => srcBlock(s, i === 0)).join("") + `</div>` +
    (list.length ? `<h4 class="sec">착용 아이템 <span>${list.length}</span></h4><div class="prows">` +
      list.map((it, i) => `<button class="prow" data-key="${esc(GROUP_OF[`${id}#${i}`])}">${thumb(it, "pthumb sm")}<span class="pt"><span class="pc">${esc(it.cat)}</span><span class="pn">${esc(it.name)}</span><span class="pb">${esc(it.brand || "")}</span></span><svg viewBox="0 0 16 16"><path d="m6 3 5 5-5 5"/></svg></button>`).join("") + `</div>` : "");
  hydrateEmbeds();
}
function renderItem(key) {
  const g = GROUPS[key]; if (!g) return;
  const it = g.it, wears = [...g.wears].reverse();
  $("#sheetTitle").textContent = `${CAT_EMOJI[it.cat] || ""} ${it.cat}`;
  const url = safeUrl(it.url);
  $("#sheetBody").innerHTML =
    `<div class="pdetail">${thumb(it, "pthumb lg")}
      <p class="pb">${esc(it.brand || "")}</p>
      <h3 class="pn">${esc(it.name)}</h3>
      ${url ? `<a class="buy" href="${esc(url)}" target="_blank" rel="noopener">구매 링크<svg viewBox="0 0 16 16"><path d="M6 3h7v7M13 3 4 12"/></svg></a><p class="hint-s">판매가 끝났거나 페이지가 바뀌면 링크가 동작하지 않을 수 있어요.</p>` : `<div class="empty">구매 링크 정보 없음</div>`}
      <h4 class="sec">착용 일정 <span>${wears.length}</span></h4>
      ${wears.map(w => { const e = evById[w.id]; return `<button class="prow evlink" data-ev="${esc(w.id)}"><span class="evicon">${mark(e.type)}</span><span class="pt"><span class="pc">${fmtDate(e.date)}</span><span class="pn">${esc(e.title)}</span></span><svg viewBox="0 0 16 16"><path d="m6 3 5 5-5 5"/></svg></button>`; }).join("")}
    </div>`;
}
$("#sheetBody").addEventListener("click", ev => {
  if (ev.target.closest("#reroll")) return reroll();
  const e = ev.target.closest("button[data-ev]"); if (e) return openEvent(e.dataset.ev);
  const k = ev.target.closest("button[data-key]"); if (k) return openItem(k.dataset.key);
});
// 상품 사진을 못 불러오면 대체 칸으로
document.addEventListener("error", e => {
  if (e.target.tagName === "IMG" && e.target.parentElement?.classList.contains("pthumb")) {
    e.target.parentElement.classList.add("none"); e.target.remove();
  }
}, true);
$("#back").onclick = () => history.back();
$("#close").onclick = closeAll;
$("#scrim").onclick = closeAll;
$("#prevS").onclick = () => go(-1);
$("#nextS").onclick = () => go(1);
document.addEventListener("keydown", e => {
  if ($("#sheet").hidden) return;
  if (e.key === "Escape") closeAll();
  else if (e.key === "ArrowLeft") go(-1);
  else if (e.key === "ArrowRight") go(1);
});
// 좌우 스와이프: 왼쪽으로 밀면 다음, 오른쪽으로 밀면 이전
let touch = null;
$("#sheetBody").addEventListener("touchstart", e => { const t = e.touches[0]; touch = { x: t.clientX, y: t.clientY }; }, { passive: true });
$("#sheetBody").addEventListener("touchend", e => {
  if (!touch) return;
  const t = e.changedTouches[0], dx = t.clientX - touch.x, dy = t.clientY - touch.y;
  touch = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
}, { passive: true });

/* ---------- 제목: 일정 탭 이번 달로 ---------- */
$("#homeLink").addEventListener("click", e => {
  e.preventDefault();
  if (stack.length) closeAll();
  $("#tab-cal").click();
  cur = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1); renderCal();
  scrollTo({ top: 0, behavior: "smooth" });
});

/* ---------- 이용 안내 팝업 ---------- */
const gTrack = $("#gTrack"), gN = gTrack.children.length;
const gIndex = () => Math.round(gTrack.scrollLeft / gTrack.clientWidth);
function gSync() {
  const i = gIndex();
  $("#gPos").textContent = `${i + 1} / ${gN}`;
  [...$("#gDots").children].forEach((d, k) => d.classList.toggle("on", k === i));
  $("#gPrev").disabled = i <= 0; $("#gNext").disabled = i >= gN - 1;
}
function openGuide() {
  track("이용 안내 열기");
  $("#guide").hidden = false; document.body.style.overflow = "hidden";
  gTrack.scrollLeft = 0; gSync();
  history.pushState({ guide: 1 }, "");
  setTimeout(() => $("#gClose").focus(), 30);
}
function hideGuide() { $("#guide").hidden = true; document.body.style.overflow = ""; $("#guideBtn").focus(); }
$("#guideBtn").onclick = openGuide;
$("#gClose").onclick = () => history.back();
$("#guide").addEventListener("click", e => { if (e.target.id === "guide") history.back(); });
addEventListener("popstate", e => { if (!$("#guide").hidden && !e.state?.guide) hideGuide(); });
gTrack.addEventListener("scroll", () => requestAnimationFrame(gSync), { passive: true });
$("#gPrev").onclick = () => gTrack.scrollBy({ left: -gTrack.clientWidth, behavior: "smooth" });
$("#gNext").onclick = () => gTrack.scrollBy({ left: gTrack.clientWidth, behavior: "smooth" });
document.addEventListener("keydown", e => {
  if ($("#guide").hidden) return;
  if (e.key === "Escape") history.back();
  else if (e.key === "ArrowLeft") $("#gPrev").click();
  else if (e.key === "ArrowRight") $("#gNext").click();
});

/* ---------- 다음 일정 배너 ---------- */
// 배너: 예정 일정이 있으면 다음 일정(여러 개면 하나씩 롤링), 없으면 가장 최근 일정
let upList = [], upIdx = 0, upTimer = null;
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function renderUpnext() {
  const today = ymd(TODAY);
  clearTimeout(upTimer);
  upList = EVENTS.filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  if (!upList.length) {
    const past = EVENTS.filter(e => e.date < today).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
    const last = past.at(-1);
    upList = last ? past.filter(e => e.date === last.date) : [];
    upList.past = true;
  }
  upIdx = 0;
  const el = $("#upnext");
  if (!upList.length) { el.hidden = true; return; }
  el.hidden = false;
  el.classList.toggle("past", !!upList.past);
  showUp(false);
}
function showUp(animate) {
  const el = $("#upnext"), e = upList[upIdx], d = e.date, today = ymd(TODAY);
  const past = !!upList.past;
  const badge = past ? `${Math.round((new Date(today + "T00:00") - new Date(d + "T00:00")) / 864e5)}일 전` : dday(d);
  const rolling = !past && upList.length > 1 && !reduceMotion();
  // 롤링하면 "1/3", 롤링 안 하면(지난 일정·동작 줄이기) 같은 날 다른 일정 수를 "외 n건"으로
  const sameDay = upList.filter(x => x.date === d).length;
  const extra = rolling ? ` · ${upIdx + 1}/${upList.length}` : (!past && upList.length > 1 ? ` · 외 ${upList.length - 1}건` : (sameDay > 1 ? ` · 외 ${sameDay - 1}건` : ""));
  el.dataset.date = d;
  el.innerHTML = `<span class="col${animate ? " roll" : ""}"><span class="lb">${past ? "최근 일정" : "다음 일정"} · ${d.slice(5).replace("-", ".")} ${DOW[new Date(d + "T00:00").getDay()]}${extra}</span><span class="tt"><span class="mq">${esc(e.title)}</span></span></span><b class="dd">${badge}</b>`;
  el.setAttribute("aria-label", `${past ? "최근 일정" : "다음 일정"} ${fmtDate(d)} ${e.title}, ${badge}`);
  requestAnimationFrame(() => {
    const dur = marquee();   // 흐르는 제목이면 한 바퀴 걸리는 시간(초)
    if (!rolling) return;
    clearTimeout(upTimer);
    upTimer = setTimeout(() => { upIdx = (upIdx + 1) % upList.length; showUp(true); }, (dur ? dur + 1.6 : 4.5) * 1000);
  });
}
// 제목이 칸보다 길면 옆으로 흐르게 (같은 글을 이어 붙여서 끊김 없이 반복). 한 바퀴 시간(초)을 돌려줌
function marquee() {
  const box = $("#upnext .tt"), mq = box?.querySelector(".mq"); if (!mq) return 0;
  const text = mq.dataset.t ?? mq.textContent; mq.dataset.t = text;
  mq.textContent = text; box.classList.remove("flow");
  const w = mq.offsetWidth;
  if (w <= box.clientWidth + 1 || reduceMotion()) return 0;
  const gap = 40, dur = Math.max(6, (w + gap) / 32);   // 초당 약 32px
  mq.innerHTML = `<span>${esc(text)}</span><span aria-hidden="true" style="padding-left:${gap}px">${esc(text)}</span>`;
  mq.style.setProperty("--dist", `-${w + gap}px`);
  mq.style.setProperty("--dur", `${dur}s`);
  box.classList.add("flow");
  return dur;
}
addEventListener("resize", () => requestAnimationFrame(marquee));
document.fonts?.ready.then(marquee);
// 탭이 안 보일 때는 롤링 멈춤
document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearTimeout(upTimer);
  else if (upList.length > 1 && !upList.past) showUp(false);
});
$("#upnext").addEventListener("click", () => {
  const d = $("#upnext").dataset.date; if (!d) return;
  track(`배너 · ${$("#upnext").classList.contains("past") ? "최근 일정" : "다음 일정"}`);
  cur = new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, 1); renderCal();
  openDay(d);
});
$("#randomBtn").addEventListener("click", () => { track("랜덤 · 아무 날 보기"); openRandom(); });

/* ---------- 부팅 ---------- */
async function boot() {
  renderCal(); renderList();
  try {
    const [ev, it, sr] = await Promise.all([loadTab("일정"), loadTab("아이템"), loadTab("출처")]);
    EVENTS = ev.map(r => ({
      id: r["행사ID"], date: r["날짜"], type: typeKey(r["종류"]),
      title: r["행사명"], place: r["장소"], desc: r["설명"]
    })).filter(e => e.id && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.type && e.title);
    evById = Object.fromEntries(EVENTS.map(e => [e.id, e]));
    byDate = {}; EVENTS.forEach(e => (byDate[e.date] ??= []).push(e));
    ITEMS = {};
    it.filter(r => evById[r["행사ID"]]).sort((a, b) => (+a["순서"] || 0) - (+b["순서"] || 0))
      .forEach(r => (ITEMS[r["행사ID"]] ??= []).push({ cat: r["카테고리"], name: r["아이템명"], brand: r["브랜드"], url: r["구매링크"], img: r["이미지"] }));
    SOURCES = {};
    sr.filter(r => evById[r["행사ID"]])
      .forEach(r => (SOURCES[r["행사ID"]] ??= []).push({ platform: PLATFORM_BY_LABEL[r["플랫폼"]], author: r["계정"], url: r["원본URL"] }));
    // 이번 달에 일정이 없으면 가장 최근 일정이 있는 달로
    const thisMonth = ymd(cur).slice(0, 7);
    if (!EVENTS.some(e => e.date.startsWith(thisMonth)) && EVENTS.length) {
      const past = EVENTS.map(e => e.date).filter(d => d <= ymd(TODAY)).sort().pop() || EVENTS.map(e => e.date).sort()[0];
      cur = new Date(+past.slice(0, 4), +past.slice(5, 7) - 1, 1);
    }
    $("#status").textContent = "";
    buildGroups(); renderCal(); renderList(); renderUpnext();
  } catch (err) {
    $("#status").textContent = "일정 데이터를 불러오지 못했어요. 잠시 후 새로고침해 주세요.";
  }
}
boot();
try { if (localStorage.getItem("pjm-tab") === "items") $("#tab-items").click(); } catch (e) {}

// 바깥으로 나가는 링크: 구매 링크, 원본 게시물
document.addEventListener("click", e => {
  const a = e.target.closest("a.buy, a.src"); if (!a) return;
  if (a.classList.contains("buy")) {
    const it = GROUPS[stack.at(-1)?.key]?.it;
    track(`구매 링크 · ${it ? `${it.brand || ""} ${it.name}`.trim() : a.href}`);
  } else track(`원본 링크 · ${a.querySelector("small")?.textContent.split("·")[0].trim() || "기타"}`);
}, true);
