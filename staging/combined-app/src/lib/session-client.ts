const CSRF_COOKIE_NAMES = ['__Host-stageway_csrf', 'stageway_csrf']

function readCookie(name: string): string | null {
  const prefix = `${name}=`
  const value = document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith(prefix))
  if (!value) return null
  try { return decodeURIComponent(value.slice(prefix.length)) } catch { return null }
}

/** Install once before rendering. Session secrets stay in HttpOnly cookies;
 * the readable CSRF cookie is only copied to a custom header on same-origin API writes. */
export function installSessionFetch(): void {
  const marker = window as Window & { __stagewayFetchWrapped?: boolean }
  if (marker.__stagewayFetchWrapped) return
  marker.__stagewayFetchWrapped = true
  const nativeFetch = window.fetch.bind(window)
  window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input.toString() : input.url, window.location.href)
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) return nativeFetch(input, init)
    const headers = new Headers(input instanceof Request ? input.headers : undefined)
    new Headers(init.headers).forEach((value, key) => headers.set(key, value))
    const csrf = CSRF_COOKIE_NAMES.map(readCookie).find(Boolean)
    if (csrf) {
      // Once cookie auth is established, prevent legacy browser keys from
      // competing with the cookie session. Keep scoped OTP Authorization tokens.
      headers.delete('x-admin-key')
      const scopedRecovery = url.pathname.startsWith('/api/customer/bookings/recovery/')
      const hasSeparateCredential = headers.has('authorization') || headers.has('x-seller-token') || headers.has('x-shadow-token')
      const apiToken = !scopedRecovery && !hasSeparateCredential && !headers.has('x-auth-token')
        ? sessionStorage.getItem('littx_token')
        : null
      if (apiToken) headers.set('x-auth-token', apiToken)
      const method = (init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers.set('x-csrf-token', csrf)
    }
    return nativeFetch(input, { ...init, headers, credentials: 'same-origin' })
  }
}
