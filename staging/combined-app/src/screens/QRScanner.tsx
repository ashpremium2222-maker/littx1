import { AnimatePresence, motion } from 'framer-motion'
import jsQR from 'jsqr'
import { useCallback, useEffect, useRef, useState } from 'react'
import LittixLogo from '../components/LittixLogo'
import type { Ticket } from '../lib/store'
import type { RejectedScan, ScannerHistoryEntry } from '../littix/App'

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  onBack: () => void
  onScan: (raw: string) => void | Promise<void>
  showBack?: boolean
  premium?: boolean
  scanFeedback?: {
    status: 'success' | 'rejected' | 'invalid'
    title: string
    message: string
    code?: string
    entry?: {
      ticketId: string
      status: 'approved' | 'duplicate' | 'cancelled' | 'invalid'
      attendee: string
      event: string
      ticketType: string
      generatedAt: string
      scannedAt: string
      originalScanAt?: string
      scannedBy: string
      attemptNumber: number
      message: string
    }
  } | null
  onScanNext?: () => void
  rejectedScans?: RejectedScan[]
  scannedTickets?: Ticket[]
  scannerHistory?: ScannerHistoryEntry[]
  sellerId?: string
}

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = 'scanner' | 'history' | 'profile'
type HistoryFilter = 'approved' | 'rejected'
type ScanPhase = 'idle' | 'scanning' | 'detected' | 'verifying'

