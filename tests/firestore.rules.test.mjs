// Firestore 보안 규칙 테스트 — 에뮬레이터에서 실행: npm run test:rules
// 거부되어야 할 요청(보안)과 앱이 실제로 하는 요청(회귀)을 함께 검사한다.
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { readFileSync } from "node:fs";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, addDoc, collection, getDocs,
  query, where, orderBy, limit, deleteField, serverTimestamp,
} from "firebase/firestore";

const env = await initializeTestEnvironment({
  projectId: "demo-trpg",
  firestore: { rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8089 },
});

await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore();
  for (const [cid, vis] of [["pub", "public"], ["priv", "private"]]) {
    await setDoc(doc(db, "campaigns", cid), { title: cid, visibility: vis, gmUid: "gm", memberUids: ["gm", "mem"], members: [] });
    await setDoc(doc(db, "campaigns", cid, "sessions", "s1"), { no: 1, title: "1화" });
    await setDoc(doc(db, "campaigns", cid, "rolls", "r1"), { type: "chat", text: "hi", byUid: "mem", createdAt: 1 });
  }
  await setDoc(doc(db, "campaigns/pub/applications/applicant"), { byUid: "applicant", status: "pending", message: "m" });
  await setDoc(doc(db, "users/alice"), { name: "Alice", email: "alice@example.com" });
  await setDoc(doc(db, "templates/t1"), { name: "t", visibility: "public", ownerUid: "x" });
});

const as = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();
const anon = (uid) => env.authenticatedContext(uid, { firebase: { sign_in_provider: "anonymous" } }).firestore();

let pass = 0, fail = 0;
async function t(name, expect, fn) {
  try { await (expect === "allow" ? assertSucceeds(fn()) : assertFails(fn())); pass++; console.log("  ✓", name); }
  catch (e) { fail++; console.log("  ✗", name, "→", e.message.split("\n")[0]); }
}

console.log("[users — 이메일 유출 차단]");
await t("타인이 users 목록 조회 불가", "deny", () => getDocs(collection(as("bob"), "users")));
await t("비로그인 users 목록 조회 불가", "deny", () => getDocs(collection(as(null), "users")));
await t("타인 프로필 단건 조회 불가", "deny", () => getDoc(doc(as("bob"), "users/alice")));
await t("본인 프로필 조회 (앱 upsertProfile)", "allow", () => getDoc(doc(as("alice"), "users/alice")));
await t("본인 프로필 병합 저장 + email 삭제", "allow", () => setDoc(doc(as("alice"), "users/alice"), { name: "A", email: deleteField(), updatedAt: serverTimestamp() }, { merge: true }));

console.log("[applications — 신청 메시지 보호 / 상태 위조 차단]");
await t("제3자가 신청 목록 조회 불가", "deny", () => getDocs(collection(as("stranger"), "campaigns/pub/applications")));
await t("비로그인 신청 목록 조회 불가", "deny", () => getDocs(collection(as(null), "campaigns/pub/applications")));
await t("GM 은 신청 목록 조회 (신청 탭)", "allow", () => getDocs(collection(as("gm"), "campaigns/pub/applications")));
await t("신청자 본인 신청서 조회", "allow", () => getDoc(doc(as("applicant"), "campaigns/pub/applications/applicant")));
await t("아직 신청 안 한 사용자의 본인 문서 조회 (구독)", "allow", () => getDoc(doc(as("newbie"), "campaigns/pub/applications/newbie")));
await t("대기 중 상태로 신청", "allow", () => setDoc(doc(as("newbie"), "campaigns/pub/applications/newbie"), { byUid: "newbie", status: "pending", message: "hi" }));
await t("게스트(익명)도 대기 중 상태로 신청", "allow", () => setDoc(doc(anon("guest1"), "campaigns/pub/applications/guest1"), { byUid: "guest1", status: "pending" }));
await t("스스로 '수락됨'으로 신청 불가", "deny", () => setDoc(doc(as("cheat"), "campaigns/pub/applications/cheat"), { byUid: "cheat", status: "accepted" }));
await t("타인 명의로 신청 불가", "deny", () => setDoc(doc(as("cheat"), "campaigns/pub/applications/victim"), { byUid: "victim", status: "pending" }));
await t("신청자가 자기 상태를 수락으로 변경 불가", "deny", () => updateDoc(doc(as("applicant"), "campaigns/pub/applications/applicant"), { status: "accepted" }));
await t("신청자는 상태 유지한 채 메시지 수정 가능", "allow", () => updateDoc(doc(as("applicant"), "campaigns/pub/applications/applicant"), { message: "수정" }));
await t("GM 은 상태 변경 (수락)", "allow", () => updateDoc(doc(as("gm"), "campaigns/pub/applications/applicant"), { status: "accepted" }));
await t("일반 멤버는 남의 상태 변경 불가", "deny", () => updateDoc(doc(as("mem"), "campaigns/pub/applications/applicant"), { status: "rejected" }));
await t("신청자 본인 취소(삭제)", "allow", () => deleteDoc(doc(as("newbie"), "campaigns/pub/applications/newbie")));

