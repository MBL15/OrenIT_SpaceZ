import { useAuth } from '../AuthContext.jsx'
import MainSite from '../components/MainSite.jsx'

export default function DashboardPage() {
  const { user, logout } = useAuth()

  return <MainSite user={user} onLogout={logout} />
}
