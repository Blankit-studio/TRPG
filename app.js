// ─────────────────────────────────────────────────────────────
// TRPG — 모집 · 세션 기록 · 캐릭터 시트 · 실시간 주사위
// (Firebase + Vanilla JS)
// ─────────────────────────────────────────────────────────────
import { firebaseConfig, isConfigured } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInAnonymously, signOut, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc, arrayUnion,
  collection, getDocs, onSnapshot, serverTimestamp, query, where, orderBy, limit,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// ── 상수 ───────────────────────────────────────────────────────
const SYSTEMS = ["크툴루의 부름(CoC)", "던전 앤 드래곤(D&D 5e)", "패스파인더", "사이버펑크 RED", "메이지", "워해머", "자작/기타"];
const DICE_BUTTONS = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];
const CHAR_EMOJIS = ["🧙", "⚔️", "🏹", "🛡️", "🗡️", "🧝", "🧛", "🦹", "🧚", "🐉", "🔮", "🎭", "👑", "💀", "🦊", "🐺"];

const STATUS = {
  recruiting: { label: "모집 중", cls: "st-recruiting", emoji: "📢" },
  playing:    { label: "진행 중", cls: "st-playing",    emoji: "🎲" },
  done:       { label: "완료",    cls: "st-done",       emoji: "🏁" },
};
const VISIBILITY = {
  public:   { label: "공개", desc: "둘러보기 목록에 노출 · 누구나 열람" },
  unlisted: { label: "링크 공개", desc: "목록에 안 보임 · 링크 아는 사람만 열람" },
  private:  { label: "비공개", desc: "GM과 참여 멤버만 열람" },
};
const APP_STATUS = {
  pending:  { label: "대기 중", cls: "ap-pending" },
  accepted: { label: "수락됨", cls: "ap-accepted" },
  rejected: { label: "거절됨", cls: "ap-rejected" },
};

// 템플릿 미선택 시 기본 능력치 프리셋
const DEFAULT_STATS = ["근력", "민첩", "건강", "지능", "정신력", "외형"];

// 바로 시작용 내장 예시 템플릿 (로그인 후 '내 템플릿으로 만들기'로 복제)
const EXAMPLE_TEMPLATES = [
  {
    key: "fantasy-village-defense",
    genre: "판타지",
    name: "판타지 — 마을 방어",
    jobCategories: [
      { name: "전사", image: "", stats: "근력 위주 · 최전선 탱커 · 근접 방어의 핵심" },
      { name: "마법사", image: "", stats: "지능 위주 · 광역 공격 마법 · 원거리 딜러" },
      { name: "궁수", image: "", stats: "민첩 위주 · 원거리 정밀 사격 · 견제와 마무리" },
      { name: "프리스트", image: "", stats: "신앙 위주 · 치유·버프·정화 지원" },
      { name: "바드", image: "", stats: "매력 위주 · 사기 진작·군중 제어·정보 수집" },
      { name: "소환사", image: "", stats: "정신력 위주 · 소환수로 전선 보강·수적 열세 보완" },
      { name: "도적", image: "", stats: "민첩 위주 · 정찰·기습·함정 설치와 해제" },
      { name: "연금술사", image: "", stats: "지식 위주 · 폭탄·물약·설치물 제작" },
    ],
    storyline:
      "평화롭던 변경 마을에 마물 무리가 몰려온다. 파티는 정찰로 위협을 파악하고, 하루 동안 방벽과 함정으로 마을을 요새화한 뒤, " +
      "밤의 척후전과 새벽의 총공세를 막아 마을을 지켜낸다. 우두머리를 쓰러뜨리면 그 배후 세력의 단서가 드러난다.",
    storyNodes: [
      { id: "n1", title: "발단 — 마을 도착", body: "평화로운 변경 마을 '이든브룩'. 최근 숲에서 가축과 사람이 사라진다는 소문이 돈다. 파티는 의뢰를 받고 마을에 도착한다.", x: 40, y: 40, links: ["n2"] },
      { id: "n2", title: "정찰 — 숲의 흔적", body: "숲을 조사하면 고블린·오크의 흔적과 진영을 발견. 무리의 규모, 지휘 체계, 공격 예정일을 파악한다.", x: 320, y: 40, links: ["n3"] },
      { id: "n3", title: "방어 준비", body: "촌장·주민과 협력해 방벽 보강, 함정 설치, 비전투원 대피, 보급과 배치를 결정한다. 남은 시간은 단 하루.", x: 600, y: 40, links: ["n4"] },
      { id: "n4", title: "1차 습격 — 밤의 척후", body: "밤, 척후 마물이 외곽을 친다. 함정과 초동 대응으로 첫 파도를 막아낸다. 이때의 피해와 사기 변화가 이후 전투에 영향을 준다.", x: 600, y: 250, links: ["n5"] },
      { id: "n5", title: "총공세 — 검은엄니", body: "새벽, 오크 군단과 우두머리 '검은엄니'의 총공세. 성문·성벽·중앙 광장 세 전선에서 격전이 벌어진다.", x: 320, y: 250, links: ["n6"] },
      { id: "n6", title: "승리와 여운", body: "마을을 지켜내면 보상과 명성을 얻는다. 우두머리의 목걸이에서 배후 세력의 문양이 발견되어 다음 이야기로 이어진다.", x: 40, y: 250, links: [] },
    ],
  },
];

// ── 전역 상태 ──────────────────────────────────────────────────
let app, auth, db;
let currentUser = null;
const subs = [];            // 현재 화면의 onSnapshot 해제 함수들

// ── DOM 헬퍼 ───────────────────────────────────────────────────
const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  });
  return node;
};

// 직업 카테고리 정규화 — 구버전(문자열 배열)도 { name, image, stats } 형태로 변환
function normalizeJobs(arr) {
  return (arr || [])
    .map((j) => (typeof j === "string"
      ? { name: j, image: "", stats: "" }
      : { name: j.name || "", image: j.image || "", stats: j.stats || "" }))
    .filter((j) => j.name);
}

// 읽기 전용 직업 카드 (이름 · 이미지 · 능력치)
function jobCardView(job) {
  const img = el("img", { class: "job-card-img", src: (job.image || "").trim() || fallbackAvatar(job.name), alt: "" });
  img.addEventListener("error", () => { img.onerror = null; img.src = fallbackAvatar(job.name); });
  return el("div", { class: "job-card" }, [
    img,
    el("div", { class: "job-card-body" }, [
      el("div", { class: "job-card-name", text: job.name }),
      job.stats ? el("div", { class: "job-card-stats", text: job.stats }) : null,
    ]),
  ]);
}

// 선택한 이미지 파일을 브라우저에서 작게 리사이즈 → data URL 반환
// (Firebase Storage 없이 Firestore 문서에 인라인 저장 — 무료 요금제에서 동작)
function fileToResizedDataURL(file, maxSize = 256, quality = 0.8) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("이미지 파일만 추가할 수 있어요."));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("이미지를 불러오지 못했습니다."));
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w >= h && w > maxSize) { h = Math.round(h * maxSize / w); w = maxSize; }
        else if (h > w && h > maxSize) { w = Math.round(w * maxSize / h); h = maxSize; }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        // WebP(투명도 유지·용량 작음) 우선, 미지원 시 자동으로 PNG
        let out = canvas.toDataURL("image/webp", quality);
        if (!out.startsWith("data:image/webp")) out = canvas.toDataURL("image/jpeg", quality);
        if (out.length > 200 * 1024) out = canvas.toDataURL("image/jpeg", 0.6); // 과대 시 한 번 더 압축
        resolve(out);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// 직업 카드 편집기 — 이름·이미지(업로드/URL)·능력치 작성. { wrap, getJobs } 반환.
function jobEditor(initial = []) {
  const jobs = normalizeJobs(initial).map((j) => ({ ...j }));
  const wrap = el("div", { class: "job-editor" });
  const list = el("div", { class: "job-edit-list" });
  const addBtn = el("button", { type: "button", class: "btn btn-sm", style: "align-self:flex-start", onclick: () => { jobs.push({ name: "", image: "", stats: "" }); render(); list.querySelectorAll(".job-name").forEach((n, i, a) => { if (i === a.length - 1) n.focus(); }); } }, "＋ 직업 추가");
  wrap.append(list, addBtn);

  const isData = (s) => (s || "").startsWith("data:");
  function render() {
    list.innerHTML = "";
    jobs.forEach((job, i) => {
      const preview = el("img", { class: "job-preview", alt: "" });
      const setPreview = () => { preview.src = (job.image || "").trim() || fallbackAvatar(job.name || "?"); };
      preview.addEventListener("error", () => { preview.onerror = null; preview.src = fallbackAvatar(job.name || "?"); });
      const nameIn = el("input", { type: "text", maxlength: "30", value: job.name, placeholder: "직업 이름 (예: 탐정)", class: "job-name" });
      const imgIn = el("input", { type: "text", maxlength: "1000", value: isData(job.image) ? "" : (job.image || "") });
      const setImgPlaceholder = () => { imgIn.placeholder = isData(job.image) ? "업로드한 이미지 사용 중 · URL 입력 시 대체" : "이미지 URL (또는 아래 버튼으로 업로드)"; };
      const statsIn = el("textarea", { maxlength: "500", placeholder: "직업 능력치 / 설명 (예: 추리 70, 심리학 50, 권총)" });
      statsIn.value = job.stats;
      const fileInput = el("input", { type: "file", accept: "image/*", style: "display:none" });
      const uploadBtn = el("button", { type: "button", class: "btn btn-sm", onclick: () => fileInput.click() }, "🖼️ 파일 선택");
      nameIn.addEventListener("input", () => { job.name = nameIn.value; if (!(job.image || "").trim()) setPreview(); });
      imgIn.addEventListener("input", () => { job.image = imgIn.value; setPreview(); });
      statsIn.addEventListener("input", () => { job.stats = statsIn.value; });
      fileInput.addEventListener("change", async () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        uploadBtn.disabled = true;
        const orig = uploadBtn.textContent;
        uploadBtn.textContent = "처리 중…";
        try {
          const dataUrl = await fileToResizedDataURL(file);
          job.image = dataUrl; imgIn.value = ""; setImgPlaceholder(); setPreview();
          toast("이미지를 추가했습니다.");
        } catch (e) { toast(e.message || "이미지 처리 실패", true); }
        uploadBtn.disabled = false;
        uploadBtn.textContent = orig;
        fileInput.value = "";
      });
      setImgPlaceholder();
      setPreview();
      list.appendChild(el("div", { class: "job-card-edit" }, [
        el("div", { class: "job-card-top" }, [
          preview,
          el("div", { class: "grow" }, [nameIn, imgIn, el("div", { class: "job-upload-row" }, [uploadBtn, fileInput])]),
          el("button", { type: "button", class: "btn btn-sm btn-danger", onclick: () => { jobs.splice(i, 1); render(); } }, "✕"),
        ]),
        statsIn,
      ]));
    });
  }
  render();
  return {
    wrap,
    getJobs: () => jobs
      .map((j) => ({ name: (j.name || "").trim(), image: (j.image || "").trim(), stats: (j.stats || "").trim() }))
      .filter((j) => j.name)
      .slice(0, 40),
  };
}

function toast(msg, isError = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast" + (isError ? " error" : "");
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 2800);
}

const isMember = () => currentUser && !currentUser.isAnonymous;

// 게스트 표시 이름 (브라우저에 기억) — 익명 사용자 구분용
const GUEST_NAME_LS = "trpg_guest_name";
const getGuestName = () => (localStorage.getItem(GUEST_NAME_LS) || "").trim();
const setGuestName = (n) => localStorage.setItem(GUEST_NAME_LS, (n || "").trim());
function displayNameFor(user) {
  if (user && !user.isAnonymous) return user.displayName || "이름없음";
  return getGuestName() || "게스트";
}

// ── 주사위 파서 ────────────────────────────────────────────────
// "2d6+3", "d20", "1d100-5" 등 한 개의 주사위 항 + 보정치 지원
function rollDice(input) {
  const m = String(input).trim().toLowerCase().replace(/\s/g, "").match(/^(\d*)d(\d+)([+-]\d+)?$/);
  if (!m) return null;
  const count = Math.min(parseInt(m[1] || "1", 10), 100);
  const sides = Math.min(parseInt(m[2], 10), 1000);
  const modifier = m[3] ? parseInt(m[3], 10) : 0;
  if (count < 1 || sides < 1) return null;
  const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
  const total = rolls.reduce((a, b) => a + b, 0) + modifier;
  return { notation: `${count}d${sides}${modifier ? (modifier > 0 ? "+" + modifier : modifier) : ""}`, rolls, modifier, sides, total };
}