console.log("[sessions — 비공개 캠페인 보호]");
await t("공개 캠페인 세션은 비로그인도 열람", "allow", () => getDocs(query(collection(as(null), "campaigns/pub/sessions"), orderBy("no", "desc"))));
await t("비공개 캠페인 세션 제3자 열람 불가", "deny", () => getDocs(collection(as("stranger"), "campaigns/priv/sessions")));
await t("비공개 캠페인 세션 멤버 열람", "allow", () => getDocs(query(collection(as("mem"), "campaigns/priv/sessions"), orderBy("no", "desc"))));
await t("GM 세션 기록 작성", "allow", () => addDoc(collection(as("gm"), "campaigns/pub/sessions"), { no: 2 }));
await t("멤버는 세션 기록 작성 불가", "deny", () => addDoc(collection(as("mem"), "campaigns/pub/sessions"), { no: 3 }));

console.log("[rolls — 플레이 로그]");
await t("공개 캠페인 로그 비로그인 열람 (최신 100개 쿼리)", "allow", () => getDocs(query(collection(as(null), "campaigns/pub/rolls"), orderBy("createdAt", "desc"), limit(100))));
await t("비공개 캠페인 로그 제3자 열람 불가", "deny", () => getDocs(collection(as("stranger"), "campaigns/priv/rolls")));
await t("닉네임 게스트가 공개 캠페인에 채팅", "allow", () => addDoc(collection(anon("guest1"), "campaigns/pub/rolls"), { type: "chat", text: "안녕", byUid: "guest1", byName: "렌" }));
await t("닉네임 게스트가 주사위", "allow", () => addDoc(collection(anon("guest1"), "campaigns/pub/rolls"), { type: "roll", notation: "2d6", rolls: [1, 2], total: 3, byUid: "guest1" }));
await t("비멤버가 비공개 캠페인 로그에 작성 불가", "deny", () => addDoc(collection(as("stranger"), "campaigns/priv/rolls"), { type: "chat", text: "spam", byUid: "stranger" }));
await t("멤버는 비공개 캠페인에 주사위", "allow", () => addDoc(collection(as("mem"), "campaigns/priv/rolls"), { type: "roll", total: 5, byUid: "mem" }));
await t("허용되지 않은 type 거부", "deny", () => addDoc(collection(as("mem"), "campaigns/pub/rolls"), { type: "hack", byUid: "mem" }));
await t("2000자 초과 채팅 거부", "deny", () => addDoc(collection(as("mem"), "campaigns/pub/rolls"), { type: "chat", text: "x".repeat(2001), byUid: "mem" }));
await t("타인 명의 작성 거부", "deny", () => addDoc(collection(as("mem"), "campaigns/pub/rolls"), { type: "chat", text: "x", byUid: "gm" }));
await t("GM 은 남의 로그 삭제 (캠페인 삭제 과정)", "allow", () => deleteDoc(doc(as("gm"), "campaigns/pub/rolls/r1")));
await t("GM 은 신청서 삭제 (캠페인 삭제 과정)", "allow", () => deleteDoc(doc(as("gm"), "campaigns/pub/applications/applicant")));

console.log("[회귀 — 기존 기능]");
await t("공개 캠페인 목록 (홈)", "allow", () => getDocs(query(collection(as(null), "campaigns"), where("visibility", "==", "public"))));
await t("GM 본인 캠페인 목록 (내 테이블)", "allow", () => getDocs(query(collection(as("gm"), "campaigns"), where("gmUid", "==", "gm"))));
await t("참여 캠페인 목록 (내 테이블)", "allow", () => getDocs(query(collection(as("mem"), "campaigns"), where("memberUids", "array-contains", "mem"))));
await t("공개 템플릿 목록", "allow", () => getDocs(query(collection(as(null), "templates"), where("visibility", "==", "public"))));
await t("비공개 캠페인 문서 제3자 조회 불가", "deny", () => getDoc(doc(as("stranger"), "campaigns/priv")));

console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
await env.cleanup();
process.exit(fail ? 1 : 0);
