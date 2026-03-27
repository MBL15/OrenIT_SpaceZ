import { useCallback, useEffect, useState } from 'react'
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

function parseUsersPayload(data) {
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.users)) return data.users
  if (data && Array.isArray(data.items)) return data.items
  return []
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

  const patchRole = async (nextRole) => {
    setLocalErr('')
    setSaving(true)
    try {
      const res = await apiFetch(`/admin/users/${row.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: nextRole }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setLocalErr(parseErrorDetail(data))
        return
      }
      setRole(nextRole)
      onUpdated()
    } finally {
      setSaving(false)
    }
  }

  const save = async () => {
    await patchRole(role)
  }

  const promoteToAdmin = async () => {
    await patchRole('admin')
  }

  const canPromoteToAdmin = row.role !== 'admin'

  return (
    <tr>
      <td>{row.id}</td>
      <td>{row.login ?? '—'}</td>
      <td>{row.display_name?.trim() ? row.display_name : '—'}</td>
      <td>
        <select
          className="ap-role-select space-input"
          value={role}
          onChange={(e) => setRole(e.target.value)}
          aria-label={`Роль: ${row.login ?? row.id}`}
        >
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        {blockSelfDemote ? (
          <p className="cp-teacher-muted" style={{ margin: '6px 0 0' }}>
            Нельзя снять с себя роль admin.
          </p>
        ) : null}
        {localErr ? <p className="cp-teacher-err" style={{ margin: '6px 0 0' }}>{localErr}</p> : null}
      </td>
      <td className="ap-user-actions-cell">
        <div className="ap-user-actions">
          {canPromoteToAdmin ? (
            <button
              type="button"
              className="space-btn space-btn--outline"
              style={{ padding: '8px 12px', fontSize: 13 }}
              disabled={saving}
              onClick={promoteToAdmin}
            >
              {saving ? '…' : 'Назначить админом'}
            </button>
          ) : null}
          <button
            type="button"
            className="space-btn space-btn--primary"
            style={{ padding: '8px 14px', fontSize: 13 }}
            disabled={!dirty || saving || blockSelfDemote}
            onClick={save}
          >
            {saving ? '…' : 'Сохранить'}
          </button>
        </div>
      </td>
    </tr>
  )
}

export default function AdminPage() {
  const { user } = useAuth()
  const [users, setUsers] = useState([])
  const [loadErr, setLoadErr] = useState('')
  const [loading, setLoading] = useState(true)

  const [adminClasses, setAdminClasses] = useState([])
  const [classesErr, setClassesErr] = useState('')
  const [loadingClasses, setLoadingClasses] = useState(false)
  const [selectedClassId, setSelectedClassId] = useState('')
  const [assignments, setAssignments] = useState([])
  const [assignmentsErr, setAssignmentsErr] = useState('')
  const [loadingAssignments, setLoadingAssignments] = useState(false)
  const [deletingAssignmentId, setDeletingAssignmentId] = useState(null)
  const [assignBanner, setAssignBanner] = useState('')

  const load = useCallback(async () => {
    setLoadErr('')
    setLoading(true)
    try {
      const res = await apiFetch('/admin/users')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setUsers([])
        setLoadErr(parseErrorDetail(data))
        return
      }
      setUsers(parseUsersPayload(data))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const loadAdminClasses = useCallback(async () => {
    setClassesErr('')
    setLoadingClasses(true)
    try {
      const res = await apiFetch('/admin/classes')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAdminClasses([])
        setClassesErr(parseErrorDetail(data))
        return
      }
      setAdminClasses(Array.isArray(data) ? data : [])
    } finally {
      setLoadingClasses(false)
    }
  }, [])

  useEffect(() => {
    loadAdminClasses()
  }, [loadAdminClasses])

  const loadAssignmentsForClass = useCallback(async (classId) => {
    if (!classId) {
      setAssignments([])
      return
    }
    setAssignmentsErr('')
    setLoadingAssignments(true)
    try {
      const res = await apiFetch(`/admin/classes/${classId}/assignments`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAssignments([])
        setAssignmentsErr(parseErrorDetail(data))
        return
      }
      setAssignments(Array.isArray(data) ? data : [])
    } finally {
      setLoadingAssignments(false)
    }
  }, [])

  useEffect(() => {
    loadAssignmentsForClass(selectedClassId)
  }, [selectedClassId, loadAssignmentsForClass])

  const deleteClassAssignment = async (classId, assignmentId) => {
    if (
      !window.confirm(
        'Удалить это классовое задание? Его не будет видно ученикам этого класса.',
      )
    ) {
      return
    }
    setAssignBanner('')
    setAssignmentsErr('')
    setDeletingAssignmentId(assignmentId)
    try {
      const res = await apiFetch(
        `/teacher/classes/${classId}/assignments/${assignmentId}`,
        { method: 'DELETE' },
      )
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setAssignmentsErr(parseErrorDetail(data))
        return
      }
      setAssignBanner('Назначение удалено')
      await loadAssignmentsForClass(classId)
    } finally {
      setDeletingAssignmentId(null)
    }
  }

  return (
    <div className="cp-wrap">
      <div className="cp-panel">
        <header className="cp-teacher-head">
          <Link className="cp-back" to="/app">
            ← К разделам
          </Link>
          <h1 className="cp-title">Админ-панель</h1>
          <p className="cp-sub">
            Смена ролей, назначение администраторов и управление назначениями в чужих классах. Через
            регистрацию роль <strong>admin</strong> недоступна — её выдают здесь или на сервере.
          </p>
        </header>

        <div className="cp-main ap-admin-body">
          <div className="cp-teacher-alerts">
            {loadErr ? (
              <p className="cp-teacher-err" role="alert">
                {loadErr}
              </p>
            ) : null}
          </div>

          <section className="cp-teacher-block" aria-label="Пользователи">
            <div className="ap-toolbar">
              <h2 className="cp-teacher-h2" style={{ margin: 0 }}>
                Пользователи
              </h2>
              <button
                type="button"
                className="space-btn space-btn--primary"
                style={{ padding: '8px 16px', fontSize: 14 }}
                onClick={load}
                disabled={loading}
              >
                {loading ? 'Загрузка…' : 'Обновить'}
              </button>
            </div>

            {loading && users.length === 0 ? (
              <p className="cp-teacher-muted" style={{ marginTop: 16 }}>
                Загрузка списка…
              </p>
            ) : null}

            {!loading && users.length === 0 && !loadErr ? (
              <p className="cp-teacher-muted" style={{ marginTop: 16 }}>
                Список пуст или ответ сервера в неожиданном формате.
              </p>
            ) : null}

            {users.length > 0 ? (
              <div className="ap-table-wrap">
                <table className="ap-users-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Логин</th>
                      <th>Имя</th>
                      <th>Роль</th>
                      <th>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((row) => (
                      <UserRoleRow
                        key={row.id}
                        row={row}
                        currentUserId={user?.id}
                        onUpdated={load}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="cp-teacher-block ap-assignments-section" aria-label="Классовые задания">
            <div className="ap-toolbar">
              <h2 className="cp-teacher-h2" style={{ margin: 0 }}>
                Классовые задания (все классы)
              </h2>
              <button
                type="button"
                className="space-btn space-btn--outline"
                style={{ padding: '8px 16px', fontSize: 14 }}
                onClick={() => {
                  loadAdminClasses()
                  if (selectedClassId) loadAssignmentsForClass(selectedClassId)
                }}
                disabled={loadingClasses}
              >
                {loadingClasses ? 'Загрузка…' : 'Обновить список классов'}
              </button>
            </div>
            <p className="cp-teacher-muted" style={{ marginTop: 0 }}>
              Выберите класс — отобразятся назначенные учителем задания. Удаление доступно для любого
              класса на платформе.
            </p>
            {classesErr ? (
              <p className="cp-teacher-err" role="alert">
                {classesErr}
              </p>
            ) : null}
            {assignBanner ? <p className="cp-teacher-banner">{assignBanner}</p> : null}
            {assignmentsErr ? (
              <p className="cp-teacher-err" role="alert">
                {assignmentsErr}
              </p>
            ) : null}

            <label className="ap-class-pick-label">
              <span className="ap-class-pick-caption">Класс</span>
              <select
                className="space-input ap-class-pick-select"
                value={selectedClassId}
                onChange={(e) => {
                  setAssignBanner('')
                  setSelectedClassId(e.target.value)
                }}
                disabled={loadingClasses && adminClasses.length === 0}
              >
                <option value="">— выберите класс —</option>
                {adminClasses.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.name} (учитель: {c.teacher_display_name || c.teacher_login || c.teacher_id})
                  </option>
                ))}
              </select>
            </label>

            {!selectedClassId ? (
              <p className="cp-teacher-muted" style={{ marginTop: 12 }}>
                {adminClasses.length === 0 && !loadingClasses
                  ? 'Классов пока нет.'
                  : 'Выберите класс, чтобы увидеть назначения.'}
              </p>
            ) : loadingAssignments ? (
              <p className="cp-teacher-muted" style={{ marginTop: 12 }}>
                Загрузка назначений…
              </p>
            ) : assignments.length === 0 ? (
              <p className="cp-teacher-muted" style={{ marginTop: 12 }}>
                В этом классе нет назначенных заданий.
              </p>
            ) : (
              <div className="ap-table-wrap ap-assignments-table-wrap">
                <table className="ap-users-table ap-assignments-table">
                  <thead>
                    <tr>
                      <th>Урок / задача</th>
                      <th>Награды</th>
                      <th>Комментарий</th>
                      <th>Создано</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {assignments.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <span className="ap-assign-lesson">{a.lesson_title}</span>
                          {a.task_title ? (
                            <span className="ap-assign-task"> — {a.task_title}</span>
                          ) : null}
                          <div className="ap-assign-ids">
                            id назначения {a.id}, шаблон {a.task_template_id}
                          </div>
                        </td>
                        <td className="ap-assign-nums">
                          +{a.reward_coins ?? 0} мон. / +{a.reward_xp ?? 0} XP
                        </td>
                        <td>{a.note?.trim() ? a.note : '—'}</td>
                        <td className="ap-assign-date">{a.created_at || '—'}</td>
                        <td className="ap-assign-actions">
                          <button
                            type="button"
                            className="space-btn ap-assign-delete"
                            disabled={deletingAssignmentId === a.id}
                            onClick={() =>
                              deleteClassAssignment(Number(selectedClassId), a.id)
                            }
                          >
                            {deletingAssignmentId === a.id ? '…' : 'Удалить'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
