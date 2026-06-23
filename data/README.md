# data — 행동실험 원자료 드롭 위치

행동실험 1·2차 데이터는 현재 작성자 로컬/NAS에 있어 원격 세션에서 직접 읽을 수 없습니다.
아래 방법 중 하나로 데이터를 올려주시면, 정리 템플릿
(`docs/Pibf1_Emx1-Cre_행동실험_결과정리.md`)의 수치 자리를 채워 드립니다.

## 데이터 전달 방법
1. **파일 push (권장)**: 이 `data/` 폴더에 검사별 csv/xlsx 파일을 추가하고
   `claude/pibf1-emx1-cre-results-8c9ovt` 브랜치로 push.
   - 권장 파일명 예: `1차_MWM.csv`, `1차_사회성.csv`, `1차_FST.csv`, `2차_MWM.csv`, ...
   - 권장 컬럼: `mouse_id, group(cKO/Control), sex(M/F), cohort(1/2), test, metric, value`
2. **표 붙여넣기**: 채팅에 검사별 mean±SEM(또는 개체값) 표를 붙여넣기.

## 그룹 정의
- `cKO` = Pibf1 f/f ; Emx1-Cre(+)
- `Control` = Pibf1 f/f ; Emx1-Cre(−)