type TorchTrack = MediaStreamTrack & {
  getCapabilities?: () => MediaTrackCapabilities & { torch?: boolean }
  applyConstraints?: (
    constraints: MediaTrackConstraints & { advanced?: Array<{ torch?: boolean }> },
  ) => Promise<void>
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function QRScanner({ onBack, onScan, premium = false, scanFeedback, onScanNext, rejectedScans = [], scannedTickets = [], scannerHistory = [], sellerId }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanTimerRef = useRef<number | null>(null)
  const scanningRef = useRef(false)
  const phaseTimerRef = useRef<number | null>(null)

  const [activeTab, setActiveTab] = useState<Tab>('scanner')
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [phase, setPhase] = useState<ScanPhase>('idle')
  const [torchOn, setTorchOn] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualId, setManualId] = useState('')
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('approved')

  // ─── Camera helpers ──────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (scanTimerRef.current) { window.clearTimeout(scanTimerRef.current); scanTimerRef.current = null }
    if (phaseTimerRef.current) { window.clearTimeout(phaseTimerRef.current); phaseTimerRef.current = null }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    scanningRef.current = false
    setTorchOn(false)
    setCameraActive(false)
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const finishScan = useCallback((raw: string) => {
    stopCamera()
    setPhase('verifying')
    Promise.resolve(onScan(raw)).catch(() => {
      setPhase('idle')
    })
  }, [onScan, stopCamera])

  const scanFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (
      video && canvas &&
      video.readyState === video.HAVE_ENOUGH_DATA &&
      video.videoWidth > 0 &&
      scanningRef.current
    ) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (ctx) {
        const maxDim = 420
        const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight))
        const w = Math.floor(video.videoWidth * scale)
        const h = Math.floor(video.videoHeight * scale)
        canvas.width = w; canvas.height = h
        ctx.drawImage(video, 0, 0, w, h)
        const imageData = ctx.getImageData(0, 0, w, h)
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' })
        if (code?.data) {
          scanningRef.current = false
          setPhase('detected')
          phaseTimerRef.current = window.setTimeout(() => {
            setPhase('verifying')
            phaseTimerRef.current = window.setTimeout(() => {
              finishScan(code.data)
            }, 600)
          }, 500)
          return
        }
      }
    }
    if (scanningRef.current) scanTimerRef.current = window.setTimeout(scanFrame, 280)
  }, [finishScan])

  const openCamera = useCallback(async () => {
    setCameraError(null)
    setPhase('scanning')
    stopCamera()

    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('camera_unavailable')
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 720 }, height: { ideal: 720 } },
      })
      streamRef.current = stream
      scanningRef.current = true
      setCameraActive(true)
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      scanFrame()
    } catch (err: unknown) {
      scanningRef.current = false
      setCameraActive(false)
      setPhase('idle')
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'camera_unavailable' || msg.includes('NotSupportedError')) {
        setCameraError('camera_unavailable')
      } else {
        setCameraError('camera_denied')
      }
    }
  }, [scanFrame, stopCamera])

  // Cleanup on unmount
  useEffect(() => () => { stopCamera() }, [stopCamera])

  // Switch tabs → stop camera
  useEffect(() => {
    if (activeTab !== 'scanner') stopCamera()
  }, [activeTab, stopCamera])

  // ─── Torch ───────────────────────────────────────────────────────────────
  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0] as TorchTrack | undefined
    const caps = track?.getCapabilities?.()
    if (!track || !caps?.torch) { setCameraError('torch_unavailable'); return }
    try {
      const next = !torchOn
      await track.applyConstraints?.({ advanced: [{ torch: next }] } as MediaTrackConstraints & { advanced: Array<{ torch: boolean }> })
      setTorchOn(next)
      setCameraError(null)
    } catch { setCameraError('torch_unavailable') }
  }

  // ─── Manual submit ────────────────────────────────────────────────────────
  function submitManual() {
    const v = manualId.trim()
    if (v) {
      stopCamera()
      setManualId('')
      setManualOpen(false)
      finishScan(v)
    }
  }

  // ─── Derived history data ─────────────────────────────────────────────────
  const approvedItems = scannerHistory.length > 0
    ? scannerHistory.filter(entry => entry.status === 'approved').map(entry => ({
      id: entry.ticketId,
      title: entry.event,
      holder: entry.attendee,
      time: `Generated ${entry.generatedAt} · Scanned ${entry.scannedAt}`,
      type: entry.ticketType,
    }))
    : scannedTickets.map(t => ({
      id: t.id,
      title: t.event,
      holder: t.attendee,
      time: t.scannedAt || '',
      type: t.ticketType,
    }))

  const rejectedItems = scannerHistory.length > 0
    ? scannerHistory.filter(entry => entry.status !== 'approved').map(entry => ({
      id: entry.ticketId,
      title: entry.event,
      holder: entry.attendee,
      time: `Generated ${entry.generatedAt} · Attempt ${entry.scannedAt}`,
      reason: entry.status === 'duplicate' ? `Already Scanned${entry.originalScanAt ? ` · First ${entry.originalScanAt}` : ''}` : entry.status === 'cancelled' ? 'Ticket Cancelled' : 'Invalid Ticket',
    }))
    : rejectedScans.map(r => ({
      id: r.ticket?.id || r.rawCode || '—',
      title: r.ticket?.event || 'Unknown Ticket',
      holder: r.ticket?.attendee || r.rawCode || 'Unknown',
      time: r.timestamp,
      reason: r.reason === 'duplicate' ? 'Already Scanned' : r.reason === 'cancelled' ? 'Ticket Cancelled' : 'Invalid Ticket',
    }))
  const feedbackEntry = scanFeedback?.entry
  const feedbackOk = scanFeedback?.status === 'success'
  const feedbackAccent = feedbackOk ? '#22C55E' : '#EF4444'
  const feedbackLabel =
    feedbackEntry?.status === 'approved' ? 'Approved' :
    feedbackEntry?.status === 'duplicate' ? 'Duplicate' :
    feedbackEntry?.status === 'cancelled' ? 'Cancelled' :
    feedbackEntry?.status === 'invalid' ? 'Invalid' :
    scanFeedback?.title
  const fallbackTicketId = feedbackEntry?.ticketId || scanFeedback?.code || 'UNKNOWN'

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="sc-shell">
      <style>{styles}</style>

      {/* Ambient background */}
      <div className="sc-ambient" aria-hidden="true">
        <div className="sc-ambient-orb sc-ambient-orb-1" />
        <div className="sc-ambient-orb sc-ambient-orb-2" />
      </div>

      {/* Hidden camera elements */}
      <video ref={videoRef} playsInline muted className={`sc-video-feed${cameraActive ? ' is-active' : ''}`} />
      <canvas ref={canvasRef} className="sc-hidden-canvas" />

      {/* ── SCANNER TAB ── */}
      <AnimatePresence mode="wait">
        {activeTab === 'scanner' && (
          <motion.div
            key="scanner-tab"
            className="sc-tab-content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Top bar */}
            <header className="sc-topbar">
              <div className="sc-brand">
                <LittixLogo dark size="sm" />
                <span>LITTIX</span>
              </div>
              {cameraActive && (
                <button
                  className={`sc-topbar-btn${torchOn ? ' is-active' : ''}`}
                  onClick={toggleTorch}
                  aria-label="Toggle flashlight"
                  type="button"
                >
                  <FlashIcon />
                </button>
              )}
            </header>

            {/* Scanner main area */}
            <main className="sc-scanner-main">
              {/* Hero text */}
              <div className="sc-hero-text">
                <motion.p
                  className="sc-eyebrow"
                  key={phase}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {phase === 'idle' && 'Ready to scan'}
                  {phase === 'scanning' && 'Camera active'}
                  {phase === 'detected' && 'QR detected'}
                  {phase === 'verifying' && 'Verifying...'}
                </motion.p>
                <motion.h1
                  className="sc-title"
                  key={`title-${phase}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35 }}
                >
                  {phase === 'idle' && 'Scan Ticket'}
                  {phase === 'scanning' && 'Scanning'}
                  {phase === 'detected' && 'Ticket Detected'}
                  {phase === 'verifying' && 'Verifying Ticket'}
                </motion.h1>
                <motion.p
                  className="sc-subtitle"
                  key={`sub-${phase}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.1 }}
                >
                  {phase === 'idle' && 'Position the ticket QR code inside the frame'}
                  {phase === 'scanning' && (cameraError ? getErrorMessage(cameraError) : 'Position code within the frame')}
                  {phase === 'detected' && 'Hold still — reading ticket data'}
                  {phase === 'verifying' && 'Checking ticket validity'}
                </motion.p>
              </div>

              {/* Scanner orb */}
              <button
                className="sc-orb-container"
                onClick={cameraActive ? stopCamera : openCamera}
                type="button"
                aria-label={cameraActive ? 'Stop scanner' : 'Start scanner'}
              >
                <ScannerOrb
                  phase={phase}
                  cameraActive={cameraActive}
                  cameraError={cameraError}
                />
              </button>

              {/* Camera error state */}
              {cameraError && (
                <motion.div
                  className="sc-error-card"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35 }}
                >
                  <div className="sc-error-icon">
                    <CameraOffIcon />
                  </div>
                  <div className="sc-error-body">
                    <p className="sc-error-title">
                      {cameraError === 'camera_denied' ? 'Camera Access Required' :
                       cameraError === 'camera_unavailable' ? 'Camera Not Available' :
                       'Torch Unavailable'}
                    </p>
                    <p className="sc-error-desc">
                      {cameraError === 'camera_denied' ? 'Allow camera access in your browser settings to scan tickets.' :
                       cameraError === 'camera_unavailable' ? 'This device does not support camera scanning.' :
                       'Torch is not supported on this device.'}
                    </p>
                  </div>
                  {(cameraError === 'camera_denied' || cameraError === 'camera_unavailable') && (
                    <button className="sc-error-retry" onClick={openCamera} type="button">Try Again</button>
                  )}
                </motion.div>
              )}
            </main>

            {/* Bottom action area */}
            <footer className="sc-footer">
              <div className="sc-action-group">
                <button
                  className="sc-action-primary"
                  onClick={cameraActive ? stopCamera : openCamera}
                  type="button"
                  id="scan-qr-btn"
                >
                  <QrIcon />
                  <span>{cameraActive ? 'Stop Scanner' : 'Scan QR'}</span>
                </button>
                <button
                  className="sc-action-secondary"
                  onClick={() => setManualOpen(true)}
                  type="button"
                  id="manual-entry-btn"
                >
                  <KeyboardIcon />
                  <span>Manual</span>
                </button>
              </div>
            </footer>
          </motion.div>
        )}

        {/* ── HISTORY TAB ── */}
        {activeTab === 'history' && (
          <motion.div
            key="history-tab"
            className="sc-tab-content sc-history-tab"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <header className="sc-page-header">
              <div className="sc-page-header-inner">
                <h1 className="sc-page-title">Scan History</h1>
                <p className="sc-page-subtitle">Review recent ticket processing logs.</p>
              </div>
            </header>

            {/* Filter tabs */}
            <div className="sc-hist-filters">
              <button
                className={`sc-hist-filter-btn${historyFilter === 'approved' ? ' is-approved' : ''}`}
                onClick={() => setHistoryFilter('approved')}
                type="button"
                id="history-approved-tab"
              >
                <CheckCircleIcon />
                <span>Approved</span>
              </button>
              <button
                className={`sc-hist-filter-btn${historyFilter === 'rejected' ? ' is-rejected' : ''}`}
                onClick={() => setHistoryFilter('rejected')}
                type="button"
                id="history-rejected-tab"
              >
                <CancelCircleIcon />
                <span>Rejected</span>
              </button>
            </div>

            {/* History list */}
            <div className="sc-hist-list-wrap">
              <AnimatePresence mode="wait">
                {historyFilter === 'approved' ? (
                  <motion.div
                    key="approved-list"
                    className="sc-hist-list"
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.22 }}
                  >
                    {approvedItems.length === 0 ? (
                      <EmptyState type="approved" />
                    ) : (
                      approvedItems.map((item, i) => (
                        <motion.article
                          key={item.id + i}
                          className="sc-hist-card is-approved"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.05, duration: 0.25 }}
                        >
                          <div className="sc-hist-card-glow sc-hist-card-glow-approved" />
                          <div className="sc-hist-status-icon is-approved">
                            <CheckIcon />
                          </div>
                          <div className="sc-hist-card-body">
                            <div className="sc-hist-card-row">
                              <span className="sc-hist-card-title">{item.title}</span>
                              <code className="sc-hist-card-id is-approved">#{item.id}</code>
                            </div>
                            <div className="sc-hist-card-meta">
                              <span><ClockIcon />{item.time}</span>
                              <span><PersonIcon />{item.holder}</span>
                            </div>
                          </div>
                        </motion.article>
                      ))
                    )}
                  </motion.div>
                ) : (
                  <motion.div
                    key="rejected-list"
                    className="sc-hist-list"
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.22 }}
                  >
                    {rejectedItems.length === 0 ? (
                      <EmptyState type="rejected" />
                    ) : (
                      rejectedItems.map((item, i) => (
                        <motion.article
                          key={item.id + i}
                          className="sc-hist-card is-rejected"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.05, duration: 0.25 }}
                        >
                          <div className="sc-hist-card-glow sc-hist-card-glow-rejected" />
                          <div className="sc-hist-status-icon is-rejected">
                            <CancelIcon />
                          </div>
                          <div className="sc-hist-card-body">
                            <div className="sc-hist-card-row">
                              <span className="sc-hist-card-title">{item.title}</span>
                              <code className="sc-hist-card-id is-rejected">#{item.id}</code>
                            </div>
                            <div className="sc-hist-card-meta">
                              <span><ClockIcon />{item.time}</span>
                              <span><ErrorIcon />{item.reason}</span>
                            </div>
                          </div>
                        </motion.article>
                      ))
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

        {/* ── PROFILE TAB ── */}
        {activeTab === 'profile' && (
          <motion.div
            key="profile-tab"
            className="sc-tab-content sc-profile-tab"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <header className="sc-page-header">
              <div className="sc-page-header-inner">
                <h1 className="sc-page-title">Profile</h1>
                <p className="sc-page-subtitle">Gate staff session information.</p>
              </div>
            </header>

            <div className="sc-profile-content">
              {/* Avatar */}
              <div className="sc-profile-avatar-wrap">
                <div className="sc-profile-avatar">
                  <PersonIcon />
                </div>
                <div className="sc-profile-avatar-ring" />
              </div>

              {/* Info */}
              <div className="sc-profile-info">
                <p className="sc-profile-name">{sellerId || 'Gate Scanner'}</p>
                <span className="sc-profile-badge">Gate Staff</span>
              </div>

              {/* Stats */}
              <div className="sc-profile-stats">
                <div className="sc-stat-card">
                  <span className="sc-stat-value sc-stat-approved">{approvedItems.length}</span>
                  <span className="sc-stat-label">Approved</span>
                </div>
                <div className="sc-stat-divider" />
                <div className="sc-stat-card">
                  <span className="sc-stat-value sc-stat-rejected">{rejectedItems.length}</span>
                  <span className="sc-stat-label">Rejected</span>
                </div>
                <div className="sc-stat-divider" />
                <div className="sc-stat-card">
                  <span className="sc-stat-value">{approvedItems.length + rejectedItems.length}</span>
                  <span className="sc-stat-label">Total</span>
                </div>
              </div>

              {/* Exit button */}
              <button className="sc-profile-exit" onClick={onBack} type="button" id="exit-scanner-btn">
                <HomeIcon />
                <span>Exit Scanner</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── BOTTOM NAVIGATION ── */}
      <nav className="sc-bottom-nav" aria-label="Scanner navigation">
        <div className="sc-nav-pill">
          <NavButton
            id="nav-scanner"
            label="Scanner"
            active={activeTab === 'scanner'}
            onClick={() => setActiveTab('scanner')}
            icon={<QrIcon />}
          />
          <NavButton
            id="nav-history"
            label="History"
            active={activeTab === 'history'}
            onClick={() => setActiveTab('history')}
            icon={<HistoryIcon />}
          />
          <NavButton
            id="nav-profile"
            label="Profile"
            active={activeTab === 'profile'}
            onClick={() => setActiveTab('profile')}
            icon={<PersonIcon />}
          />
        </div>
      </nav>

      <AnimatePresence>
        {phase === 'verifying' && !scanFeedback && (
          <motion.div
            className="fixed inset-0 flex items-center justify-center px-6"
            style={{ zIndex: 65, background: 'radial-gradient(circle at 50% 35%, rgba(0,122,255,0.26), rgba(0,0,0,0.78) 58%, rgba(0,0,0,0.92) 100%)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-[360px] rounded-[32px] border border-white/10 bg-white/[0.07] p-7 text-center backdrop-blur-2xl shadow-2xl"
              initial={{ y: 16, scale: 0.96 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 12, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 360, damping: 30 }}
            >
              <motion.div
                className="mx-auto mb-5 h-24 w-24 rounded-full grid place-items-center text-[#4fb0ff]"
                style={{ background: 'radial-gradient(circle, rgba(79,176,255,0.22), rgba(79,176,255,0.08) 58%, transparent 72%)', boxShadow: '0 0 48px rgba(79,176,255,0.34)' }}
                animate={{ scale: [1, 1.06, 1] }}
                transition={{ duration: 1.25, repeat: Infinity, ease: 'easeInOut' }}
              >
                <div className="h-12 w-12">
                  <SpinnerIcon />
                </div>
              </motion.div>
              <p className="text-white text-2xl font-black leading-tight">Verifying Ticket</p>
              <p className="text-white/55 text-sm leading-snug mt-2">Checking ticket details and scan status</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── SCAN RESULT MODAL ── */}
      <AnimatePresence>
        {scanFeedback && premium && (
          <RefinedScanResult
            feedbackEntry={feedbackEntry}
            feedbackLabel={feedbackLabel}
            fallbackTicketId={fallbackTicketId}
            scanFeedback={scanFeedback}
            sellerId={sellerId}
            onScanNext={onScanNext}
          />
        )}

        {scanFeedback && !premium && (
          <motion.div
            className="fixed inset-0 bg-black/72 backdrop-blur-sm flex items-center px-4 py-6 overflow-y-auto"
            style={{ zIndex: 70, background: 'radial-gradient(circle at 50% 18%, rgba(0,122,255,0.22), rgba(0,0,0,0.78) 48%, rgba(0,0,0,0.9) 100%)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-[520px] mx-auto my-auto border border-white/10 bg-[#111]/95 rounded-3xl p-5 shadow-2xl overflow-hidden relative"
              initial={{ y: 28, scale: 0.92, opacity: 0 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 20, scale: 0.98, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 360, damping: 32 }}
              style={premium ? {
                background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
                backdropFilter: 'blur(28px)',
                WebkitBackdropFilter: 'blur(28px)',
                boxShadow: '0 24px 80px rgba(0,0,0,0.42), inset 0 1px 1px rgba(255,255,255,0.16)',
              } : undefined}
            >
              <motion.div
                className="absolute inset-x-0 top-0 h-1"
                style={{ backgroundColor: feedbackAccent }}
                initial={{ scaleX: 0, transformOrigin: 'left' }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
              />
              <motion.div
                className="mx-auto mb-4 h-20 w-20 rounded-full grid place-items-center"
                style={{
                  color: feedbackAccent,
                  background: `radial-gradient(circle, ${feedbackAccent}2e, ${feedbackAccent}12 54%, transparent 72%)`,
                  boxShadow: `0 0 42px ${feedbackAccent}45`,
                }}
                initial={{ scale: 0.72, opacity: 0 }}
                animate={{ scale: [0.72, 1.08, 1], opacity: 1 }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              >
                <motion.div
                  animate={{ scale: [1, 1.08, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  className="h-12 w-12"
                >
                  {feedbackOk ? <CheckCircleIcon /> : <CancelCircleIcon />}
                </motion.div>
              </motion.div>
              <div className="flex items-center gap-4">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: feedbackOk ? 'rgba(34,197,94,0.16)' : 'rgba(239,68,68,0.15)',
                  }}
                >
                  {feedbackOk ? (
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                      <path d="M6 14.5l5 5L22 8.5" stroke="#22C55E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                      <path d="M14 7v9" stroke="#EF4444" strokeWidth="3" strokeLinecap="round" />
                      <circle cx="14" cy="21" r="1.7" fill="#EF4444" />
                    </svg>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-[10px] font-black uppercase tracking-[0.16em] px-2 py-1 rounded-full"
                      style={{ color: feedbackAccent, backgroundColor: `${feedbackAccent}24` }}
                    >
                      {feedbackLabel}
                    </span>
                  </div>
                  <p className="text-white text-lg font-black leading-tight">{scanFeedback.title}</p>
                  <p className="text-white/60 text-sm leading-snug mt-1">{scanFeedback.message}</p>
                </div>
              </div>

              <motion.div
                className="mt-5 grid grid-cols-2 gap-2"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.12, duration: 0.28 }}
              >
                <ResultDetail label="Ticket ID" value={`#${fallbackTicketId}`} mono />
                <ResultDetail label="Attendee" value={feedbackEntry?.attendee || 'Not available'} />
                <ResultDetail label="Ticket Type" value={feedbackEntry?.ticketType || 'Not available'} />
                <ResultDetail label="Generated" value={feedbackEntry?.generatedAt || 'Not available'} />
                <ResultDetail label={feedbackOk ? 'Scanned' : 'Scan Attempt'} value={feedbackEntry?.scannedAt || 'Just now'} />
                <ResultDetail label="Scanner" value={feedbackEntry?.scannedBy || sellerId || 'Gate Scanner'} />
                {feedbackEntry?.originalScanAt && (
                  <ResultDetail label="First Scanned" value={feedbackEntry.originalScanAt} />
                )}
                {feedbackEntry && feedbackEntry.attemptNumber > 1 && (
                  <ResultDetail label="Attempt" value={`${feedbackEntry.attemptNumber}`} />
                )}
                <div className="col-span-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
                  <p className="text-white/35 text-[10px] font-bold uppercase tracking-[0.14em] mb-1">Event</p>
                  <p className="text-white text-[13px] font-semibold leading-snug">{feedbackEntry?.event || scanFeedback.message}</p>
                </div>
              </motion.div>

              <motion.button
                onClick={onScanNext}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className={`w-full mt-5 ${premium ? 'bg-white text-[#06111a] rounded-full' : 'bg-[#A855F7] text-white rounded-2xl'} font-bold text-sm py-4`}
                style={{ boxShadow: premium ? '0 0 28px rgba(255,255,255,0.22)' : '0 4px 20px rgba(168,85,247,0.3)' }}
              >
                Scan Next Ticket
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {manualOpen && (
          <motion.div
            className="sc-modal-backdrop"
            onClick={() => setManualOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="sc-modal"
              onClick={e => e.stopPropagation()}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            >
              <div className="sc-modal-handle" />
              <h2>Enter Ticket ID</h2>
              <input
                autoFocus
                value={manualId}
                onChange={e => setManualId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && submitManual()}
                placeholder="e.g. FT-2026-00847"
                id="manual-ticket-input"
              />
              <button type="button" onClick={submitManual} id="manual-verify-btn">Verify Ticket</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function RefinedScanResult({
  feedbackEntry,
  feedbackLabel,
  fallbackTicketId,
  scanFeedback,
  sellerId,
  onScanNext,
}: {
  feedbackEntry: NonNullable<Props['scanFeedback']>['entry'] | undefined
  feedbackLabel: string | undefined
  fallbackTicketId: string
  scanFeedback: NonNullable<Props['scanFeedback']>
  sellerId?: string
  onScanNext?: () => void
}) {
  const approved = scanFeedback.status === 'success'
  const attendee = feedbackEntry?.attendee || 'Not available'
  const attendeeInitials = attendee
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('') || 'NA'
  const scanCount = Math.max(1, feedbackEntry?.attemptNumber || (approved ? 1 : 2))
  const rejectedReason =
    feedbackEntry?.status === 'duplicate' ? 'Duplicate Pass' :
    feedbackEntry?.status === 'cancelled' ? 'Cancelled Pass' :
    'Invalid Pass'
  const background = approved
    ? 'radial-gradient(circle at 50% 20%, rgba(5,231,119,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(5,231,119,0.1) 0%, transparent 50%), #131313'
    : 'radial-gradient(circle at top, rgba(255,77,77,0.15) 0%, transparent 70%), linear-gradient(180deg, #3a0000 0%, #130000 44%, #0a0000 100%)'

  function scanNext() {
    if (navigator.vibrate) navigator.vibrate(50)
    onScanNext?.()
  }

  // Staggered Container Animation
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.1
      }
    }
  }

  // Individual Card Animation
  const cardVariants = {
    hidden: { opacity: 0, y: 20, scale: 0.96 },
    show: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: "spring",
        stiffness: 120,
        damping: 14
      }
    }
  }

  // Intercept browser back when feedback is showing — go to "scan next" instead of exiting
  React.useEffect(() => {
    window.history.pushState({ _scanResult: true }, '')
    const handlePop = () => {
      scanNext()
    }
    window.addEventListener('popstate', handlePop)
    return () => window.removeEventListener('popstate', handlePop)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.div
      className="fixed inset-0 flex justify-center font-[Inter]"
      style={{ zIndex: 70 }}
      initial={{ opacity: 0 }}
      animate={{ 
        opacity: 1,
        background: approved 
          ? [
              'radial-gradient(circle at 50% 10%, rgba(5,231,119,0.18) 0%, transparent 60%), #0d0d0d',
              'radial-gradient(circle at 50% 25%, rgba(5,231,119,0.26) 0%, transparent 70%), #0d0d0d',
              'radial-gradient(circle at 50% 10%, rgba(5,231,119,0.18) 0%, transparent 60%), #0d0d0d'
            ]
          : [
              'radial-gradient(circle at 50% 0%, rgba(239,68,68,0.20) 0%, transparent 60%), #0d0000',
              'radial-gradient(circle at 50% 15%, rgba(239,68,68,0.32) 0%, transparent 70%), #0d0000',
              'radial-gradient(circle at 50% 0%, rgba(239,68,68,0.20) 0%, transparent 60%), #0d0000'
            ]
      }}
      exit={{ opacity: 0 }}
      transition={{
        background: { duration: 3.5, repeat: Infinity, ease: "easeInOut" }
      }}
    >
      {/* Alarm Pulse Overlay */}
      {!approved && (
        <motion.div 
          className="pointer-events-none absolute inset-0 bg-[#FF4D4D]/10" 
          animate={{ opacity: [0.04, 0.14, 0.04] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      {/* Scrollable content column */}
      <motion.div
        className="relative flex w-full max-w-[520px] flex-col overflow-y-auto text-[#E5E2E1]"
        style={{ 
          paddingBottom: 'calc(90px + 72px + env(safe-area-inset-bottom))',
          paddingTop: 4,
          scrollbarWidth: 'none',
        }}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.18 }}
      >
        {/* Header */}
        <header className="sticky top-0 z-10 flex h-[56px] shrink-0 items-center justify-between px-5"
          style={{ background: approved ? 'rgba(13,13,13,0.85)' : 'rgba(13,0,0,0.85)', backdropFilter: 'blur(20px)' }}
        >
          <motion.button 
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className={`flex h-10 w-10 items-center justify-start ${approved ? 'text-white/70' : 'text-[#FF4D4D]/80'}`} 
            type="button" 
            aria-label="Flash"
          >
            <span className="material-symbols-outlined text-[22px]">flash_on</span>
          </motion.button>
          <span className={`text-[13px] font-black uppercase tracking-[0.2em] ${approved ? 'text-white' : 'text-[#FF4D4D]'}`}>Scanner</span>
          <motion.button 
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className={`flex h-10 w-10 items-center justify-end ${approved ? 'text-white/70' : 'text-[#FF4D4D]/80'}`} 
            type="button" 
            aria-label="Help"
          >
            <span className="material-symbols-outlined text-[22px]">help_outline</span>
          </motion.button>
        </header>

        {/* ─── Main Content ─── */}
        <div className="flex flex-1 flex-col px-4">
          {approved ? (
            <>
              {/* ── APPROVED HERO ── */}
              <div className="flex flex-col items-center pt-6 pb-5 text-center">
                <div className="relative mb-4 flex h-[88px] w-[88px] items-center justify-center">
                  {[...Array(2)].map((_, idx) => (
                    <motion.div
                      key={idx}
                      className="absolute inset-[-10px] rounded-full border border-[#05E777]/25"
                      initial={{ scale: 0.85, opacity: 0.7 }}
                      animate={{ scale: 1.5, opacity: 0 }}
                      transition={{ duration: 1.8, repeat: Infinity, delay: idx * 0.9, ease: "easeOut" }}
                    />
                  ))}
                  <motion.div
                    className="relative z-10 flex h-[88px] w-[88px] items-center justify-center rounded-full border border-[#05E777]/50 bg-[#05E777]/20 shadow-[0_0_36px_8px_rgba(5,231,119,0.25)]"
                    initial={{ scale: 0.72, opacity: 0 }}
                    animate={{ scale: [0.72, 1.08, 1], opacity: 1 }}
                    transition={{ duration: 0.45, ease: 'easeOut' }}
                  >
                    <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#05E777" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
                      <motion.path d="M20 6L9 17l-5-5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, delay: 0.15, ease: "easeOut" }} />
                    </svg>
                  </motion.div>
                </div>
                <motion.h1 className="mb-0.5 text-[22px] font-bold leading-tight text-[#E5E2E1]" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
                  Ticket Approved
                </motion.h1>
                <motion.p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#00E475]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
                  Valid Entry
                </motion.p>
              </div>

              {/* ── APPROVED CARDS ── */}
              <motion.div className="flex flex-col gap-3" variants={containerVariants} initial="hidden" animate="show">
                
                {/* Attendee Row */}
                <motion.div variants={cardVariants} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/5 px-4 py-3 backdrop-blur-xl">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/8">
                    <span className="material-symbols-outlined text-[20px] text-[#C8C6C5]">person</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#C8C6C5]/60">Attendee</p>
                    <p className="truncate text-[16px] font-bold text-[#E5E2E1]">{attendee}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#C8C6C5]/60">Created</p>
                    <p className="max-w-[100px] truncate text-[13px] font-medium text-[#E5E2E1]">{feedbackEntry?.generatedAt || 'TBA'}</p>
                  </div>
                </motion.div>

                {/* Stat Cards Row */}
                <motion.div variants={cardVariants} className="grid grid-cols-2 gap-3">
                  <CompactCard icon="tag" label="Ticket ID" value={`#${fallbackTicketId}`} mono />
                  <CompactCard icon="confirmation_number" label="Type" value={feedbackEntry?.ticketType || 'N/A'} />
                  <CompactCard icon="qr_code_scanner" label="Total Scans" value={`${scanCount}`} accent="#00E475" big />
                  <CompactCard icon="fact_check" label="Result" value="Success" accent="#00E475" />
                </motion.div>

                {/* Event */}
                <motion.div variants={cardVariants} className="rounded-2xl border-l-4 border-l-[#05E777] border border-white/8 bg-white/5 px-4 py-3 backdrop-blur-xl">
                  <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#C8C6C5]/60">Event</p>
                  <p className="truncate text-[15px] font-semibold text-[#E5E2E1]">{feedbackEntry?.event || scanFeedback.message}</p>
                </motion.div>

                {/* More Details */}
                <motion.details className="group" variants={cardVariants}>
                  <summary className="flex cursor-pointer list-none items-center justify-center gap-2 py-3 text-[#C8C6C5] transition-colors group-open:text-[#E5E2E1]">
                    <span className="text-[11px] font-bold uppercase tracking-[0.18em]">More Details</span>
                    <span className="material-symbols-outlined text-[18px] transition-transform group-open:rotate-180">expand_more</span>
                  </summary>
                  <div className="grid grid-cols-2 gap-3 pt-1 pb-2">
                    <CompactCard icon="schedule" label="Scanned At" value={feedbackEntry?.scannedAt || 'Just now'} />
                    <CompactCard icon="badge" label="Scanned By" value={feedbackEntry?.scannedBy || sellerId || 'Gate Staff'} />
                  </div>
                </motion.details>
              </motion.div>
            </>
          ) : (
            <>
              {/* ── REJECTED HERO ── */}
              <div className="flex flex-col items-center pt-6 pb-4 text-center">
                <div className="relative mb-4 flex h-[100px] w-[100px] items-center justify-center">
                  {[...Array(3)].map((_, idx) => (
                    <motion.div
                      key={idx}
                      className="absolute inset-0 rounded-full border border-[#FF4D4D]/20"
                      initial={{ scale: 0.9, opacity: 0.7 }}
                      animate={{ scale: 1.65, opacity: 0 }}
                      transition={{ duration: 2.0, repeat: Infinity, delay: idx * 0.65, ease: "easeOut" }}
                    />
                  ))}
                  <div className="absolute inset-4 rounded-full border border-[#FF4D4D]/20" />
                  <motion.div
                    className="relative z-10 flex h-[80px] w-[80px] items-center justify-center rounded-full border border-[#FF4D4D]/50 bg-[#3A0000] shadow-[0_0_32px_rgba(255,77,77,0.5)]"
                    initial={{ scale: 0.72, opacity: 0, rotate: -10 }}
                    animate={{ scale: [0.72, 1.08, 1], opacity: 1, rotate: 0 }}
                    transition={{ duration: 0.45, ease: 'easeOut' }}
                  >
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#FF4D4D" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <motion.path d="M18 6L6 18" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 0.15, ease: "easeOut" }} />
                      <motion.path d="M6 6l12 12" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.4, delay: 0.3, ease: "easeOut" }} />
                    </svg>
                  </motion.div>
                </div>
                <motion.h2 
                  className="mb-0.5 text-[13px] font-black uppercase tracking-[0.22em] text-[#FF4D4D] drop-shadow-[0_0_8px_rgba(255,77,77,0.4)]"
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                >Ticket Rejected</motion.h2>
                <motion.p 
                  className="m-0 text-[15px] leading-6 text-[#C8C6C5]"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
                >Entry not allowed</motion.p>
              </div>

              {/* ── REJECTED CARDS ── */}
              <motion.div className="flex flex-col gap-3" variants={containerVariants} initial="hidden" animate="show">
                
                {/* Attendee Row */}
                <motion.div variants={cardVariants} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/5 px-4 py-3 backdrop-blur-xl">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#3A1010] border border-[#FF4D4D]/20">
                    <span className="text-[15px] font-bold text-[#E4BEBA]">{attendeeInitials}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#C8C6C5]/60">Attendee</p>
                    <p className="truncate text-[16px] font-bold text-[#E5E2E1]">{attendee}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#C8C6C5]/60">Created</p>
                    <p className="max-w-[100px] truncate text-[13px] font-medium text-[#E5E2E1]">{feedbackEntry?.generatedAt || 'TBA'}</p>
                  </div>
                </motion.div>

                {/* Reason Banner */}
                <motion.div variants={cardVariants} className="rounded-2xl border border-[#FF4D4D]/25 border-l-4 border-l-[#FF4D4D] bg-[#FF4D4D]/8 px-4 py-3 backdrop-blur-xl">
                  <div className="flex items-start gap-3">
                    <span className="material-symbols-outlined mt-0.5 text-[20px] text-[#FF4D4D]">warning</span>
                    <div className="min-w-0">
                      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#FF4D4D]/80">Reason</p>
                      <p className="text-[15px] font-bold text-[#E5E2E1]">{rejectedReason}</p>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-[#C8C6C5]/80">{scanFeedback.message} · Do not allow entry.</p>
                    </div>
                  </div>
                </motion.div>

                {/* Stat Cards */}
                <motion.div variants={cardVariants} className="grid grid-cols-2 gap-3">
                  <CompactCard icon="bar_chart" label="Total Scans" value={`${scanCount}`} accent="#FF4D4D" big />
                  <CompactCard icon="assignment_late" label="Result" value={`Failed${feedbackLabel ? ` (${feedbackLabel})` : ''}`} accent="#FF4D4D" />
                  <CompactCard icon="confirmation_number" label="Ticket Type" value={feedbackEntry?.ticketType || 'N/A'} />
                  <CompactCard icon="sell" label="Ticket ID" value={`#${fallbackTicketId}`} mono />
                </motion.div>

                {/* Event */}
                <motion.div variants={cardVariants} className="rounded-2xl border-l-4 border-l-[#FF4D4D]/60 border border-white/8 bg-white/5 px-4 py-3 backdrop-blur-xl">
                  <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#C8C6C5]/60">Event</p>
                  <p className="truncate text-[15px] font-semibold text-[#E5E2E1]">{feedbackEntry?.event || scanFeedback.message}</p>
                </motion.div>

                {/* More Details */}
                <motion.details className="group" variants={cardVariants}>
                  <summary className="flex cursor-pointer list-none items-center justify-center gap-2 py-3 text-[#FF4D4D]/80">
                    <span className="material-symbols-outlined text-[18px]">info</span>
                    <span className="text-[11px] font-black uppercase tracking-[0.18em]">More Details</span>
                  </summary>
                  <div className="grid grid-cols-2 gap-3 pt-1 pb-2">
                    <CompactCard icon="schedule" label="Attempt At" value={feedbackEntry?.scannedAt || 'Just now'} />
                    <CompactCard icon="history" label="First Scan" value={feedbackEntry?.originalScanAt || 'N/A'} />
                  </div>
                </motion.details>
              </motion.div>
            </>
          )}
        </div>
      </motion.div>

      {/* ── STICKY CTA BUTTON ── */}
      <div 
        className="fixed left-0 right-0 flex justify-center px-4"
        style={{ bottom: 'calc(90px + env(safe-area-inset-bottom))', zIndex: 73 }}
      >
        <motion.button
          onClick={scanNext}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.95 }}
          className={`flex h-14 w-full max-w-[520px] items-center justify-center gap-3 rounded-2xl text-[14px] font-black uppercase tracking-[0.15em] shadow-lg transition-all ${approved ? 'bg-[#05E777] text-[#003D1A] shadow-[0_4px_20px_rgba(5,231,119,0.45)]' : 'bg-[#FF4D4D] text-white shadow-[0_4px_20px_rgba(255,77,77,0.55)]'}`}
          type="button"
        >
          <span className="material-symbols-outlined text-[20px]">{approved ? 'barcode_scanner' : 'document_scanner'}</span>
          Scan Next Ticket
        </motion.button>
      </div>

      {/* ── BOTTOM NAV ── */}
      <nav className="fixed bottom-0 left-0 z-[72] flex h-[90px] w-full items-center justify-around rounded-t-3xl border-t border-white/10 bg-[#0d0d0d]/90 px-5 pb-[env(safe-area-inset-bottom)] shadow-2xl backdrop-blur-2xl">
        {[
          ['qr_code_scanner', 'Scanner'],
          ['history', 'History'],
          ['account_circle', 'Profile'],
        ].map(([icon, label], index) => (
          <button
            key={label}
            className={`flex min-w-[64px] flex-col items-center justify-center rounded-2xl p-2 transition-all active:scale-90 ${index === 0 ? (approved ? 'text-[#05E777]' : 'text-[#FF4D4D]') : 'text-[#C8C6C5]/50'}`}
            type="button"
            onClick={index === 0 ? scanNext : undefined}
          >
            <span className="material-symbols-outlined mb-0.5 text-[24px]">{icon}</span>
            <span className="text-[11px] font-semibold tracking-[0.05em]">{label}</span>
          </button>
        ))}
      </nav>
    </motion.div>
  )
}


function CompactCard({
  icon,
  label,
  value,
  accent,
  mono = false,
  big = false,
}: {
  icon: string
  label: string
  value: string
  accent?: string
  mono?: boolean
  big?: boolean
}) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/5 p-3 backdrop-blur-xl">
      <div className="mb-1 flex items-center gap-1.5">
        <span className="material-symbols-outlined text-[16px]" style={{ color: accent || '#C8C6C5' }}>{icon}</span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em]" style={{ color: accent || '#C8C6C5' }}>{label}</span>
      </div>
      <p
        className={`m-0 truncate font-bold ${big ? 'text-[22px] leading-tight' : 'text-[14px] leading-5'} ${mono ? 'font-mono text-[12px]' : ''}`}
        style={{ color: accent || '#E5E2E1' }}
      >{value}</p>
    </div>
  )
}


function RefinedResultCard({
  icon,
  label,
  value,
  accent,
  mono = false,
  large = false,
  compact = false,
  full = false,
}: {
  icon: string
  label: string
  value: string
  accent?: string
  mono?: boolean
  large?: boolean
  compact?: boolean
  full?: boolean
}) {
  return (
    <section className={`${full ? 'col-span-2' : ''} rounded-2xl border-t border-white/10 bg-[#201F1F]/40 ${compact ? 'p-3' : 'p-4'} shadow-lg ring-1 ring-inset ring-white/5 backdrop-blur-xl`}>
      <div className="mb-2 flex items-center gap-2">
        <span className="material-symbols-outlined text-[18px]" style={{ color: accent || '#C8C6C5' }}>{icon}</span>
        <span className="text-[12px] font-semibold uppercase tracking-[0.05em]" style={{ color: accent || '#C8C6C5' }}>{label}</span>
      </div>
      <p className={`m-0 truncate font-semibold ${large ? 'text-[24px] leading-8' : 'text-[16px] leading-6'} ${mono ? 'font-mono text-sm' : ''}`} style={{ color: accent || '#E5E2E1' }}>{value}</p>
    </section>
  )
}

function ScanResultField({ label, value, mono = false, dark = false }: { label: string; value: string; mono?: boolean; dark?: boolean }) {
  return (
    <div className={`min-w-0 rounded-lg px-3 py-3 ${dark ? 'bg-white/[0.045] border border-white/10' : 'bg-black/10'}`}>
      <p className={`mb-1 text-[10px] font-black uppercase tracking-[0.12em] ${dark ? 'text-[#C4C7C8]' : 'text-black/60'}`}>{label}</p>
      <p className={`truncate text-[13px] font-black leading-snug ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}

function ResultDetail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3">
      <p className="text-white/35 text-[10px] font-bold uppercase tracking-[0.14em] mb-1">{label}</p>
      <p className={`text-white text-[13px] font-semibold leading-snug truncate ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function getErrorMessage(err: string): string {
  if (err === 'camera_denied') return 'Camera access denied. Check browser settings.'
  if (err === 'camera_unavailable') return 'Camera not available on this device.'
  if (err === 'torch_unavailable') return 'Torch not supported on this device.'
  return 'Camera error. Tap Try Again.'
}

// ─── Scanner Orb ──────────────────────────────────────────────────────────────
function ScannerOrb({ phase, cameraActive, cameraError }: { phase: ScanPhase; cameraActive: boolean; cameraError: string | null }) {
  const isActive = cameraActive && !cameraError
  const isDetected = phase === 'detected'
  const isVerifying = phase === 'verifying'

  return (
    <div className={`sc-orb${isActive ? ' is-scanning' : ''}${isDetected ? ' is-detected' : ''}${isVerifying ? ' is-verifying' : ''}`}>
      {/* Outer rings */}
      <div className="sc-ring sc-ring-1" />
      <div className="sc-ring sc-ring-2" />
      {/* Pulse ring for detected state */}
      {(isDetected || isVerifying) && (
        <motion.div
          className={`sc-pulse-ring${isVerifying ? ' sc-pulse-ring-verify' : ''}`}
          initial={{ scale: 0.8, opacity: 0.8 }}
          animate={{ scale: 1.15, opacity: 0 }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'easeOut' }}
        />
      )}

      {/* Inner target */}
      <div className="sc-target">
        <div className="sc-target-glow" />
        <AnimatePresence mode="wait">
          {isVerifying ? (
            <motion.div
              key="verify-icon"
              className="sc-target-icon"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <SpinnerIcon />
            </motion.div>
          ) : isDetected ? (
            <motion.div
              key="detected-icon"
              className="sc-target-icon is-detected"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 16 }}
            >
              <DetectedCheckIcon />
            </motion.div>
          ) : isActive ? (
            <motion.div
              key="scan-icon"
              className="sc-target-icon"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <QrIcon />
            </motion.div>
          ) : (
            <motion.div
              key="ticket-icon"
              className="sc-target-icon"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              <TicketIcon />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Viewfinder corners — shown when camera active */}
      {isActive && (
        <>
          <motion.div
            className="sc-corner sc-corner-tl"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
          />
          <motion.div
            className="sc-corner sc-corner-tr"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.05 }}
          />
          <motion.div
            className="sc-corner sc-corner-br"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          />
          <motion.div
            className="sc-corner sc-corner-bl"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.15 }}
          />
          <motion.div
            className="sc-scan-line"
            animate={{ y: [-80, 80, -80] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        </>
      )}
    </div>
  )
}

// ─── NavButton ────────────────────────────────────────────────────────────────
function NavButton({ id, label, active, onClick, icon }: {
  id: string; label: string; active: boolean; onClick: () => void; icon: React.ReactNode
}) {
  return (
    <button
      id={id}
      type="button"
      className={`sc-nav-btn${active ? ' is-active' : ''}`}
      onClick={onClick}
      aria-label={label}
    >
      {active ? (
        <motion.div
          className="sc-nav-active-bg"
          layoutId="sc-nav-active"
          transition={{ type: 'spring', stiffness: 500, damping: 38 }}
        />
      ) : null}
      <span className="sc-nav-icon">{icon}</span>
      <span className="sc-nav-label">{label}</span>
    </button>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ type }: { type: 'approved' | 'rejected' }) {
  return (
    <motion.div
      className="sc-empty-state"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className={`sc-empty-icon${type === 'approved' ? ' is-approved' : ' is-rejected'}`}>
        {type === 'approved' ? <CheckCircleIcon /> : <CancelCircleIcon />}
      </div>
      <p className="sc-empty-title">
        {type === 'approved' ? 'No approved tickets yet' : 'No rejected tickets yet'}
      </p>
      <p className="sc-empty-desc">
        {type === 'approved' ? 'Approved scans will appear here.' : 'Rejected scans will appear here.'}
      </p>
    </motion.div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function QrIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
      <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="2" />
      <path d="M14 14h3v3M17 17h4M14 21h4v-3M14 17v1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
function HistoryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3.5 12a8.5 8.5 0 1 0 2.35-5.86M3.5 4.5v4h4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 7.5v5l3.2 1.9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM5.5 20a6.5 6.5 0 0 1 13 0" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  )
}
function FlashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M13 2L4.5 13.5H11L10 22L19.5 10.5H13L13 2Z" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function KeyboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 7h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 11h.01M10 11h.01M13 11h.01M16 11h.01M7 14h.01M10 14h4M17 14h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}
function TicketIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4.5 8.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v1.2a2.3 2.3 0 0 0 0 4.6v1.2a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-1.2a2.3 2.3 0 0 0 0-4.6V8.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 9h6M9 12h5M9 15h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m4 11 8-7 8 7M6.5 10.5V20h11v-9.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function CameraOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 3l18 18M10.5 5H17l2 3h2a1 1 0 0 1 1 1v9M21 15l-4.17-4.17M12 17a4 4 0 0 1-3.83-5.17M7 7H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h14" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function CheckCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.9" />
      <path d="m8 12 2.5 2.5L16 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function CancelCircleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.9" />
      <path d="m8.5 8.5 7 7M15.5 8.5l-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m6 12.6 3.5 3.5L18.5 7" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function CancelIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}
function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.9" />
      <path d="M12 7.5V12l3 1.8" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function ErrorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 8v5M12 16.5h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.9" />
    </svg>
  )
}
function SpinnerIcon() {
  return (
    <motion.svg viewBox="0 0 24 24" fill="none" aria-hidden="true"
      animate={{ rotate: 360 }}
      transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
    >
      <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2" strokeDasharray="32 16" />
    </motion.svg>
  )
}
function DetectedCheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <motion.path
        d="m6 12 4 4 8-8"
        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      />
    </svg>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = `
  /* ── Shell ── */
  .sc-shell {
    position: relative;
    min-height: 100dvh;
    width: 100%;
    overflow: hidden;
    background: #0b0f10;
    color: #e0e4ec;
    font-family: 'Geist', Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
  }
  .sc-shell *, .sc-shell button, .sc-shell input { box-sizing: border-box; font: inherit; }

  /* ── Ambient ── */
  .sc-ambient {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    overflow: hidden;
  }
  .sc-ambient-orb {
    position: absolute;
    border-radius: 50%;
    filter: blur(110px);
    mix-blend-mode: screen;
  }
  .sc-ambient-orb-1 {
    top: -12%;
    left: -22%;
    width: min(680px, 120vw);
    height: min(680px, 120vw);
    background: rgba(0, 122, 255, 0.28);
  }
  .sc-ambient-orb-2 {
    bottom: 4%;
    right: -28%;
    width: min(520px, 90vw);
    height: min(520px, 90vw);
    background: rgba(2, 150, 210, 0.18);
  }

  /* ── Video ── */
  .sc-video-feed {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0;
    transform: scale(1.03);
    transition: opacity 280ms ease;
    z-index: 0;
    pointer-events: none;
  }
  .sc-video-feed.is-active { opacity: 0.48; }
  .sc-hidden-canvas { display: none; }

  /* ── Tab content ── */
  .sc-tab-content {
    position: relative;
    z-index: 1;
    width: min(100%, 520px);
    margin: 0 auto;
    min-height: 100dvh;
    padding-bottom: 104px;
    display: flex;
    flex-direction: column;
  }

  /* ── Top bar ── */
  .sc-topbar {
    position: fixed;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10;
    width: min(100%, 520px);
    height: 88px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 24px 20px 12px;
    background: linear-gradient(to bottom, rgba(11,15,16,0.9) 0%, transparent 100%);
  }
  .sc-brand {
    display: flex;
    align-items: center;
    gap: 9px;
    color: #fff;
    font-size: 19px;
    font-weight: 800;
    letter-spacing: -0.3px;
    text-shadow: 0 0 20px rgba(0,122,255,0.4);
  }
  .sc-topbar-btn {
    width: 46px;
    height: 46px;
    border-radius: 50%;
    border: 1px solid rgba(255,255,255,0.1);
    background: linear-gradient(135deg, rgba(255,255,255,0.09), rgba(255,255,255,0.02));
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    box-shadow: 0 8px 32px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.1);
    color: #e0e4ec;
    display: grid;
    place-items: center;
    transition: transform 160ms ease, background 160ms ease, color 160ms ease;
  }
  .sc-topbar-btn svg { width: 20px; height: 20px; }
  .sc-topbar-btn:hover { transform: translateY(-1px); }
  .sc-topbar-btn:active { transform: scale(0.94); }
  .sc-topbar-btn.is-active { background: #007aff; color: #fff; box-shadow: 0 0 22px rgba(0,122,255,0.5); }

  /* ── Scanner main ── */
  .sc-scanner-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 100px 20px 16px;
    gap: 0;
  }

  /* ── Hero text ── */
  .sc-hero-text {
    text-align: center;
    margin-bottom: 36px;
    width: 100%;
  }
  .sc-eyebrow {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1.8px;
    text-transform: uppercase;
    color: #4fb0ff;
    margin: 0 0 10px;
  }
  .sc-title {
    margin: 0 0 8px;
    color: #fff;
    font-size: clamp(34px, 9vw, 46px);
    line-height: 1.04;
    font-weight: 800;
    letter-spacing: -0.02em;
    text-shadow: 0 0 22px rgba(0,122,255,0.38);
  }
  .sc-subtitle {
    margin: 0;
    color: #9aacbf;
    font-size: 15px;
    line-height: 1.55;
    min-height: 24px;
  }

  /* ── Orb ── */
  .sc-orb-container {
    width: 100%;
    border: 0;
    background: transparent;
    padding: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .sc-orb-container:active .sc-orb { transform: scale(0.97); }
  .sc-orb {
    position: relative;
    width: min(66vw, 260px);
    height: min(66vw, 260px);
    border-radius: 50%;
    display: grid;
    place-items: center;
    overflow: hidden;
    background: rgba(0,0,0,0.44);
    box-shadow:
      inset 0 20px 38px rgba(0,0,0,0.6),
      inset 0 1px 2px rgba(255,255,255,0.07),
      0 1px 0 rgba(255,255,255,0.09);
    transition: box-shadow 400ms ease, transform 160ms ease;
  }
  .sc-orb.is-scanning {
    box-shadow:
      inset 0 0 0 1.5px rgba(0,122,255,0.28),
      0 0 72px rgba(0,122,255,0.22);
  }
  .sc-orb.is-detected {
    box-shadow:
      inset 0 0 0 2px rgba(52,211,153,0.55),
      0 0 88px rgba(52,211,153,0.28);
  }
  .sc-orb.is-verifying {
    box-shadow:
      inset 0 0 0 2px rgba(251,191,36,0.45),
      0 0 80px rgba(251,191,36,0.2);
  }

  /* Rings */
  .sc-ring {
    position: absolute;
    border-radius: 50%;
    border: 1px solid rgba(0,122,255,0.2);
    pointer-events: none;
  }
  .sc-ring-1 { inset: 0; animation: sc-spin 12s linear infinite; }
  .sc-ring-2 { inset: 18px; border-color: rgba(79,176,255,0.12); animation: sc-spin 18s linear infinite reverse; }
  @keyframes sc-spin { to { transform: rotate(360deg); } }
  @keyframes sc-shimmer {
    100% { transform: translateX(100%); }
  }

  /* Pulse ring */
  .sc-pulse-ring {
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 2px solid rgba(52,211,153,0.6);
    pointer-events: none;
  }
  .sc-pulse-ring-verify { border-color: rgba(251,191,36,0.55); }

  /* Target */
  .sc-target {
    position: relative;
    width: 126px;
    height: 126px;
    border-radius: 30px;
    display: grid;
    place-items: center;
    overflow: hidden;
    background: linear-gradient(135deg, rgba(255,255,255,0.09), rgba(255,255,255,0.02));
    border: 1px solid rgba(255,255,255,0.1);
    box-shadow: 0 16px 44px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.1);
    transition: border-color 400ms ease, box-shadow 400ms ease;
  }
  .sc-target-glow {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: radial-gradient(circle at 50% 50%, rgba(0,122,255,0.2), transparent 65%);
    transition: background 400ms ease;
  }
  .sc-orb.is-detected .sc-target-glow { background: radial-gradient(circle at 50% 50%, rgba(52,211,153,0.25), transparent 65%); }
  .sc-orb.is-verifying .sc-target-glow { background: radial-gradient(circle at 50% 50%, rgba(251,191,36,0.22), transparent 65%); }

  .sc-target-icon {
    position: relative;
    z-index: 1;
    color: #28a3ff;
    display: grid;
    place-items: center;
    width: 54px;
    height: 54px;
    filter: drop-shadow(0 0 14px rgba(0,122,255,0.7));
  }
  .sc-target-icon svg { width: 54px; height: 54px; }
  .sc-target-icon.is-detected { color: #34d399; filter: drop-shadow(0 0 14px rgba(52,211,153,0.8)); }

  /* Viewfinder corners */
  .sc-corner {
    position: absolute;
    width: 34px;
    height: 34px;
    border-color: #45adff;
    border-style: solid;
    pointer-events: none;
  }
  .sc-corner-tl { top: 40px; left: 40px; border-width: 3px 0 0 3px; border-top-left-radius: 8px; }
  .sc-corner-tr { top: 40px; right: 40px; border-width: 3px 3px 0 0; border-top-right-radius: 8px; }
  .sc-corner-br { right: 40px; bottom: 40px; border-width: 0 3px 3px 0; border-bottom-right-radius: 8px; }
  .sc-corner-bl { left: 40px; bottom: 40px; border-width: 0 0 3px 3px; border-bottom-left-radius: 8px; }

  /* Scan line */
  .sc-scan-line {
    position: absolute;
    left: 46px;
    right: 46px;
    top: 50%;
    height: 2px;
    background: linear-gradient(90deg, transparent, #35aaff 30%, #35aaff 70%, transparent);
    box-shadow: 0 0 16px rgba(0,122,255,0.9), 0 0 32px rgba(0,122,255,0.4);
    pointer-events: none;
  }

  /* ── Camera error card ── */
  .sc-error-card {
    margin-top: 24px;
    width: 100%;
    background: linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.01));
    border: 1px solid rgba(255,255,255,0.09);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-radius: 22px;
    padding: 18px 18px 18px 16px;
    display: flex;
    align-items: flex-start;
    gap: 14px;
    box-shadow: 0 10px 36px rgba(0,0,0,0.3);
  }
  .sc-error-icon {
    width: 44px;
    height: 44px;
    flex: 0 0 auto;
    border-radius: 14px;
    background: rgba(239,68,68,0.12);
    color: #f87171;
    display: grid;
    place-items: center;
  }
  .sc-error-icon svg { width: 22px; height: 22px; }
  .sc-error-body { flex: 1; min-width: 0; }
  .sc-error-title { font-size: 14px; font-weight: 700; color: #fff; margin: 0 0 4px; }
  .sc-error-desc { font-size: 12px; color: #9aacbf; margin: 0; line-height: 1.5; }
  .sc-error-retry {
    flex: 0 0 auto;
    height: 36px;
    padding: 0 14px;
    border-radius: 12px;
    border: 1px solid rgba(0,122,255,0.4);
    background: rgba(0,122,255,0.14);
    color: #4fb0ff;
    font-size: 12px;
    font-weight: 700;
    transition: background 160ms ease;
  }
  .sc-error-retry:hover { background: rgba(0,122,255,0.22); }
  .sc-error-retry:active { transform: scale(0.95); }

  /* ── Footer (scanner actions) ── */
  .sc-footer {
    position: fixed;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    z-index: 8;
    width: min(100%, 520px);
    padding: 20px 18px 108px;
    background: linear-gradient(0deg, rgba(11,15,16,0.97) 0%, rgba(11,15,16,0.88) 55%, transparent 100%);
  }
  .sc-action-group {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 8px;
    border-radius: 28px;
    background: linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.015));
    border: 1px solid rgba(255,255,255,0.08);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    box-shadow: 0 18px 50px rgba(0,0,0,0.35), inset 0 1px 1px rgba(255,255,255,0.1);
  }
  .sc-action-primary,
  .sc-action-secondary {
    height: 72px;
    border-radius: 20px;
    border: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 0.2px;
    color: #fff;
    transition: transform 160ms ease, background 160ms ease, box-shadow 160ms ease;
  }
  .sc-action-primary svg, .sc-action-secondary svg { width: 22px; height: 22px; }
  .sc-action-primary:active, .sc-action-secondary:active { transform: scale(0.96); }
  .sc-action-primary {
    background: #007aff;
    box-shadow: 0 0 24px rgba(0,122,255,0.42);
  }
  .sc-action-primary:hover { background: #0070f0; box-shadow: 0 0 32px rgba(0,122,255,0.5); }
  .sc-action-secondary {
    background: rgba(40,44,48,0.7);
    border: 1px solid rgba(255,255,255,0.06);
  }
  .sc-action-secondary:hover { background: rgba(50,55,60,0.7); }

  /* ── Bottom nav ── */
  .sc-bottom-nav {
    position: fixed;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    z-index: 20;
    width: min(100%, 520px);
    padding: 0 16px 20px;
    padding-bottom: max(20px, env(safe-area-inset-bottom));
  }
  .sc-nav-pill {
    display: flex;
    align-items: center;
    justify-content: space-around;
    background: linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.015));
    border: 1px solid rgba(255,255,255,0.1);
    backdrop-filter: blur(28px);
    -webkit-backdrop-filter: blur(28px);
    box-shadow: 0 18px 48px rgba(0,0,0,0.45), 0 2px 0 rgba(255,255,255,0.07) inset;
    border-radius: 999px;
    padding: 6px;
    gap: 4px;
  }
  .sc-nav-btn {
    position: relative;
    flex: 1;
    height: 52px;
    border-radius: 999px;
    border: 0;
    background: transparent;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    color: rgba(193,198,215,0.7);
    transition: color 200ms ease;
  }
  .sc-nav-btn:active { transform: scale(0.93); }
  .sc-nav-btn.is-active { color: #fff; }
  .sc-nav-active-bg {
    position: absolute;
    inset: 0;
    border-radius: 999px;
    background: rgba(255,255,255,0.12);
    box-shadow: 0 0 18px rgba(0,122,255,0.25);
  }
  .sc-nav-icon { position: relative; z-index: 1; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; }
  .sc-nav-icon svg { width: 22px; height: 22px; }
  .sc-nav-label { position: relative; z-index: 1; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; line-height: 1; }

  /* ── History tab ── */
  .sc-history-tab { overflow-y: auto; }
  .sc-page-header {
    position: sticky;
    top: 0;
    z-index: 5;
    background: linear-gradient(to bottom, rgba(11,15,16,0.96) 60%, transparent);
    padding: 56px 20px 12px;
  }
  .sc-page-title {
    font-size: 34px;
    font-weight: 800;
    color: #fff;
    margin: 0 0 4px;
    letter-spacing: -0.02em;
  }
  .sc-page-subtitle { font-size: 13px; color: rgba(255,255,255,0.5); margin: 0; }

  .sc-hist-filters {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    padding: 0 20px;
    margin-bottom: 16px;
  }
  .sc-hist-filter-btn {
    height: 48px;
    border-radius: 18px;
    border: 1px solid rgba(255,255,255,0.1);
    background: linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.015));
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    box-shadow: 0 8px 26px rgba(0,0,0,0.25), inset 0 1px 1px rgba(255,255,255,0.1);
    color: rgba(255,255,255,0.5);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    transition: transform 160ms ease, background 200ms ease, color 200ms ease, border-color 200ms ease;
  }
  .sc-hist-filter-btn:active { transform: scale(0.96); }
  .sc-hist-filter-btn svg { width: 18px; height: 18px; }
  .sc-hist-filter-btn.is-approved {
    color: #34d399;
    border-color: rgba(52,211,153,0.35);
    background: linear-gradient(135deg, rgba(52,211,153,0.12), rgba(0,0,0,0.3));
    box-shadow: 0 8px 28px rgba(0,0,0,0.28), inset 0 0 14px rgba(52,211,153,0.1);
  }
  .sc-hist-filter-btn.is-rejected {
    color: #f87171;
    border-color: rgba(239,68,68,0.32);
    background: linear-gradient(135deg, rgba(239,68,68,0.1), rgba(0,0,0,0.3));
    box-shadow: 0 8px 28px rgba(0,0,0,0.28), inset 0 0 14px rgba(239,68,68,0.08);
  }

  .sc-hist-list-wrap { flex: 1; padding: 0 20px 16px; overflow: visible; }
  .sc-hist-list { display: flex; flex-direction: column; gap: 10px; min-height: 120px; }

  .sc-hist-card {
    position: relative;
    display: flex;
    align-items: center;
    gap: 13px;
    padding: 13px 15px;
    border-radius: 22px;
    overflow: hidden;
    background: linear-gradient(145deg, rgba(25,18,10,0.9), rgba(5,5,5,0.95));
    border-top: 1px solid rgba(255,255,255,0.13);
    border-left: 1px solid rgba(255,255,255,0.08);
    border-right: 1px solid rgba(0,0,0,0.2);
    border-bottom: 1px solid rgba(0,0,0,0.35);
    box-shadow: 0 10px 30px rgba(0,0,0,0.28);
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
  }
  .sc-hist-card-glow { position: absolute; inset: 0; z-index: 0; pointer-events: none; }
  .sc-hist-card-glow-approved { background: radial-gradient(circle at 95% 10%, rgba(52,211,153,0.14), transparent 55%); }
  .sc-hist-card-glow-rejected { background: radial-gradient(circle at 95% 10%, rgba(239,68,68,0.13), transparent 55%); }

  .sc-hist-status-icon {
    position: relative;
    z-index: 1;
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: grid;
    place-items: center;
  }
  .sc-hist-status-icon svg { width: 18px; height: 18px; }
  .sc-hist-status-icon.is-approved { color: #34d399; background: rgba(52,211,153,0.12); }
  .sc-hist-status-icon.is-rejected { color: #f87171; background: rgba(239,68,68,0.12); }

  .sc-hist-card-body { position: relative; z-index: 1; flex: 1; min-width: 0; }
  .sc-hist-card-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 5px; }
  .sc-hist-card-title { font-size: 14px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sc-hist-card-id { flex: 0 0 auto; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 10px; }
  .sc-hist-card-id.is-approved { color: rgba(52,211,153,0.8); }
  .sc-hist-card-id.is-rejected { color: rgba(239,68,68,0.8); }
  .sc-hist-card-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .sc-hist-card-meta > span {
    display: flex;
    align-items: center;
    gap: 4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    color: rgba(255,255,255,0.45);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 140px;
  }
  .sc-hist-card-meta svg { width: 13px; height: 13px; flex: 0 0 auto; }

  /* ── Empty state ── */
  .sc-empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 20px;
    text-align: center;
    gap: 12px;
  }
  .sc-empty-icon {
    width: 56px;
    height: 56px;
    border-radius: 18px;
    display: grid;
    place-items: center;
    margin-bottom: 4px;
  }
  .sc-empty-icon svg { width: 28px; height: 28px; }
  .sc-empty-icon.is-approved { background: rgba(52,211,153,0.1); color: #34d399; }
  .sc-empty-icon.is-rejected { background: rgba(239,68,68,0.1); color: #f87171; }
  .sc-empty-title { font-size: 16px; font-weight: 700; color: #fff; margin: 0; }
  .sc-empty-desc { font-size: 13px; color: rgba(255,255,255,0.45); margin: 0; }

  /* ── Profile tab ── */
  .sc-profile-tab { align-items: stretch; }
  .sc-profile-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px 20px 32px;
    gap: 20px;
  }
  .sc-profile-avatar-wrap { position: relative; width: 88px; height: 88px; }
  .sc-profile-avatar {
    width: 88px;
    height: 88px;
    border-radius: 50%;
    background: linear-gradient(135deg, rgba(0,122,255,0.25), rgba(2,150,210,0.12));
    border: 1.5px solid rgba(0,122,255,0.35);
    display: grid;
    place-items: center;
    color: #4fb0ff;
    position: relative;
    z-index: 1;
  }
  .sc-profile-avatar svg { width: 40px; height: 40px; }
  .sc-profile-avatar-ring {
    position: absolute;
    inset: -5px;
    border-radius: 50%;
    border: 1px solid rgba(0,122,255,0.2);
    animation: sc-spin 18s linear infinite;
  }
  .sc-profile-info { display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .sc-profile-name { font-size: 22px; font-weight: 800; color: #fff; margin: 0; letter-spacing: -0.02em; text-transform: capitalize; }
  .sc-profile-badge { font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #4fb0ff; background: rgba(0,122,255,0.12); border: 1px solid rgba(0,122,255,0.25); padding: 4px 12px; border-radius: 999px; }

  .sc-profile-stats {
    width: 100%;
    background: linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.015));
    border: 1px solid rgba(255,255,255,0.1);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-radius: 24px;
    padding: 20px;
    display: flex;
    align-items: center;
    justify-content: space-around;
    box-shadow: 0 10px 36px rgba(0,0,0,0.3), inset 0 1px 1px rgba(255,255,255,0.08);
  }
  .sc-stat-card { display: flex; flex-direction: column; align-items: center; gap: 6px; }
  .sc-stat-value { font-size: 28px; font-weight: 800; color: #fff; line-height: 1; }
  .sc-stat-value.sc-stat-approved { color: #34d399; }
  .sc-stat-value.sc-stat-rejected { color: #f87171; }
  .sc-stat-label { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.45); letter-spacing: 0.08em; text-transform: uppercase; }
  .sc-stat-divider { width: 1px; height: 42px; background: rgba(255,255,255,0.1); }

  .sc-profile-exit {
    width: 100%;
    height: 56px;
    border-radius: 18px;
    border: 1px solid rgba(255,255,255,0.1);
    background: linear-gradient(135deg, rgba(255,255,255,0.07), rgba(255,255,255,0.015));
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    color: #c1c6d7;
    font-size: 14px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    transition: background 160ms ease, transform 160ms ease;
    margin-top: 4px;
  }
  .sc-profile-exit svg { width: 20px; height: 20px; }
  .sc-profile-exit:hover { background: rgba(255,255,255,0.1); }
  .sc-profile-exit:active { transform: scale(0.97); }

  /* ── Modal ── */
  .sc-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: flex;
    align-items: flex-end;
    background: rgba(0,0,0,0.65);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }
  .sc-modal {
    width: min(100%, 520px);
    margin: 0 auto;
    padding: 10px 20px 30px;
    border-radius: 28px 28px 0 0;
    background: linear-gradient(180deg, rgba(28,32,34,0.97), rgba(11,15,16,0.99));
    border-top: 1px solid rgba(255,255,255,0.1);
    border-left: 1px solid rgba(255,255,255,0.07);
    border-right: 1px solid rgba(255,255,255,0.07);
    box-shadow: 0 -24px 60px rgba(0,0,0,0.5);
    backdrop-filter: blur(28px);
    -webkit-backdrop-filter: blur(28px);
  }
  .sc-modal-handle { width: 42px; height: 4px; margin: 0 auto 22px; border-radius: 999px; background: rgba(255,255,255,0.2); }
  .sc-modal h2 { margin: 0 0 14px; color: #fff; font-size: 20px; font-weight: 800; }
  .sc-modal input {
    display: block;
    width: 100%;
    height: 54px;
    margin-bottom: 12px;
    padding: 0 16px;
    border-radius: 18px;
    border: 1px solid rgba(255,255,255,0.1);
    outline: none;
    color: #fff;
    background: rgba(255,255,255,0.06);
    font-size: 15px;
    transition: border-color 200ms ease, box-shadow 200ms ease;
  }
  .sc-modal input:focus { border-color: rgba(0,122,255,0.75); box-shadow: 0 0 0 3px rgba(0,122,255,0.14); }
  .sc-modal button {
    display: block;
    width: 100%;
    height: 54px;
    border: 0;
    border-radius: 18px;
    color: #fff;
    background: #007aff;
    font-size: 15px;
    font-weight: 800;
    box-shadow: 0 0 24px rgba(0,122,255,0.35);
    transition: background 160ms ease, transform 160ms ease;
  }
  .sc-modal button:hover { background: #0070f0; }
  .sc-modal button:active { transform: scale(0.97); }

  /* ── Responsive ── */
  @media (max-height: 740px) {
    .sc-scanner-main { padding-top: 88px; }
    .sc-hero-text { margin-bottom: 24px; }
    .sc-title { font-size: 30px; }
    .sc-orb { width: min(58vw, 220px); height: min(58vw, 220px); }
    .sc-target { width: 108px; height: 108px; border-radius: 26px; }
    .sc-corner-tl, .sc-corner-tr { top: 34px; }
    .sc-corner-br, .sc-corner-bl { bottom: 34px; }
    .sc-corner-tl, .sc-corner-bl { left: 34px; }
    .sc-corner-tr, .sc-corner-br { right: 34px; }
  }
  @media (max-width: 360px) {
    .sc-action-primary, .sc-action-secondary { height: 64px; font-size: 12px; }
    .sc-nav-label { font-size: 9px; }
  }
`
