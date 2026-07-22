# PIBF1 참고 자료 (항체·실험 계획용)

> 정리일: 2026-07-22 · 항체/재료 주문 및 sample 준비 참고용
> ⚠️ 벤더 카탈로그 상세(희석배수·가격·재고)는 발주 전 각 제품 데이터시트에서 최종 확인 필요.

---

## 1. PIBF1 개요

| 항목 | 내용 |
|------|------|
| 유전자명 | **PIBF1** (Progesterone Immunomodulatory Binding Factor 1) |
| 별칭(aliases) | PIBF, **CEP90** (Centrosomal protein 90 kDa), C13orf24, JBTS33 |
| 위치 | 13q21.33–q22.1, 18 exon, >234 kb |
| 전장 단백질 | 757 aa, 예측 분자량 **약 90 kDa** (89,724 Da) |
| 반응성(항체) | 주로 **Human** (마우스/랫 교차반응은 항체별 확인 필요) |

### 기능 (application·컨트롤 설계에 영향)
- **90 kDa 전장형**: centrosome(중심체)에 결합. 중심립 복제, 1차 섬모(primary cilia) 형성에 필수. PCM1, CEP63, CDK2를 중심체로 recruit.
- **분비형 소형 아이소폼**: alternative splicing 산물. GPI-anchored PIBF 수용체 / IL4Rα에 결합 → STAT6 활성·STAT4 억제 → **Th2 편향 면역조절**.
- **질환**: PIBF1 biallelic 변이는 **Joubert syndrome 33 (JBTS33)**, Dandy-Walker, cephalocele 등 ciliopathy와 연관.

---

## 2. 아이소폼 / 분자량 (WB 밴드 해석 필수)

| 아이소폼 | 크기 | 특징/위치 |
|----------|------|-----------|
| Full-length (isoform 1) | **~90 kDa** | 전장 ORF, 중심체 결합. 세포내 + 분비 |
| Splice variant (exon 1–5 + 17–18) | **~34–35 kDa** | 분비형, 면역조절(원조 "PIBF") |
| Astrocytoma 유래 | ~57 kDa | 세포내 + 분비 보고 |

> **주의**: WB에서 목표 밴드가 90 kDa인지 34~57 kDa 분비형인지에 따라 항체 선택(인식 epitope 영역)과 시료(세포 lysate vs 배양 상등액/혈청)가 달라집니다. 대부분 시판 항체는 90 kDa 전장형을 관찰 분자량으로 표기.

---

## 3. 시판 항체 비교 (주문 후보)

| 벤더 | 카탈로그 | Host / Clonality | 검증 응용 | 반응성 | Immunogen 영역 | 비고 |
|------|----------|------------------|-----------|--------|----------------|------|
| **Proteintech** | 14413-1-AP | Rabbit polyclonal | WB, IHC, IF/ICC, IP, ELISA | Human | PIBF1 fusion protein | 관찰 MW ~90 kDa. 가장 응용 폭 넓음 → **1순위 후보** |
| Proteintech | CL488-14413 | Rabbit poly (CoraLite488 직접표지) | IF | Human | 위와 동일 clone | IF 전용, 형광 직접표지본 |
| Abcam | ab72118 | Rabbit polyclonal | IP, WB | Human | 합성 peptide, aa 700–800 | C-말단 영역 인식 |
| Abcam | ab151491 | Rabbit polyclonal | WB, ICC/IF | Human | recombinant fragment, aa 450–700 | 중앙 영역 인식 |
| Sigma-Aldrich | SAB1401526 | Mouse | (WB) | Human | — | 데이터시트 확인 |
| Abcepta | ASC11618 | (poly) | WB, IHC-P, IF, ELISA | Human | — | 대체 후보 |

### 추천 판단
- **다목적(WB+IHC+IF+IP)이면** → Proteintech 14413-1-AP 1개로 대부분 커버.
- **IF만** → CL488-14413(직접표지)로 secondary 생략 가능.
- **epitope 다른 2종 교차검증**이 필요하면 → Abcam ab72118(C-말단) + ab151491(중앙) 조합.

---

## 4. 실험 조건 (일반 권장값 — 데이터시트로 최종 확인)

| 응용 | 권장 희석 (일반) | 참고 |
|------|------------------|------|
| WB | 1:500 ~ 1:1000 | 관찰 밴드 ~90 kDa |
| IHC-P | 1:50 ~ 1:500 | 항원부활: TE buffer pH 9.0 (우선), 또는 citrate pH 6.0 |
| IF/ICC | 1:50 ~ 1:500 | 중심체 punctate 패턴 예상 |
| IP | 데이터시트 확인 | lysate 0.5~4.0 mg |

- **Positive control 아이디어**: 태반 조직/lysate, 증식 활발한 세포주(중심체 발현), progesterone 처리 세포 등. 실제 검증 시료는 데이터시트의 tested samples 확인.
- **보관(일반)**: -20°C, PBS + 0.02% sodium azide + 50% glycerol (pH 7.3). 소분 권장.

---

## 5. 주문 전 체크리스트

- [ ] 목표 아이소폼 확정 (90 kDa 전장형 / 34–57 kDa 분비형) → 항체 epitope 영역과 매칭
- [ ] 응용 확정 (WB / IHC / IF / IP) → 검증된 카탈로그 선택
- [ ] 시료 종 확인 (human 외 종이면 교차반응 데이터 확인)
- [ ] Positive/negative control 시료 확보 여부
- [ ] Secondary 항체 매칭 (host: 대부분 rabbit → anti-rabbit HRP/형광)
- [ ] 부자재: 항원부활 buffer(TE pH9 / citrate pH6), blocking, 막/겔, ECL 등 재고 확인
- [ ] 리드타임 확인 (국내 재고 vs 수입) → 이번 주 sample 가능 여부 판단

---

## 6. 출처
- [GeneCards – PIBF1](https://www.genecards.org/card/PIBF1)
- [OMIM *607532 – PIBF1](https://omim.org/entry/607532)
- [Exploration – Progesterone induced blocking factor in health and disease](https://www.explorationpub.com/Journals/ei/Article/100327)
- [Nature J Hum Genet – Biallelic PIBF1 insertion & Joubert syndrome](https://www.nature.com/articles/s10038-018-0462-7)
- [Proteintech 14413-1-AP](https://www.ptglab.com/products/PIBF1-Antibody-14413-1-AP.htm) · [CL488-14413](https://www.ptglab.com/products/PIBF1-Antibody-CL488-14413.htm)
- [Abcam ab72118](https://www.abcam.com/en-us/products/primary-antibodies/pibf-antibody-ab72118) · [ab151491](https://www.abcam.com/en-us/products/primary-antibodies/pibf-antibody-ab151491)
- [Sigma-Aldrich SAB1401526](https://www.sigmaaldrich.com/US/en/product/sigma/sab1401526)
- [Abcepta ASC11618](https://www.abcepta.com/products/ASC11618-PIBF1-Antibody)