// ── AI 진행 보조 (무료 Gemini API · GM이 본인 키 사용) ─────────
const AI_KEY_LS = "dicelog_gemini_key";
const AI_MODEL = "gemini-2.0-flash"; // 무료 등급 모델 (콘솔에서 다른 모델로 교체 가능)
const AI_SYSTEM =
  "당신은 숙련된 TRPG 게임 마스터(GM)를 돕는 보조자입니다. 주어진 게임 상황과 스토리 맥락을 활용해, " +
  "GM이 세션 도중 즉시 사용할 수 있는 구체적이고 간결한 제안을 한국어로 제공합니다. 실전에서 바로 읽어주거나 적용할 수 있게 " +
  "너무 길지 않게 작성하고, 플레이어의 자유의지를 존중하며 강제적 전개는 피하세요.";

const getAiKey = () => localStorage.getItem(AI_KEY_LS) || "";
const setAiKey = (k) => localStorage.setItem(AI_KEY_LS, k);

async function callGemini(prompt, systemText) {
  const key = getAiKey();
  if (!key) throw new Error("NO_KEY");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.9, maxOutputTokens: 800 },
    }),
  });
  if (!res.ok) {
    if (res.status === 400 || res.status === 403) throw new Error("API 키가 올바르지 않거나 권한이 없습니다.");
    if (res.status === 429) throw new Error("무료 사용량 한도를 초과했어요. 잠시 후 다시 시도하세요.");
    throw new Error("요청 실패 (" + res.status + ")");
  }
  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text).join("").trim();
  if (!text) throw new Error("응답이 비어 있습니다. (안전 필터에 걸렸을 수 있어요)");
  return text;
}

// 캠페인 맥락을 AI 프롬프트용 텍스트로 정리
function campaignAiContext(data, nodes, log) {
  const parts = [`캠페인 제목: ${data.title || "(제목 없음)"}`];
  if (data.system) parts.push(`시스템/룰: ${data.system}`);
  if (data.description) parts.push(`소개: ${data.description}`);
  const jobs = normalizeJobs(data.jobCategories);
  if (jobs.length) parts.push("직업: " + jobs.map((j) => j.name + (j.stats ? `(${j.stats})` : "")).join(", "));
  if (nodes.length) parts.push("스토리 맵:\n" + nodes.map((n) => `- ${n.title || "무제"}: ${n.body || ""}`).join("\n"));
  const recent = (log || []).slice(-12).map((r) => r.type === "roll" ? `${r.byName} 주사위 ${r.notation}=${r.total}` : `${r.byName}: ${r.text}`);
  if (recent.length) parts.push("최근 진행:\n" + recent.join("\n"));
  return parts.join("\n");
}

const AI_ACTIONS = [
  ["다음 전개 3가지", "지금 상황에서 이어질 수 있는 흥미로운 전개를 3가지 제안해줘. 각 항목 1~2문장으로 간결하게."],
  ["NPC 즉석 생성", "현재 장면에 어울리는 NPC 1명을 즉석에서 만들어줘. 이름·성격·동기·말투 예시를 짧게 포함해줘."],
  ["랜덤 돌발사건", "지금 분위기에 맞는 예상치 못한 돌발 사건 하나를 제안해줘. 2~3문장으로 짧게."],
  ["장면 묘사", "현재 장면을 플레이어에게 들려줄 생생한 묘사로 3~4문장 써줘."],
  ["판정 난이도 추천", "현재 상황에서 필요할 법한 판정과 적절한 난이도(목표 수치/주사위)를 시스템에 맞게 추천해줘."],
];

// AI 보조 패널 — getContext()로 최신 맥락 제공, onShare(text)로 결과를 플레이 로그에 공유
function buildAiPanel({ getContext, onShare }) {
  const panel = el("div", { class: "ai-panel" });
  panel.appendChild(el("div", { class: "ai-head" }, [
    el("span", { class: "ai-title", text: "🤖 AI 진행 보조" }),
    el("span", { class: "ai-sub", text: "세션 진행·즉석 선택을 돕습니다" }),
  ]));
  const bodyBox = el("div");
  panel.appendChild(bodyBox);

  function renderKeyForm() {
    bodyBox.innerHTML = "";
    const keyIn = el("input", { type: "password", class: "play-input", placeholder: "Gemini API 키 붙여넣기" });
    keyIn.addEventListener("keydown", (e) => { if (e.key === "Enter") saveKey(); });
    const saveKey = () => { const k = keyIn.value.trim(); if (!k) { toast("키를 입력하세요.", true); return; } setAiKey(k); toast("API 키를 저장했습니다."); renderTools(); };
    bodyBox.appendChild(el("div", { class: "ai-keyform" }, [
      el("div", { class: "mode-hint", style: "margin:0", html: "무료 <b>Gemini API 키</b>가 필요합니다. <a href='https://aistudio.google.com/apikey' target='_blank' rel='noopener'>Google AI Studio에서 무료 발급</a> 후 붙여넣으세요. 키는 <b>이 브라우저에만</b> 저장되며 서버로 전송되지 않습니다." }),
      el("div", { class: "play-row" }, [keyIn, el("button", { class: "btn btn-primary", onclick: saveKey }, "저장")]),
    ]));
  }

  function renderTools() {
    bodyBox.innerHTML = "";
    const quick = el("div", { class: "ai-actions" });
    AI_ACTIONS.forEach(([label, instr]) => quick.appendChild(el("button", { class: "btn btn-sm", onclick: () => run(instr) }, label)));
    const askIn = el("input", { class: "play-input", placeholder: "직접 물어보기 (예: 이 방의 함정 아이디어 줘)" });
    askIn.addEventListener("keydown", (e) => { if (e.key === "Enter" && askIn.value.trim()) { run(askIn.value.trim()); askIn.value = ""; } });
    const out = el("div", { class: "ai-output", hidden: true });
    bodyBox.append(
      quick,
      el("div", { class: "play-row" }, [askIn, el("button", { class: "btn btn-primary", onclick: () => { if (askIn.value.trim()) { run(askIn.value.trim()); askIn.value = ""; } } }, "생성")]),
      out,
      el("div", { class: "ai-foot" }, [el("button", { class: "btn btn-sm btn-ghost", onclick: () => { if (confirm("저장된 API 키를 삭제할까요?")) { localStorage.removeItem(AI_KEY_LS); renderKeyForm(); } } }, "키 변경/삭제")]),
    );

    async function run(instruction) {
      out.hidden = false; out.className = "ai-output"; out.textContent = "생각 중…";
      try {
        const text = await callGemini(`[게임 상황]\n${getContext()}\n\n[요청]\n${instruction}`, AI_SYSTEM);
        out.innerHTML = "";
        out.appendChild(el("div", { class: "ai-text", text }));
        out.appendChild(el("div", { class: "ai-out-actions" }, [
          el("button", { class: "btn btn-sm", onclick: async () => { try { await navigator.clipboard.writeText(text); toast("복사했습니다."); } catch { prompt("복사하세요:", text); } } }, "📋 복사"),
          onShare ? el("button", { class: "btn btn-sm", onclick: () => { onShare("🤖 " + text); toast("플레이 로그에 공유했습니다."); } }, "💬 로그에 공유") : null,
        ]));
      } catch (e) {
        out.className = "ai-output error";
        if (e.message === "NO_KEY") { renderKeyForm(); return; }
        out.textContent = "AI 오류: " + e.message;
      }
    }
  }

  if (getAiKey()) renderTools(); else renderKeyForm();
  return panel;
}

// ── 초기화 ─────────────────────────────────────────────────────
function boot() {
  if (!isConfigured) {
    $("#configBanner").hidden = false;
    renderConfigHelp();
    return;
  }
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (e) {
    console.error(e);
    $("#configBanner").hidden = false;
    return;
  }

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user && !user.isAnonymous) await upsertProfile(user);
    renderAuthArea();
    route();
  });

  // 화면 이동 시에만 모달 정리 (인증 변화로 인한 재렌더에서는 열린 모달 유지)
  window.addEventListener("hashchange", () => { closeModal(); route(); });
  route();
}

// 로그인 시 본인 프로필을 users/{uid} 에 병합 저장
async function upsertProfile(user) {
  if (!user || user.isAnonymous) return;
  try {
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    const patch = {
      name: user.displayName || "이름없음",
      photo: user.photoURL || "",
      email: user.email || "",
      updatedAt: serverTimestamp(),
    };
    if (!snap.exists()) patch.createdAt = serverTimestamp();
    await setDoc(ref, patch, { merge: true });
  } catch (e) {
    console.warn("프로필 저장 실패", e);
  }
}

// 로그인 사용자의 표시 정보 (작성자 denormalize 용)
function me() {
  return {
    uid: currentUser?.uid || "",
    name: currentUser?.displayName || "익명",
    photo: currentUser?.photoURL || "",
  };
}

// ── 인증 영역 / 액션 ───────────────────────────────────────────
function renderAuthArea() {
  const area = $("#authArea");
  area.innerHTML = "";
  document.querySelectorAll("[data-auth-only]").forEach((n) => (n.style.display = isMember() ? "" : "none"));

  if (isMember()) {
    area.appendChild(
      el("div", { class: "user-chip" }, [
        el("img", { class: "avatar", src: currentUser.photoURL || fallbackAvatar(currentUser.displayName), alt: "" }),
        el("span", { class: "user-name", text: currentUser.displayName || "사용자" }),
        el("button", { class: "btn btn-sm btn-ghost", onclick: doLogout }, "로그아웃"),
      ])
    );
  } else if (currentUser && currentUser.isAnonymous) {
    area.appendChild(
      el("div", { class: "user-chip" }, [
        el("img", { class: "avatar", src: fallbackAvatar("게"), alt: "" }),
        el("span", { class: "user-name", text: "게스트" }),
        el("button", { class: "btn btn-sm btn-google", onclick: doLogin }, [googleIcon(), "로그인"]),
      ])
    );
  } else {
    area.appendChild(el("button", { class: "btn btn-google", onclick: doLogin }, [googleIcon(), "Google로 로그인"]));
  }
}

async function doLogin() {
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
    toast("로그인되었습니다.");
  } catch (e) {
    console.error(e);
    toast("로그인 실패: " + (e.code || e.message), true);
  }
}
async function doLogout() {
  await signOut(auth);
  toast("로그아웃되었습니다.");
  location.hash = "#/";
}
// 게스트(비로그인) 참여용 익명 인증 보장
async function ensureUser() {
  if (currentUser) return currentUser;
  try {
    const cred = await signInAnonymously(auth);
    return cred.user;
  } catch (e) {
    const blocked = e.code === "auth/admin-restricted-operation" || e.code === "auth/operation-not-allowed";
    toast(blocked ? "게스트 참여가 꺼져 있어요. Firebase 콘솔에서 '익명 로그인'을 켜주세요." : "인증 실패: " + (e.code || e.message), true);
    return null;
  }
}

// ── 라우터 ─────────────────────────────────────────────────────
function teardownSubs() {
  while (subs.length) {
    const u = subs.pop();
    try { u(); } catch {}
  }
}
function track(unsub) { if (typeof unsub === "function") subs.push(unsub); return unsub; }

function route() {
  teardownSubs();
  const hash = location.hash || "#/";
  const view = $("#view");
  view.innerHTML = "";
  document.querySelectorAll(".nav-link").forEach((n) => n.classList.remove("active"));

  const setActive = (r) => $(`.nav-link[data-route="${r}"]`)?.classList.add("active");

  if (hash === "#/" || hash === "") {
    setActive("home"); renderHome(view);
  } else if (hash === "#/templates") {
    setActive("templates"); renderTemplates(view);
  } else if (hash === "#/me") {
    setActive("me");
    if (!isMember()) return renderLoginPrompt(view, "내 테이블을 관리하려면 Google 로그인이 필요합니다.");
    renderMe(view);
  } else if (hash.startsWith("#/c/")) {
    renderCampaign(view, decodeURIComponent(hash.slice(4)));
  } else if (hash.startsWith("#/char/")) {
    renderCharacter(view, decodeURIComponent(hash.slice(7)));
  } else if (hash.startsWith("#/t/")) {
    renderTemplate(view, decodeURIComponent(hash.slice(4)));
  } else {
    renderHome(view);
  }
  window.scrollTo(0, 0);
}

