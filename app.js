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
  concert:   { label: "콘서트",   chip: "콘서트", cls: "etc" }
};
const TYPE_BY_LABEL = { "유튜브":"youtube", "인스타그램":"instagram", "GV":"gv", "무대인사":"muin", "북토크":"book", "방송":"tv", "콘서트":"concert" };
const PLATFORM_BY_LABEL = { "X":"x", "인스타그램":"instagram", "유튜브":"youtube" };
const PLATFORM_LABEL = { x:"X", instagram:"인스타그램", youtube:"유튜브" };
const CAT_EMOJI = { "아우터":"🧥", "상의":"👕", "하의":"👖", "신발":"👟", "잡화":"👜", "기타":"✨" };

const APP_ICON = {
  youtube: '<svg class="app" viewBox="0 0 18 18" aria-label="유튜브"><rect x="1" y="3.5" width="16" height="11" rx="3" fill="#e5302a"/><path d="M7.4 6.6v4.8L11.6 9z" fill="#fff"/></svg>',
  instagram: '<svg class="app" viewBox="0 0 18 18" aria-label="인스타그램"><defs><linearGradient id="ig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#f6a13a"/><stop offset=".5" stop-color="#e2336b"/><stop offset="1" stop-color="#7a3fc4"/></linearGradient></defs><rect x="1.5" y="1.5" width="15" height="15" rx="4.2" fill="url(#ig)"/><circle cx="9" cy="9" r="3.3" fill="none" stroke="#fff" stroke-width="1.4"/><circle cx="13" cy="5" r=".9" fill="#fff"/></svg>',
  x: '<svg class="app" viewBox="0 0 18 18" aria-label="X"><rect x="1.5" y="1.5" width="15" height="15" rx="3.5" fill="#000"/><path d="M5.2 5h2.3l5.3 8H10.5zM12.6 5 5.4 13" stroke="#fff" stroke-width="1.1" fill="none"/></svg>'
};
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
    const shown = evs.slice(0, 3).map(e => mark(e.type)).join("");
    const more = evs.length > 3 ? `<span class="more">+${evs.length - 3}</span>` : "";
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
let brandFilter = "";
try { brandFilter = localStorage.getItem("pjm-brand") || ""; } catch (e) {}
function renderBrands() {
  const count = {};
  Object.entries(ITEMS).forEach(([id, list]) => {
    if (!evById[id]) return;
    new Set(list.map(it => it.brand).filter(Boolean)).forEach(b => count[b] = (count[b] || 0) + 1);
  });
  const brands = Object.keys(count).sort((a, b) => count[b] - count[a] || a.localeCompare(b, "ko"));
  if (brandFilter && !count[brandFilter]) brandFilter = "";
  $("#brandBar").hidden = brands.length < 2;
  $("#brandBar").innerHTML = [["", "전체"], ...brands.map(b => [b, b])].map(([v, label]) =>
    `<button class="bf" data-brand="${esc(v)}" aria-pressed="${v === brandFilter}">${esc(label)}${v ? `<span>${count[v]}</span>` : ""}</button>`
  ).join("");
}
function renderList() {
  renderBrands();
  const ids = Object.keys(ITEMS).filter(id => evById[id])
    .filter(id => !brandFilter || ITEMS[id].some(it => it.brand === brandFilter))
    .sort((a, b) => evById[b].date.localeCompare(evById[a].date));
  $("#itemList").innerHTML = ids.length ? ids.map(id => {
    const e = evById[id], list = ITEMS[id];
    const brands = [...new Set(list.map(it => it.brand).filter(Boolean))];
    const sub = brandFilter
      ? `${esc(brandFilter)} ${list.filter(it => it.brand === brandFilter).length} · 전체 ${list.length}개`
      : `${brands.map(esc).join(" · ")} · ${list.length}개`;
    return `<li><button data-id="${esc(id)}"><span class="thumb" style="display:grid;place-items:center">${mark(e.type)}</span><div class="meta"><div class="date">${fmtDate(e.date)}</div><div class="ttl">${esc(e.title)}</div><div class="cnt">${sub}</div></div><svg class="go" viewBox="0 0 16 16"><path d="m6 3 5 5-5 5"/></svg></button></li>`;
  }).join("") : `<li class="empty">아직 등록된 아이템 정보가 없어요.</li>`;
}
$("#itemList").addEventListener("click", e => { const b = e.target.closest("button[data-id]"); if (b) openItems(b.dataset.id, null); });
$("#brandBar").addEventListener("click", e => {
  const b = e.target.closest("button[data-brand]"); if (!b) return;
  brandFilter = b.dataset.brand;
  try { localStorage.setItem("pjm-brand", brandFilter); } catch (err) {}
  renderList();
});

