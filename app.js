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
  fancafe:   { label: "팬카페",   kind: "app" },
  blog:      { label: "블로그",   kind: "app" }
};
const TYPE_BY_LABEL = { "유튜브":"youtube", "인스타그램":"instagram", "GV":"gv", "무대인사":"muin", "북토크":"book", "방송":"tv", "콘서트":"concert", "팬카페":"fancafe", "블로그":"blog" };
const PLATFORM_BY_LABEL = { "X":"x", "인스타그램":"instagram", "유튜브":"youtube", "네이버 카페":"cafe", "네이버 블로그":"blog" };
const PLATFORM_LABEL = { x:"X", instagram:"인스타그램", youtube:"유튜브", cafe:"네이버 카페", blog:"네이버 블로그" };
const CAT_CODE = { "아우터":"OUTER", "상의":"TOP", "하의":"BOTTOM", "신발":"SHOES", "잡화":"ACC", "기타":"ETC" };
const CAT_PRE  = { "아우터":"OUT", "상의":"TOP", "하의":"BTM", "신발":"SHO", "잡화":"ACC", "기타":"ETC" };
// 흑백 선화 아이콘 (index.html의 <symbol> 사용)
const icon = (id, label) => `<svg class="ic" role="img" aria-label="${label}"><use href="#i-${id}"/></svg>`;
const APP_ICON = {
  youtube: icon("youtube", "유튜브"), instagram: icon("instagram", "인스타그램"), x: icon("x", "X"),
  cafe: icon("cafe", "네이버 카페"), fancafe: icon("cafe", "팬카페"), blog: icon("blog", "블로그")
};
// 사이트가 모르는 종류가 시트에 들어와도 일정이 사라지지 않게 회색 글자 칩으로 표시
function typeKey(label) {
  if (!label) return "";
  if (TYPE_BY_LABEL[label]) return TYPE_BY_LABEL[label];
  const k = "x-" + label;
  TYPES[k] ??= { label, chip: label, cls: "etc" };
  return k;
}
const mark = t => { const T = TYPES[t]; return T.kind === "app" ? APP_ICON[t] : `<span class="chip">${esc(T.chip)}</span>`; };

/* ---------- 유틸 ---------- */
const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const DOW = ["SUN","MON","TUE","WED","THU","FRI","SAT"];
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
    const pcs = evs.reduce((n, e) => n + (ITEMS[e.id]?.length || 0), 0);   // 그날 입은 아이템 수
    // 같은 종류는 아이콘 하나 + ×개수로 묶고, 칸에는 두 종류까지만
    const groups = [];
    evs.forEach(e => { const g = groups.find(x => x.type === e.type); g ? g.n++ : groups.push({ type: e.type, n: 1 }); });
    const shown = groups.slice(0, 2).map(g => `<span class="g">${mark(g.type)}${g.n > 1 ? `<span class="x">×${g.n}</span>` : ""}</span>`).join("");
    const rest = groups.slice(2).reduce((s, g) => s + g.n, 0);
    const more = rest ? `<span class="more">+${rest}</span>` : "";
    const num = `<span class="n"><span>${pad(d.getDate())}</span>${pcs ? `<em title="아이템 ${pcs}개">${pcs}</em>` : ""}</span>`;
    html += evs.length
      ? `<button class="${cls}" data-date="${k}" aria-label="${fmtDate(k)} 일정 ${evs.length}건${pcs ? `, 아이템 ${pcs}개` : ""}">${num}<span class="marks">${shown}${more}</span></button>`
      : `<div class="${cls}">${num}</div>`;
  }
  $("#grid").innerHTML = html;
  const m = ymd(cur).slice(0, 7), n = EVENTS.filter(e => e.date.startsWith(m)).length;
  $("#monthCnt").textContent = n ? `${n} ENTRIES` : "";
}
$("#grid").addEventListener("click", e => { const b = e.target.closest(".day.has"); if (b) openDay(b.dataset.date); });
$("#prev").onclick = () => { cur.setMonth(cur.getMonth() - 1); renderCal(); };
$("#next").onclick = () => { cur.setMonth(cur.getMonth() + 1); renderCal(); };
const renderLegend = () => { $("#legend").innerHTML = Object.entries(TYPES).map(([k, T]) => `<span>${mark(k)}${T.kind === "app" ? T.label : (T.chip === T.label ? "" : T.label)}</span>`).join("") + `<span><em>2</em>아이템 수</span>`; };
renderLegend();

