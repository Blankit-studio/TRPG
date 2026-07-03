# TRPG — 모집 · 세션 기록 · 캐릭터 시트

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
- **닉네임 세션 참가** — 로그인 없이 닉네임만 입력하면 플레이 탭의 주사위·채팅에 바로 참여 (익명 인증 필요)
- **AI 진행 보조** — 세션 중 다음 전개·NPC·돌발 사건·장면 묘사·판정 난이도를 즉석 제안 (무료 Gemini API, 각자 본인 키 사용 · 결과를 플레이 로그로 공유 가능)
- **캐릭터 시트 관리** — 능력치(자유 구성) · HP · 인벤토리 · 스킬 · 배경 · 메모. 캠페인에 연결 가능
- **플레이 설정 템플릿** — 제목·직업 카테고리·스토리로 정리 → 캠페인을 열 때 그대로 불러오기
- **스토리 맵 (카드 + 마인드맵)** — 장면·단서를 상세 카드로 작성하고 노드를 드래그·연결해, GM은 흐름을 한눈에 보고 플레이어는 이야기를 따라가기 쉽게
- **공개 범위 설정** — 공개 / 링크 공개 / 비공개 (캠페인·캐릭터·템플릿 각각)
- **공유 링크** — 캠페인·캐릭터·템플릿 URL을 복사해 공유
- **나이트 / 일반 모드** — 우측 상단 버튼으로 다크·라이트 테마 전환 (선택은 브라우저에 저장)

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

> 💡 직업 카드 이미지는 별도 Storage 없이 동작합니다. 파일을 선택하면 브라우저에서
> 작게 리사이즈해 Firestore 문서에 인라인 저장하므로, **무료(Spark) 요금제에서도** 사용할 수 있습니다.
> (이미지 URL을 직접 붙여넣는 것도 지원합니다.)

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
  jobCategories: [                     # 직업 카드 목록
    { name, image, stats }             #  이름 · 이미지(업로드 data URL 또는 URL) · 능력치
  ]
  storyline                            # 스토리 요약(텍스트)
  storyNodes: [                        # 스토리 맵(마인드맵 노드)
    { id, title, body, x, y, links }   #  제목 · 상세 · 위치 · 연결된 노드 id 목록
  ]
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
  jobCategories: [{ name, image, stats }]   # 직업 카드 (신청 시 이름으로 선택)
  storyNodes: [{ id, title, body, x, y, links }]  # 스토리 맵 (템플릿에서 복사 / GM 편집)
  status: "recruiting" | "playing" | "done"
  visibility: "public" | "unlisted" | "private"
  memberUids: [uid, ...]              # 참여 멤버(GM 포함)
  members: [{ uid, name, photo, job }]
  updatedAt
  │
  ├─ sessions/{sessionId}             # 세션 기록 (GM 작성)
  │    no, title, date, attendees, summary
  │
  ├─ applications/{applicantUid}      # 모집 신청 (1인 1신청)
  │    byUid, byName, byPhoto, job, characterName, message, status
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

## 🤖 AI 진행 보조 (선택)

캠페인 상세 → **🎲 플레이 탭** 하단의 **AI 진행 보조**에서 세션 도중 GM을 돕는 제안을 받을 수 있습니다.

- **무료 Gemini API 키**를 [Google AI Studio](https://aistudio.google.com/apikey) 에서 발급(무료) 후 패널에 붙여넣으면 됩니다.
- 키는 **사용자 브라우저(localStorage)에만** 저장되고 저장소/서버로 전송되지 않습니다. 각자 본인 무료 할당량을 사용합니다.
- 캠페인 제목·시스템·직업·스토리 맵·최근 진행 로그를 맥락으로 전달해, 다음 전개/NPC/돌발사건/묘사/판정 난이도를 제안합니다.
- 결과는 **📋 복사** 하거나 **💬 로그에 공유**(플레이어에게 전달)할 수 있습니다.
- 사용하는 모델은 `app.js` 의 `AI_MODEL` 상수로 바꿀 수 있습니다.

## 🔧 커스터마이즈 팁

- 추천 시스템 목록: `app.js` 의 `SYSTEMS`
- 빠른 주사위 버튼: `app.js` 의 `DICE_BUTTONS`
- 캐릭터 아이콘 이모지: `app.js` 의 `CHAR_EMOJIS`
- 기본 능력치 프리셋: `app.js` 의 `DEFAULT_STATS`
- AI 모델 / 빠른 제안 버튼: `app.js` 의 `AI_MODEL`, `AI_ACTIONS`
- 색상 테마: `styles.css` 의 CSS 변수(`:root`)
