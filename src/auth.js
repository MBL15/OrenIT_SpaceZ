const USERS_KEY = 'spaceedu-users'
const SESSION_KEY = 'spaceedu-session'

function getUsers() {
  try {
    const raw = localStorage.getItem(USERS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

/** Демо: пароли в localStorage только для прототипа, не для продакшена */
export function registerUser({ email, password, name }) {
  const users = getUsers()
  if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    return { ok: false, error: 'Пользователь с таким email уже зарегистрирован' }
  }
  users.push({
    email: email.trim().toLowerCase(),
    password,
    name: name.trim(),
  })
  saveUsers(users)
  return { ok: true }
}

export function loginUser(email, password) {
  const users = getUsers()
  const u = users.find(
    (x) =>
      x.email === email.trim().toLowerCase() && x.password === password,
  )
  if (!u) return { ok: false, error: 'Неверный email или пароль' }
  const session = { email: u.email, name: u.name }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  return { ok: true, user: session }
}

export function getSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setSession(user) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user))
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}
