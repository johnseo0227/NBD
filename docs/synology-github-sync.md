# Synology NAS + GitHub로 PC ↔ 모바일(iOS) 작업 이어가기

PC에서 하던 문서·메모·파일 작업을 iPhone/iPad에서도 그대로 이어서 하고,
GitHub에 자동으로 백업(버전 이력)되도록 구성하는 가이드입니다.

## 전체 구조

```
  PC (Synology Drive Client)
        ⇅  실시간 동기화
  Synology NAS (문서 폴더)  ──자동 commit/push──►  GitHub (백업·이력)
        ⇅  실시간 동기화
  iPhone/iPad (Synology Drive 앱)
```

- **PC ↔ 모바일**: Synology Drive가 실시간 동기화 → 즉시 이어서 작업
- **NAS → GitHub**: 작업 스케줄러가 `scripts/nas-sync.sh`를 주기 실행해 자동 백업

---

## 1단계. Synology Drive로 PC ↔ 모바일 동기화

1. **NAS(DSM)**: 패키지 센터에서 **Synology Drive Server** 설치
2. **PC**: [Synology Drive Client](https://www.synology.com/ko-kr/support/download) 설치
   → 동기화할 폴더를 NAS의 작업 폴더(예: `Documents/nbd`)와 연결
3. **iPhone/iPad**: App Store에서 **Synology Drive** 앱 설치 → 같은 폴더 접근

이제 PC에서 저장한 파일이 NAS를 거쳐 모바일에 바로 나타납니다.

> 팁: iOS의 "파일" 앱에 Synology Drive를 연동하면 다른 앱에서도 바로 열고 저장할 수 있습니다.

---

## 2단계. NAS에서 GitHub 인증 설정 (1회)

NAS가 사람 개입 없이 push 하려면 **개인용 액세스 토큰(PAT)** 또는 **SSH 키**가 필요합니다.

### 방법 A) HTTPS + 토큰 (간단)

1. GitHub → Settings → Developer settings → **Personal access tokens**
   → `repo` 권한으로 토큰 발급
2. NAS에서 SSH 접속 후, 작업 폴더를 git 저장소로 초기화/연결:

```sh
cd /volume1/homes/johnseo/Documents/nbd
git init
git remote add origin https://<TOKEN>@github.com/johnseo0227/nbd.git
git branch -M main
git pull origin main --allow-unrelated-histories
```

### 방법 B) SSH 키 (더 안전, 권장)

```sh
ssh-keygen -t ed25519 -C "synology-nas"
cat ~/.ssh/id_ed25519.pub   # 출력값을 GitHub > Settings > SSH keys 에 등록
git remote add origin git@github.com:johnseo0227/nbd.git
```

---

## 3단계. 자동 백업 스크립트 등록

1. 이 저장소의 `scripts/nas-sync.sh`를 NAS에 두고, 상단 **설정 값**
   (`REPO_DIR`, 작성자 정보)을 본인 환경에 맞게 수정
2. 실행 권한 부여:

```sh
chmod +x /volume1/.../scripts/nas-sync.sh
```

3. **DSM → 제어판 → 작업 스케줄러 → 생성 → 예약된 작업 → 사용자 지정 스크립트**
   - 사용자: `johnseo` (본인 계정)
   - 일정: 예) 매시간 또는 하루 1회
   - 실행 명령:
     ```
     sh /volume1/.../scripts/nas-sync.sh
     ```

이제 NAS가 주기적으로 변경분을 GitHub에 자동 백업합니다.

---

## 참고: 이게 GitHub만으로는 부족한 이유

- 문서/메모/이미지 같은 파일은 Git의 강점(코드 diff)이 잘 안 맞고,
  실시간 양방향 동기화가 어렵습니다.
- 그래서 **실시간 동기화는 Synology Drive**, **버전 이력 백업은 GitHub**로
  역할을 나누는 것이 가장 안정적입니다.

## 충돌이 걱정된다면

- 같은 파일을 PC와 모바일에서 **동시에** 편집하면 Synology Drive가
  충돌 사본을 만듭니다. 한 곳에서 닫고 다른 곳에서 여는 습관을 권장합니다.
- GitHub 백업은 자동 `rebase --autostash`로 처리되며, 충돌 시
  스크립트가 멈추므로 NAS에서 수동 확인하면 됩니다.