/* ---------- 아이템 목록 ---------- */
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
};
let brandFilter = store.get("pjm-brand", "");
let sortDir = store.get("pjm-sort", "desc");            // desc 최신순 · asc 오래된순
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
let lastListIds = null;   // 목록에 지금 보이는 행사들 (팝업 이전/다음 범위)

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
  $("#sortBtn").innerHTML = (sortDir === "desc" ? "최신순" : "오래된순") + '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3v10M2.5 10.5 5 13l2.5-2.5M11 13V3M8.5 5.5 11 3l2.5 2.5"/></svg>';
}
function setPeriod(p) {
  if (p.from && p.to && p.from > p.to) [p.from, p.to] = [p.to, p.from];
  period = p; store.set("pjm-period", JSON.stringify(period)); renderList();
}

let catFilter = store.get("pjm-cat", "");
const pad3 = n => String(n).padStart(3, "0");
// 모든 아이템을 날짜순으로 펼치고 고유 번호(품번)를 매긴다
function allPieces() {
  const ids = itemIds().sort((a, b) => evById[a].date.localeCompare(evById[b].date) || a.localeCompare(b));
  let seq = 0; const out = [];
  ids.forEach(id => ITEMS[id].forEach((it, i) => out.push({ id, i, it, seq: ++seq })));
  return out;
}
function chipBar(el, attr, current, entries) {
  el.innerHTML = entries.map(([v, label, n]) =>
    `<button data-${attr}="${esc(v)}" aria-pressed="${v === current}">${esc(label)}${n != null ? `<span>${n}</span>` : ""}</button>`).join("");
}
function renderList() {
  renderPeriodPanel();
  const inRange = allPieces().filter(p => inPeriod(evById[p.id].date));
  // 카테고리
  const catCount = {}; inRange.forEach(p => catCount[p.it.cat] = (catCount[p.it.cat] || 0) + 1);
  const cats = Object.keys(CAT_CODE).filter(c => catCount[c]);
  if (catFilter && !catCount[catFilter]) cats.push(catFilter);
  chipBar($("#catBar"), "cat", catFilter, [["", "ALL", inRange.length], ...cats.map(c => [c, CAT_CODE[c] || c, catCount[c] || 0])]);
  const byCat = inRange.filter(p => !catFilter || p.it.cat === catFilter);
  // 브랜드
  const count = {}; byCat.forEach(p => p.it.brand && (count[p.it.brand] = (count[p.it.brand] || 0) + 1));
  const brands = Object.keys(count).sort((a, b) => count[b] - count[a] || a.localeCompare(b, "ko"));
  if (brandFilter && !count[brandFilter]) brands.push(brandFilter);
  $("#brandBar").hidden = brands.length < 2;
  chipBar($("#brandBar"), "brand", brandFilter, [["", "ALL BRANDS"], ...brands.map(b => [b, b, count[b] || 0])]);
  $("#brandBar").querySelectorAll("button").forEach(b => b.classList.add("bf"));
  const pieces = byCat.filter(p => !brandFilter || p.it.brand === brandFilter)
    .sort((a, b) => (sortDir === "desc" ? b.seq - a.seq : a.seq - b.seq));
  lastListIds = [...new Set(pieces.map(p => p.id))];
  if (!pieces.length) {
    const any = itemIds().length;
    $("#itemList").innerHTML = `<li class="empty">${any ? "조건에 맞는 아이템 정보가 없어요." : "아직 등록된 아이템 정보가 없어요."}${any ? ` <button class="reset" id="resetFilters">필터 초기화</button>` : ""}</li>`;
    return;
  }
  const months = [];
  pieces.forEach(p => { const m = ym(evById[p.id].date); (months.at(-1)?.m === m ? months.at(-1) : (months.push({ m, list: [] }), months.at(-1))).list.push(p); });
  $("#itemList").innerHTML = months.map(({ m, list }) =>
    `<li class="mhead"><span>${ymLabel(m)}</span><small>${list.length} PCS</small></li><li class="tags">${list.map(tagCard).join("")}</li>`).join("");
}
function tagCard(p) {
  const e = evById[p.id], it = p.it;
  return `<button class="tag" data-id="${esc(p.id)}" data-i="${p.i}">
    <span class="no">${CAT_PRE[it.cat] || "ETC"}-${pad3(p.seq)}</span>
    <span class="br">${esc(it.brand || "—")}</span>
    <span class="nm">${esc(it.name)}</span>
    <span class="ev">${e.date.slice(5).replace("-", ".")} · ${esc(e.title)}</span>
    <span class="bc" aria-hidden="true"></span>
    <span class="ft"><span>VIEW</span><span>→</span></span>
  </button>`;
}
$("#itemList").addEventListener("click", e => {
  if (e.target.closest("#resetFilters")) { brandFilter = ""; catFilter = ""; store.set("pjm-brand", ""); store.set("pjm-cat", ""); setPeriod({ from: "", to: "" }); return; }
  const b = e.target.closest("button[data-id]"); if (b) openItems(b.dataset.id, null, +b.dataset.i);
});
$("#brandBar").addEventListener("click", e => {
  const b = e.target.closest("button[data-brand]"); if (!b) return;
  brandFilter = b.dataset.brand; store.set("pjm-brand", brandFilter); renderList();
});
$("#catBar").addEventListener("click", e => {
  const b = e.target.closest("button[data-cat]"); if (!b) return;
  catFilter = b.dataset.cat; store.set("pjm-cat", catFilter); renderList();
});
$("#periodBtn").addEventListener("click", () => {
  const open = $("#periodPanel").hidden;
  $("#periodPanel").hidden = !open; $("#periodBtn").setAttribute("aria-expanded", open);
});
$("#periodPanel").addEventListener("click", e => {
  const q = e.target.closest("[data-quick]"); if (q) setPeriod(QUICK[q.dataset.quick]());
});
$("#pFrom").addEventListener("change", () => setPeriod({ from: $("#pFrom").value, to: period.to }));
$("#pTo").addEventListener("change", () => setPeriod({ from: period.from, to: $("#pTo").value }));
$("#sortBtn").addEventListener("click", () => { sortDir = sortDir === "desc" ? "asc" : "desc"; store.set("pjm-sort", sortDir); renderList(); });
// 월 헤더가 상단 고정 메뉴 바로 아래에 붙도록 메뉴 높이를 CSS 변수로
const syncHeader = () => document.documentElement.style.setProperty("--hdr", $("header").offsetHeight + "px");
addEventListener("resize", syncHeader); syncHeader();

