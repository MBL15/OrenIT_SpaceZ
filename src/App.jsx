import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import LandingPage from './pages/LandingPage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import ClassPage from './pages/ClassPage.jsx'
import TeacherCabinetPage from './pages/TeacherCabinetPage.jsx'
import ProfilePage from './pages/ProfilePage.jsx'
import LessonAsgardPage from './pages/LessonAsgardPage.jsx'
import ParentsPage from './pages/ParentsPage.jsx'
import AssignmentsPage from './pages/AssignmentsPage.jsx'
import './App.css'

function ProtectedRoute({ children }) {
  const { user } = useAuth()
  const loc = useLocation()
  if (!user) {
    return <Navigate to="/login" replace state={{ from: loc }} />
  }
  return children
}

function GuestRoute({ children }) {
  const { user } = useAuth()
  if (user) return <Navigate to="/app" replace />
  return children
}

function App() {
  return (
    <div className="space-root">
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route
          path="/login"
          element={
            <GuestRoute>
              <LoginPage />
            </GuestRoute>
          }
        />
        <Route
          path="/register"
          element={
            <GuestRoute>
              <RegisterPage />
            </GuestRoute>
          }
        />
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/class"
          element={
            <ProtectedRoute>
              <ClassPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/teacher"
          element={
            <ProtectedRoute>
              <TeacherCabinetPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/assignments"
          element={
            <ProtectedRoute>
              <AssignmentsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/parents"
          element={
            <ProtectedRoute>
              <ParentsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/lesson/asgard"
          element={
            <ProtectedRoute>
              <LessonAsgardPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

export default App
