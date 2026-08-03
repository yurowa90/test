# Poetry Camera (웹 DIY 버전)

찍으면, 시가 나옵니다. [poetry-camera-rpi](https://github.com/bokito-studio/poetry-camera-rpi)에서 영감을 받아, 라즈베리파이 없이 **폰 브라우저만으로** 돌아가게 만든 DIY 웹 버전입니다.

폰 카메라로 장면을 담으면 Gemini가 사진을 읽고 **한국어 시**를 지어 주고, 결과는 감열식 영수증 모양으로 "인쇄되어" 나옵니다. 실제 감열 프린터로도 뽑을 수 있습니다.

## 동작 방식

1. **찍기** — 뷰파인더에서 카메라 촬영 또는 앨범 사진 선택 (브라우저에서 긴 변 1280px로 리사이즈)
2. **짓기** — 사진을 Gemini API(비전)로 보내 시 형식 규칙과 함께 JSON 강제 출력으로 시를 받음
   - 형식: 자유시 · 시조(3장, 종장 첫 마디 3음절) · 하이쿠(5·7·5) · 동시
3. **뽑기** — 영수증이 배출구에서 스텝 애니메이션으로 밀려 나오고, 세 가지 방법으로 실물 인쇄
   - 사진은 시를 짓는 동안 Gemini API로만 전송됩니다. 별도 서버가 없습니다.

## 감열식 영수증 프린터로 인쇄하기

| 방법 | 조건 | 비고 |
| --- | --- | --- |
| **블루투스 인쇄** | Android Chrome 또는 데스크톱 Chrome/Edge + BLE ESC/POS 프린터 | 영수증을 캔버스 비트맵으로 그려 ESC/POS 래스터(`GS v 0`)로 전송 — **프린터에 한글 폰트가 없어도 인쇄됩니다** |
| **시스템 인쇄** | OS에 프린터 드라이버 설치(또는 AirPrint 등) | 58/80mm 전용 인쇄 CSS 적용, 설정에서 용지 폭 선택 |
| **PNG 저장** | 아무 브라우저 | iOS 등 Web Bluetooth 미지원 환경에서는 PNG 저장 후 [RawBT](https://rawbt.ru/) 같은 프린터 앱으로 인쇄 |

- 용지 폭: 58mm(384dot, 휴대용 대부분) / 80mm(576dot, 매장용) — 설정(⚙)에서 선택
- Web Bluetooth는 HTTPS(또는 localhost)에서만 동작합니다. iOS Safari는 Web Bluetooth를 지원하지 않습니다.

### GOOJPRT PT-210 빠른 시작 (기준 프린터)

이 앱은 PT-210(58mm · 384dot · ESC/POS · Bluetooth 4.0)을 기준으로 맞춰져 있습니다.

1. 충전 후 감열지(57~58mm × 직경 30~40mm)를 넣고 전원을 켭니다 — 파란 LED가 깜빡이면 대기 상태
2. **안드로이드 설정에서 페어링하지 마세요.** Web Bluetooth는 OS 페어링 없이 앱에서 직접 연결합니다 (OS에 페어링돼 있으면 오히려 검색이 안 되는 경우가 있습니다 — 이때는 페어링 해제)
3. Android Chrome(또는 데스크톱 Chrome/Edge)에서 앱을 열고, 시를 지은 뒤 **블루투스 프린터로 인쇄** → 기기 목록에서 `PT-210`(또는 `MTP-2` 등으로 표시될 수 있음) 선택
4. 설정(⚙)의 감열지 폭이 **58mm**인지 확인 (기본값)

인쇄가 흐리면 새 감열지인지 확인하고(감열지는 인쇄면이 정해져 있어 롤 방향이 뒤집히면 백지가 나옵니다), 연결이 안 되면 프린터 전원을 껐다 켠 뒤 다시 시도하세요.

## 시작하기

```bash
npm install
npm run dev
```

[Google AI Studio](https://aistudio.google.com/app/apikey)에서 무료 API 키를 발급받아 앱 우상단 설정(⚙)에 넣으세요. 키는 브라우저 localStorage에만 저장됩니다.

```bash
npm run build   # 타입 검사 + 프로덕션 빌드
```

Vercel 정적 배포 설정(`vercel.json`)이 포함되어 있습니다. 폰에서 쓰려면 HTTPS 배포가 필요합니다(카메라·클립보드·Web Bluetooth 모두 HTTPS 요구).

## 구조

```
src/
  App.tsx                 카메라 바디 UI(뷰파인더·셔터·배출구)와 상태 흐름
  components/
    Viewfinder.tsx        사진 미리보기 + 촬영/선택
    Receipt.tsx           화면·시스템 인쇄 공용 영수증(em 기준 치수)
    SettingsModal.tsx     API 키 · 모델 · 감열지 폭
  lib/
    gemini.ts             Gemini 비전 호출(JSON 강제 출력, 한국어 오류 처리)
    prompts.ts            시 작법 시스템 프롬프트 + 형식 규칙
    image.ts              업로드 사진 리사이즈·압축
    receipt.ts            영수증 캔버스 렌더러(인쇄·PNG 공용)
    escpos.ts             캔버스 → ESC/POS 래스터 바이트
    bluetooth.ts          Web Bluetooth BLE 프린터 연결·전송
```

기술 스택: React 19 + TypeScript + Vite + Tailwind CSS 4. 런타임 의존성은 React뿐입니다.