/* ---------- 원본 게시물 임베드 ---------- */
const loaded = {};
function loadScript(src) {
  return loaded[src] ??= new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.async = true; s.onload = ok; s.onerror = no; document.body.appendChild(s); });
}
function ytId(u) { const m = u.match(/(?:youtu\.be\/|v=|shorts\/|embed\/|live\/)([\w-]{11})/); return m && m[1]; }
// 같은 영상이 여러 곳에 올라온 경우: 유튜브 > 인스타그램 > X 순으로 하나만 임베드하고 나머지는 링크로
const SRC_ORDER = { youtube: 0, instagram: 1, x: 2 };
const orderSrcs = list => [...list].sort((a, b) => (SRC_ORDER[a.platform] ?? 9) - (SRC_ORDER[b.platform] ?? 9));
function srcLink(s) {
  const url = safeUrl(s.url); if (!url) return "";
  return `<a class="orig" href="${esc(url)}" target="_blank" rel="noopener">${APP_ICON[s.platform] || ""}<span>${PLATFORM_LABEL[s.platform] || "원본"}${s.author ? " · " + esc(s.author) : ""} ↗</span></a>`;
}
function srcEmbed(s) {
  const url = safeUrl(s.url); if (!url) return "";
  if (s.platform === "x") {
    const tw = url.replace(/^https?:\/\/(www\.)?x\.com/, "https://twitter.com").split("?")[0];
    return `<blockquote class="twitter-tweet" data-dnt="true"><a href="${esc(tw)}"></a></blockquote>`;
  }
  if (s.platform === "instagram")
    return `<blockquote class="instagram-media" data-instgrm-permalink="${esc(url.split("?")[0])}" data-instgrm-version="14" style="margin:0;min-width:0;width:100%"></blockquote>`;
  if (s.platform === "youtube" && ytId(url))
    return `<iframe src="https://www.youtube-nocookie.com/embed/${ytId(url)}" title="유튜브 영상" loading="lazy" allowfullscreen></iframe>`;
  return "";
}
function hydrateEmbeds() {
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  document.querySelectorAll("#sheetBody .twitter-tweet").forEach(b => dark && b.setAttribute("data-theme", "dark"));
  if ($("#sheetBody .twitter-tweet")) loadScript("https://platform.twitter.com/widgets.js").then(() => window.twttr?.widgets?.load($("#sheetBody"))).catch(() => {});
  if ($("#sheetBody .instagram-media")) loadScript("https://www.instagram.com/embed.js").then(() => window.instgrm?.Embeds?.process()).catch(() => {});
}

