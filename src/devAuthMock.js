/**
 * Только в dev (import.meta.env.DEV) и при VITE_DEV_MOCK_ADMIN=true:
 * вход тестового админа без бэкенда и моки /admin/users, /teacher/*, /lessons.
 */
export const DEV_MOCK_ADMIN_LOGIN = 'admin@test.local'
export const DEV_MOCK_ADMIN_PASSWORD = 'admin123'
export const DEV_MOCK_TOKEN = '__orenit_dev_mock_admin__'

export function isDevMockAdminEnabled() {
  return Boolean(import.meta.env.DEV && import.meta.env.VITE_DEV_MOCK_ADMIN === 'true')
}

export function matchDevMockAdmin(login, password) {
  return (
    isDevMockAdminEnabled() &&
    login.trim() === DEV_MOCK_ADMIN_LOGIN &&
    password === DEV_MOCK_ADMIN_PASSWORD
  )
}

export function getMockAdminUser() {
  return {
    id: 999,
    login: DEV_MOCK_ADMIN_LOGIN,
    display_name: 'Тестовый админ',
    role: 'admin',
    avatar_id: null,
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

let mockUsers = [
  { id: 1, login: 'student_demo', display_name: 'Демо-ученик', role: 'child', avatar_id: null },
  { id: 2, login: 'teacher_demo', display_name: 'Демо-учитель', role: 'teacher', avatar_id: null },
  { ...getMockAdminUser(), avatar_id: null },
]

const mockClassStore = { nextId: 1, classes: [] }

/** Демо-уроки для GET /lessons (кабинет учителя в dev) */
const mockLessons = [
  {
    id: 1,
    title: 'Асгард',
    description: 'Вводный модуль курса',
    order_index: 0,
  },
]
const mockTasksByLessonId = {
  1: [{ id: 101, title: 'Практика: старт', lesson_id: 1 }],
}

function lessonById(id) {
  return mockLessons.find((l) => l.id === id) ?? null
}

function lessonDetailPayload(id) {
  const l = lessonById(id)
  if (!l) return null
  const task_templates = (mockTasksByLessonId[id] || []).map((t) => ({ ...t }))
  return { ...l, task_templates }
}

export function devMockApiFetch(path, init = {}) {
  const method = (init.method || 'GET').toUpperCase()
  const url = path.split('?')[0]

  if (url === '/admin/users' && method === 'GET') {
    return json(mockUsers.map((u) => ({ ...u })))
  }

  const patchUser = url.match(/^\/admin\/users\/(\d+)$/)
  if (patchUser && method === 'PATCH') {
    const id = Number(patchUser[1])
    let body = {}
    try {
      body = JSON.parse(init.body || '{}')
    } catch {
      /* ignore */
    }
    const idx = mockUsers.findIndex((u) => u.id === id)
    if (idx === -1) return json({ detail: 'Пользователь не найден' }, 404)
    if (body.role === 'child' || body.role === 'teacher' || body.role === 'admin') {
      mockUsers[idx] = { ...mockUsers[idx], role: body.role }
    }
    return json({ ...mockUsers[idx] })
  }

  if (url === '/teacher/classes' && method === 'GET') {
    return json([...mockClassStore.classes])
  }
  if (url === '/teacher/classes' && method === 'POST') {
    let body = {}
    try {
      body = JSON.parse(init.body || '{}')
    } catch {
      /* ignore */
    }
    const c = { id: mockClassStore.nextId++, name: body.name || 'Класс' }
    mockClassStore.classes.push(c)
    return json(c)
  }
  if (url.match(/^\/teacher\/classes\/\d+\/invite$/) && method === 'GET') {
    return json({ invite_code: 'DEVMOCK', invite_token: 'mock-invite-token-dev' })
  }
  if (url.match(/^\/teacher\/classes\/\d+\/invite\/refresh$/) && method === 'POST') {
    return json({ invite_code: 'DEVMOK2', invite_token: 'mock-invite-token-refresh' })
  }
  if (url.match(/^\/teacher\/classes\/\d+\/students$/)) {
    return json([])
  }
  if (url.match(/^\/teacher\/classes\/\d+\/assignments$/)) {
    if (method === 'GET') return json([])
    if (method === 'POST') return json({ id: 1 })
  }
  if (url === '/lessons') {
    return json(mockLessons.map(({ id, title }) => ({ id, title })))
  }
  const pubLesson = url.match(/^\/lessons\/(\d+)$/)
  if (pubLesson && method === 'GET') {
    const id = Number(pubLesson[1])
    const payload = lessonDetailPayload(id)
    if (!payload) return json({ detail: 'Урок не найден' }, 404)
    return json(payload)
  }

  return json({ detail: `Mock: запрос не эмулирован (${method} ${path})` }, 404)
}
