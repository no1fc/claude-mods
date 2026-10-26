import { expect, test } from 'claude-code/testing'

import {
  buildPrTemplate,
  isValidBranch,
  parseTasks,
  sensitiveTarget,
  worktreePath,
} from './lib'

const PANE = {
  plugin: 'work-hub',
  component: 'Pane',
  requestId: 'work-hub',
  props: {
    title: 'Work Hub',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const TASKS = '# 작업\n- [x] 요구사항 정리\n- [ ] 패널 구현\n* [ ] 문서 작성\n일반 줄\n'

test('lib: tasks, sensitive files, branches, PR template', async () => {
  expect(parseTasks(TASKS)).toEqual([
    { text: '요구사항 정리', isDone: true },
    { text: '패널 구현', isDone: false },
    { text: '문서 작성', isDone: false },
  ])

  expect(sensitiveTarget('Edit', { file_path: 'C:\\app\\.env' })).toBe('C:\\app\\.env')
  expect(sensitiveTarget('Write', { file_path: 'config/.env.production' })).toBe('config/.env.production')
  expect(sensitiveTarget('Edit', { file_path: '.env.example' })).toBeUndefined()
  expect(sensitiveTarget('Edit', { file_path: 'src/environment.ts' })).toBeUndefined()
  expect(sensitiveTarget('Write', { file_path: 'certs/server.pem' })).toBe('certs/server.pem')
  expect(sensitiveTarget('Bash', { command: 'echo KEY=1 >> .env' })).toBe('.env')
  expect(sensitiveTarget('PowerShell', { command: 'Get-Content "secrets.json"' })).toBe('"secrets.json"')
  expect(sensitiveTarget('Bash', { command: 'npm run env-check' })).toBeUndefined()
  expect(sensitiveTarget('Read', { file_path: '.env' })).toBeUndefined()

  expect(isValidBranch('feat/work-hub')).toBe(true)
  expect(isValidBranch('-delete')).toBe(false)
  expect(isValidBranch('a..b')).toBe(false)
  expect(worktreePath('C:/repo/app', 'feat/x')).toBe('C:/repo/app-feat-x')

  const template = buildPrTemplate({ branch: 'feat/x', base: 'main', commits: 'abc fix', stat: '1 file', status: '' })
  expect(template).toContain('- abc fix')
  expect(template).toContain('## Test plan')
  expect(template).toContain('Generated with [Claude Code]')
})

test('pane lists tasks and fills the prompt on press, on every surface', async ($, on) => {
  let filled = ''
  on('fs.read', () => ({ value: TASKS }))
  on('agent.list', () => ({ value: [] }))
  on('prompt.fill', (_, e) => {
    filled = e.text
    return { isFilled: true }
  })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ key: 'overview' }))?.text).toContain('진행 1/3')
    expect((await ui.find({ key: 'next-task' }))?.text).toContain('패널 구현')
    expect((await ui.find({ key: 'task-0' }))?.text).toContain('문서 작성')
    await ui.press({ key: 'next-task' })
    expect(filled).toContain('"패널 구현"')
    await ui.unmount()
  }
})

test('editing .env asks first and is blocked unless allowed', async ($, on) => {
  let answer = '차단'
  let edits = 0
  on('tool.call', { tool: 'AskUserQuestion' }, (_, e) => ({
    result: { questions: e.questions, answers: { [e.questions[0].question]: answer } },
  }))
  on('tool.call', { tool: 'Edit' }, () => {
    edits += 1
    return { result: {} }
  })
  const edit = { tool: 'Edit', file_path: '.env', old_string: 'A=1', new_string: 'A=2', replace_all: false } as const

  const blocked = await $.tool.call(edit)
  expect(blocked.deny ?? blocked.text).toContain('차단')
  expect(edits).toBe(0)

  answer = '허용'
  await $.tool.call(edit)
  expect(edits).toBe(1)
})
