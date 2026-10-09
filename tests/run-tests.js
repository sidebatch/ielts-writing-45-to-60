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
  check("ASSEMBLY = 5", data.ASSEMBLY.length === 5, data.ASSEMBLY.length);
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
console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