// ── 홈 / 모집 게시판 ──────────────────────────────────────────
async function renderHome(view) {
  view.appendChild(
    el("section", { class: "hero" }, [
      el("h1", { text: "함께 굴리는 TRPG 테이블" }),
      el("p", {
        text:
          "GM은 캠페인을 모집하고 세션을 기록하세요. 플레이어는 마음에 드는 테이블에 신청하고, " +
          "캐릭터 시트를 만들고, 실시간으로 주사위를 굴리며 즐기세요.",
      }),
      el("div", { class: "hero-actions" }, [
        isMember()
          ? el("button", { class: "btn btn-primary", onclick: () => openCampaignModal() }, "＋ 캠페인 모집하기")
          : el("button", { class: "btn btn-google", onclick: doLogin }, [googleIcon(), "Google로 시작하기"]),
        el("a", { class: "btn btn-ghost", href: "#/templates" }, "템플릿 둘러보기"),
      ]),
    ])
  );

  const sec = el("div");
  const filterBar = el("div", { class: "filter-bar" });
  let curFilter = "all";
  const cards = el("div", { class: "cards", id: "cards" }, [el("div", { class: "empty", text: "불러오는 중…" })]);

  const renderFilter = (docs) => {
    filterBar.innerHTML = "";
    const opts = [["all", "전체"], ["recruiting", "📢 모집 중"], ["playing", "🎲 진행 중"], ["done", "🏁 완료"]];
    opts.forEach(([key, label]) => {
      filterBar.appendChild(
        el("button", {
          class: "chip" + (curFilter === key ? " active" : ""),
          onclick: () => { curFilter = key; renderFilter(docs); renderCards(docs); },
        }, label)
      );
    });
  };
  const renderCards = (docs) => {
    const list = curFilter === "all" ? docs : docs.filter((d) => (d.status || "recruiting") === curFilter);
    cards.innerHTML = "";
    if (!list.length) { cards.appendChild(el("div", { class: "empty", text: "해당하는 캠페인이 없습니다." })); return; }
    list.forEach((data) => cards.appendChild(campaignCard(data)));
  };

  sec.appendChild(el("div", { class: "section-title" }, [el("h2", { text: "공개 캠페인" }), el("span", { class: "count", id: "homeCount" })]));
  sec.appendChild(filterBar);
  sec.appendChild(cards);
  view.appendChild(sec);

  try {
    const snap = await getDocs(query(collection(db, "campaigns"), where("visibility", "==", "public")));
    const docs = [];
    snap.forEach((d) => docs.push({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
    $("#homeCount").textContent = `${docs.length}개`;
    renderFilter(docs);
    renderCards(docs);
    if (!docs.length) cards.appendChild(el("div", { class: "empty", text: "아직 공개된 캠페인이 없습니다. 첫 캠페인을 모집해 보세요!" }));
  } catch (e) {
    console.error(e);
    cards.innerHTML = "";
    cards.appendChild(el("div", { class: "empty", text: "목록을 불러오지 못했습니다. Firestore 보안 규칙을 확인하세요." }));
  }
}

function campaignCard(data) {
  const st = STATUS[data.status] || STATUS.recruiting;
  const cur = (data.memberUids || []).length;
  const max = data.maxPlayers || 0;
  return el("div", { class: "card", onclick: () => (location.hash = "#/c/" + encodeURIComponent(data.id)) }, [
    el("div", { class: "card-top" }, [
      el("span", { class: "badge " + st.cls, text: st.emoji + " " + st.label }),
      data.system ? el("span", { class: "tag", text: data.system }) : null,
    ]),
    el("div", { class: "card-name", text: data.title || "제목 없음" }),
    data.description ? el("div", { class: "card-desc", text: data.description }) : null,
    el("div", { class: "card-foot" }, [
      el("div", { class: "card-head" }, [
        el("img", { class: "avatar avatar-sm", src: data.gmPhoto || fallbackAvatar(data.gmName), alt: "" }),
        el("span", { class: "card-sub", text: "GM " + (data.gmName || "익명") }),
      ]),
      el("span", { class: "card-sub", html: `👥 <b>${cur}</b>${max ? " / " + max : ""}` }),
    ]),
  ]);
}

function renderLoginPrompt(view, msg) {
  view.appendChild(
    el("div", { class: "center-stack", style: "padding:60px 20px" }, [
      el("p", { class: "card-sub", text: msg, style: "font-size:15px" }),
      el("button", { class: "btn btn-google", onclick: doLogin }, [googleIcon(), "Google로 로그인"]),
    ])
  );
}

// ── 내 테이블 (대시보드) ──────────────────────────────────────
async function renderMe(view) {
  const uid = currentUser.uid;
  view.appendChild(
    el("div", { class: "section-title" }, [
      el("h2", { text: "내 테이블" }),
      el("div", { class: "grow" }),
      el("button", { class: "btn btn-sm", onclick: () => openCharacterModal() }, "＋ 캐릭터"),
      el("button", { class: "btn btn-sm", onclick: () => openTemplateModal() }, "＋ 템플릿"),
      el("button", { class: "btn btn-sm btn-primary", onclick: () => openCampaignModal() }, "＋ 캠페인"),
    ])
  );

  const mkBlock = (title) => {
    const box = el("div", { class: "cards" }, [el("div", { class: "empty", text: "불러오는 중…" })]);
    view.appendChild(el("h3", { class: "block-title", text: title }));
    view.appendChild(box);
    return box;
  };
  const gmBox = mkBlock("🎙️ 내가 GM인 캠페인");
  const playBox = mkBlock("🎲 참여 중인 캠페인");
  const charBox = mkBlock("🧙 내 캐릭터");
  const tplBox = mkBlock("📜 내 템플릿");

  const fill = (box, docs, render, emptyMsg) => {
    box.innerHTML = "";
    if (!docs.length) { box.appendChild(el("div", { class: "empty", text: emptyMsg })); return; }
    docs.forEach((d) => box.appendChild(render(d)));
  };

  try {
    const gmSnap = await getDocs(query(collection(db, "campaigns"), where("gmUid", "==", uid)));
    fill(gmBox, gmSnap.docs.map((d) => ({ id: d.id, ...d.data() })), campaignCard, "아직 만든 캠페인이 없습니다.");
  } catch (e) { console.error(e); gmBox.innerHTML = ""; gmBox.appendChild(el("div", { class: "empty", text: "불러오기 실패" })); }

  try {
    const memSnap = await getDocs(query(collection(db, "campaigns"), where("memberUids", "array-contains", uid)));
    const joined = memSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((d) => d.gmUid !== uid);
    fill(playBox, joined, campaignCard, "참여 중인 캠페인이 없습니다. 모집 게시판에서 신청해 보세요!");
  } catch (e) { console.error(e); playBox.innerHTML = ""; playBox.appendChild(el("div", { class: "empty", text: "불러오기 실패" })); }

  try {
    const charSnap = await getDocs(query(collection(db, "characters"), where("ownerUid", "==", uid)));
    const chars = charSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    chars.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
    fill(charBox, chars, characterCard, "아직 캐릭터가 없습니다. ＋캐릭터로 시트를 만들어 보세요.");
  } catch (e) { console.error(e); charBox.innerHTML = ""; charBox.appendChild(el("div", { class: "empty", text: "불러오기 실패" })); }

  try {
    const tplSnap = await getDocs(query(collection(db, "templates"), where("ownerUid", "==", uid)));
    fill(tplBox, tplSnap.docs.map((d) => ({ id: d.id, ...d.data() })), templateCard, "아직 템플릿이 없습니다.");
  } catch (e) { console.error(e); tplBox.innerHTML = ""; tplBox.appendChild(el("div", { class: "empty", text: "불러오기 실패" })); }
}

function characterCard(data) {
  return el("div", { class: "card", onclick: () => (location.hash = "#/char/" + encodeURIComponent(data.id)) }, [
    el("div", { class: "card-head" }, [
      el("span", { class: "char-emoji", text: data.emoji || "🧙" }),
      el("div", { class: "grow" }, [
        el("div", { class: "card-name", text: data.name || "이름 없는 캐릭터" }),
        el("div", { class: "card-sub", text: data.system || "시스템 미지정" }),
      ]),
    ]),
    el("div", { class: "card-foot" }, [
      el("span", { class: "card-sub", html: `❤️ HP <b>${data.hp ?? "-"}</b>${data.maxHp ? " / " + data.maxHp : ""}` }),
      el("span", { class: "card-sub", text: VISIBILITY[data.visibility]?.label || "공개" }),
    ]),
  ]);
}

function exampleCard(ex) {
  return el("div", { class: "card", onclick: () => openTemplateModal(null, ex) }, [
    el("div", { class: "card-top" }, [
      el("span", { class: "badge st-recruiting", text: "🌟 예시" }),
      ex.genre ? el("span", { class: "tag", text: ex.genre }) : null,
    ]),
    el("div", { class: "card-name", text: ex.name }),
    ex.storyline ? el("div", { class: "card-desc", text: ex.storyline }) : null,
    el("div", { class: "card-foot" }, [
      el("span", { class: "card-sub", html: `🧰 직업 <b>${(ex.jobCategories || []).length}</b>종` }),
      el("span", { class: "card-sub", text: "클릭 → 내 템플릿으로 만들기" }),
    ]),
  ]);
}

function templateCard(data) {
  return el("div", { class: "card", onclick: () => (location.hash = "#/t/" + encodeURIComponent(data.id)) }, [
    el("div", { class: "card-top" }, [
      el("span", { class: "tag", text: "📜 템플릿" }),
      el("span", { class: "card-sub", text: VISIBILITY[data.visibility]?.label || "공개" }),
    ]),
    el("div", { class: "card-name", text: data.name || "이름 없는 템플릿" }),
    data.storyline ? el("div", { class: "card-desc", text: data.storyline }) : null,
    el("div", { class: "card-foot" }, [
      el("span", { class: "card-sub", html: `🧰 직업 <b>${(data.jobCategories || []).length}</b>종` }),
      el("span", { class: "card-sub", text: "제작 " + (data.ownerName || "익명") }),
    ]),
  ]);
}

// ── 캠페인 상세 (실시간) ──────────────────────────────────────
const campaignTabs = {};                                  // 캠페인별 마지막 탭 (재렌더 시 유지)
const sessionJoinKey = (id) => "trpg_session_joined_" + id; // 닉네임 참가 여부 (브라우저 기억)

function renderCampaign(view, id) {
  view.innerHTML = "";
  const wrap = el("div");
  view.appendChild(wrap);
  const statusBox = el("div", {}, [el("div", { class: "empty", text: "캠페인을 불러오는 중…" })]);
  wrap.appendChild(statusBox);

  let data = null;
  let sessions = [], applications = [], characters = [];
  const state = { tab: campaignTabs[id] || "info" };

  const isGM = () => currentUser && data && currentUser.uid === data.gmUid;
  const amMember = () => currentUser && data && (data.memberUids || []).includes(currentUser.uid);

  function render() {
    if (!data) return;
    const st = STATUS[data.status] || STATUS.recruiting;
    wrap.innerHTML = "";

    // 헤더
    const actions = el("div", { class: "schedule-actions" });
    if (isGM()) {
      if (data.status !== "done") {
        actions.appendChild(el("button", { class: "btn btn-sm", onclick: () => { if (confirm("이 캠페인의 세션을 종료(완료 처리)할까요? 나중에 다시 열 수 있습니다.")) setStatus("done", "세션을 종료했습니다."); } }, "🏁 세션 종료"));
      } else {
        actions.appendChild(el("button", { class: "btn btn-sm", onclick: () => setStatus("recruiting", "다시 모집을 시작했습니다.") }, "↩️ 다시 열기"));
      }
      actions.appendChild(el("button", { class: "btn btn-sm", onclick: () => openCampaignModal(data) }, "⚙️ 설정"));
    }
    actions.appendChild(el("button", { class: "btn btn-sm btn-ghost", onclick: () => copyShareLink("#/c/" + id) }, "🔗 공유"));

    wrap.appendChild(
      el("div", { class: "detail-head" }, [
        el("div", { class: "grow" }, [
          el("div", { class: "card-top" }, [
            el("span", { class: "badge " + st.cls, text: st.emoji + " " + st.label }),
            data.system ? el("span", { class: "tag", text: data.system }) : null,
          ]),
          el("h2", { class: "detail-title", text: data.title || "제목 없음" }),
          el("div", { class: "owner-line" }, [
            el("img", { class: "avatar avatar-sm", src: data.gmPhoto || fallbackAvatar(data.gmName), alt: "" }),
            el("span", { text: "GM " + (data.gmName || "익명") }),
            data.schedule ? el("span", { class: "dot-sep", text: "🗓️ " + data.schedule }) : null,
            el("span", { class: "dot-sep", html: `👥 ${(data.memberUids || []).length}${data.maxPlayers ? " / " + data.maxPlayers : ""}명` }),
          ]),
        ]),
        actions,
      ])
    );

    // 탭
    const tabs = el("div", { class: "tabs" });
    const tabDefs = [
      ["info", "ℹ️ 소개"],
      ["play", "🎲 플레이"],
      ["sessions", `📖 세션 (${sessions.length})`],
      ["chars", `🧙 캐릭터 (${characters.length})`],
    ];
    if (isGM()) tabDefs.push(["applicants", `📨 신청 (${applications.filter((a) => a.status === "pending").length})`]);
    tabDefs.forEach(([key, label]) => {
      tabs.appendChild(el("button", { class: "tab" + (state.tab === key ? " active" : ""), onclick: () => { state.tab = key; campaignTabs[id] = key; render(); } }, label));
    });
    wrap.appendChild(tabs);

    const panel = el("div", { class: "tab-panel" });
    wrap.appendChild(panel);
    if (state.tab === "info") renderInfoTab(panel);
    else if (state.tab === "play") renderPlayTab(panel);
    else if (state.tab === "sessions") renderSessionsTab(panel);
    else if (state.tab === "chars") renderCharsTab(panel);
    else if (state.tab === "applicants") renderApplicantsTab(panel);
  }

  // ── 소개 탭 + 신청 ──
  function renderInfoTab(panel) {
    panel.appendChild(el("div", { class: "prose", text: data.description || "소개가 아직 없습니다." }));

    // 직업 카테고리 카드
    const jobsArr = normalizeJobs(data.jobCategories);
    if (jobsArr.length) {
      panel.appendChild(el("h3", { class: "block-title", text: "🧰 직업 카테고리" }));
      const jg = el("div", { class: "job-grid" });
      jobsArr.forEach((j) => jg.appendChild(jobCardView(j)));
      panel.appendChild(jg);
    }

    // 스토리 맵
    const storyNodes = storyNodesFrom(data);
    panel.appendChild(el("div", { class: "story-head" }, [
      el("h3", { class: "block-title", style: "margin:0", text: "📖 스토리 맵" }),
      el("div", { class: "grow" }),
      isGM() ? el("button", { class: "btn btn-sm btn-primary", onclick: () => openStoryEditor(storyNodes, async (nodes) => {
        try { await updateDoc(doc(db, "campaigns", id), { storyNodes: nodes, updatedAt: serverTimestamp() }); toast("스토리 맵을 저장했습니다."); return true; }
        catch (e) { console.error(e); toast("저장 실패: " + (e.code || e.message), true); return false; }
      }) }, "🧠 스토리 맵 편집") : null,
    ]));
    const storyBox = el("div");
    panel.appendChild(storyBox);
    renderStoryViewer(storyBox, storyNodes);

    // 멤버 목록
    panel.appendChild(el("h3", { class: "block-title", text: "참여 멤버" }));
    const memberBox = el("div", { class: "member-list" });
    (data.members || []).forEach((m) => {
      memberBox.appendChild(
        el("div", { class: "member-chip" }, [
          el("img", { class: "avatar avatar-sm", src: m.photo || fallbackAvatar(m.name), alt: "" }),
          el("span", { text: m.name || "익명" }),
          m.uid === data.gmUid ? el("span", { class: "mini-badge", text: "GM" }) : (m.job ? el("span", { class: "mini-badge", text: m.job }) : null),
        ])
      );
    });
    panel.appendChild(memberBox);

    // 신청 영역 (GM/멤버가 아니고 모집 중일 때)
    if (!isGM() && !amMember()) {
      const myApp = currentUser ? applications.find((a) => a.id === currentUser.uid) : null;
      const box = el("div", { class: "apply-box" });
      if (data.status !== "recruiting") {
        box.appendChild(el("div", { class: "mode-hint", style: "margin:0", text: "현재 모집 중이 아닙니다." }));
      } else if (myApp) {
        const ap = APP_STATUS[myApp.status] || APP_STATUS.pending;
        box.appendChild(el("div", { class: "mode-hint", style: "margin:0" }, [
          `신청 상태: `, el("span", { class: "badge " + ap.cls, text: ap.label }),
        ]));
        box.appendChild(el("button", { class: "btn btn-sm btn-danger", onclick: () => cancelApplication() }, "신청 취소"));
      } else {
        box.appendChild(el("button", { class: "btn btn-primary", onclick: () => openApplyModal() }, "✋ 이 캠페인에 참여 신청"));
      }
      panel.appendChild(box);
    }
  }

  // ── 플레이 탭 (실시간 주사위 + 채팅) ──
  function renderPlayTab(panel) {
    // 정식 멤버가 아니어도 닉네임만 정하면 세션에 참가(주사위·채팅) 가능
    const joinedAsGuest = !!currentUser && !!localStorage.getItem(sessionJoinKey(id));
    const canPlay = isGM() || amMember() || joinedAsGuest;
    panel.appendChild(
      el("div", { class: "mode-hint" }, canPlay
        ? "🎲 주사위 표기(예: 2d6+3, d20)를 입력하거나 빠른 버튼을 눌러 굴리세요. 결과는 모든 참여자에게 실시간으로 공유됩니다."
        : "👋 로그인 없이 닉네임만 입력하면 이 세션의 주사위·채팅에 바로 참여할 수 있어요.")
    );

    const log = el("div", { class: "play-log", id: "playLog" });
    panel.appendChild(log);
    renderLog(log);

    if (!canPlay) {
      // 닉네임 참가 박스
      const nickIn = el("input", { type: "text", maxlength: "20", class: "play-input", placeholder: "닉네임 (예: 방랑자 렌)" });
      nickIn.value = isMember() ? "" : getGuestName();
      const join = async () => {
        if (!isMember()) {
          const n = nickIn.value.trim();
          if (!n) { toast("닉네임을 입력하세요.", true); return; }
          setGuestName(n);
        }
        // 익명 로그인 완료 시 auth 재렌더가 먼저 돌 수 있으므로, 참가 상태를 먼저 기록
        campaignTabs[id] = "play";
        localStorage.setItem(sessionJoinKey(id), "1");
        const user = await ensureUser();
        if (!user) { localStorage.removeItem(sessionJoinKey(id)); return; }
        render();
        toast("세션에 참가했습니다. 즐거운 플레이 되세요!");
      };
      nickIn.addEventListener("keydown", (e) => { if (e.key === "Enter") join(); });
      panel.appendChild(
        el("div", { class: "play-bar" }, [
          isMember()
            ? el("div", { class: "play-row" }, [el("button", { class: "btn btn-primary", onclick: join }, `🎲 ${currentUser.displayName || "내 계정"}으로 세션 참가`)])
            : el("div", { class: "play-row" }, [nickIn, el("button", { class: "btn btn-primary", onclick: join }, "🎲 세션 참가")]),
        ])
      );
    }

    if (canPlay) {
      // 빠른 주사위 버튼
      const quick = el("div", { class: "dice-quick" });
      DICE_BUTTONS.forEach((d) => quick.appendChild(el("button", { class: "btn btn-sm dice-btn", onclick: () => doRoll(d) }, d)));
      panel.appendChild(quick);

      // 입력줄
      const diceInput = el("input", { type: "text", placeholder: "주사위 표기 (예: 2d6+3)", class: "play-input" });
      const chatInput = el("input", { type: "text", placeholder: "채팅 메시지…", class: "play-input" });
      diceInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { doRoll(diceInput.value); diceInput.value = ""; } });
      chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { sendChat(chatInput.value); chatInput.value = ""; } });
      panel.appendChild(
        el("div", { class: "play-bar" }, [
          el("div", { class: "play-row" }, [diceInput, el("button", { class: "btn btn-primary", onclick: () => { doRoll(diceInput.value); diceInput.value = ""; } }, "🎲 굴리기")]),
          el("div", { class: "play-row" }, [chatInput, el("button", { class: "btn", onclick: () => { sendChat(chatInput.value); chatInput.value = ""; } }, "전송")]),
        ])
      );

      // 닉네임 참가자: 이름 표시 + 변경
      if (currentUser?.isAnonymous) {
        panel.appendChild(
          el("div", { class: "guest-bar" }, [
            el("span", { class: "card-sub", text: `참가 중: ${getGuestName() || "게스트"}` }),
            el("button", { class: "btn btn-sm btn-ghost", onclick: () => {
              const n = prompt("새 닉네임을 입력하세요.", getGuestName());
              if (n && n.trim()) { setGuestName(n.trim()); render(); toast("닉네임을 변경했습니다."); }
            } }, "닉네임 변경"),
          ])
        );
      }

      // AI 진행 보조 (GM·정식 멤버, 각자 무료 Gemini 키 사용)
      if (isGM() || amMember()) {
        panel.appendChild(buildAiPanel({
          getContext: () => campaignAiContext(data, storyNodesFrom(data), playLog),
          onShare: (text) => sendChat(text),
        }));
      }
    }
  }
  function renderLog(log) {
    log.innerHTML = "";
    if (!playLog.length) { log.appendChild(el("div", { class: "empty", text: "아직 기록이 없습니다. 첫 주사위를 굴려보세요!" })); return; }
    playLog.forEach((r) => {
      const mine = currentUser && r.byUid === currentUser.uid;
      if (r.type === "chat") {
        log.appendChild(el("div", { class: "log-line chat" + (mine ? " mine" : "") }, [
          el("span", { class: "log-who", text: r.byName || "익명" }),
          el("span", { class: "log-text", text: r.text || "" }),
          el("span", { class: "log-time", text: shortTime(r.createdAt) }),
        ]));
      } else {
        log.appendChild(el("div", { class: "log-line roll" + (mine ? " mine" : "") }, [
          el("span", { class: "log-who", text: (r.byName || "익명") }),
          el("span", { class: "roll-notation", text: "🎲 " + (r.notation || "") }),
          el("span", { class: "roll-detail", text: `[${(r.rolls || []).join(", ")}]${r.modifier ? (r.modifier > 0 ? " +" + r.modifier : " " + r.modifier) : ""}` }),
          el("span", { class: "roll-total", text: "= " + r.total }),
          el("span", { class: "log-time", text: shortTime(r.createdAt) }),
        ]));
      }
    });
    log.scrollTop = log.scrollHeight;
  }

  // ── 세션 기록 탭 ──
  function renderSessionsTab(panel) {
    if (isGM()) panel.appendChild(el("button", { class: "btn btn-sm btn-primary", style: "margin-bottom:14px", onclick: () => openSessionModal(id, sessions.length + 1) }, "＋ 세션 기록 추가"));
    if (!sessions.length) { panel.appendChild(el("div", { class: "empty", text: "아직 기록된 세션이 없습니다." })); return; }
    sessions.forEach((s) => {
      panel.appendChild(
        el("div", { class: "session-item" }, [
          el("div", { class: "session-head" }, [
            el("span", { class: "session-no", text: "#" + (s.no || "?") }),
            el("div", { class: "grow" }, [
              el("div", { class: "session-title", text: s.title || "제목 없음" }),
              s.date ? el("div", { class: "card-sub", text: "🗓️ " + s.date + (s.attendees ? " · 참석: " + s.attendees : "") }) : null,
            ]),
            isGM() ? el("div", { class: "row-gap" }, [
              el("button", { class: "btn btn-sm btn-ghost", onclick: () => openSessionModal(id, s.no, s) }, "수정"),
              el("button", { class: "btn btn-sm btn-danger", onclick: () => deleteSession(s.id) }, "삭제"),
            ]) : null,
          ]),
          s.summary ? el("div", { class: "prose session-summary", text: s.summary }) : null,
        ])
      );
    });
  }

  // ── 캐릭터 탭 ──
  function renderCharsTab(panel) {
    if (currentUser && (isGM() || amMember())) {
      panel.appendChild(el("button", { class: "btn btn-sm btn-primary", style: "margin-bottom:14px", onclick: () => openCharacterModal({ campaignId: id, system: data.system, templateId: data.templateId, onSaved: loadCampaignCharacters }) }, "＋ 이 캠페인에 캐릭터 추가"));
    }
    if (!characters.length) { panel.appendChild(el("div", { class: "empty", text: "아직 등록된 캐릭터가 없습니다." })); return; }
    const grid = el("div", { class: "cards" });
    characters.forEach((c) => grid.appendChild(characterCard(c)));
    panel.appendChild(grid);
  }

  // ── 신청 관리 탭 (GM) ──
  function renderApplicantsTab(panel) {
    if (!applications.length) { panel.appendChild(el("div", { class: "empty", text: "아직 신청자가 없습니다." })); return; }
    applications.forEach((a) => {
      const ap = APP_STATUS[a.status] || APP_STATUS.pending;
      panel.appendChild(
        el("div", { class: "applicant-item" }, [
          el("img", { class: "avatar", src: a.byPhoto || fallbackAvatar(a.byName), alt: "" }),
          el("div", { class: "grow" }, [
            el("div", { class: "row-gap" }, [
              el("span", { class: "who", text: a.byName || "익명" }),
              el("span", { class: "badge " + ap.cls, text: ap.label }),
              a.job ? el("span", { class: "mini-badge", text: a.job }) : null,
            ]),
            a.characterName ? el("div", { class: "card-sub", text: "캐릭터: " + a.characterName }) : null,
            a.message ? el("div", { class: "note", text: a.message }) : null,
          ]),
          a.status === "pending"
            ? el("div", { class: "row-gap" }, [
                el("button", { class: "btn btn-sm btn-primary", onclick: () => acceptApplication(a) }, "수락"),
                el("button", { class: "btn btn-sm btn-danger", onclick: () => setApplicationStatus(a, "rejected") }, "거절"),
              ])
            : el("button", { class: "btn btn-sm btn-ghost", onclick: () => setApplicationStatus(a, "pending") }, "되돌리기"),
        ])
      );
    });
  }

  // ── 액션들 ──
  function openApplyModal() {
    const isGuest = !isMember();
    const nameInput = el("input", { type: "text", maxlength: "20", placeholder: "표시할 이름 (예: 홍길동)" });
    nameInput.value = getGuestName();
    const charInput = el("input", { type: "text", maxlength: "40", placeholder: "참여할 캐릭터 이름 (선택)" });
    const msgInput = el("textarea", { maxlength: "300", placeholder: "GM에게 한마디 (플레이 경험, 가능 시간 등)" });
    const jobs = normalizeJobs(data.jobCategories);
    const jobSelect = jobs.length
      ? el("select", {}, [el("option", { value: "" }, "직업 선택 (선택 안 함)"), ...jobs.map((j) => el("option", { value: j.name }, j.name + (j.stats ? ` — ${j.stats}` : "")))])
      : null;
    openModal({
      title: "참여 신청",
      sub: `"${data.title}" 캠페인에 참여를 신청합니다.`,
      body: [
        isGuest ? el("div", { class: "mode-hint", style: "margin:0", text: "로그인 없이 게스트로도 신청할 수 있어요. 표시할 이름을 입력해 주세요." }) : null,
        isGuest ? el("div", { class: "field" }, [el("label", { text: "이름 (게스트)" }), nameInput]) : null,
        jobSelect ? el("div", { class: "field" }, [el("label", { text: "희망 직업" }), jobSelect]) : null,
        el("div", { class: "field" }, [el("label", { text: "캐릭터 이름" }), charInput]),
        el("div", { class: "field" }, [el("label", { text: "신청 메시지" }), msgInput]),
      ],
      actions: [
        el("button", { class: "btn btn-ghost", onclick: closeModal }, "취소"),
        el("button", { class: "btn btn-primary", onclick: async () => {
          if (isGuest) {
            const n = nameInput.value.trim();
            if (!n) { toast("이름을 입력하세요.", true); return; }
            setGuestName(n);
          }
          const user = await ensureUser();
          if (!user) return;
          try {
            await setDoc(doc(db, "campaigns", id, "applications", user.uid), {
              byUid: user.uid,
              byName: displayNameFor(user),
              byPhoto: user.photoURL || "",
              job: jobSelect ? jobSelect.value : "",
              characterName: charInput.value.trim(),
              message: msgInput.value.trim(),
              status: "pending",
              createdAt: serverTimestamp(),
            });
            closeModal();
            toast("신청을 보냈습니다.");
          } catch (e) { console.error(e); toast("신청 실패: " + (e.code || e.message), true); }
        } }, "신청하기"),
      ],
    });
    setTimeout(() => (isGuest ? nameInput : charInput).focus(), 50);
  }
  async function cancelApplication() {
    try { await deleteDoc(doc(db, "campaigns", id, "applications", currentUser.uid)); toast("신청을 취소했습니다."); }
    catch (e) { console.error(e); toast("취소 실패: " + (e.code || e.message), true); }
  }
  async function acceptApplication(a) {
    const cap = data.maxPlayers || 0;
    const cur = (data.memberUids || []).length;
    if (cap && cur >= cap && !confirm(`정원(${cap}명)이 이미 찼습니다. 그래도 수락할까요?`)) return;
    try {
      await updateDoc(doc(db, "campaigns", id), {
        memberUids: arrayUnion(a.byUid),
        members: arrayUnion({ uid: a.byUid, name: a.byName || "익명", photo: a.byPhoto || "", job: a.job || "" }),
        updatedAt: serverTimestamp(),
      });
      await updateDoc(doc(db, "campaigns", id, "applications", a.id), { status: "accepted" });
      toast(`${a.byName} 님을 멤버로 수락했습니다.`);
    } catch (e) { console.error(e); toast("수락 실패: " + (e.code || e.message), true); }
  }
  async function setApplicationStatus(a, status) {
    try { await updateDoc(doc(db, "campaigns", id, "applications", a.id), { status }); }
    catch (e) { console.error(e); toast("변경 실패: " + (e.code || e.message), true); }
  }
  async function setStatus(status, msg) {
    try { await updateDoc(doc(db, "campaigns", id), { status, updatedAt: serverTimestamp() }); toast(msg); }
    catch (e) { console.error(e); toast("변경 실패: " + (e.code || e.message), true); }
  }
  async function deleteSession(sid) {
    if (!confirm("이 세션 기록을 삭제할까요?")) return;
    try { await deleteDoc(doc(db, "campaigns", id, "sessions", sid)); toast("삭제했습니다."); }
    catch (e) { console.error(e); toast("삭제 실패: " + (e.code || e.message), true); }
  }
  async function doRoll(notation) {
    const r = rollDice(notation);
    if (!r) { toast("주사위 표기를 확인하세요. 예: 2d6+3, d20", true); return; }
    const user = await ensureUser();
    if (!user) return;
    try {
      await addDoc(collection(db, "campaigns", id, "rolls"), {
        type: "roll", notation: r.notation, rolls: r.rolls, modifier: r.modifier, total: r.total,
        byUid: user.uid, byName: displayNameFor(user), byPhoto: user.photoURL || "",
        createdAt: serverTimestamp(),
      });
    } catch (e) { console.error(e); toast("주사위 실패: " + (e.code || e.message), true); }
  }
  async function sendChat(text) {
    text = (text || "").trim();
    if (!text) return;
    const user = await ensureUser();
    if (!user) return;
    try {
      await addDoc(collection(db, "campaigns", id, "rolls"), {
        type: "chat", text,
        byUid: user.uid, byName: displayNameFor(user), byPhoto: user.photoURL || "",
        createdAt: serverTimestamp(),
      });
    } catch (e) { console.error(e); toast("전송 실패: " + (e.code || e.message), true); }
  }

  // ── 실시간 구독 ──
  let playLog = [];
  track(onSnapshot(doc(db, "campaigns", id),
    (snap) => {
      if (!snap.exists()) { wrap.innerHTML = ""; wrap.appendChild(el("div", { class: "empty", text: "존재하지 않는 캠페인입니다." })); return; }
      data = { id: snap.id, ...snap.data() };
      render();
    },
    (err) => {
      console.error(err);
      wrap.innerHTML = "";
      wrap.appendChild(el("div", { class: "empty", text: err.code === "permission-denied" ? "🔒 비공개 캠페인이거나 접근 권한이 없습니다." : "캠페인을 불러오지 못했습니다." }));
    }
  ));
  track(onSnapshot(query(collection(db, "campaigns", id, "sessions"), orderBy("no", "desc")),
    (snap) => { sessions = snap.docs.map((d) => ({ id: d.id, ...d.data() })); if (data) render(); },
    (err) => console.error("세션 구독 오류", err)
  ));
  track(onSnapshot(query(collection(db, "campaigns", id, "applications")),
    (snap) => {
      applications = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      applications.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      if (data) render();
    },
    (err) => console.error("신청 구독 오류", err)
  ));
  // 최신 100개를 받아 시간순으로 뒤집어 표시 (asc+limit 는 '가장 오래된' 100개만 받아 새 로그가 안 보임)
  track(onSnapshot(query(collection(db, "campaigns", id, "rolls"), orderBy("createdAt", "desc"), limit(100)),
    (snap) => {
      playLog = snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse();
      const log = $("#playLog");
      if (log) renderLog(log);
    },
    (err) => console.error("플레이로그 구독 오류", err)
  ));
  // 이 캠페인에 연결된 캐릭터 (공개 + 본인). list 규칙(public 또는 owner)을 만족하도록 분리 조회.
  async function loadCampaignCharacters() {
    const byId = {};
    try {
      const pub = await getDocs(query(collection(db, "characters"), where("campaignId", "==", id), where("visibility", "==", "public")));
      pub.forEach((d) => (byId[d.id] = { id: d.id, ...d.data() }));
    } catch (e) { console.warn("공개 캐릭터 로드", e); }
    if (currentUser) {
      try {
        const mine = await getDocs(query(collection(db, "characters"), where("campaignId", "==", id), where("ownerUid", "==", currentUser.uid)));
        mine.forEach((d) => (byId[d.id] = { id: d.id, ...d.data() }));
      } catch (e) { console.warn("내 캐릭터 로드", e); }
    }
    characters = Object.values(byId).sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
    if (data) render();
  }
  loadCampaignCharacters();
}

