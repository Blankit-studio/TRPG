// ─────────────────────────────────────────────────────────────
// 다이스로그 — TRPG 모집 · 세션 기록 · 캐릭터 시트 · 실시간 주사위
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

// ── 전역 상태 ──────────────────────────────────────────────────
let app, auth, db;
let currentUser = null;
let userProfile = null;
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

function toast(msg, isError = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast" + (isError ? " error" : "");
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), 2800);
}

function fmtDate(ts) {
  if (!ts) return "";
  const d = ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
  if (isNaN(d)) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const isMember = () => currentUser && !currentUser.isAnonymous;

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
    else userProfile = null;
    renderAuthArea();
    route();
  });

  window.addEventListener("hashchange", route);
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
    userProfile = { uid: user.uid, ...(snap.exists() ? snap.data() : {}), ...patch };
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
function renderCampaign(view, id) {
  view.innerHTML = "";
  const wrap = el("div");
  view.appendChild(wrap);
  const statusBox = el("div", {}, [el("div", { class: "empty", text: "캠페인을 불러오는 중…" })]);
  wrap.appendChild(statusBox);

  let data = null;
  let sessions = [], applications = [], characters = [];
  const state = { tab: "info" };

  const isGM = () => currentUser && data && currentUser.uid === data.gmUid;
  const amMember = () => currentUser && data && (data.memberUids || []).includes(currentUser.uid);

  function render() {
    if (!data) return;
    const st = STATUS[data.status] || STATUS.recruiting;
    wrap.innerHTML = "";

    // 헤더
    const actions = el("div", { class: "schedule-actions" });
    if (isGM()) {
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
      tabs.appendChild(el("button", { class: "tab" + (state.tab === key ? " active" : ""), onclick: () => { state.tab = key; render(); } }, label));
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

    // 멤버 목록
    panel.appendChild(el("h3", { class: "block-title", text: "참여 멤버" }));
    const memberBox = el("div", { class: "member-list" });
    (data.members || []).forEach((m) => {
      memberBox.appendChild(
        el("div", { class: "member-chip" }, [
          el("img", { class: "avatar avatar-sm", src: m.photo || fallbackAvatar(m.name), alt: "" }),
          el("span", { text: m.name || "익명" }),
          m.uid === data.gmUid ? el("span", { class: "mini-badge", text: "GM" }) : null,
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
    const canPlay = isGM() || amMember();
    panel.appendChild(
      el("div", { class: "mode-hint" }, canPlay
        ? "🎲 주사위 표기(예: 2d6+3, d20)를 입력하거나 빠른 버튼을 눌러 굴리세요. 결과는 모든 참여자에게 실시간으로 공유됩니다."
        : "🔒 이 테이블의 멤버만 주사위를 굴리고 채팅할 수 있습니다. 관전만 가능합니다.")
    );

    const log = el("div", { class: "play-log", id: "playLog" });
    panel.appendChild(log);
    renderLog(log);

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
      panel.appendChild(el("button", { class: "btn btn-sm btn-primary", style: "margin-bottom:14px", onclick: () => openCharacterModal({ campaignId: id, system: data.system, templateId: data.templateId }) }, "＋ 이 캠페인에 캐릭터 추가"));
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
            el("div", { class: "row-gap" }, [el("span", { class: "who", text: a.byName || "익명" }), el("span", { class: "badge " + ap.cls, text: ap.label })]),
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
    const charInput = el("input", { type: "text", maxlength: "40", placeholder: "참여할 캐릭터 이름 (선택)" });
    const msgInput = el("textarea", { maxlength: "300", placeholder: "GM에게 한마디 (플레이 경험, 가능 시간 등)" });
    openModal({
      title: "참여 신청",
      sub: `"${data.title}" 캠페인에 참여를 신청합니다.`,
      body: [
        !isMember() ? el("div", { class: "mode-hint", style: "margin:0", text: "로그인 없이 게스트로도 신청할 수 있어요. (이름은 Google 계정 또는 게스트로 표시)" }) : null,
        el("div", { class: "field" }, [el("label", { text: "캐릭터 이름" }), charInput]),
        el("div", { class: "field" }, [el("label", { text: "신청 메시지" }), msgInput]),
      ],
      actions: [
        el("button", { class: "btn btn-ghost", onclick: closeModal }, "취소"),
        el("button", { class: "btn btn-primary", onclick: async () => {
          const user = await ensureUser();
          if (!user) return;
          try {
            await setDoc(doc(db, "campaigns", id, "applications", user.uid), {
              byUid: user.uid,
              byName: user.displayName || "게스트",
              byPhoto: user.photoURL || "",
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
  }
  async function cancelApplication() {
    try { await deleteDoc(doc(db, "campaigns", id, "applications", currentUser.uid)); toast("신청을 취소했습니다."); }
    catch (e) { console.error(e); toast("취소 실패: " + (e.code || e.message), true); }
  }
  async function acceptApplication(a) {
    try {
      await updateDoc(doc(db, "campaigns", id), {
        memberUids: arrayUnion(a.byUid),
        members: arrayUnion({ uid: a.byUid, name: a.byName || "익명", photo: a.byPhoto || "" }),
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
        byUid: user.uid, byName: user.displayName || "게스트", byPhoto: user.photoURL || "",
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
        byUid: user.uid, byName: user.displayName || "게스트", byPhoto: user.photoURL || "",
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
  track(onSnapshot(query(collection(db, "campaigns", id, "rolls"), orderBy("createdAt", "asc"), limit(100)),
    (snap) => {
      playLog = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
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
    if (isMember()) actions.appendChild(el("button", { class: "btn btn-sm btn-primary", onclick: () => openCampaignModal(null, { title: data.name, description: campaignTextFromTemplate(data) }) }, "🎲 이 설정으로 캠페인 열기"));
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
    const chips = el("div", { class: "member-list" });
    (data.jobCategories || []).forEach((f) => chips.appendChild(el("span", { class: "stat-chip", text: f })));
    if (!(data.jobCategories || []).length) chips.appendChild(el("div", { class: "card-sub", text: "등록된 직업 카테고리 없음" }));
    wrap.appendChild(chips);
    wrap.appendChild(el("h3", { class: "block-title", text: "📖 스토리 라인" }));
    wrap.appendChild(el("div", { class: "prose", text: data.storyline || "작성된 스토리 라인이 없습니다." }));
  }).catch((e) => { console.error(e); wrap.innerHTML = ""; wrap.appendChild(el("div", { class: "empty", text: "불러오지 못했습니다." })); });
}
async function deleteTemplate(id, ownerUid) {
  if (!currentUser || currentUser.uid !== ownerUid) return;
  if (!confirm("이 템플릿을 삭제할까요?")) return;
  try { await deleteDoc(doc(db, "templates", id)); toast("삭제했습니다."); location.hash = "#/templates"; }
  catch (e) { console.error(e); toast("삭제 실패: " + (e.code || e.message), true); }
}

// 템플릿(직업 카테고리 + 스토리 라인)을 캠페인 소개 텍스트로 변환
function campaignTextFromTemplate(tpl) {
  const parts = [];
  if (tpl.storyline) parts.push(tpl.storyline);
  if ((tpl.jobCategories || []).length) parts.push("🧰 직업 카테고리: " + tpl.jobCategories.join(", "));
  return parts.join("\n\n");
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
  const scheduleInput = el("input", { type: "text", maxlength: "60", value: existing?.schedule || "", placeholder: "예: 매주 토요일 20:00, 온라인" });
  const maxInput = el("input", { type: "number", min: "1", max: "12", value: existing?.maxPlayers || 4 });

  const statusSelect = el("select");
  Object.entries(STATUS).forEach(([k, v]) => statusSelect.appendChild(el("option", { value: k, ...((existing?.status || "recruiting") === k ? { selected: "selected" } : {}) }, v.emoji + " " + v.label)));
  const visSelect = el("select");
  Object.entries(VISIBILITY).forEach(([k, v]) => visSelect.appendChild(el("option", { value: k, ...((existing?.visibility || "public") === k ? { selected: "selected" } : {}) }, `${v.label} — ${v.desc}`)));

  openModal({
    title: isEdit ? "캠페인 설정" : "캠페인 모집하기",
    sub: isEdit ? "캠페인 정보를 수정합니다." : "새 TRPG 캠페인을 열고 플레이어를 모집하세요.",
    body: [
      datalist,
      el("div", { class: "field" }, [el("label", { text: "제목" }), titleInput]),
      el("div", { class: "field" }, [el("label", { text: "시스템 / 룰" }), systemInput]),
      el("div", { class: "field" }, [el("label", { text: "소개" }), descInput]),
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
      el("button", { class: "btn btn-ghost", onclick: closeModal }, "취소"),
      el("button", { class: "btn btn-primary", onclick: async () => {
        const title = titleInput.value.trim();
        if (!title) { toast("제목을 입력하세요.", true); return; }
        const payload = {
          title,
          system: systemInput.value.trim(),
          description: descInput.value.trim(),
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

  const visSelect = el("select");
  Object.entries(VISIBILITY).forEach(([k, v]) => visSelect.appendChild(el("option", { value: k, ...((existing?.visibility || "unlisted") === k ? { selected: "selected" } : {}) }, `${v.label} — ${v.desc}`)));

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
            location.hash = "#/char/" + encodeURIComponent(ref.id);
          }
          closeModal();
        } catch (e) { console.error(e); toast("저장 실패: " + (e.code || e.message), true); }
      } }, existing ? "저장" : "만들기"),
    ],
  });
  setTimeout(() => nameInput.focus(), 50);
}

// ── 모달: 템플릿 생성/수정 ────────────────────────────────────
function openTemplateModal(existing) {
  if (!isMember()) { toast("템플릿을 만들려면 Google 로그인이 필요합니다.", true); doLogin(); return; }
  const nameInput = el("input", { type: "text", maxlength: "50", value: existing?.name || "", placeholder: "예: 인스머스의 그림자" });
  const jobInput = el("textarea", { maxlength: "300", placeholder: "쉼표 또는 줄바꿈으로 구분. 예: 탐정, 기자, 의사, 어부" });
  jobInput.value = (existing?.jobCategories || []).join(", ");
  const storyInput = el("textarea", { maxlength: "2000", placeholder: "이 플레이의 배경과 줄거리를 적어주세요." });
  storyInput.value = existing?.storyline || "";
  const visSelect = el("select");
  Object.entries(VISIBILITY).forEach(([k, v]) => visSelect.appendChild(el("option", { value: k, ...((existing?.visibility || "public") === k ? { selected: "selected" } : {}) }, `${v.label} — ${v.desc}`)));

  openModal({
    title: existing ? "템플릿 편집" : "템플릿 만들기",
    sub: "플레이 설정을 제목·직업 카테고리·스토리 라인으로 간단히 정리하세요.",
    body: [
      el("div", { class: "field" }, [el("label", { text: "템플릿 제목" }), nameInput]),
      el("div", { class: "field" }, [el("label", { text: "직업 카테고리" }), jobInput]),
      el("div", { class: "field" }, [el("label", { text: "스토리 라인" }), storyInput]),
      el("div", { class: "field" }, [el("label", { text: "공개 범위" }), visSelect]),
    ],
    actions: [
      el("button", { class: "btn btn-ghost", onclick: closeModal }, "취소"),
      el("button", { class: "btn btn-primary", onclick: async () => {
        const name = nameInput.value.trim();
        if (!name) { toast("템플릿 제목을 입력하세요.", true); return; }
        const jobCategories = jobInput.value.split(/[,\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 40);
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

// ── 시작 ───────────────────────────────────────────────────────
boot();
