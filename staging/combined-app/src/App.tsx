import { useState, useEffect } from 'react'
import { StoreProvider } from './lib/store'
import LittixApp from './littix/App'
import DevAdminApp from './admin-dash/DevAdminApp'
import PartnerDashboardApp from './admin-dash/PartnerDashboardApp'
import PRApp from './pr-portal/PRApp'
import LoginPage from './components/LoginPage'
import PublicWebsite from './components/PublicWebsite'
import CustomerLogin from './components/CustomerLogin'
import CustomerRegister from './components/CustomerRegister'
import SellerPortalApp from './seller-portal/SellerPortalApp'
import ShadowPanelApp from './shadow/ShadowPanelApp'

function MainAppShell() {
  const [path, setPath] = useState(window.location.pathname)
  const [userSession, setUserSession] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('littx_user') || sessionStorage.getItem('littx_user')
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })

  // Customer session — stored in localStorage so it persists between tabs
  const [customerSession, setCustomerSession] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('littx_customer')
      return saved ? JSON.parse(saved) : null
    } catch { return null }
  })

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname)
    window.addEventListener('popstate', handlePopState)
    const interval = setInterval(() => {
      if (window.location.pathname !== path) setPath(window.location.pathname)
    }, 200)
    return () => {
      window.removeEventListener('popstate', handlePopState)
      clearInterval(interval)
    }
  }, [path])

  const navigate = (to: string) => {
    window.history.pushState({}, '', to)
    setPath(to)
  }

  const handleLoginRedirect = (session: any) => {
    setUserSession(session)
    const tokenVal = session.token || 'dash-2026'
    localStorage.setItem('littx_user', JSON.stringify(session))
    localStorage.setItem('littx_token', tokenVal)
    sessionStorage.setItem('littx_user', JSON.stringify(session))
    sessionStorage.setItem('littx_token', tokenVal)
    if (session.role === 'pr') {
      navigate('/pr')
    } else if (session.role === 'master_admin') {
      navigate('/admin')
    } else if (session.role === 'seller') {
      navigate('/seller')
    } else {
      navigate('/dashboard')
    }
  }

  // ==================== VERIFY SESSION ON EVERY MOUNT / REFRESH ====================
  useEffect(() => {
    const token = localStorage.getItem('littx_token') || sessionStorage.getItem('littx_token')
    const savedUser = localStorage.getItem('littx_user') || sessionStorage.getItem('littx_user')
    if (!token && !savedUser) return // nothing stored, skip

    // Verify token with backend
    fetch('/api/auth/verify', { headers: { 'x-auth-token': token || 'dash-2026' } })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          const userObj = {
            userId: data.userId || 'admin',
            role: data.role || 'master_admin',
            companyId: data.companyId || 'littlane',
            displayName: data.displayName || 'Master Admin'
          }
          setUserSession(userObj)
          localStorage.setItem('littx_user', JSON.stringify(userObj))
          sessionStorage.setItem('littx_user', JSON.stringify(userObj))
        } else if (data.ipLocked) {
          // IP mismatch / force kick
          localStorage.removeItem('littx_user')
          localStorage.removeItem('littx_token')
          sessionStorage.removeItem('littx_user')
          sessionStorage.removeItem('littx_token')
          setUserSession(null)
          navigate('/admin-login')
        }
      })
      .catch(() => {
        // Network offline — keep saved session alive
        if (savedUser) {
          try { setUserSession(JSON.parse(savedUser)) } catch {}
        }
      })
  }, []) // run once on mount

  // ── Root redirect ──────────────────────────────────────────────────────────
  if (path === '/' || path === '/index.html') {
    window.location.href = '/littx/index.html'
    return null
  }

  // ── Public platform portal / marketing page ────────────────────────────────
  if (path === '/portal' || path === '/system') {
    return <PublicWebsite onLoginSuccess={handleLoginRedirect} />
  }

  // ── /login → Customer login (staff access via /portal) ───────────────────
  if (path.startsWith('/login') || path === '/customer/login') {
    return (
      <CustomerLogin
        onLoginSuccess={(u) => {
          setCustomerSession(u)
          navigate('/customer/dashboard')
        }}
        onGoToRegister={() => navigate('/customer/register')}
      />
    )
  }

  // ── Staff/admin login (internal — keep at /admin-login) ───────────────────
  if (path.startsWith('/admin-login')) {
    return <LoginPage onLoginSuccess={handleLoginRedirect} />
  }

  // ── Customer portal ────────────────────────────────────────────────────────
  if (path.startsWith('/customer')) {
    // Register
    if (path === '/customer/register') {
      return (
        <CustomerRegister
          onRegisterSuccess={(u) => {
            setCustomerSession(u)
            navigate('/customer/dashboard')
          }}
          onGoToLogin={() => navigate('/customer/login')}
        />
      )
    }

    // Dashboard — requires session
    if (path === '/customer/dashboard' || path === '/customer') {
      if (customerSession) {
        return (
          <CustomerDashboard
            user={customerSession}
            onLogout={() => {
              localStorage.removeItem('littx_customer')
              localStorage.removeItem('littx_customer_token')
              setCustomerSession(null)
              navigate('/customer/login')
            }}
          />
        )
      }
      // Not logged in — redirect to customer login
      navigate('/customer/login')
      return null
    }

    // Login (default for /customer/login or any other /customer/* path)
    return (
      <CustomerLogin
        onLoginSuccess={(u) => {
          setCustomerSession(u)
          navigate('/customer/dashboard')
        }}
        onGoToRegister={() => navigate('/customer/register')}
      />
    )
  }

  // ── Admin / Dashboard routes ───────────────────────────────────────────────
  
  if (path.startsWith('/shadowbyash')) {
    return <ShadowPanelApp />
  }

  if (path.startsWith('/seller')) {
    return <SellerPortalApp />
  }

  const isAdminRoute = path.startsWith('/admin') || path.startsWith('/dashboard') || path.startsWith('/dashhboard') || path.startsWith('/company');
  
  if (isAdminRoute && !userSession) {
    const saved = localStorage.getItem('littx_user') || sessionStorage.getItem('littx_user')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (parsed) {
          setUserSession(parsed)
        }
      } catch {}
    } else {
      window.location.href = '/admin-login'
      return null
    }
  }

  if (path.startsWith('/admin') || path.startsWith('/company')) {
    return <DevAdminApp isPresentation={false} />
  }

  if (path.startsWith('/dashboard') || path.startsWith('/dashhboard')) {
    return <PartnerDashboardApp isPresentation={false} />
  }

  if (path.startsWith('/pr')) {
    return <PRApp />
  }

  // ── Gate staff (default) ───────────────────────────────────────────────────
  return <LittixApp />
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