function shortTime(ts) {
  if (!ts) return "";
  const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  if (isNaN(d)) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── 캐릭터 시트 (실시간) ──────────────────────────────────────
function renderCharacter(view, id) {
  view.innerHTML = "";
  const wrap = el("div");
  view.appendChild(wrap);
  wrap.appendChild(el("div", { class: "empty", text: "캐릭터를 불러오는 중…" }));

  track(onSnapshot(doc(db, "characters", id),
    (snap) => {
      if (!snap.exists()) { wrap.innerHTML = ""; wrap.appendChild(el("div", { class: "empty", text: "존재하지 않는 캐릭터입니다." })); return; }
      const data = { id: snap.id, ...snap.data() };
      const isOwner = currentUser && currentUser.uid === data.ownerUid;
      wrap.innerHTML = "";

      const actions = el("div", { class: "schedule-actions" });
      if (isOwner) {
        actions.appendChild(el("button", { class: "btn btn-sm", onclick: () => openCharacterModal(data) }, "✏️ 편집"));
        actions.appendChild(el("button", { class: "btn btn-sm btn-danger", onclick: () => deleteCharacter(id, data.ownerUid) }, "삭제"));
      }
      actions.appendChild(el("button", { class: "btn btn-sm btn-ghost", onclick: () => copyShareLink("#/char/" + id) }, "🔗 공유"));

      wrap.appendChild(
        el("div", { class: "detail-head" }, [
          el("div", { class: "char-id" }, [
            el("span", { class: "char-emoji big", text: data.emoji || "🧙" }),
            el("div", {}, [
              el("h2", { class: "detail-title", text: data.name || "이름 없는 캐릭터" }),
              el("div", { class: "owner-line" }, [
                data.system ? el("span", { class: "tag", text: data.system }) : null,
                el("span", { html: `❤️ HP <b>${data.hp ?? "-"}</b>${data.maxHp ? " / " + data.maxHp : ""}` }),
                el("span", { class: "dot-sep", text: "플레이어 " + (data.ownerName || "익명") }),
              ]),
            ]),
          ]),
          actions,
        ])
      );

      // 능력치 그리드
      if ((data.stats || []).length) {
        const grid = el("div", { class: "stat-grid" });
        data.stats.forEach((s) => {
          grid.appendChild(el("div", { class: "stat-cell" }, [
            el("div", { class: "stat-name", text: s.k }),
            el("div", { class: "stat-value", text: s.v || "-" }),
          ]));
        });
        wrap.appendChild(el("h3", { class: "block-title", text: "능력치" }));
        wrap.appendChild(grid);
      }

      const section = (title, content) => {
        if (!content) return;
        wrap.appendChild(el("h3", { class: "block-title", text: title }));
        wrap.appendChild(el("div", { class: "prose", text: content }));
      };
      section("🎒 인벤토리", data.inventory);
      section("✨ 스킬 / 특기", data.skills);
      section("📜 배경 이야기", data.background);
      section("📝 메모", data.notes);

      if (data.campaignId) {
        wrap.appendChild(el("div", { class: "back-link" }, [
          el("a", { class: "btn btn-sm btn-ghost", href: "#/c/" + encodeURIComponent(data.campaignId) }, "← 연결된 캠페인 보기"),
        ]));
      }
    },
    (err) => {
      console.error(err);
      wrap.innerHTML = "";
      wrap.appendChild(el("div", { class: "empty", text: err.code === "permission-denied" ? "🔒 비공개 캐릭터입니다." : "불러오지 못했습니다." }));
    }
  ));
}
async function deleteCharacter(id, ownerUid) {
  if (!currentUser || currentUser.uid !== ownerUid) return;
  if (!confirm("이 캐릭터를 삭제할까요?")) return;
  try { await deleteDoc(doc(db, "characters", id)); toast("삭제했습니다."); location.hash = "#/me"; }
  catch (e) { console.error(e); toast("삭제 실패: " + (e.code || e.message), true); }
}

// ── 템플릿 갤러리 ─────────────────────────────────────────────
async function renderTemplates(view) {
  view.appendChild(
    el("section", { class: "hero compact" }, [
      el("h1", { text: "플레이 설정 템플릿" }),
      el("p", { text: "제목·직업 카테고리·스토리 라인을 템플릿으로 저장해 두면, 캠페인을 열 때 그대로 불러올 수 있습니다." }),
      isMember()
        ? el("button", { class: "btn btn-primary", onclick: () => openTemplateModal() }, "＋ 템플릿 만들기")
        : el("button", { class: "btn btn-google", onclick: doLogin }, [googleIcon(), "로그인하고 만들기"]),
    ])
  );
  // 바로 시작용 예시 템플릿
  view.appendChild(el("div", { class: "section-title" }, [el("h2", { text: "🌟 예시 템플릿" }), el("span", { class: "count", text: "바로 시작용" })]));
  const exBox = el("div", { class: "cards" });
  EXAMPLE_TEMPLATES.forEach((ex) => exBox.appendChild(exampleCard(ex)));
  view.appendChild(exBox);

  const cards = el("div", { class: "cards" }, [el("div", { class: "empty", text: "불러오는 중…" })]);
  view.appendChild(el("div", { class: "section-title" }, [el("h2", { text: "공개 템플릿" })]));
  view.appendChild(cards);

  try {
    const snap = await getDocs(query(collection(db, "templates"), where("visibility", "==", "public")));
    const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
    cards.innerHTML = "";
    if (!docs.length) cards.appendChild(el("div", { class: "empty", text: "아직 공개 템플릿이 없습니다." }));
    docs.forEach((d) => cards.appendChild(templateCard(d)));
  } catch (e) {
    console.error(e); cards.innerHTML = "";
    cards.appendChild(el("div", { class: "empty", text: "목록을 불러오지 못했습니다." }));
  }
}

function renderTemplate(view, id) {
  view.innerHTML = "";
  const wrap = el("div");
  view.appendChild(wrap);
  wrap.appendChild(el("div", { class: "empty", text: "템플릿을 불러오는 중…" }));

  getDoc(doc(db, "templates", id)).then((snap) => {
    if (!snap.exists()) { wrap.innerHTML = ""; wrap.appendChild(el("div", { class: "empty", text: "존재하지 않는 템플릿입니다." })); return; }
    const data = { id: snap.id, ...snap.data() };
    const isOwner = currentUser && currentUser.uid === data.ownerUid;
    wrap.innerHTML = "";

    const actions = el("div", { class: "schedule-actions" });
    if (isMember()) actions.appendChild(el("button", { class: "btn btn-sm btn-primary", onclick: () => openCampaignModal(null, { title: data.name, description: data.storyline || "", jobCategories: data.jobCategories || [], storyNodes: storyNodesFrom(data) }) }, "🎲 이 설정으로 캠페인 열기"));
    if (isOwner) {
      actions.appendChild(el("button", { class: "btn btn-sm", onclick: () => openTemplateModal(data) }, "✏️ 편집"));
      actions.appendChild(el("button", { class: "btn btn-sm btn-danger", onclick: () => deleteTemplate(id, data.ownerUid) }, "삭제"));
    }
    actions.appendChild(el("button", { class: "btn btn-sm btn-ghost", onclick: () => copyShareLink("#/t/" + id) }, "🔗 공유"));

    wrap.appendChild(el("div", { class: "detail-head" }, [
      el("div", { class: "grow" }, [
        el("div", { class: "card-top" }, [el("span", { class: "tag", text: "📜 템플릿" }), el("span", { class: "card-sub", text: VISIBILITY[data.visibility]?.label || "공개" })]),
        el("h2", { class: "detail-title", text: data.name || "이름 없는 템플릿" }),
        el("div", { class: "owner-line" }, [el("span", { text: "제작 " + (data.ownerName || "익명") })]),
      ]),
      actions,
    ]));
    wrap.appendChild(el("h3", { class: "block-title", text: "🧰 직업 카테고리" }));
    const jobsArr = normalizeJobs(data.jobCategories);
    if (!jobsArr.length) wrap.appendChild(el("div", { class: "card-sub", text: "등록된 직업이 없습니다." }));
    else { const jg = el("div", { class: "job-grid" }); jobsArr.forEach((j) => jg.appendChild(jobCardView(j))); wrap.appendChild(jg); }
    const storyBox = el("div");
    const reloadStory = () => renderStoryViewer(storyBox, storyNodesFrom(data));
    wrap.appendChild(el("div", { class: "story-head" }, [
      el("h3", { class: "block-title", style: "margin:0", text: "📖 스토리 맵" }),
      el("div", { class: "grow" }),
      isOwner ? el("button", { class: "btn btn-sm btn-primary", onclick: () => openStoryEditor(storyNodesFrom(data), async (nodes) => {
        try {
          await updateDoc(doc(db, "templates", id), { storyNodes: nodes, updatedAt: serverTimestamp() });
          data.storyNodes = nodes; reloadStory(); toast("스토리 맵을 저장했습니다."); return true;
        } catch (e) { console.error(e); toast("저장 실패: " + (e.code || e.message), true); return false; }
      }) }, "🧠 스토리 맵 편집") : null,
    ]));
    wrap.appendChild(storyBox);
    reloadStory();
  }).catch((e) => { console.error(e); wrap.innerHTML = ""; wrap.appendChild(el("div", { class: "empty", text: "불러오지 못했습니다." })); });
}
async function deleteTemplate(id, ownerUid) {
  if (!currentUser || currentUser.uid !== ownerUid) return;
  if (!confirm("이 템플릿을 삭제할까요?")) return;
  try { await deleteDoc(doc(db, "templates", id)); toast("삭제했습니다."); location.hash = "#/templates"; }
  catch (e) { console.error(e); toast("삭제 실패: " + (e.code || e.message), true); }
}

// 캠페인 + 하위 컬렉션(세션·신청·플레이로그) 전체 삭제 (best-effort)
async function deleteCampaignFull(id) {
  for (const sub of ["rolls", "applications", "sessions"]) {
    try {
      const snap = await getDocs(collection(db, "campaigns", id, sub));
      await Promise.all(snap.docs.map((d) => deleteDoc(d.ref).catch(() => {})));
    } catch (e) { console.warn("하위 컬렉션 삭제 실패", sub, e); }
  }
  await deleteDoc(doc(db, "campaigns", id));
}

// ── 모달: 캠페인 생성/수정 ────────────────────────────────────
function openCampaignModal(existing, prefill) {
  if (!isMember()) { toast("캠페인을 만들려면 Google 로그인이 필요합니다.", true); doLogin(); return; }
  const isEdit = !!existing;
  const titleInput = el("input", { type: "text", maxlength: "60", value: existing?.title || prefill?.title || "", placeholder: "예: 인스머스의 그림자 (CoC 시나리오)" });
  const systemInput = el("input", { type: "text", maxlength: "40", value: existing?.system || prefill?.system || "", placeholder: "예: 크툴루의 부름(CoC)", list: "systemList" });
  const datalist = el("datalist", { id: "systemList" }, SYSTEMS.map((s) => el("option", { value: s })));
  const descInput = el("textarea", { maxlength: "1000", placeholder: "시나리오 소개, 분위기, 진행 방식, 주의사항 등" });
  descInput.value = existing?.description || prefill?.description || "";
  const job = jobEditor(existing?.jobCategories || prefill?.jobCategories || []);
  const scheduleInput = el("input", { type: "text", maxlength: "60", value: existing?.schedule || "", placeholder: "예: 매주 토요일 20:00, 온라인" });
  const maxInput = el("input", { type: "number", min: "1", max: "12", value: existing?.maxPlayers || 4 });

  const statusSelect = el("select");
  Object.entries(STATUS).forEach(([k, v]) => statusSelect.appendChild(el("option", { value: k, ...((existing?.status || "recruiting") === k ? { selected: "selected" } : {}) }, v.emoji + " " + v.label)));
  const visSelect = el("select");
  Object.entries(VISIBILITY).forEach(([k, v]) => visSelect.appendChild(el("option", { value: k, ...((existing?.visibility || "public") === k ? { selected: "selected" } : {}) }, `${v.label} — ${v.desc}`)));

  openModal({
    title: isEdit ? "캠페인 설정" : "캠페인 모집하기",
    sub: isEdit ? "캠페인 정보를 수정합니다." : "새 TRPG 캠페인을 열고 플레이어를 모집하세요.",
    wide: true,
    body: [
      datalist,
      el("div", { class: "field" }, [el("label", { text: "제목" }), titleInput]),
      el("div", { class: "field" }, [el("label", { text: "시스템 / 룰" }), systemInput]),
      el("div", { class: "field" }, [el("label", { text: "소개" }), descInput]),
      el("div", { class: "field" }, [el("label", { text: "직업 카테고리 (이름·이미지·능력치 / 신청 시 선택)" }), job.wrap]),
      el("div", { class: "form-row" }, [
        el("div", { class: "field grow" }, [el("label", { text: "일정" }), scheduleInput]),
        el("div", { class: "field", style: "width:110px" }, [el("label", { text: "정원" }), maxInput]),
      ]),
      el("div", { class: "form-row" }, [
        el("div", { class: "field grow" }, [el("label", { text: "상태" }), statusSelect]),
        el("div", { class: "field grow" }, [el("label", { text: "공개 범위" }), visSelect]),
      ]),
    ],
    actions: [
      isEdit ? el("button", { class: "btn btn-danger", style: "margin-right:auto", onclick: async () => {
        if (!confirm(`'${existing.title}' 캠페인을 삭제할까요?\n세션 기록 · 신청 · 플레이 로그가 모두 지워지며 되돌릴 수 없습니다.`)) return;
        try { await deleteCampaignFull(existing.id); closeModal(); toast("캠페인을 삭제했습니다."); location.hash = "#/me"; }
        catch (e) { console.error(e); toast("삭제 실패: " + (e.code || e.message), true); }
      } }, "🗑️ 캠페인 삭제") : null,
      el("button", { class: "btn btn-ghost", onclick: closeModal }, "취소"),
      el("button", { class: "btn btn-primary", onclick: async () => {
        const title = titleInput.value.trim();
        if (!title) { toast("제목을 입력하세요.", true); return; }
        const payload = {
          title,
          system: systemInput.value.trim(),
          description: descInput.value.trim(),
          jobCategories: job.getJobs(),
          schedule: scheduleInput.value.trim(),
          maxPlayers: Math.max(1, parseInt(maxInput.value, 10) || 1),
          status: statusSelect.value,
          visibility: visSelect.value,
          updatedAt: serverTimestamp(),
        };
        try {
          if (isEdit) {
            await updateDoc(doc(db, "campaigns", existing.id), payload);
            toast("저장했습니다.");
          } else {
            const meInfo = me();
            const ref = await addDoc(collection(db, "campaigns"), {
              ...payload,
              storyNodes: prefill?.storyNodes || [],
              gmUid: meInfo.uid, gmName: meInfo.name, gmPhoto: meInfo.photo,
              memberUids: [meInfo.uid],
              members: [{ uid: meInfo.uid, name: meInfo.name, photo: meInfo.photo }],
              createdAt: serverTimestamp(),
            });
            toast("캠페인을 만들었습니다.");
            location.hash = "#/c/" + encodeURIComponent(ref.id);
          }
          closeModal();
        } catch (e) { console.error(e); toast("저장 실패: " + (e.code || e.message), true); }
      } }, isEdit ? "저장" : "모집 시작"),
    ],
  });
  setTimeout(() => titleInput.focus(), 50);
}

// ── 모달: 세션 기록 ───────────────────────────────────────────
function openSessionModal(campaignId, defaultNo, existing) {
  const noInput = el("input", { type: "number", min: "1", value: existing?.no || defaultNo });
  const titleInput = el("input", { type: "text", maxlength: "80", value: existing?.title || "", placeholder: "예: 1화 — 마을에 도착하다" });
  const dateInput = el("input", { type: "text", maxlength: "40", value: existing?.date || "", placeholder: "예: 2026-06-21" });
  const attendInput = el("input", { type: "text", maxlength: "100", value: existing?.attendees || "", placeholder: "예: 홍길동, 김철수, 이영희" });
  const summaryInput = el("textarea", { maxlength: "3000", placeholder: "이번 세션에서 있었던 일, 주요 전개, 다음 예고 등" });
  summaryInput.value = existing?.summary || "";

  openModal({
    title: existing ? "세션 기록 수정" : "세션 기록 추가",
    sub: "이번 회차에서 일어난 일을 정리해 두면 다음 세션 준비가 쉬워집니다.",
    body: [
      el("div", { class: "form-row" }, [
        el("div", { class: "field", style: "width:90px" }, [el("label", { text: "회차" }), noInput]),
        el("div", { class: "field grow" }, [el("label", { text: "제목" }), titleInput]),
      ]),
      el("div", { class: "form-row" }, [
        el("div", { class: "field grow" }, [el("label", { text: "날짜" }), dateInput]),
        el("div", { class: "field grow" }, [el("label", { text: "참석자" }), attendInput]),
      ]),
      el("div", { class: "field" }, [el("label", { text: "요약 / 일지" }), summaryInput]),
    ],
    actions: [
      el("button", { class: "btn btn-ghost", onclick: closeModal }, "취소"),
      el("button", { class: "btn btn-primary", onclick: async () => {
        const payload = {
          no: parseInt(noInput.value, 10) || defaultNo,
          title: titleInput.value.trim(),
          date: dateInput.value.trim(),
          attendees: attendInput.value.trim(),
          summary: summaryInput.value.trim(),
          updatedAt: serverTimestamp(),
        };
        try {
          if (existing) await updateDoc(doc(db, "campaigns", campaignId, "sessions", existing.id), payload);
          else await addDoc(collection(db, "campaigns", campaignId, "sessions"), { ...payload, createdAt: serverTimestamp() });
          closeModal();
          toast("저장했습니다.");
        } catch (e) { console.error(e); toast("저장 실패: " + (e.code || e.message), true); }
      } }, "저장"),
    ],
  });
  setTimeout(() => titleInput.focus(), 50);
}

// ── 모달: 캐릭터 생성/수정 ────────────────────────────────────
function openCharacterModal(opts = {}) {
  if (!isMember()) { toast("캐릭터를 만들려면 Google 로그인이 필요합니다.", true); doLogin(); return; }
  const existing = opts.id ? opts : null;

  // 능력치 행: 기존 → 기본 프리셋 순으로 시드
  let statRows;
  if (existing?.stats?.length) statRows = existing.stats.map((s) => ({ k: s.k, v: s.v }));
  else statRows = DEFAULT_STATS.map((k) => ({ k, v: "" }));

  const emojiPick = el("div", { class: "emoji-picker" });
  let selEmoji = existing?.emoji || CHAR_EMOJIS[0];
  CHAR_EMOJIS.forEach((m) => {
    const b = el("button", { type: "button", class: "emoji-opt" + (m === selEmoji ? " selected" : ""), text: m });
    b.addEventListener("click", () => { selEmoji = m; emojiPick.querySelectorAll(".emoji-opt").forEach((x) => x.classList.remove("selected")); b.classList.add("selected"); });
    emojiPick.appendChild(b);
  });

  const nameInput = el("input", { type: "text", maxlength: "40", value: existing?.name || "", placeholder: "캐릭터 이름" });
  const systemInput = el("input", { type: "text", maxlength: "40", value: existing?.system || opts.system || "", placeholder: "예: 크툴루의 부름(CoC)", list: "systemList2" });
  const datalist = el("datalist", { id: "systemList2" }, SYSTEMS.map((s) => el("option", { value: s })));
  const hpInput = el("input", { type: "number", value: existing?.hp ?? "", placeholder: "현재" });
  const maxHpInput = el("input", { type: "number", value: existing?.maxHp ?? "", placeholder: "최대" });

  // 능력치 편집기
  const statBox = el("div", { class: "stat-editor" });
  function renderStatRows() {
    statBox.innerHTML = "";
    statRows.forEach((row, i) => {
      const kIn = el("input", { type: "text", maxlength: "20", value: row.k, placeholder: "능력치", class: "stat-k" });
      const vIn = el("input", { type: "text", maxlength: "20", value: row.v, placeholder: "값", class: "stat-v" });
      kIn.addEventListener("input", () => (statRows[i].k = kIn.value));
      vIn.addEventListener("input", () => (statRows[i].v = vIn.value));
      statBox.appendChild(el("div", { class: "stat-row" }, [
        kIn, vIn,
        el("button", { type: "button", class: "btn btn-sm btn-danger", onclick: () => { statRows.splice(i, 1); renderStatRows(); } }, "✕"),
      ]));
    });
  }
  renderStatRows();

  const invInput = el("textarea", { maxlength: "1500", placeholder: "소지품, 장비, 소지금 등" });
  invInput.value = existing?.inventory || "";
  const skillInput = el("textarea", { maxlength: "1500", placeholder: "스킬, 특기, 주문 등" });
  skillInput.value = existing?.skills || "";
  const bgInput = el("textarea", { maxlength: "2000", placeholder: "배경 이야기, 성격, 동기" });
  bgInput.value = existing?.background || "";
  const notesInput = el("textarea", { maxlength: "1500", placeholder: "기타 메모" });
  notesInput.value = existing?.notes || "";

  // 캠페인에 연결해 만드는 캐릭터는 파티원이 볼 수 있게 기본 공개
  const defaultVis = existing?.visibility || (opts.campaignId ? "public" : "unlisted");
  const visSelect = el("select");
  Object.entries(VISIBILITY).forEach(([k, v]) => visSelect.appendChild(el("option", { value: k, ...(defaultVis === k ? { selected: "selected" } : {}) }, `${v.label} — ${v.desc}`)));

  openModal({
    title: existing ? "캐릭터 시트 편집" : "캐릭터 만들기",
    sub: "능력치·인벤토리·스킬을 자유롭게 구성하세요.",
    wide: true,
    body: [
      datalist,
      el("div", { class: "field" }, [el("label", { text: "아이콘" }), emojiPick]),
      el("div", { class: "form-row" }, [
        el("div", { class: "field grow" }, [el("label", { text: "이름" }), nameInput]),
        el("div", { class: "field grow" }, [el("label", { text: "시스템" }), systemInput]),
      ]),
      el("div", { class: "form-row" }, [
        el("div", { class: "field", style: "width:120px" }, [el("label", { text: "HP" }), hpInput]),
        el("div", { class: "field", style: "width:120px" }, [el("label", { text: "최대 HP" }), maxHpInput]),
      ]),
      el("div", { class: "field" }, [
        el("label", { text: "능력치" }), statBox,
        el("button", { type: "button", class: "btn btn-sm", style: "align-self:flex-start", onclick: () => { statRows.push({ k: "", v: "" }); renderStatRows(); } }, "＋ 능력치 추가"),
      ]),
      el("div", { class: "field" }, [el("label", { text: "🎒 인벤토리" }), invInput]),
      el("div", { class: "field" }, [el("label", { text: "✨ 스킬 / 특기" }), skillInput]),
      el("div", { class: "field" }, [el("label", { text: "📜 배경" }), bgInput]),
      el("div", { class: "field" }, [el("label", { text: "📝 메모" }), notesInput]),
      el("div", { class: "field" }, [el("label", { text: "공개 범위" }), visSelect]),
    ],
    actions: [
      el("button", { class: "btn btn-ghost", onclick: closeModal }, "취소"),
      el("button", { class: "btn btn-primary", onclick: async () => {
        const name = nameInput.value.trim();
        if (!name) { toast("캐릭터 이름을 입력하세요.", true); return; }
        const meInfo = me();
        const payload = {
          name, emoji: selEmoji,
          system: systemInput.value.trim(),
          hp: hpInput.value === "" ? null : parseInt(hpInput.value, 10),
          maxHp: maxHpInput.value === "" ? null : parseInt(maxHpInput.value, 10),
          stats: statRows.filter((r) => r.k.trim()).map((r) => ({ k: r.k.trim(), v: r.v.trim() })),
          inventory: invInput.value.trim(),
          skills: skillInput.value.trim(),
          background: bgInput.value.trim(),
          notes: notesInput.value.trim(),
          visibility: visSelect.value,
          templateId: existing?.templateId || opts.templateId || null,
          campaignId: existing?.campaignId || opts.campaignId || null,
          updatedAt: serverTimestamp(),
        };
        try {
          if (existing) {
            await updateDoc(doc(db, "characters", existing.id), payload);
            toast("저장했습니다.");
          } else {
            const ref = await addDoc(collection(db, "characters"), {
              ...payload,
              ownerUid: meInfo.uid, ownerName: meInfo.name, ownerPhoto: meInfo.photo,
              createdAt: serverTimestamp(),
            });
            toast("캐릭터를 만들었습니다.");
            // 캠페인 화면에서 만든 경우 목록만 갱신, 그 외에는 시트로 이동
            if (!opts.onSaved) location.hash = "#/char/" + encodeURIComponent(ref.id);
          }
          closeModal();
          opts.onSaved?.();
        } catch (e) { console.error(e); toast("저장 실패: " + (e.code || e.message), true); }
      } }, existing ? "저장" : "만들기"),
    ],
  });
  setTimeout(() => nameInput.focus(), 50);
}

// ── 모달: 템플릿 생성/수정 ────────────────────────────────────
// existing: 편집 대상(있으면 수정) · prefill: 예시 등으로 새로 만들 때 초기값
function openTemplateModal(existing, prefill) {
  if (!isMember()) { toast("템플릿을 만들려면 Google 로그인이 필요합니다.", true); doLogin(); return; }
  const src = existing || prefill || {};
  const nameInput = el("input", { type: "text", maxlength: "50", value: src.name || "", placeholder: "예: 인스머스의 그림자" });
  const job = jobEditor(src.jobCategories || []);
  const storyInput = el("textarea", { maxlength: "2000", placeholder: "전체 줄거리 요약. (만든 뒤 상세 페이지에서 '스토리 맵'으로 카드·연결을 추가할 수 있어요)" });
  storyInput.value = src.storyline || "";
  const visSelect = el("select");
  Object.entries(VISIBILITY).forEach(([k, v]) => visSelect.appendChild(el("option", { value: k, ...((src.visibility || "public") === k ? { selected: "selected" } : {}) }, `${v.label} — ${v.desc}`)));

  openModal({
    title: existing ? "템플릿 편집" : "템플릿 만들기",
    sub: "플레이 설정을 제목·직업 카테고리·스토리 라인으로 간단히 정리하세요.",
    wide: true,
    body: [
      el("div", { class: "field" }, [el("label", { text: "템플릿 제목" }), nameInput]),
      el("div", { class: "field" }, [el("label", { text: "직업 카테고리 (이름·이미지·능력치)" }), job.wrap]),
      el("div", { class: "field" }, [el("label", { text: "스토리 요약" }), storyInput]),
      el("div", { class: "field" }, [el("label", { text: "공개 범위" }), visSelect]),
    ],
    actions: [
      el("button", { class: "btn btn-ghost", onclick: closeModal }, "취소"),
      el("button", { class: "btn btn-primary", onclick: async () => {
        const name = nameInput.value.trim();
        if (!name) { toast("템플릿 제목을 입력하세요.", true); return; }
        const jobCategories = job.getJobs();
        const meInfo = me();
        const payload = {
          name,
          jobCategories,
          storyline: storyInput.value.trim(),
          visibility: visSelect.value,
          updatedAt: serverTimestamp(),
        };
        try {
          if (existing) {
            await updateDoc(doc(db, "templates", existing.id), payload);
            toast("저장했습니다.");
          } else {
            const ref = await addDoc(collection(db, "templates"), {
              ...payload,
              storyNodes: prefill?.storyNodes || [],
              ownerUid: meInfo.uid, ownerName: meInfo.name, ownerPhoto: meInfo.photo,
              createdAt: serverTimestamp(),
            });
            toast("템플릿을 만들었습니다.");
            location.hash = "#/t/" + encodeURIComponent(ref.id);
          }
          closeModal();
        } catch (e) { console.error(e); toast("저장 실패: " + (e.code || e.message), true); }
      } }, existing ? "저장" : "만들기"),
    ],
  });
  setTimeout(() => nameInput.focus(), 50);
}

// ── 공유 ───────────────────────────────────────────────────────
async function copyShareLink(hash) {
  const url = location.origin + location.pathname + hash;
  try { await navigator.clipboard.writeText(url); toast("공유 링크를 복사했습니다."); }
  catch { prompt("아래 링크를 복사하세요:", url); }
}

// ── 스토리 맵 (상세 카드 + 마인드맵) ──────────────────────────
const SVGNS = "http://www.w3.org/2000/svg";
function newNodeId() { return "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

// 저장 데이터 → 노드 배열 (구버전 storyline 문자열도 단일 노드로 변환)
function storyNodesFrom(data) {
  const ns = Array.isArray(data?.storyNodes) ? data.storyNodes : null;
  if (ns && ns.length) {
    return ns.map((n, i) => ({
      id: n.id || ("n" + i),
      title: n.title || "",
      body: n.body || "",
      x: typeof n.x === "number" ? n.x : 40 + (i % 4) * 240,
      y: typeof n.y === "number" ? n.y : 40 + Math.floor(i / 4) * 200,
      links: Array.isArray(n.links) ? n.links.filter(Boolean) : [],
    }));
  }
  if (data && data.storyline) return [{ id: "n0", title: "스토리", body: data.storyline, x: 40, y: 40, links: [] }];
  return [];
}

function drawStoryLines(svg, nodes, elsById) {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const seen = new Set();
  nodes.forEach((n) => (n.links || []).forEach((tid) => {
    const a = elsById[n.id], b = elsById[tid];
    if (!a || !b) return;
    const key = [n.id, tid].sort().join("|");
    if (seen.has(key)) return; seen.add(key);
    const line = document.createElementNS(SVGNS, "line");
    line.setAttribute("class", "story-line");
    line.setAttribute("x1", a.offsetLeft + a.offsetWidth / 2);
    line.setAttribute("y1", a.offsetTop + a.offsetHeight / 2);
    line.setAttribute("x2", b.offsetLeft + b.offsetWidth / 2);
    line.setAttribute("y2", b.offsetTop + b.offsetHeight / 2);
    svg.appendChild(line);
  }));
}

// 읽기 전용 스토리 맵 뷰어
function renderStoryViewer(container, nodes) {
  container.innerHTML = "";
  if (!nodes.length) { container.appendChild(el("div", { class: "card-sub", text: "작성된 스토리가 없습니다." })); return; }
  const inner = el("div", { class: "story-canvas-inner" });
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("class", "story-svg");
  inner.appendChild(svg);
  const elsById = {};
  let maxX = 0, maxY = 0;
  nodes.forEach((n) => {
    const node = el("div", { class: "story-node", style: `left:${n.x}px;top:${n.y}px`,
      onclick: () => openModal({ title: n.title || "스토리", body: [el("div", { class: "prose", text: n.body || "(상세 내용 없음)" })], actions: [el("button", { class: "btn btn-primary", onclick: closeModal }, "닫기")] }) }, [
      el("div", { class: "story-node-title", text: n.title || "제목 없음" }),
      n.body ? el("div", { class: "story-node-body", text: n.body }) : null,
    ]);
    elsById[n.id] = node; inner.appendChild(node);
    maxX = Math.max(maxX, n.x + 220); maxY = Math.max(maxY, n.y + 160);
  });
  inner.style.width = Math.max(maxX, 600) + "px";
  inner.style.height = Math.max(maxY, 340) + "px";
  container.appendChild(el("div", { class: "story-viewbox" }, [inner]));
  requestAnimationFrame(() => drawStoryLines(svg, nodes, elsById));
}

// 스토리 맵 편집기 (전체 화면 오버레이) — onSave(nodes) 가 false 를 반환하면 닫지 않음
function openStoryEditor(initial, onSave) {
  const nodes = storyNodesFrom({ storyNodes: initial }).map((n) => ({ ...n, links: [...(n.links || [])] }));
  let connectFrom = null;

  const inner = el("div", { class: "story-canvas-inner", style: "width:2000px;height:1400px" });
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("class", "story-svg");
  inner.appendChild(svg);
  const canvas = el("div", { class: "story-canvas" }, [inner]);
  const elsById = {};
  const hint = el("div", { class: "story-hint" });

  function setHint() {
    hint.textContent = connectFrom
      ? "🔗 연결할 다른 노드를 클릭하세요. (이미 연결돼 있으면 해제 · '연결'을 다시 누르면 취소)"
      : "노드 제목 부분을 끌어 배치하고, '🔗 연결'로 노드를 잇고, '✏️'로 상세 내용을 작성하세요.";
  }
  function repaint() {
    inner.querySelectorAll(".story-node").forEach((e) => e.remove());
    Object.keys(elsById).forEach((k) => delete elsById[k]);
    nodes.forEach((n) => inner.appendChild(makeNode(n)));
    setHint();
    requestAnimationFrame(() => drawStoryLines(svg, nodes, elsById));
  }
  function makeNode(n) {
    const node = el("div", { class: "story-node editable" + (connectFrom === n.id ? " connect-source" : ""), style: `left:${n.x}px;top:${n.y}px` }, [
      el("div", { class: "story-node-head" }, [el("div", { class: "story-node-title", text: n.title || "제목 없음" })]),
      el("div", { class: "story-node-body" + (n.body ? "" : " empty"), text: n.body || "(상세 내용 없음)" }),
      el("div", { class: "story-node-actions" }, [
        el("button", { class: "btn btn-sm", onclick: (e) => { e.stopPropagation(); editNode(n); } }, "✏️"),
        el("button", { class: "btn btn-sm", onclick: (e) => { e.stopPropagation(); connectFrom = (connectFrom === n.id ? null : n.id); repaint(); } }, "🔗 연결"),
        el("button", { class: "btn btn-sm btn-danger", onclick: (e) => { e.stopPropagation(); delNode(n); } }, "✕"),
      ]),
    ]);
    elsById[n.id] = node;
    node.addEventListener("click", () => {
      if (connectFrom && connectFrom !== n.id) { toggleLink(connectFrom, n.id); connectFrom = null; repaint(); }
    });
    node.querySelector(".story-node-head").addEventListener("pointerdown", (e) => startDrag(e, n, node));
    return node;
  }
  function startDrag(e, n, node) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const gx = (e.clientX - rect.left + canvas.scrollLeft) - node.offsetLeft;
    const gy = (e.clientY - rect.top + canvas.scrollTop) - node.offsetTop;
    function move(ev) {
      n.x = Math.max(0, Math.round(ev.clientX - rect.left + canvas.scrollLeft - gx));
      n.y = Math.max(0, Math.round(ev.clientY - rect.top + canvas.scrollTop - gy));
      node.style.left = n.x + "px"; node.style.top = n.y + "px";
      drawStoryLines(svg, nodes, elsById);
    }
    function up() { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); }
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  }
  function toggleLink(a, b) {
    const na = nodes.find((x) => x.id === a); if (!na) return;
    na.links = na.links || [];
    const i = na.links.indexOf(b);
    if (i >= 0) na.links.splice(i, 1); else na.links.push(b);
    const nb = nodes.find((x) => x.id === b);
    if (nb && nb.links) { const j = nb.links.indexOf(a); if (j >= 0) nb.links.splice(j, 1); }
  }
  function delNode(n) {
    const idx = nodes.indexOf(n); if (idx >= 0) nodes.splice(idx, 1);
    nodes.forEach((x) => (x.links = (x.links || []).filter((l) => l !== n.id)));
    if (connectFrom === n.id) connectFrom = null;
    repaint();
  }
  function editNode(n) {
    const titleIn = el("input", { type: "text", maxlength: "60", value: n.title || "", placeholder: "노드 제목 (예: 1막 — 의뢰)" });
    const bodyIn = el("textarea", { maxlength: "2000", placeholder: "이 장면/단서의 상세 내용을 작성하세요." });
    bodyIn.value = n.body || "";
    openModal({
      title: "스토리 노드 편집", wide: true,
      body: [
        el("div", { class: "field" }, [el("label", { text: "제목" }), titleIn]),
        el("div", { class: "field" }, [el("label", { text: "상세 내용" }), bodyIn]),
      ],
      actions: [
        el("button", { class: "btn btn-ghost", onclick: closeModal }, "취소"),
        el("button", { class: "btn btn-primary", onclick: () => { n.title = titleIn.value.trim(); n.body = bodyIn.value.trim(); closeModal(); repaint(); } }, "확인"),
      ],
    });
    setTimeout(() => titleIn.focus(), 50);
  }
  function addNode() {
    const n = { id: newNodeId(), title: "새 장면", body: "", x: canvas.scrollLeft + 40, y: canvas.scrollTop + 40, links: [] };
    nodes.push(n); repaint(); editNode(n);
  }

  const overlay = el("div", { class: "story-overlay" }, [
    el("div", { class: "story-overlay-head" }, [
      el("h3", { text: "🧠 스토리 맵 편집" }),
      el("button", { class: "btn btn-sm", onclick: addNode }, "＋ 노드 추가"),
      el("button", { class: "btn btn-sm btn-primary", onclick: async () => {
        const out = nodes.map((n) => ({ id: n.id, title: (n.title || "").trim(), body: (n.body || "").trim(), x: n.x, y: n.y, links: (n.links || []).filter((l) => nodes.some((m) => m.id === l)) }));
        const ok = await onSave(out);
        if (ok !== false) close();
      } }, "저장"),
      el("button", { class: "btn btn-sm btn-ghost", onclick: () => close() }, "닫기"),
    ]),
    hint,
    canvas,
  ]);
  function close() { document.removeEventListener("keydown", esc); overlay.remove(); }
  function esc(e) { if (e.key === "Escape" && !$("#modalBackdrop")) close(); }
  document.addEventListener("keydown", esc);
  document.body.appendChild(overlay);
  repaint();
}

