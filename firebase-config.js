// ─────────────────────────────────────────────────────────────
// Firebase 설정 파일
// ─────────────────────────────────────────────────────────────
// Firebase 콘솔(https://console.firebase.google.com) → 프로젝트 설정 →
// "내 앱" → 웹 앱(</>) 등록 후 나오는 firebaseConfig 값을 아래에 붙여넣으세요.
//
// 그리고 Authentication → Sign-in method 에서 "Google"을 사용 설정하세요.
// (게스트 관전을 허용하려면 "익명(Anonymous)" 도 켜세요.)
// Firestore Database 도 생성하고, firestore.rules 의 규칙을 적용하세요.
// 자세한 단계는 README.md 를 참고하세요.
// ─────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: "AIzaSyC0g3MkCD1MgpDO3B53Y3wOl5hvyHhc5Dc",
  authDomain: "trpg-c4f51.firebaseapp.com",
  projectId: "trpg-c4f51",
  storageBucket: "trpg-c4f51.firebasestorage.app",
  messagingSenderId: "598090987208",
  appId: "1:598090987208:web:7035c3399ff99b314597fd",
  measurementId: "G-0RGBNP7G5P",
};

// 위 값이 채워졌는지 간단히 확인하는 플래그 (UI 안내용)
export const isConfigured =
  firebaseConfig.apiKey !== "YOUR_API_KEY" &&
  !!firebaseConfig.projectId &&
  firebaseConfig.projectId !== "YOUR_PROJECT_ID";
