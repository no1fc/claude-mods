// Pure helpers: no $ here (the validator follows $ only within register.tsx).

export type Task = { text: string; isDone: boolean }

export type GitInfo = {
  branch: string
  base: string
  commits: string
  stat: string
  status: string
}

export const TASK_FILE = 'docs/task_list.md'

const TASK_LINE = /^\s*(?:[-*+]|\d+\.)\s+\[( |x|X)\]\s+(.+?)\s*$/

export function parseTasks(markdown: string): Task[] {
  return markdown.split(/\r?\n/).flatMap(line => {
    const match = TASK_LINE.exec(line)
    return match ? [{ text: match[2], isDone: match[1] !== ' ' }] : []
  })
}

// Templates of secrets are edited routinely, so they pass without a question.
const SAFE_NAMES = /^\.env\.(example|sample|template|dist)$/i
const SENSITIVE_NAMES = [
  /^\.env$/i,
  /^\.env\..+$/i,
  /\.(pem|key|p12|pfx|keystore|jks)$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /^credentials(\.\w+)?$/i,
  /^secrets?\.\w+$/i,
]

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

export function isSensitivePath(path: string): boolean {
  const name = baseName(path.trim().replace(/^['"]|['"]$/g, ''))
  if (SAFE_NAMES.test(name)) return false
  return SENSITIVE_NAMES.some(pattern => pattern.test(name))
}

// Returns the sensitive file a tool call touches, or undefined. For shells
// every word of the command is checked: a read of .env is asked about too.
export function sensitiveTarget(
  tool: string,
  input: Record<string, unknown>,
): string | undefined {
  if (tool === 'Edit' || tool === 'Write') {
    const path = String(input.file_path ?? '')
    return isSensitivePath(path) ? path : undefined
  }
  if (tool === 'NotebookEdit') {
    const path = String(input.notebook_path ?? '')
    return isSensitivePath(path) ? path : undefined
  }
  if (tool === 'Bash' || tool === 'PowerShell') {
    const words = String(input.command ?? '').split(/[\s;|&<>()=,]+/)
    return words.find(word => word !== '' && isSensitivePath(word))
  }
  return undefined
}

const BRANCH = /^(?!-)(?!.*\.\.)[A-Za-z0-9._\/-]+$/

export function isValidBranch(name: string): boolean {
  return BRANCH.test(name) && !name.endsWith('/') && !name.endsWith('.lock')
}

export function worktreePath(root: string, branch: string): string {
  const parts = root.split(/[\\/]/)
  const repo = parts.pop() ?? 'repo'
  return [...parts, `${repo}-${branch.replace(/\//g, '-')}`].join('/')
}

const ATTRIBUTION = '🤖 Generated with [Claude Code](https://claude.com/claude-code)'

export function buildPrTemplate(info: GitInfo): string {
  const commits = info.commits.trim() || '(커밋 없음)'
  const stat = info.stat.trim() || '(변경 없음)'
  return [
    `## Summary`,
    `<!-- ${info.branch} → ${info.base}: 이 PR이 하는 일을 1~3줄로 -->`,
    `- `,
    ``,
    `## Changes`,
    ...commits.split(/\r?\n/).map(line => `- ${line}`),
    ``,
    `## Changed files`,
    '```',
    stat,
    '```',
    ``,
    `## Test plan`,
    `- [ ] `,
    ``,
    ATTRIBUTION,
  ].join('\n')
}

export function buildPrPrompt(info: GitInfo): string {
  const pending = info.status.trim()
    ? `\n\n커밋되지 않은 변경이 있습니다(PR에 포함되지 않음):\n${info.status.trim()}`
    : ''
  return [
    `현재 브랜치 \`${info.branch}\`의 작업으로 \`${info.base}\` 대상 PR 본문을 작성해줘.`,
    `\`git log ${info.base}..HEAD\`와 \`git diff ${info.base}...HEAD\`를 직접 분석해서`,
    `아래 템플릿의 Summary·Changes·Test plan을 구체적으로 채우고, 마지막 줄은 그대로 둬.`,
    `PR 생성이나 push는 하지 말고 본문만 보여줘.${pending}`,
    ``,
    buildPrTemplate(info),
  ].join('\n')
}

export function taskPrompt(task: Task): string {
  return `${TASK_FILE}의 작업 "${task.text}"의 현재 진행 상황과, 완료하려면 해야 할 내용을 정리해줘.`
}

export const OVERVIEW_PROMPT = `${TASK_FILE} 기준으로 전체 작업 진행 상황, 다음 작업, 남은 작업을 정리해줘.`

export const CREATE_TASKS_PROMPT = `현재 프로젝트를 분석해서 ${TASK_FILE}를 만들어줘. 각 작업은 "- [ ] 작업 내용" 체크박스 한 줄로, 완료된 작업은 "- [x]"로 표시해줘.`
