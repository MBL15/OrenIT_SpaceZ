import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext.jsx'
import MainSite from '../components/MainSite.jsx'
import ParentsGateOverlay from '../components/ParentsGateOverlay.jsx'
import { isParentUnlocked } from '../lib/parentUnlock.js'

export default function DashboardPage() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [parentsGateOpen, setParentsGateOpen] = useState(false)

  const openParents = useCallback(() => {
    if (isParentUnlocked()) {
      navigate('/app/parents')
    } else {
      setParentsGateOpen(true)
    }
  }, [navigate])

  useEffect(() => {
    if (location.state?.openParents) {
      if (isParentUnlocked()) {
        navigate('/app/parents', { replace: true, state: {} })
      } else {
        setParentsGateOpen(true)
        navigate('/app', { replace: true, state: {} })
      }
    }
  }, [location.state, navigate])

  return (
    <>
      <MainSite user={user} onLogout={logout} onOpenParents={openParents} />
      {parentsGateOpen ? (
        <ParentsGateOverlay
          onClose={() => setParentsGateOpen(false)}
          onVerified={() => {
            setParentsGateOpen(false)
            navigate('/app/parents')
          }}
        />
      ) : null}
    </>
  )
}
