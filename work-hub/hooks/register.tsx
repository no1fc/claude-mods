import type { Register } from 'claude-code'

import {
  CREATE_TASKS_PROMPT,
  OVERVIEW_PROMPT,
  TASK_FILE,
  buildPrPrompt,
  buildPrTemplate,
  isValidBranch,
  parseTasks,
  sensitiveTarget,
  taskPrompt,
  worktreePath,
} from './lib'
import type { GitInfo, Task } from './lib'

const PANE = 'work-hub'
const TITLE = 'Work Hub'
// ponytail: the pane polls every 5s for task-file and agent changes; hook the
// edits and agent events instead if the redraw ever shows up as a cost.
const REFRESH_MS = 5000
const ALLOW = '허용'
const BLOCK = '차단'
const ACTIVE_AGENT = new Set(['pending', 'running', 'waiting', 'idle'])

async function git($, args: string[]) {
  const ran = await $.process.run(['git', ...args], { timeoutMs: 15000 })
  return { isOk: ran.exitCode === 0, out: ran.stdout.trim(), err: ran.stderr.trim() }
}

async function baseBranch($): Promise<string> {
  const origin = await git($, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
  if (origin.isOk && origin.out) return origin.out
  for (const name of ['main', 'master']) {
    if ((await git($, ['rev-parse', '--verify', '--quiet', name])).isOk) return name
  }
  return 'main'
}

async function gitInfo($): Promise<GitInfo | string> {
  if (!(await git($, ['rev-parse', '--is-inside-work-tree'])).isOk) {
    return '현재 폴더는 git 저장소가 아닙니다.'
  }
  const base = await baseBranch($)
  const branch = (await git($, ['branch', '--show-current'])).out || 'HEAD'
  const commits = await git($, ['log', '--oneline', '--no-merges', `${base}..HEAD`])
  const stat = await git($, ['diff', '--stat', `${base}...HEAD`])
  const status = await git($, ['status', '--short'])
  return { branch, base, commits: commits.out, stat: stat.out, status: status.out }
}

async function readTasks($): Promise<Task[] | undefined> {
  try {
    return parseTasks(await $.fs.read(TASK_FILE))
  } catch {
    return undefined
  }
}

async function runWorktree($, args: string): Promise<string> {
  const branch = args.trim()
  if (branch === '') {
    const list = await git($, ['worktree', 'list'])
    return list.isOk ? list.out : `git worktree list 실패: ${list.err}`
  }
  if (!isValidBranch(branch)) return `브랜치 이름이 올바르지 않습니다: ${branch}`

  const root = await git($, ['rev-parse', '--show-toplevel'])
  if (!root.isOk) return '현재 폴더는 git 저장소가 아닙니다.'
  const path = worktreePath(root.out, branch)
  const exists = (await git($, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])).isOk
  const added = await git(
    $,
    exists ? ['worktree', 'add', path, branch] : ['worktree', 'add', '-b', branch, path],
  )
  if (!added.isOk) return `워크트리 생성 실패: ${added.err}`
  return `워크트리를 만들었습니다: ${path} (브랜치 ${branch}${exists ? '' : ', 새로 생성'}). 이 폴더로 새 세션을 열어 작업하세요.`
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const commands = [
      { name: 'hub', description: 'Work Hub 패널(작업 목록·에이전트)을 연다' },
      { name: 'worktree', description: 'git 워크트리 생성(인자: 브랜치명) 또는 목록(인자 없음)', argumentHint: '[branch]' },
      { name: 'pr-template', description: '현재 브랜치 커밋·변경 파일로 PR 템플릿을 출력한다' },
      { name: 'pr', description: 'PR 템플릿을 바탕으로 Claude가 PR 본문을 작성한다' },
    ]
    for (const command of commands) await $.command.register(command)
    $.clock.every(REFRESH_MS, () => $.ui.invalidate('ui.render'))

    return next(e)
  })

  on('command.run', { command: 'hub' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: 'Work Hub 패널을 열었습니다.' }
  })

  on('command.run', { command: 'worktree' }, async ($, e) => ({
    text: await runWorktree($, e.args),
  }))

  on('command.run', { command: 'pr-template' }, async $ => {
    const info = await gitInfo($)
    return { text: typeof info === 'string' ? info : buildPrTemplate(info) }
  })

  on('command.run', { command: 'pr' }, async $ => {
    const info = await gitInfo($)
    if (typeof info === 'string') return { text: info }
    await $.prompt.submit({ text: buildPrPrompt(info) })
    return { text: `${info.branch} → ${info.base} PR 본문 작성을 요청했습니다.` }
  })

  on('tool.call', async ($, e, next) => {
    const target = sensitiveTarget(String(e.tool), e as unknown as Record<string, unknown>)
    if (target === undefined) return next(e)
    const answer = await $.ui.ask(
      `${e.tool}이(가) 보안 파일 ${target}에 접근·변경하려고 합니다. 허용할까요?`,
      { header: '보안 파일', options: [ALLOW, BLOCK] },
    )
    return answer === ALLOW ? next(e) : { deny: `work-hub: ${target} 접근을 차단했습니다.` }
  }).catch(($, e, next) =>
    next.called ? next(e) : { deny: 'work-hub: 보안 파일 확인을 받지 못해 차단했습니다.' },
  )

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const tasks = await readTasks($)
    const agents = await $.agent.list()
    const viewing = e.props.view?.agentId
    const fill = (text: string) => async () => {
      const filled = await $.prompt.fill({ text }).catch(() => ({ isFilled: false }))
      if (!filled.isFilled) $.ui.toast('프롬프트 입력창에 넣지 못했습니다. 열린 대화상자를 닫고 다시 눌러주세요.')
    }
    const remaining = (tasks ?? []).filter(task => !task.isDone)
    const nextTask = remaining[0]

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text bold>작업 ({TASK_FILE})</Text>
          {tasks === undefined && <Text dimColor>작업 목록 파일이 없습니다.</Text>}
          {tasks === undefined && (
            <Button key="create-tasks" plain onPress={fill(CREATE_TASKS_PROMPT)}>
              + 작업 목록 만들기
            </Button>
          )}
          {tasks !== undefined && (
            <Button key="overview" plain onPress={fill(OVERVIEW_PROMPT)}>
              {`진행 ${tasks.length - remaining.length}/${tasks.length} · 전체 현황 보기`}
            </Button>
          )}
          {nextTask && (
            <Button key="next-task" plain onPress={fill(taskPrompt(nextTask))}>
              {`▶ 다음: ${nextTask.text}`}
            </Button>
          )}
          {remaining.slice(1).map((task, i) => (
            <Button key={`task-${i}`} plain onPress={fill(taskPrompt(task))}>
              {`· ${task.text}`}
            </Button>
          ))}
          {tasks !== undefined && remaining.length === 0 && <Text dimColor>남은 작업이 없습니다.</Text>}
        </Box>
        <Box flexDirection="column">
          <Text bold>병렬 에이전트 ({agents.filter(a => ACTIVE_AGENT.has(a.status)).length} 진행 중)</Text>
          {agents.length === 0 && <Text dimColor>이 세션에서 실행된 에이전트가 없습니다.</Text>}
          {agents.map(agent => (
            <Button
              key={`agent-${agent.id}`}
              plain
              onPress={async () => {
                const moved = await $.ui.view({ agentId: agent.id })
                if (moved.deny) $.ui.toast(`대화를 열 수 없습니다: ${moved.deny}`)
              }}
            >
              {`${agent.id === viewing ? '● ' : ''}${agent.description || agent.type} · ${agent.status}`}
            </Button>
          ))}
          {viewing && (
            <Button key="main-view" plain onPress={() => void $.ui.view({})}>
              ← 메인 대화로
            </Button>
          )}
        </Box>
      </Box>
    )
  })
}