// ── 모달 시스템 ────────────────────────────────────────────────
function openModal({ title, sub, body, actions, onClose, wide }) {
  closeModal();
  const backdrop = el("div", { class: "modal-backdrop", id: "modalBackdrop" });
  const modal = el("div", { class: "modal" + (wide ? " wide" : "") }, [
    el("div", { class: "modal-head" }, [el("h3", { text: title }), sub ? el("div", { class: "sub", text: sub }) : null]),
    el("div", { class: "modal-body" }, body.filter(Boolean)),
    el("div", { class: "modal-foot" }, (actions || []).filter(Boolean)),
  ]);
  backdrop.appendChild(modal);
  backdrop._onClose = onClose;
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeModal(); });
  document.addEventListener("keydown", escClose);
  $("#modalRoot").appendChild(backdrop);
}
function escClose(e) { if (e.key === "Escape") closeModal(); }
function closeModal() {
  const b = $("#modalBackdrop");
  if (b) { if (typeof b._onClose === "function") b._onClose(); b.remove(); }
  document.removeEventListener("keydown", escClose);
}

// ── 설정 미완료 시 안내 ────────────────────────────────────────
function renderConfigHelp() {
  const view = $("#view");
  view.innerHTML = "";
  view.appendChild(
    el("section", { class: "hero" }, [
      el("h1", { text: "거의 다 됐어요! 🎲" }),
      el("p", {
        html:
          "이 앱을 실행하려면 본인의 <b>Firebase 프로젝트</b>에 연결해야 합니다.<br>" +
          "<code>firebase-config.js</code> 파일에 Firebase 설정값을 입력하고, " +
          "Google 로그인과 Firestore를 활성화하세요. 자세한 방법은 <code>README.md</code>를 참고하세요.",
      }),
      el("a", { class: "btn btn-primary", href: "https://console.firebase.google.com", target: "_blank", rel: "noopener" }, "Firebase 콘솔 열기"),
    ])
  );
}

