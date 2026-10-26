# claude-mods

Claude Code에서 쓰는 mod(함수 훅 플러그인) 모음 마켓플레이스입니다.

| mod | 설명 |
| --- | --- |
| [work-hub](./work-hub) | 작업 목록·병렬 에이전트 패널, 보안 파일 변경 확인, git 워크트리·PR 템플릿 커맨드 |

> Claude Code mod API는 early access라 Claude Code 버전에 따라 동작이 바뀔 수 있습니다. (개발 기준: Claude Code 2.1.308)

## 사전 설정 (필수)

mod(함수 훅)는 아직 early access라, **설치한 플러그인의 mod는 기본적으로 로드되지 않습니다.** `~/.claude/settings.json`에 아래 `env`를 추가하세요(이미 `env`가 있으면 키만 추가):

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1"
  }
}
```

설정 후 새로 시작한 세션부터 적용됩니다. 설정 없이 `/hub`를 실행하면 `Unknown command: /hub`가 나옵니다.

설정 파일 대신 환경변수로 켜도 됩니다(Windows는 `setx CLAUDE_CODE_ENABLE_FUNCTION_HOOKS 1` 후 새 터미널, macOS·Linux는 셸 프로필에 `export CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1`).

## 설치

터미널 세션의 프롬프트에서:

```
/plugin install work-hub --marketplace no1fc/claude-mods
```

`Add marketplace?`에 `y`, 스코프는 user(기본값)를 고르면 바로 켜집니다.

셸에서:

```bash
claude plugin install work-hub --marketplace no1fc/claude-mods
```

데스크톱 앱(`/plugin`이 동작하지 않음): 프롬프트 입력창 옆 **+** → **Plugins** → **Add marketplace**에 `no1fc/claude-mods` → **Add plugin**.

### 릴리스 파일로 설치

[Releases](https://github.com/no1fc/claude-mods/releases)의 `work-hub-<버전>.zip`을 받아 원하는 폴더에 풀고:

```bash
claude --plugin-dir <압축을 푼 폴더>/work-hub
```

## 업데이트

```bash
claude plugin marketplace update claude-mods
```

```bash
claude plugin update work-hub
```

그다음 실행 중인 세션에서 `/reload-plugins`.

## 문제 해결

| 증상 | 확인할 것 |
| --- | --- |
| `Unknown command: /hub` | [사전 설정](#사전-설정-필수)의 `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS`가 빠졌는지. `claude --debug`로 실행하면 디버그 로그에 `hooks module work-hub@claude-mods not loaded` 사유가 남습니다 |
| `Cannot add marketplace "claude-mods": its network source differs ...` | 이미 같은 이름(`claude-mods`)으로 다른 출처(로컬 폴더 등)가 등록된 상태. 그 출처로 설치돼 있으면 그대로 쓰거나, `claude plugin marketplace remove claude-mods` 후 다시 설치 |
| Git Bash에서 `claude -p "/hub"`가 경로로 바뀜 | `MSYS_NO_PATHCONV=1 claude -p "/hub"` |

## work-hub

### 패널 — `/hub`

- **작업**: 프로젝트의 `docs/task_list.md` 체크박스(`- [ ]` / `- [x]`)를 읽어 진행률, ▶ 다음 작업, 남은 작업을 보여줍니다. 5초마다 다시 읽습니다.
  - 작업을 누르면 "이 작업의 진행 상황과 해야 할 내용을 정리해줘"가 프롬프트 입력창에 채워집니다. 확인 후 Enter.
  - "진행 n/m"을 누르면 전체 현황 정리 요청이 채워집니다.
  - 파일이 없으면 **작업 목록 만들기** 버튼으로 Claude에게 생성을 요청합니다.
- **병렬 에이전트**: 이 세션의 서브에이전트·팀원과 상태. 누르면 메인 화면이 그 에이전트 대화로 전환되고, **← 메인 대화로**로 돌아옵니다.
  - 데스크톱 앱의 다른 세션 목록·분할 창은 mod API 범위 밖입니다. 다른 세션은 앱 사이드바에서 끌어다 놓아 나란히 볼 수 있습니다.

### 보안 파일 가드 (자동)

Claude가 아래 파일을 Edit·Write·NotebookEdit로 변경하거나 Bash·PowerShell 명령에서 다루려 하면 **허용 / 차단** 확인을 받습니다. 확인 창을 닫으면 차단됩니다.

- `.env`, `.env.*` (`.env.example`·`.sample`·`.template`·`.dist`는 제외)
- `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.keystore`, `*.jks`
- `id_rsa`, `id_ed25519` 등 SSH 키, `credentials*`, `secret(s).*`

### git 커맨드

| 커맨드 | 동작 |
| --- | --- |
| `/worktree` | `git worktree list` |
| `/worktree <브랜치>` | 저장소 옆에 `<저장소>-<브랜치>` 폴더로 워크트리 생성 (브랜치가 없으면 새로 만듦) |
| `/pr-template` | 기본 브랜치 대비 커밋·변경 파일로 PR 템플릿(Summary / Changes / Changed files / Test plan) 출력 |
| `/pr` | 위 템플릿을 바탕으로 Claude가 PR 본문을 작성 (PR 생성·push는 하지 않음) |

기본 브랜치는 `origin/HEAD` → `main` → `master` 순으로 찾습니다.

## 개발

이 저장소를 로컬 마켓플레이스로 등록하면 폴더를 직접 읽으므로, 수정 후 `/reload-plugins`만 하면 반영됩니다.

```bash
claude plugin marketplace add <이 저장소 경로>
```

```bash
claude plugin install work-hub@claude-mods
```

검증·테스트:

```bash
claude plugin validate work-hub
```

```bash
claude plugin test work-hub
```

릴리스: `work-hub/.claude-plugin/plugin.json`의 `version`을 올리고 커밋·push한 뒤 `v<버전>` 태그로 GitHub 릴리스를 만듭니다.

구조:

```
.claude-plugin/marketplace.json   # 마켓플레이스 목록
work-hub/
  .claude-plugin/plugin.json      # mod 매니페스트
  hooks/hooks.json                # 훅 모듈 경로
  hooks/register.tsx              # 훅 연결 ($ 사용 코드)
  hooks/lib.ts                    # 순수 로직 (작업 파싱, 보안 파일 판별, PR 템플릿)
  hooks/work-hub.test.tsx         # claude plugin test
```
