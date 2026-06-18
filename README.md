# 🎲 다이스로그 — TRPG 모집 · 세션 기록 · 캐릭터 시트

GM과 플레이어가 **함께 TRPG를 즐기고, 그 데이터가 잘 정리되는** 웹사이트입니다.
GM은 캠페인을 모집하고 세션을 기록하며, 플레이어는 신청해서 참여하고 캐릭터 시트를 만들고,
모두가 **실시간으로 주사위를 굴리고 채팅**하며 플레이합니다.

순수 정적 사이트(HTML/CSS/JS) + **Firebase**(구글/익명 인증 + Firestore) 구조라 별도 서버가 필요 없습니다.

---

## ✨ 주요 기능

- **Google 로그인** (Firebase Authentication) · 게스트(익명) 참여 지원
- **캠페인 모집 게시판** — GM이 시스템·일정·정원·소개를 적어 캠페인을 열고, 상태(📢모집중 / 🎲진행중 / 🏁완료)별로 둘러보기
- **참여 신청 & 수락** — 플레이어가 캐릭터 이름·메시지를 적어 신청하면, GM이 수락/거절. 수락 시 멤버로 합류
- **세션 / 캠페인 기록** — 회차별 일지(제목·날짜·참석자·요약)를 누적 기록
- **실시간 플레이 도구** — `2d6+3`, `d20` 같은 주사위 표기 + 빠른 버튼으로 굴리고, 결과·채팅이 `onSnapshot`으로 즉시 공유
- **캐릭터 시트 관리** — 능력치(자유 구성) · HP · 인벤토리 · 스킬 · 배경 · 메모. 캠페인에 연결 가능
- **플레이 설정 템플릿** — 제목·직업 카테고리·스토리 라인으로 간단히 정리 → 캠페인을 열 때 그대로 불러오기
- **공개 범위 설정** — 공개 / 링크 공개 / 비공개 (캠페인·캐릭터·템플릿 각각)
- **공유 링크** — 캠페인·캐릭터·템플릿 URL을 복사해 공유

---

## 🚀 설정 방법 (약 5분)

### 1. Firebase 프로젝트 만들기
1. [Firebase 콘솔](https://console.firebase.google.com) → **프로젝트 추가**
2. 프로젝트 이름 입력 후 생성

### 2. 웹 앱 등록 & 설정값 복사
1. 프로젝트 개요 → **웹(`</>`)** 아이콘 클릭해 앱 등록
2. 표시되는 `firebaseConfig` 객체의 값을 복사
3. 이 저장소의 [`firebase-config.js`](./firebase-config.js) 의 값을 본인 값으로 교체

```js
export const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "내프로젝트.firebaseapp.com",
  projectId: "내프로젝트",
  storageBucket: "내프로젝트.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef",
};
```

### 3. 로그인 켜기
- **Authentication** → **시작하기** → **Sign-in method** 탭 → **Google** 사용 설정 → 저장
- (선택) **게스트 참여/관전**을 허용하려면 같은 화면에서 **익명(Anonymous)** 도 사용 설정하세요.

### 4. Firestore 만들기 & 보안 규칙 적용
1. **Firestore Database** → **데이터베이스 만들기** (프로덕션 모드로 생성)
2. **규칙(Rules)** 탭으로 이동
3. 이 저장소의 [`firestore.rules`](./firestore.rules) 내용을 붙여넣고 **게시**

> 일부 목록 조회는 단일 필드 인덱스로 동작합니다. 콘솔에서 인덱스 생성 안내가 뜨면 링크를 눌러 생성하세요.

### 5. 승인된 도메인 등록
- **Authentication → Settings → 승인된 도메인**에 사이트를 띄울 도메인 추가
  - 로컬 테스트: `localhost`
  - 배포 시: 예) `내아이디.github.io` 또는 Firebase Hosting 도메인

---

## 🖥️ 로컬에서 실행

ES 모듈을 사용하므로 `file://` 로 직접 열면 안 되고, 간단한 정적 서버가 필요합니다.

```bash
# 둘 중 아무거나
npx serve .
# 또는
python3 -m http.server 5173
```

그 후 브라우저에서 `http://localhost:5173` (또는 표시된 주소) 접속.

> ⚠️ 구글 로그인 팝업이 동작하려면 `localhost`가 **승인된 도메인**(4-5단계)에 있어야 합니다.

---

## 🌐 배포

정적 파일이므로 어디든 올릴 수 있습니다.

- **Firebase Hosting**
  ```bash
  npm i -g firebase-tools
  firebase login
  firebase deploy --only hosting
  ```
- **GitHub Pages** — 저장소 Settings → Pages → 브랜치 지정 후 배포
- **Vercel / Netlify** — 정적 사이트로 import 후 배포

배포 도메인을 **승인된 도메인**에 추가하는 것을 잊지 마세요.

---

## 🗂️ 데이터 구조 (Firestore)

```
users/{uid}
  name, photo, email, createdAt, updatedAt

templates/{templateId}                # 플레이 설정 템플릿
  ownerUid, ownerName, ownerPhoto
  name                                 # 템플릿 제목
  jobCategories: ["탐정","기자",...]    # 직업 카테고리
  storyline                            # 스토리 라인
  visibility, createdAt, updatedAt

characters/{characterId}              # 캐릭터 시트
  ownerUid, ownerName, ownerPhoto
  name, emoji, system, hp, maxHp
  stats: [{ k, v }]                    # 능력치(이름/값) 목록
  inventory, skills, background, notes
  templateId, campaignId, visibility, updatedAt

campaigns/{campaignId}                # 캠페인(모집 + 기록)
  gmUid, gmName, gmPhoto
  title, system, description, schedule, maxPlayers
  status: "recruiting" | "playing" | "done"
  visibility: "public" | "unlisted" | "private"
  memberUids: [uid, ...]              # 참여 멤버(GM 포함)
  members: [{ uid, name, photo }]
  updatedAt
  │
  ├─ sessions/{sessionId}             # 세션 기록 (GM 작성)
  │    no, title, date, attendees, summary
  │
  ├─ applications/{applicantUid}      # 모집 신청 (1인 1신청)
  │    byUid, byName, byPhoto, characterName, message, status
  │
  └─ rolls/{rollId}                   # 실시간 플레이 로그
       type: "roll" | "chat"
       byUid, byName, byPhoto, createdAt
       (roll) notation, rolls[], modifier, total
       (chat) text
```

### 공개 범위(visibility)
- **public(공개)** — 둘러보기 목록에 노출되고 누구나 열람
- **unlisted(링크 공개)** — 목록엔 안 보이지만 링크를 아는 사람은 열람
- **private(비공개)** — 캠페인은 GM·멤버만, 캐릭터/템플릿은 본인만 열람

---

## 📁 파일 구성

| 파일 | 설명 |
|------|------|
| `index.html` | 페이지 골격 |
| `styles.css` | 스타일 |
| `app.js` | 앱 로직 (인증·라우팅·캠페인·세션·캐릭터·템플릿·실시간 주사위) |
| `firebase-config.js` | **본인 Firebase 설정값 입력** |
| `firestore.rules` | Firestore 보안 규칙 |

---

## 🔧 커스터마이즈 팁

- 추천 시스템 목록: `app.js` 의 `SYSTEMS`
- 빠른 주사위 버튼: `app.js` 의 `DICE_BUTTONS`
- 캐릭터 아이콘 이모지: `app.js` 의 `CHAR_EMOJIS`
- 기본 능력치 프리셋: `app.js` 의 `DEFAULT_STATS`
- 색상 테마: `styles.css` 의 CSS 변수(`:root`)