/* ---------- 시트(팝업) ---------- */
// 화면 스택: 날짜 상세 → (아이템) 순서로 쌓이고, 브라우저 뒤로가기와 연동된다.
// 이전/다음은 항상 날짜순(‹ 이전 날짜, › 다음 날짜)으로 이동하고 스택 깊이는 그대로 둔다.
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
function navList(view) {
  return view.v === "day" ? Object.keys(byDate).sort() : [...(view.scope || itemIds())].sort(byDateId);
}
const viewKey = v => v.v === "day" ? v.date : v.id;
function render(view, dir = 0) {
  const list = navList(view), i = list.indexOf(viewKey(view));
  $("#prevS").disabled = i <= 0;
  $("#nextS").disabled = i < 0 || i >= list.length - 1;
  $("#sheetPos").textContent = i >= 0 && list.length > 1 ? `${i + 1} / ${list.length}` : "";
  $("#back").style.visibility = stack.length < 2 ? "hidden" : "visible";   // 자리는 유지해서 제목이 가운데 오게
  view.v === "day" ? renderDay(view.date) : renderItems(view.id);
  const body = $("#sheetBody");
  body.scrollTop = 0;
  if (view.focus != null) {   // 목록에서 누른 행택으로 바로 이동
    const t = body.querySelector(`.tag[data-i="${view.focus}"]`);
    if (t && view.focus > 0) { body.scrollTop = t.offsetTop - 12; t.classList.add("flash"); }
  }
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
  const next = view.v === "day" ? { ...view, date: list[j] } : { ...view, id: list[j], focus: null };
  stack[stack.length - 1] = next;
  render(next, dir);
  if (next.v === "day") { const d = next.date; const m = new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, 1); if (m.getTime() !== cur.getTime()) { cur = m; renderCal(); } }
}
function openDay(date) { stack = []; push({ v: "day", date }); }
function openItems(id, fromDate, focus = null) {
  if (fromDate) push({ v: "items", id });                                // 날짜 상세에서 들어옴: 전체 아이템을 날짜순으로
  else { stack = []; push({ v: "items", id, scope: lastListIds, focus }); } // 목록에서 들어옴: 지금 걸린 필터 결과 안에서
}
function closeAll() { if (stack.length) history.go(-stack.length); }
addEventListener("popstate", e => {
  const d = e.state?.pjm || 0;
  if (d >= stack.length) return;
  stack.length = d;
  if (!d) hideSheet(); else render(stack[d - 1]);
});