/* ---------- 원본 게시물 임베드 ---------- */
const loaded = {};
function loadScript(src) {
  return loaded[src] ??= new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.async = true; s.onload = ok; s.onerror = no; document.body.appendChild(s); });
}
function ytId(u) { const m = u.match(/(?:youtu\.be\/|v=|shorts\/|embed\/|live\/)([\w-]{11})/); return m && m[1]; }
function srcBlock(s) {
  const url = safeUrl(s.url); if (!url) return "";
  const link = `<a class="src" href="${esc(url)}" target="_blank" rel="noopener">${APP_ICON[s.platform] || ""}<span class="who"><b>원본 게시물 보기</b><small>${PLATFORM_LABEL[s.platform] || ""} · ${esc(s.author)}</small></span><svg class="ext" viewBox="0 0 16 16"><path d="M6 3h7v7M13 3 4 12"/></svg></a>`;
  let embed = "";
  if (s.platform === "x") {
    const tw = url.replace(/^https?:\/\/(www\.)?x\.com/, "https://twitter.com").split("?")[0];
    embed = `<blockquote class="twitter-tweet" data-dnt="true"><a href="${esc(tw)}"></a></blockquote>`;
  } else if (s.platform === "instagram") {
    embed = `<blockquote class="instagram-media" data-instgrm-permalink="${esc(url.split("?")[0])}" data-instgrm-version="14" style="margin:0;min-width:0;width:100%"></blockquote>`;
  } else if (s.platform === "youtube" && ytId(url)) {
    embed = `<iframe src="https://www.youtube-nocookie.com/embed/${ytId(url)}" title="유튜브 영상" loading="lazy" allowfullscreen></iframe>`;
  }
  return `<div class="embed">${embed}</div>${link}`;
}
function hydrateEmbeds() {
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  document.querySelectorAll("#sheetBody .twitter-tweet").forEach(b => dark && b.setAttribute("data-theme", "dark"));
  if ($("#sheetBody .twitter-tweet")) loadScript("https://platform.twitter.com/widgets.js").then(() => window.twttr?.widgets?.load($("#sheetBody"))).catch(() => {});
  if ($("#sheetBody .instagram-media")) loadScript("https://www.instagram.com/embed.js").then(() => window.instgrm?.Embeds?.process()).catch(() => {});
}

/* ---------- 시트(팝업) ---------- */
let backTo = null, lastFocus = null;
function showSheet() {
  if (!$("#sheet").hidden) return;
  lastFocus = document.activeElement;
  $("#scrim").hidden = false; $("#sheet").hidden = false;
  requestAnimationFrame(() => { $("#scrim").classList.add("on"); $("#sheet").classList.add("on"); });
  document.body.style.overflow = "hidden";
  setTimeout(() => $("#close").focus(), 50);
}
function closeSheet() {
  $("#scrim").classList.remove("on"); $("#sheet").classList.remove("on");
  document.body.style.overflow = "";
  setTimeout(() => { $("#scrim").hidden = true; $("#sheet").hidden = true; lastFocus && lastFocus.focus(); }, 250);
}
function openDay(date) {
  backTo = null; $("#back").hidden = true;
  $("#sheetTitle").textContent = fmtDate(date);
  $("#sheetBody").innerHTML = (byDate[date] || []).map(e => {
    const has = !!ITEMS[e.id];
    const title = has
      ? `<button data-items="${esc(e.id)}">${esc(e.title)}<svg viewBox="0 0 16 16"><path d="m6 3 5 5-5 5"/></svg></button>`
      : esc(e.title);
    let dl = "";
    if (e.place) dl += `<dt>장소</dt><dd>${esc(e.place)}</dd>`;
    if (e.desc) dl += `<dt>설명</dt><dd>${esc(e.desc)}</dd>`;
    return `<article class="ev"><div class="type">${mark(e.type)}${TYPES[e.type].label}</div><h3>${title}</h3>${dl ? `<dl>${dl}</dl>` : ""}</article>`;
  }).join("");
  $("#sheetBody").scrollTop = 0;
  showSheet();
}
function openItems(id, fromDate) {
  const e = evById[id];
  backTo = fromDate; $("#back").hidden = !fromDate;
  $("#sheetTitle").textContent = fmtDate(e.date);
  const list = ITEMS[id] || [], srcs = SOURCES[id] || [];
  $("#sheetBody").innerHTML =
    `<div class="item-head"><div class="type">${mark(e.type)}${TYPES[e.type].label} · 아이템 ${list.length}개</div><h3>${esc(e.title)}</h3>${srcs.map(srcBlock).join("")}</div>` +
    list.map((it, i) => {
      const url = safeUrl(it.url);
      return `<article class="item">
        <div class="row"><span class="cat">${CAT_EMOJI[it.cat] || ""} ${esc(it.cat)}</span><span class="idx">${pad(i + 1)} / ${pad(list.length)}</span></div>
        <div><p class="name">${esc(it.name)}</p><p class="brandname">${esc(it.brand)}</p></div>
        ${url ? `<a class="buy" href="${esc(url)}" target="_blank" rel="noopener">구매 링크<svg viewBox="0 0 16 16"><path d="M6 3h7v7M13 3 4 12"/></svg></a>` : `<div class="empty">구매 링크 정보 없음</div>`}
      </article>`;
    }).join("");
  $("#sheetBody").scrollTop = 0;
  showSheet();
  hydrateEmbeds();
}
$("#sheetBody").addEventListener("click", ev => {
  const b = ev.target.closest("button[data-items]");
  if (b) { const id = b.dataset.items; openItems(id, evById[id].date); }
});
$("#back").onclick = () => { if (backTo) openDay(backTo); };
$("#close").onclick = closeSheet;
$("#scrim").onclick = closeSheet;
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#sheet").hidden) closeSheet(); });

/* ---------- 부팅 ---------- */
async function boot() {
  renderCal(); renderList();
  try {
    const [ev, it, sr] = await Promise.all([loadTab("일정"), loadTab("아이템"), loadTab("출처")]);
    EVENTS = ev.map(r => ({
      id: r["행사ID"], date: r["날짜"], type: TYPE_BY_LABEL[r["종류"]],
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
    renderCal(); renderList();
  } catch (err) {
    $("#status").textContent = "일정 데이터를 불러오지 못했어요. 잠시 후 새로고침해 주세요.";
  }
}
boot();
try { if (localStorage.getItem("pjm-tab") === "items") $("#tab-items").click(); } catch (e) {}
