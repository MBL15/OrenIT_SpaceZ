import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch, parseErrorDetail } from '../api.js'
import { useAuth } from '../AuthContext.jsx'
import './ClassPage.css'
import './AdminPage.css'

const ROLES = [
  { value: 'child', label: 'Ученик' },
  { value: 'teacher', label: 'Учитель' },
  { value: 'admin', label: 'Администратор' },
]

const ROLE_FILTER_OPTIONS = [
  { value: 'all', label: 'Все' },
  { value: 'child', label: 'Ученики' },
  { value: 'teacher', label: 'Учителя' },
  { value: 'admin', label: 'Админы' },
]

function roleLabel(role) {
  return ROLES.find((r) => r.value === role)?.label ?? role
}

function parseUsersPayload(data) {
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.users)) return data.users
  if (data && Array.isArray(data.items)) return data.items
  return []
}

async function readJsonResponse(res) {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function UserRoleRow({ row, currentUserId, onUpdated }) {
  const [role, setRole] = useState(row.role || 'child')
  const [saving, setSaving] = useState(false)
  const [localErr, setLocalErr] = useState('')

  useEffect(() => {
    setRole(row.role || 'child')
    setLocalErr('')
  }, [row.id, row.role])

  const dirty = role !== (row.role || 'child')
  const blockSelfDemote =
    row.id === currentUserId && row.role === 'admin' && role !== 'admin'

  const save = async () => {
    setLocalErr('')
    setSaving(true)
    try {
      const res = await apiFetch(`/admin/users/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLocalErr(parseErrorDetail(data))
        return
      }
      onUpdated()
    } finally {
      setSaving(false)
    }
  }

  return (
    <tr>
      <td className="ap-td-num">{row.id}</td>
      <td>
        <span className="ap-login">{row.login ?? '—'}</span>
      </td>
      <td>{row.display_name?.trim() ? row.display_name : '—'}</td>
      <td>
        <span className={`ap-badge ap-badge--${row.role || 'child'}`}>{roleLabel(row.role)}</span>
      </td>
      <td>
        <div className="ap-role-cell">
          <select
            className="ap-role-select space-input"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            aria-label={`Новая роль: ${row.login ?? row.id}`}
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          {blockSelfDemote ? (
            <p className="cp-teacher-muted ap-role-hint">Нельзя снять с себя роль администратора.</p>
          ) : null}
          {localErr ? <p className="cp-teacher-err ap-role-hint">{localErr}</p> : null}
        </div>
      </td>
      <td className="ap-td-actions">
        <button
          type="button"
          className="space-btn space-btn--primary ap-save-btn"
          disabled={!dirty || saving || blockSelfDemote}
          onClick={save}
        >
          {saving ? '…' : 'Сохранить'}
        </button>
      </td>
    </tr>
  )
}

export default function AdminPage() {
  const { user } = useAuth()
  const [users, setUsers] = useState([])
  const [stats, setStats] = useState(null)
  const [loadErr, setLoadErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')

  const loadAll = useCallback(async () => {
    setLoadErr('')
    setLoading(true)
    try {
      const [uRes, sRes] = await Promise.all([apiFetch('/admin/users'), apiFetch('/admin/stats')])
      const uData = await readJsonResponse(uRes)
      const sData = await readJsonResponse(sRes)

      if (!uRes.ok) {
        setUsers([])
        setStats(null)
        setLoadErr(
          uData && typeof uData === 'object'
            ? parseErrorDetail(uData)
            : `Пользователи: ошибка ${uRes.status}. Проверьте API и VITE_API_BASE.`,
        )
        return
      }
      if (!sRes.ok) {
        setUsers(parseUsersPayload(uData))
        setStats(null)
        setLoadErr(
          sData && typeof sData === 'object'
            ? `Статистика: ${parseErrorDetail(sData)}`
            : `Статистика недоступна (${sRes.status}). Обновите бэкенд.`,
        )
        return
      }

      setUsers(parseUsersPayload(uData))
      setStats(
        sData && typeof sData === 'object'
          ? {
              users_total: sData.users_total ?? 0,
              users_child: sData.users_child ?? 0,
              users_teacher: sData.users_teacher ?? 0,
              users_admin: sData.users_admin ?? 0,
              classes_total: sData.classes_total ?? 0,
              class_memberships: sData.class_memberships ?? 0,
              lessons_total: sData.lessons_total ?? 0,
              task_attempts_total: sData.task_attempts_total ?? 0,
            }
          : null,
      )
    } catch (e) {
      setUsers([])
      setStats(null)
      const msg = e instanceof Error ? e.message : String(e)
      setLoadErr(
        `Не удалось загрузить данные (${msg}). Запустите бэкенд (порт 8000) и проверьте прокси /admin.`,
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const filteredUsers = useMemo(() => {
    let list = users
    if (roleFilter !== 'all') {
      list = list.filter((u) => (u.role || 'child') === roleFilter)
    }
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter((u) => {
      const idStr = String(u.id)
      const login = (u.login || '').toLowerCase()
      const name = (u.display_name || '').toLowerCase()
      return idStr.includes(q) || login.includes(q) || name.includes(q)
    })
  }, [users, search, roleFilter])

  const statCards = stats
    ? [
        { key: 'users', value: stats.users_total, label: 'Всего пользователей', sub: 'в системе' },
        {
          key: 'roles',
          value: `${stats.users_child} / ${stats.users_teacher} / ${stats.users_admin}`,
          label: 'Ученики · Учителя · Админы',
          sub: 'по ролям',
        },
        { key: 'classes', value: stats.classes_total, label: 'Классов', sub: 'создано' },
        {
          key: 'members',
          value: stats.class_memberships,
          label: 'Записей в классы',
          sub: 'связей ученик–класс',
        },
        { key: 'lessons', value: stats.lessons_total, label: 'Уроков', sub: 'в каталоге' },
        {
          key: 'attempts',
          value: stats.task_attempts_total,
          label: 'Попыток задач',
          sub: 'всего отправок',
        },
      ]
    : []

  return (
    <div className="cp-wrap">
      <div className="cp-panel ap-panel">
        <header className="ap-hero">
          <Link className="cp-back" to="/app">
            ← К разделам
          </Link>
          <div className="ap-hero-text">
            <p className="ap-kicker">Управление платформой</p>
            <h1 className="cp-title ap-hero-title">Админ-панель</h1>
            <p className="cp-sub ap-hero-sub">
              Статистика по базе, список пользователей и смена ролей. Роль <strong>admin</strong> через
              регистрацию не выдаётся — только здесь или в БД.
            </p>
          </div>
          <button
            type="button"
            className="space-btn space-btn--outline ap-refresh"
            onClick={loadAll}
            disabled={loading}
          >
            {loading ? 'Обновление…' : 'Обновить всё'}
          </button>
        </header>

        <div className="ap-body">
          {loadErr ? (
            <div className="cp-teacher-alerts ap-alert" role="alert">
              <p className="cp-teacher-err">{loadErr}</p>
            </div>
          ) : null}

          <section className="ap-section" aria-labelledby="ap-stats-heading">
            <h2 id="ap-stats-heading" className="ap-section-title">
              Статистика
            </h2>
            {loading && !stats ? (
              <p className="cp-teacher-muted ap-muted-block">Загрузка показателей…</p>
            ) : null}
            {!loading && stats ? (
              <div className="ap-stats-grid">
                {statCards.map((c) => (
                  <article key={c.key} className="ap-stat-card">
                    <p className="ap-stat-value">{c.value}</p>
                    <p className="ap-stat-label">{c.label}</p>
                    <p className="ap-stat-sub">{c.sub}</p>
                  </article>
                ))}
              </div>
            ) : null}
            {!loading && !stats && !loadErr ? (
              <p className="cp-teacher-muted ap-muted-block">Показатели не загружены.</p>
            ) : null}
          </section>

          <section className="ap-section" aria-labelledby="ap-users-heading">
            <div className="ap-section-head">
              <h2 id="ap-users-heading" className="ap-section-title">
                Пользователи
                {users.length > 0 ? (
                  <span className="ap-count-badge">
                    {filteredUsers.length === users.length
                      ? users.length
                      : `${filteredUsers.length} из ${users.length}`}
                  </span>
                ) : null}
              </h2>
            </div>

            <div className="ap-toolbar">
              <label className="ap-search-label">
                <span className="ap-search-hint">Поиск</span>
                <input
                  type="search"
                  className="space-input ap-search-input"
                  placeholder="ID, логин или имя"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoComplete="off"
                />
              </label>
              <div className="ap-role-filters" role="group" aria-label="Фильтр по роли">
                {ROLE_FILTER_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`ap-chip ${roleFilter === opt.value ? 'ap-chip--on' : ''}`}
                    onClick={() => setRoleFilter(opt.value)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {loading && users.length === 0 ? (
              <p className="cp-teacher-muted ap-muted-block">Загрузка списка…</p>
            ) : null}

            {!loading && users.length === 0 && !loadErr ? (
              <p className="cp-teacher-muted ap-muted-block">Пользователей нет или данные не пришли.</p>
            ) : null}

            {!loading && users.length > 0 && filteredUsers.length === 0 ? (
              <p className="cp-teacher-muted ap-muted-block">Никого не найдено по фильтру.</p>
            ) : null}

            {filteredUsers.length > 0 ? (
              <div className="ap-table-wrap">
                <table className="ap-users-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Логин</th>
                      <th>Имя</th>
                      <th>Текущая роль</th>
                      <th>Новая роль</th>
                      <th className="ap-th-actions">Действие</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((row) => (
                      <UserRoleRow
                        key={row.id}
                        row={row}
                        currentUserId={user?.id}
                        onUpdated={loadAll}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  )
}
