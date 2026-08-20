import { useState, useEffect } from 'react'
import { StoreProvider } from './lib/store'
import LittixApp from './littix/App'
import AdminDashboard from './admin-dash/App'
import PRApp from './pr-portal/PRApp'
import LoginPage from './components/LoginPage'
import PublicWebsite from './components/PublicWebsite'

function MainAppShell() {
  const [path, setPath] = useState(window.location.pathname)
  const [userSession, setUserSession] = useState<any>(() => {
    try {
      const saved = sessionStorage.getItem('littx_user')
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })

  useEffect(() => {
    const handlePopState = () => {
      setPath(window.location.pathname)
    }
    window.addEventListener('popstate', handlePopState)
    
    const interval = setInterval(() => {
      if (window.location.pathname !== path) {
        setPath(window.location.pathname)
      }
    }, 200)

    return () => {
      window.removeEventListener('popstate', handlePopState)
      clearInterval(interval)
    }
  }, [path])

  const handleLoginRedirect = (session: any) => {
    setUserSession(session)
    if (session.role === 'pr') {
      window.history.pushState({}, '', '/pr')
    } else if (session.role === 'master_admin') {
      window.history.pushState({}, '', '/master-admin')
    } else {
      window.history.pushState({}, '', '/company')
    }
  }

  if (path === '/' || path === '/index.html') {
    window.location.href = '/littx/index.html'
    return null
  }

  if (path === '/portal' || path === '/system') {
    return <PublicWebsite onLoginSuccess={handleLoginRedirect} />
  }

  if (path.startsWith('/login')) {
    return <LoginPage onLoginSuccess={handleLoginRedirect} />
  }

  if (path.startsWith('/dashhboard')) {
    return <AdminDashboard isPresentation={true} />
  }

  if (path.startsWith('/dashboard')) {
    return <DashboardGateApp />
  }

  if (path.startsWith('/master-admin') || path.startsWith('/admin') || path.startsWith('/company')) {
    return <AdminDashboard isPresentation={false} />
  }

  if (path.startsWith('/pr')) {
    return <PRApp />
  }

  // Restore the original default route (PasswordGateApp -> LittixApp)
  return <PasswordGateApp />
}

function DashboardGateApp() {
  const [auth, setAuth] = useState(() => {
    return sessionStorage.getItem('dashboard_auth') === 'true'
  })
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password === 'dash-2026') {
      sessionStorage.setItem('dashboard_auth', 'true')
      setAuth(true)
      setError('')
    } else {
      setError('Invalid authorization key')
    }
  }

  if (auth) {
    // Pass a flag to indicate this is the manager dashboard
    return <AdminDashboard isPresentation={false} isManager={true} />
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: '#0D0D0D',
      color: '#ffffff',
      fontFamily: 'Inter, sans-serif',
      padding: '20px'
    }}>
      <form onSubmit={handleSubmit} style={{
        backgroundColor: '#1A1A1A',
        border: '1px solid #2A2A2A',
        padding: '32px',
        borderRadius: '24px',
        width: '100%',
        maxWidth: '380px',
        textAlign: 'center',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
      }}>
        <div style={{
          fontSize: '24px',
          fontWeight: 900,
          marginBottom: '8px',
          letterSpacing: '1px'
        }}>
          <img src="/logo.png" alt="LITTX" style={{ height: 32, width: 'auto', display: 'block', margin: '0 auto' }} />
        </div>
        <div style={{
          fontSize: '12px',
          color: '#A0A0A0',
          marginBottom: '24px',
          textTransform: 'uppercase',
          letterSpacing: '1px'
        }}>
          Manager Dashboard Access
        </div>
        
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter access code"
          style={{
            width: '100%',
            backgroundColor: '#0D0D0D',
            border: '1px solid #2A2A2A',
            color: '#ffffff',
            padding: '14px 16px',
            borderRadius: '14px',
            outline: 'none',
            fontSize: '14px',
            textAlign: 'center',
            marginBottom: '12px',
            boxSizing: 'border-box'
          }}
        />

        {error && (
          <div style={{
            color: '#EF4444',
            fontSize: '12px',
            fontWeight: 600,
            marginBottom: '16px'
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          style={{
            width: '100%',
            backgroundColor: '#A855F7',
            color: '#ffffff',
            border: 'none',
            padding: '14px',
            borderRadius: '14px',
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(168,85,247,0.3)'
          }}
        >
          Verify Code
        </button>
      </form>
    </div>
  )
}


function PasswordGateApp() {
  const [auth, setAuth] = useState(() => {
    return sessionStorage.getItem('tickets_auth') === 'true'
  })
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password === 'littx2026' || password === 'littlane2026') {
      sessionStorage.setItem('tickets_auth', 'true')
      setAuth(true)
      setError('')
    } else {
      setError('Invalid authorization key')
    }
  }

  if (auth) {
    return <LittixApp />
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: '#0D0D0D',
      color: '#ffffff',
      fontFamily: 'Inter, sans-serif',
      padding: '20px'
    }}>
      <form onSubmit={handleSubmit} style={{
        backgroundColor: '#1A1A1A',
        border: '1px solid #2A2A2A',
        padding: '32px',
        borderRadius: '24px',
        width: '100%',
        maxWidth: '380px',
        textAlign: 'center',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
      }}>
        <div style={{
          fontSize: '24px',
          fontWeight: 'black',
          marginBottom: '8px',
          letterSpacing: '1px'
        }}>
          <img src="/logo.png" alt="LITTX" style={{ height: 32, width: 'auto', display: 'block', margin: '0 auto' }} />
        </div>
        <div style={{
          fontSize: '12px',
          color: '#A0A0A0',
          marginBottom: '24px',
          textTransform: 'uppercase',
          letterSpacing: '1px'
        }}>
          Gate Staff Access Protection
        </div>
        
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter access code"
          style={{
            width: '100%',
            backgroundColor: '#0D0D0D',
            border: '1px solid #2A2A2A',
            color: '#ffffff',
            padding: '14px 16px',
            borderRadius: '14px',
            outline: 'none',
            fontSize: '14px',
            textAlign: 'center',
            marginBottom: '12px',
            boxSizing: 'border-box'
          }}
        />

        {error && (
          <div style={{
            color: '#EF4444',
            fontSize: '12px',
            fontWeight: '600',
            marginBottom: '16px'
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          style={{
            width: '100%',
            backgroundColor: '#A855F7',
            color: '#ffffff',
            border: 'none',
            padding: '14px',
            borderRadius: '14px',
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(168,85,247,0.3)'
          }}
        >
          Verify Code
        </button>
      </form>
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <MainAppShell />
    </StoreProvider>
  )
}
