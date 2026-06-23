#!/bin/sh
# ============================================================
# Synology NAS -> GitHub 자동 백업 스크립트
# ------------------------------------------------------------
# Synology DSM "제어판 > 작업 스케줄러"에서 이 스크립트를
# 사용자 지정 스크립트로 등록해 주기적으로 실행하세요.
#
# 동작: 지정한 문서 폴더의 변경분을 자동으로 commit 후
#       GitHub 로 push 합니다. 변경이 없으면 아무것도 안 합니다.
# ============================================================

# --- 설정 (본인 환경에 맞게 수정) ---------------------------
# Synology Drive 로 PC/모바일과 동기화되는 폴더 경로
REPO_DIR="/volume1/homes/johnseo/Documents/nbd"

# git 실행 파일 경로 (Synology Git Server 패키지 설치 시)
GIT_BIN="/usr/bin/git"

# 커밋에 사용할 작성자 정보
GIT_AUTHOR_NAME="Synology NAS"
GIT_AUTHOR_EMAIL="johnseo0227@gmail.com"
# ------------------------------------------------------------

export GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL
export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME"
export GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"

cd "$REPO_DIR" || {
    echo "[오류] 폴더를 찾을 수 없습니다: $REPO_DIR"
    exit 1
}

# 원격 최신 내용을 먼저 반영 (충돌 방지)
"$GIT_BIN" pull --rebase --autostash origin main

# 변경 사항이 없으면 종료
if [ -z "$("$GIT_BIN" status --porcelain)" ]; then
    echo "변경 사항 없음 - 종료"
    exit 0
fi

# 변경분 커밋 후 push
TIMESTAMP="$(date '+%Y-%m-%d %H:%M:%S')"
"$GIT_BIN" add -A
"$GIT_BIN" commit -m "NAS 자동 백업: $TIMESTAMP"
"$GIT_BIN" push origin main

echo "백업 완료: $TIMESTAMP"