function renderDay(date) {
  const evs = byDate[date] || [];
  $("#sheetTitle").textContent = fmtDate(date);
  // 옷 안쪽 케어 라벨처럼
  $("#sheetBody").innerHTML = `<div class="care"><div class="top"><span>${fmtDate(date)}</span><span>${pad(evs.length)} ENTRIES</span></div>` +
    evs.map(e => {
      const n = ITEMS[e.id]?.length || 0;
      let dl = "";
      if (e.place) dl += `<dt>PLACE</dt><dd>${esc(e.place)}</dd>`;
      if (e.desc) dl += `<dt>NOTE</dt><dd>${esc(e.desc)}</dd>`;
      const acts = n
        ? `<button class="pcs" data-items="${esc(e.id)}">${n} PCS <span aria-hidden="true">→</span></button>`
        : (SOURCES[e.id] || []).map(srcLink).join("");
      return `<div class="r">${mark(e.type)}<div><h3>${esc(e.title)}</h3>${dl ? `<dl class="meta">${dl}</dl>` : ""}${acts ? `<div class="acts">${acts}</div>` : ""}</div></div>`;
    }).join("") + `</div>`;
}
function renderItems(id) {
  const e = evById[id];
  $("#sheetTitle").textContent = fmtDate(e.date);
  const list = ITEMS[id] || [], srcs = orderSrcs(SOURCES[id] || []);
  const seqOf = Object.fromEntries(allPieces().filter(p => p.id === id).map(p => [p.i, p.seq]));
  const embed = srcs.length ? srcEmbed(srcs[0]) : "";
  $("#sheetBody").innerHTML =
    `<div class="item-head"><div class="type">${mark(e.type)}<span>${esc(TYPES[e.type].label)} · ${list.length} PCS</span></div><h3>${esc(e.title)}</h3>` +
    `${embed ? `<div class="embed">${embed}</div>` : ""}${srcs.length ? `<div class="srcs">${srcs.map(srcLink).join("")}</div>` : ""}</div>` +
    `<div class="sheet-tags">` + list.map((it, i) => {
      const url = safeUrl(it.url);
      return `<article class="tag" data-i="${i}">
        <span class="no">${CAT_PRE[it.cat] || "ETC"}-${pad3(seqOf[i] || 0)} · ${esc(CAT_CODE[it.cat] || it.cat)}</span>
        <span class="br">${esc(it.brand || "—")}</span>
        <span class="nm">${esc(it.name)}</span>
        <span class="bc" aria-hidden="true"></span>
        ${url ? `<a class="buy" href="${esc(url)}" target="_blank" rel="noopener"><span>BUY</span><span>↗</span></a>` : `<span class="buy none"><span>NO LINK</span><span>—</span></span>`}
      </article>`;
    }).join("") + `</div>`;
  hydrateEmbeds();
}
$("#sheetBody").addEventListener("click", ev => {
  const b = ev.target.closest("button[data-items]");
  if (b) { const id = b.dataset.items; openItems(id, evById[id].date); }
});
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
      .forEach(r => (ITEMS[r["행사ID"]] ??= []).push({ cat: r["카테고리"], name: r["아이템명"], brand: r["브랜드"], url: r["구매링크"] }));
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
    renderLegend(); renderCal(); renderList();
  } catch (err) {
    $("#status").textContent = "일정 데이터를 불러오지 못했어요. 잠시 후 새로고침해 주세요.";
  }
}
boot();
try { if (localStorage.getItem("pjm-tab") === "items") $("#tab-items").click(); } catch (e) {}
