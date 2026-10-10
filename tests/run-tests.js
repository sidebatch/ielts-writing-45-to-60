// Band Jump 자동 점검 — 푸시 전 전부 PASS가 규칙
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sw = fs.readFileSync(path.join(root, "sw.js"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log("PASS", name); }
  else { fail++; console.log("FAIL", name, extra || ""); }
}
// 1. JS 문법 검사
const m = html.match(/<script>([\s\S]*?)<\/script>/);
check("script block exists", !!m);
try { new Function(m[1]); check("JS syntax valid", true); } catch (e) { check("JS syntax valid", false, e.message); }
// 2. 데이터 평가 (샌드박스에서 배열만 추출)
let data = {};
try {
  const src = m[1].split("/* ============ POOLS")[0];
  data = new Function(src + "; return {CLINIC,BUILDER_MCQ,BUILDER_ORDER,PARA,CHUNKS,DIAG,ASSEMBLY,WEEKS};")();
  check("data evaluates", true);
} catch (e) { check("data evaluates", false, e.message); }
if (data.CLINIC) {
  check("CLINIC = 24", data.CLINIC.length === 24, data.CLINIC.length);
  check("BUILDER_MCQ = 26", data.BUILDER_MCQ.length === 26, data.BUILDER_MCQ.length);
  check("BUILDER_ORDER = 27", data.BUILDER_ORDER.length === 27, data.BUILDER_ORDER.length);
  check("PARA = 6", data.PARA.length === 6, data.PARA.length);
  check("CHUNKS = 32", data.CHUNKS.length === 32, data.CHUNKS.length);
  check("DIAG = 12", data.DIAG.length === 12, data.DIAG.length);
  check("ASSEMBLY = 6", data.ASSEMBLY.length === 6, data.ASSEMBLY.length);
  check("WEEKS = 8 / lessons = 40", data.WEEKS.length === 8 && data.WEEKS.reduce((n, w) => n + w.lessons.length, 0) === 40);
  // MCQ 정답 인덱스 유효성
  let badIdx = [];
  const pools = { CLINIC: data.CLINIC, BUILDER_MCQ: data.BUILDER_MCQ, CHUNKS: data.CHUNKS, DIAG: data.DIAG };
  for (const [name, arr] of Object.entries(pools)) arr.forEach(it => { if (!(it.a >= 0 && it.a < it.opts.length)) badIdx.push(name + ":" + it.id); });
  check("all MCQ answer indexes in range", badIdx.length === 0, badIdx.join(","));
  // ID 중복 검사
  const allIds = [];
  [data.CLINIC, data.BUILDER_MCQ, data.BUILDER_ORDER, data.PARA, data.CHUNKS, data.DIAG, data.ASSEMBLY].forEach(a => a.forEach(x => allIds.push(x.id)));
  data.WEEKS.forEach(w => w.lessons.forEach(l => allIds.push(l.id)));
  check("no duplicate ids", new Set(allIds).size === allIds.length);
  // 레슨의 운동 참조가 실제 존재하는지
  const mcqIds = { clinic: new Set(data.CLINIC.map(x => x.id)), builder: new Set(data.BUILDER_MCQ.map(x => x.id)), chunk: new Set(data.CHUNKS.map(x => x.id)), paraphrase: new Set() };
  const ordIds = { builder: new Set(data.BUILDER_ORDER.map(x => x.id)), para: new Set(data.PARA.map(x => x.id)) };
  // PARAPHRASE는 별도 확인
  const ppMatch = html.match(/const PARAPHRASE=\[([\s\S]*?)\n\];/);
  check("PARAPHRASE block found", !!ppMatch);
  let missing = [];
  data.WEEKS.forEach(w => w.lessons.forEach(l => {
    if (l.ready === false) return;
    if (!l.models || l.models.length < 2) missing.push(l.id + ":models");
    if (!l.ex || l.ex.length < 3) missing.push(l.id + ":ex");
    (l.ex || []).forEach(e => {
      const [kind, pool, id] = e;
      if (kind === "mcq") { if (pool === "paraphrase") { if (!html.includes('id:"' + id + '"')) missing.push(l.id + "->" + id); } else if (!mcqIds[pool] || !mcqIds[pool].has(id)) missing.push(l.id + "->" + pool + ":" + id); }
      else if (kind === "order") { if (!ordIds[pool] || !ordIds[pool].has(id)) missing.push(l.id + "->order:" + id); }
      else if (kind === "para") { if (!ordIds.para.has(id)) missing.push(l.id + "->para:" + id); }
    });
  }));
  check("all lesson exercise refs resolve", missing.length === 0, missing.join(",") + " HEY");
  // 준비된 레슨 수 (1~4주차 완성 기준 20개 이상)
  const ready = data.WEEKS.reduce((n, w) => n + w.lessons.filter(l => l.ready !== false).length, 0);
  check("ready lessons >= 20", ready >= 20, ready);
  check("week 3 all ready", data.WEEKS[2].lessons.every(l => l.ready !== false));
  check("week 4 all ready", data.WEEKS[3].lessons.every(l => l.ready !== false));
  check("week 5 all ready", data.WEEKS[4].lessons.every(l => l.ready !== false));
  check("week 6 all ready", data.WEEKS[5].lessons.every(l => l.ready !== false));
  check("week 7 all ready", data.WEEKS[6].lessons.every(l => l.ready !== false));
  check("week 8 all ready", data.WEEKS[7].lessons.every(l => l.ready !== false));
  // 레슨 운동 종류 회귀 (chunk 같은 미지원 kind가 세션 렌더러에서 빈 화면이 되는 버그 방지)
  let badKind = [];
  data.WEEKS.forEach(w => w.lessons.forEach(l => { (l.ex || []).forEach(e => { if (!["mcq", "order", "para"].includes(e[0])) badKind.push(l.id + ":" + e[0]); }); }));
  check("lesson ex kinds are renderable", badKind.length === 0, badKind.join(","));
  // ASSEMBLY 문단 경계 유효성
  let badAsm = [];
  data.ASSEMBLY.forEach(a => { a.breaks.forEach(b => { if (!(b > 0 && b < a.s.length)) badAsm.push(a.id + ":" + b); }); if (a.parts.length !== a.breaks.length + 1) badAsm.push(a.id + ":parts"); });
  check("assembly breaks valid", badAsm.length === 0, badAsm.join(","));
  // PARA 문장 수
  check("each PARA has 5 sentences", data.PARA.every(p => p.s.length === 5));
  // 전수 검수 회귀 (2026-10-09, 백로그 7): MCQ 선택지 내 중복 금지
  let dupOpts = [];
  [data.CLINIC, data.BUILDER_MCQ, data.CHUNKS, data.DIAG].forEach(arr => arr.forEach(it => { const norm = it.opts.map(o => o.trim().toLowerCase()); if (new Set(norm).size !== norm.length) dupOpts.push(it.id); }));
  check("no duplicate options within an MCQ", dupOpts.length === 0, dupOpts.join(","));
  // 복수 정답 회귀: k5는 'contact'(keep in contact with도 성립), k10은 'with'(suffer with 용법 존재)가 오답으로 있으면 안 됨
  const k5 = data.CHUNKS.find(x => x.id === "k5"), k10 = data.CHUNKS.find(x => x.id === "k10");
  check("k5 distractor is not also-correct 'contact'", !!k5 && !k5.opts.includes("contact"));
  check("k10 distractor is not also-correct 'with'", !!k10 && !k10.opts.includes("with"));
  // 레슨 모델은 [영문, 국문] 쌍이 모두 비어 있지 않아야 함
  let badModel = [];
  data.WEEKS.forEach(w => w.lessons.forEach(l => (l.models || []).forEach(mo => { if (!Array.isArray(mo) || mo.length !== 2 || !mo[0] || !mo[1]) badModel.push(l.id); })));
  check("all lesson models are en/ko pairs", badModel.length === 0, badModel.join(","));
}
// 3. 버전 동기화
const vHtml = (html.match(/Band Jump v([\d.]+)/) || [])[1];
const vSw = (sw.match(/bandjump-v([\d.]+)/) || [])[1];
check("version sync index/sw", vHtml && vHtml === vSw, vHtml + " vs " + vSw);
check("README mentions version", readme.includes("v" + vHtml));
// 4. 금지 표현 검수 (IELTS 클리셰 — 단, '피해야 할 예'로 인용된 경우는 부정 맥락)
check("no 'to sum up' as taught linker", html.split("\n").filter(l => /to sum up/i.test(l) && !l.includes("dc3")).length === 0);
// 5. PWA 기본
check("manifest name", manifest.name.includes("Band Jump"));
check("sw network-first", sw.includes("fetch(e.request)"));
check("localStorage key", html.includes('const KEY="bandjump-v1"'));
check("icons exist", fs.existsSync(path.join(root, "icon-192.png")) && fs.existsSync(path.join(root, "icon-512.png")));
// 5b. 레슨 주차 라벨 회귀 ([object Object] 버그 방지)
check("findLesson returns week number", html.includes("return{w:w.w,l}"));
// 6. 자유 작문 모듈이 없는지 (러닝형 설계 확정)
check("no free-writing textarea", !html.includes("<textarea"));
// 7. UX 다듬기 회귀 (백로그 8): 다음 레슨은 '바로 다음 순서'여야 하고, 완주·복습 빈 상태가 안내돼야 함
check("lessonAfter helper exists", html.includes("function lessonAfter"));
check("lesson result uses linear next lesson", html.includes("function renderLessonResult") && html.includes("lessonAfter(id)"));
check("home has course-completion state", html.includes("8주 코스를 완주했어요"));
check("review empty state is explicit", html.includes("오늘 복습할 문제가 없어요"));
check("next review schedule helpers exist", html.includes("function nextDueInfo") && html.includes("function fmtDay"));
check("quit returns to session origin", html.includes("SES.back"));
// 8. 접근성·성능 회귀 (백로그 9): 터치 영역·대비·키보드·오프라인
check("touch targets >=44px (chip)", html.includes(".chip{display:inline-flex;align-items:center;min-height:44px"));
check("touch targets >=44px (back)", html.includes(".back{display:inline-flex;align-items:center;min-height:44px"));
check("touch targets >=48px (opt/sent/btn)", html.includes(".opt{display:block") && html.includes("min-height:48px") && html.includes("min-height:52px"));
check("focus-visible style present", html.includes(":focus-visible{outline:3px solid"));
check("reduced motion respected", html.includes("prefers-reduced-motion"));
check("no sub-12.5px text classes", !/font-size:11\.5px/.test(html) && !/font-size:12px/.test(html.split("<style>")[1].split("</style>")[0].replace("12.5px", "")));
check("footer contrast color (not #9ca3af)", !html.includes("color:#9ca3af") && html.includes("color:#595959"));
check("teal/amber/rose darkened for AA tags", html.includes("--teal:#0f766e") && html.includes("--amber:#b45309") && html.includes("--rose:#be123c"));
check("select font 16px (no iOS auto-zoom)", /select\{[^}]*font-size:16px/.test(html));
check("nav exposes aria-current and go() syncs it", html.includes('aria-current="page"') && html.includes('b.setAttribute("aria-current","page")'));
check("keyboard activation for tappable rows/models", html.includes('data-kb') && html.includes('"kb"in e.target.dataset') && html.includes('role="button" tabindex="0" data-kb'));
check("feedback regions are aria-live", (html.match(/aria-live="polite"/g) || []).length >= 4);
check("sw caches only ok responses", sw.includes("res.ok"));
check("sw offline navigation fallback to app shell", sw.includes('e.request.mode === "navigate"') && sw.includes('caches.match("./index.html"'));
// 9. 최종 플레이스루 회귀 (백로그 10): 모범 에세이는 실제 시험 최소 분량(250단어)을 충족해야 하고, 전 레슨이 처음부터 끝까지 플레이 가능해야 함
if (data.ASSEMBLY) {
  const wc = data.ASSEMBLY.map(a => a.s.join(" ").split(/\s+/).length);
  check("every assembly essay meets the IELTS 250-word minimum (<=300)", wc.every(n => n >= 250 && n <= 300), wc.join(","));
  check("assembly list shows word count", html.includes('a.s.join(" ").split(/\\s+/).length'));
  check("w8d2 note matches a1 sentence count", html.includes("의견형 에세이 " + data.ASSEMBLY[0].s.length + "문장"));
  let incomplete = [];
  data.WEEKS.forEach(w => w.lessons.forEach(l => {
    if (!l.pat || l.pat.length < 3) incomplete.push(l.id + ":pat");
    if (!l.note || l.note.length < 40) incomplete.push(l.id + ":note");
    if (!l.models || l.models.length < 2) incomplete.push(l.id + ":models");
    if (!l.ex || l.ex.length < 3 || l.ex.length > 5) incomplete.push(l.id + ":ex");
  }));
  check("all 40 lessons playthrough-complete (pat/note/models/ex)", incomplete.length === 0, incomplete.join(","));
}
// 10. 6편째 에세이 회귀 (2차 백로그 11): 긍정/부정 발전형이 기존 5편과 같은 형식·기준을 지켜야 함
if (data.ASSEMBLY) {
  const a6 = data.ASSEMBLY.find(a => a.id === "a6");
  check("a6 exists as positive/negative development essay", !!a6 && a6.type.includes("Positive or Negative Development") && /positive or negative development/i.test(a6.q));
  check("a6 has 16 sentences and standard breaks/parts", !!a6 && a6.s.length === 16 && JSON.stringify(a6.breaks) === "[2,8,14]" && a6.parts.length === 4);
  check("a6 states position in intro and restates it in conclusion", !!a6 && a6.s[1].includes("largely positive development") && a6.s[14].startsWith("In conclusion") && a6.s[14].includes("positive development overall"));
  check("a6 body order markers are unambiguous", !!a6 && a6.s[8].startsWith("However") && a6.s[11].startsWith("Another problem") && a6.s[13].startsWith("Because returning products"));
  check("README counts 6 assembly essays", readme.includes("모범 에세이 6편"));
}
// 11. 공유·발견 마감 회귀 (2차 백로그 12): OG/Twitter 메타·canonical·구조화 데이터가 실주소와 맞고, 설명 문구가 페이지·매니페스트·소셜 메타에서 하나로 통일돼야 함
{
  const LIVE = "https://sidebatch.github.io/ielts-writing-45-to-60/";
  const metaDesc = (html.match(/<meta name="description" content="([^"]+)">/) || [])[1];
  const og = (name) => (html.match(new RegExp('<meta property="og:' + name + '" content="([^"]+)">')) || [])[1];
  const tw = (name) => (html.match(new RegExp('<meta name="twitter:' + name + '" content="([^"]+)">')) || [])[1];
  const canonical = (html.match(/<link rel="canonical" href="([^"]+)">/) || [])[1];
  check("og title/description present and description unified (meta=og=twitter=manifest)", !!metaDesc && og("description") === metaDesc && tw("description") === metaDesc && manifest.description === metaDesc);
  check("canonical and og:url match the live URL", canonical === LIVE && og("url") === LIVE, canonical + " / " + og("url"));
  check("og:image is the absolute live og-image.png", og("image") === LIVE + "og-image.png" && tw("image") === og("image"), og("image"));
  const ogPath = path.join(root, "og-image.png");
  let ogDims = null;
  if (fs.existsSync(ogPath)) { const b = fs.readFileSync(ogPath); if (b.slice(1, 4).toString() === "PNG") ogDims = [b.readUInt32BE(16), b.readUInt32BE(20)]; }
  check("og-image.png exists at 1200x630 and meta dims agree", !!ogDims && ogDims[0] === 1200 && ogDims[1] === 630 && og("image:width") === "1200" && og("image:height") === "630", ogDims && ogDims.join("x"));
  check("twitter card is summary_large_image with alt text", tw("card") === "summary_large_image" && !!tw("image:alt") && !!og("image:alt"));
  let ld = null;
  const ldMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  try { ld = ldMatch ? JSON.parse(ldMatch[1]) : null; } catch (e) { ld = null; }
  check("JSON-LD parses as WebApplication for the live URL with unified description", !!ld && ld["@type"] === "WebApplication" && ld.url === LIVE && ld.description === metaDesc);
  check("apple touch icon and web-app title present", html.includes('<link rel="apple-touch-icon"') && html.includes('<meta name="apple-mobile-web-app-title" content="Band Jump">'));
}
// 12. 학습 리듬 마감 회귀 (2차 백로그 13): 홈 '이번 주 진도'는 월요일 시작 주간으로 완료 레슨·학습일·끝낸 복습 문제 수를 보여줘야 하고, 복습 완료는 실제로 기록돼야 함
{
  const fnMatch = html.match(/function weekStartTs\(ts\)\{[\s\S]*?\n\}/);
  check("weekStartTs function extractable", !!fnMatch);
  if (fnMatch) {
    const fn = new Function(fnMatch[0] + "; return weekStartTs;")();
    const fri = new Date(fn(new Date(2026, 9, 9, 15, 30).getTime()));
    check("weekStartTs returns that week's Monday at midnight (Fri 2026-10-09 -> Mon 2026-10-05)", fri.getDay() === 1 && fri.getFullYear() === 2026 && fri.getMonth() === 9 && fri.getDate() === 5 && fri.getHours() === 0 && fri.getMinutes() === 0, fri.toString());
    check("weekStartTs on a Monday returns the same day", new Date(fn(new Date(2026, 9, 5, 9, 0).getTime())).getDate() === 5);
    check("weekStartTs on a Sunday stays in the same Monday-start week", new Date(fn(new Date(2026, 9, 11, 9, 0).getTime())).getDate() === 5);
  }
  check("weekStats aggregates lessons/days/review log from the week start", html.includes("function weekStats()") && html.includes("v.at>=start") && html.includes("s>=startStr") && html.includes("(S.rlog||[])"));
  check("home renders this-week summary card with all three metrics", html.includes("이번 주 진도") && html.includes("완료한 레슨") && html.includes("학습한 날") && html.includes("끝낸 복습 문제") && html.includes("weekStats()"));
  check("weekly summary explains the Monday reset and the 5-lesson pace", html.includes("월요일마다 새로 시작합니다") && html.includes("주 5레슨 페이스"));
  check("review completions are logged (capped) without changing the storage key", html.includes("S.rlog=S.rlog||[]") && html.includes("S.rlog.push(Date.now())") && html.includes("S.rlog.slice(-1000)") && html.includes('const KEY="bandjump-v1"'));
  check("README documents the weekly summary", readme.includes("이번 주 진도"));
}
console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