// ── 아이콘 / 폴백 ──────────────────────────────────────────────
function googleIcon() {
  const span = el("span");
  span.innerHTML =
    '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
  return span.firstChild;
}
function fallbackAvatar(name = "?") {
  const ch = encodeURIComponent((name || "?").trim().charAt(0).toUpperCase() || "?");
  return `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='64' height='64' fill='%2300abfc'/><text x='50%25' y='54%25' font-size='30' fill='%23000000' text-anchor='middle' dominant-baseline='middle' font-family='sans-serif'>${ch}</text></svg>`;
}

// ── 테마(나이트/일반 모드) ─────────────────────────────────────
const THEME_LS = "dicelog_theme";
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const btn = document.getElementById("themeToggle");
  if (btn) {
    btn.textContent = theme === "light" ? "☀️" : "🌙";
    const label = theme === "light" ? "나이트 모드로 전환" : "일반 모드로 전환";
    btn.title = label;
    btn.setAttribute("aria-label", label);
  }
}
function initTheme() {
  const saved = localStorage.getItem(THEME_LS) === "light" ? "light" : "dark";
  applyTheme(saved);
  const btn = document.getElementById("themeToggle");
  if (btn) btn.addEventListener("click", () => {
    const next = (localStorage.getItem(THEME_LS) === "light") ? "dark" : "light";
    localStorage.setItem(THEME_LS, next);
    applyTheme(next);
  });
}

// ── 시작 ───────────────────────────────────────────────────────
initTheme();
boot();
