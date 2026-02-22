# Pre-VD Identifier Admin

CSV를 업로드하면 Gemini(`gemini-2.5-flash-lite`)로 응답을 자동 분류하고, 어드민에서 검토/수정/재분류할 수 있는 내부 도구입니다.

## Setup

1. 환경 변수 준비

```bash
cp .env.example .env
```

2. `GEMINI_API_KEY` 입력

3. 개발 서버 실행

```bash
npm run dev
```

## 핵심 기능

- CSV 업로드 + 동기 분류(`sync_request`)
- 분류 결과/수정 이력/업로드 히스토리 전부 localStorage 저장
- Gemini self-consistency (n회 투표 후 다수결)
- 분류 기준 자연어 입력/저장(localStorage)
- 자연어 AND/OR 필터
- 컬럼 색상 규칙(초록/노랑/빨강)
- 결과 수동 수정 + 단건 재분류

## 디자인 레퍼런스

- 프로젝트 루트의 `designref.html` 기준 레이아웃/톤 참고
