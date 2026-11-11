# 로컬 테스트

네트워크·외부 의존성·오디오 장치 없이 Node(v18 이상)만으로 실행한다.

```sh
npm test
# 또는
node tests/run-tests.js
```

`run-tests.js` 는 `vm` 컨텍스트로 브라우저의 클래식 `<script>` 로드 순서를 재현해
`js/bgmaudit.js`(BgmAudit)와 `js/audio.js`(Sound)를 실제 파일 그대로 적재하고
합성 배경음 스케줄링 감사를 검증한다.

## 커버 범위

1. **정상 경로**: 한 장소 key 에 대해 `BgmAudit.auditTheme` 결과(bpm·화음 진행·root·
   64칸 멜로디의 모든 비쉼 MIDI 음정·쉼표 수·카테고리별 이벤트 카운트)가
   `Sound`의 실제 `makeTheme` 결과와 항목별로 일치하고 모든 검사 항목을 통과.
   멜로디 음정은 테마의 `deg` 함수로 재계산 가능한지도 확인한다.
2. **부정 경로**: 같은 카테고리가 같은 절대 시각에 두 번 트리거되는 스케줄을 만들어
   `auditSchedule` 의 중복 검사가 실패(reason 포함)로 보고되는지 확인.
3. **경계·강등 경로**: 빈 key, 불법 `mode`, `bpm: 0`(및 음수 bpm, 잘못된 prog 등)이
   예외 없이 읽을 수 있는 reason·영향 필드를 담은 강등 결과로 반환되는지 확인.
4. **JSON 직렬화**: 정상·강등·스케줄 감사 객체가 모두 `JSON.stringify` 로 직렬화되고
   함수/AudioContext 등 비직렬화 요소를 포함하지 않음을 확인.
5. **`Sound.auditBgm` 통합**: 배경음 꺼짐·활성 테마 없음에서는 "미사용" 결과,
   활성 테마가 있으면 현재 `want` 파라미터로 감사한 결과를 반환.
   기존 `play/bgm/title/town/dungeon/boss/refresh` 등 export 는 변경되지 않으며
   `auditBgm`·내부 훅은 비열거 읽기 전용이다.
