import { AnimatePresence, motion } from 'framer-motion'
import jsQR from 'jsqr'
import { useCallback, useEffect, useRef, useState } from 'react'
import LittixLogo from '../components/LittixLogo'

interface Props {
  onBack: () => void
  onScan: (raw: string) => void
}

type ScannerMode = 'hub' | 'camera'
type HistoryFilter = 'scanned' | 'rejected'
type HistoryItem = {
  id: string
  title: string
  time: string
  detail: string
  status: HistoryFilter
}

type TorchTrack = MediaStreamTrack & {
  getCapabilities?: () => MediaTrackCapabilities & { torch?: boolean }
  applyConstraints?: (
    constraints: MediaTrackConstraints & { advanced?: Array<{ torch?: boolean }> },
  ) => Promise<void>
}

export default function QRScanner({ onBack, onScan }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const scanTimerRef = useRef<number | null>(null)
  const scanningRef = useRef(false)

  const [mode, setMode] = useState<ScannerMode>('hub')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualId, setManualId] = useState('')
  const [torchOn, setTorchOn] = useState(false)
  const [detected, setDetected] = useState(false)
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('scanned')

  const isCamera = mode === 'camera'
  const visibleHistory = scanHistoryItems.filter((item) => item.status === historyFilter)

  const stopCamera = useCallback(() => {
    if (scanTimerRef.current) {
      window.clearTimeout(scanTimerRef.current)
      scanTimerRef.current = null
    }

    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    scanningRef.current = false
    setTorchOn(false)

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  const scanFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current

    if (
      video &&
      canvas &&
      video.readyState === video.HAVE_ENOUGH_DATA &&
      video.videoWidth > 0 &&
      video.videoHeight > 0 &&
      scanningRef.current
    ) {
      const ctx = canvas.getContext('2d', { willReadFrequently: true })

      if (ctx) {
        const maxDim = 640
        const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight))
        const width = Math.floor(video.videoWidth * scale)
        const height = Math.floor(video.videoHeight * scale)

        canvas.width = width
        canvas.height = height
        ctx.drawImage(video, 0, 0, width, height)

        const imageData = ctx.getImageData(0, 0, width, height)
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        })

        if (code?.data) {
          scanningRef.current = false
          setDetected(true)
          stopCamera()
          onScan(code.data)
          return
        }
      }
    }

    if (scanningRef.current) {
      scanTimerRef.current = window.setTimeout(scanFrame, 180)
    }
  }, [onScan, stopCamera])

  const openCamera = useCallback(async () => {
    setCameraError(null)
    setDetected(false)
    stopCamera()
    setMode('camera')

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera unavailable')
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })

      streamRef.current = stream
      scanningRef.current = true

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      scanFrame()
    } catch {
      scanningRef.current = false
      setCameraError('Camera access unavailable')
    }
  }, [scanFrame, stopCamera])

  useEffect(() => stopCamera, [stopCamera])

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0] as TorchTrack | undefined
    const capabilities = track?.getCapabilities?.()

    if (!track || !capabilities?.torch) {
      setCameraError('Torch is not available on this device')
      return
    }

    try {
      const next = !torchOn
      await track.applyConstraints?.({
        advanced: [{ torch: next }],
      } as MediaTrackConstraints & { advanced: Array<{ torch: boolean }> })
      setTorchOn(next)
      setCameraError(null)
    } catch {
      setCameraError('Torch could not be enabled')
    }
  }

  function submitManual() {
    const value = manualId.trim()
    if (value) {
      stopCamera()
      onScan(value)
    }
  }

  function exitCamera() {
    stopCamera()
    setMode('hub')
    setCameraError(null)
    setDetected(false)
  }

  function handleBack() {
    if (isCamera) {
      exitCamera()
      return
    }

    onBack()
  }

  return (
    <div className="scan-hub-shell">
      <style>{scannerStyles}</style>

      <div className="scan-ambient" aria-hidden="true">
        <div className="scan-glow scan-glow-top" />
        <div className="scan-glow scan-glow-bottom" />
      </div>

      <video
        ref={videoRef}
        playsInline
        muted
        className={`scan-camera-feed ${isCamera ? 'is-visible' : ''}`}
      />
      <canvas ref={canvasRef} className="scan-hidden-canvas" />

      <header className="scan-topbar">
        <button className="scan-icon-button" type="button" onClick={handleBack} aria-label={isCamera ? 'Close scanner' : 'Back'}>
          {isCamera ? <CloseIcon /> : <MenuIcon />}
        </button>

        <div className="scan-brand">
          <LittixLogo dark size="sm" />
          <span>LITTIX</span>
        </div>

        <button
          className={`scan-icon-button ${isCamera && torchOn ? 'is-active' : ''}`}
          type="button"
          onClick={isCamera ? toggleTorch : openCamera}
          aria-label={isCamera ? 'Toggle torch' : 'Open scanner'}
        >
          {isCamera ? <LightIcon /> : <SearchIcon />}
        </button>
      </header>

      <main className={`scan-main ${isCamera ? 'is-camera-mode' : ''}`}>
        <motion.section
          className="scan-hero"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="scan-kicker">Event access</p>
          <h1>{isCamera ? 'Scanning' : 'Start Scan'}</h1>
          <p>{isCamera ? cameraError || 'Position code within frame' : 'Position code within frame'}</p>

          <motion.div
            className={`scan-orb ${isCamera ? 'has-camera' : ''} ${detected ? 'is-detected' : ''}`}
            animate={{ scale: detected ? 1.04 : 1 }}
            transition={{ duration: 0.25 }}
          >
            <div className="scan-ring scan-ring-one" />
            <div className="scan-ring scan-ring-two" />
            <div className="scan-target">
              <div className="scan-target-glow" />
              {isCamera ? <ScanIcon /> : <TicketIcon />}
            </div>

            {isCamera && !cameraError && (
              <>
                <div className="scan-viewfinder-corner corner-tl" />
                <div className="scan-viewfinder-corner corner-tr" />
                <div className="scan-viewfinder-corner corner-br" />
                <div className="scan-viewfinder-corner corner-bl" />
                <motion.div
                  className="scan-line"
                  animate={{ y: [-74, 74, -74] }}
                  transition={{ duration: 2.15, repeat: Infinity, ease: 'easeInOut' }}
                />
              </>
            )}
          </motion.div>
        </motion.section>

        {!isCamera && (
          <motion.section
            className="scan-history-panel"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            aria-label="Scan history"
          >
            <div className="scan-history-heading">
              <span>
                <strong>Scan History</strong>
                <small>Review recent ticket processing logs.</small>
              </span>
              <HistoryIcon />
            </div>

            <div className="scan-history-filters" role="tablist" aria-label="Scan history filter">
              <button
                className={historyFilter === 'scanned' ? 'is-selected' : ''}
                type="button"
                onClick={() => setHistoryFilter('scanned')}
                role="tab"
                aria-selected={historyFilter === 'scanned'}
              >
                <CheckIcon />
                <span>Scanned</span>
              </button>
              <button
                className={historyFilter === 'rejected' ? 'is-selected is-rejected' : 'is-rejected'}
                type="button"
                onClick={() => setHistoryFilter('rejected')}
                role="tab"
                aria-selected={historyFilter === 'rejected'}
              >
                <CancelIcon />
                <span>Rejected</span>
              </button>
            </div>

            <div className="scan-history-list">
              <div className="scan-history-backdrop scan-history-backdrop-one" />
              <div className="scan-history-backdrop scan-history-backdrop-two" />

              {visibleHistory.map((item) => (
                <article className={`scan-history-card is-${item.status}`} key={item.id}>
                  <div className="scan-history-card-glow" />
                  <span className="scan-history-status-icon">
                    {item.status === 'scanned' ? <CheckIcon /> : <CancelIcon />}
                  </span>
                  <span className="scan-history-copy">
                    <span className="scan-history-title-row">
                      <strong>{item.title}</strong>
                      <code>{item.id}</code>
                    </span>
                    <span className="scan-history-meta">
                      <small>
                        <ClockIcon />
                        {item.time}
                      </small>
                      <small>
                        {item.status === 'scanned' ? <PersonIcon /> : <ErrorIcon />}
                        {item.detail}
                      </small>
                    </span>
                  </span>
                </article>
              ))}
            </div>
          </motion.section>
        )}
      </main>

      <footer className="scan-actions">
        <div className="scan-action-group">
          <button className="scan-primary-action" type="button" onClick={openCamera}>
            <ScanIcon />
            <span>Scan QR</span>
          </button>
          <button className="scan-secondary-action" type="button" onClick={() => setManualOpen(true)}>
            <KeyboardIcon />
            <span>Manual</span>
          </button>
        </div>

        <nav className="scan-bottom-nav" aria-label="Scanner navigation">
          <button className="is-selected" type="button" onClick={isCamera ? exitCamera : openCamera} aria-label="Scan">
            <ScanIcon />
          </button>
          <button type="button" onClick={() => setManualOpen(true)} aria-label="Manual entry">
            <KeyboardIcon />
          </button>
          <button type="button" onClick={onBack} aria-label="Exit scanner">
            <HomeIcon />
          </button>
        </nav>
      </footer>

      <AnimatePresence>
        {manualOpen && (
          <motion.div
            className="scan-modal-backdrop"
            onClick={() => setManualOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="scan-modal"
              onClick={(event) => event.stopPropagation()}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            >
              <div className="scan-modal-handle" />
              <h2>Enter Ticket ID</h2>
              <input
                autoFocus
                value={manualId}
                onChange={(event) => setManualId(event.target.value)}
                onKeyDown={(event) => event.key === 'Enter' && submitManual()}
                placeholder="e.g. TML-2026-00847"
              />
              <button type="button" onClick={submitManual}>
                Verify Ticket
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const scanHistoryItems: HistoryItem[] = [
  {
    id: '#TX-8924A',
    title: 'VIP Entry: NEON GA',
    time: '22:45, Oct 24',
    detail: 'Alex Vance',
    status: 'scanned',
  },
  {
    id: '#TX-5542B',
    title: 'BACKSTAGE PASS',
    time: '21:30, Oct 24',
    detail: 'C. Redfield',
    status: 'scanned',
  },
  {
    id: '#TX-1109X',
    title: 'GA Entry: SECTOR 4',
    time: '22:15, Oct 24',
    detail: 'Expired',
    status: 'rejected',
  },
]

const scannerStyles = `
  .scan-hub-shell {
    position: relative;
    min-height: 100vh;
    width: 100%;
    overflow: hidden;
    background:
      radial-gradient(circle at 18% -10%, rgba(0, 122, 255, 0.24), transparent 36%),
      radial-gradient(circle at 120% 68%, rgba(2, 132, 199, 0.18), transparent 34%),
      #0b0f10;
    color: #e8edf2;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .scan-hub-shell button,
  .scan-hub-shell input {
    font: inherit;
  }

  .scan-ambient {
    position: fixed;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .scan-glow {
    position: absolute;
    border-radius: 999px;
    filter: blur(120px);
    mix-blend-mode: screen;
  }

  .scan-glow-top {
    top: -16%;
    left: -26%;
    width: min(640px, 110vw);
    height: min(640px, 110vw);
    background: rgba(0, 122, 255, 0.32);
  }

  .scan-glow-bottom {
    right: -32%;
    bottom: 6%;
    width: min(560px, 86vw);
    height: min(560px, 86vw);
    background: rgba(8, 145, 178, 0.22);
  }

  .scan-camera-feed {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 0;
    transform: scale(1.02);
    transition: opacity 260ms ease;
    z-index: 0;
  }

  .scan-camera-feed.is-visible {
    opacity: 0.5;
  }

  .scan-hidden-canvas {
    display: none;
  }

  .scan-topbar {
    position: fixed;
    top: 0;
    left: 50%;
    z-index: 5;
    width: min(100%, 520px);
    height: 92px;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 24px 20px 12px;
  }

  .scan-icon-button,
  .scan-bottom-nav,
  .scan-action-group,
  .scan-modal {
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.015));
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.35), inset 0 1px 1px rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
  }

  .scan-icon-button {
    width: 48px;
    height: 48px;
    border-radius: 999px;
    color: #e8edf2;
    display: grid;
    place-items: center;
    transition: transform 180ms ease, background 180ms ease, color 180ms ease;
  }

  .scan-icon-button:hover {
    transform: translateY(-1px);
    color: #4fb0ff;
  }

  .scan-icon-button.is-active {
    background: #007aff;
    color: #fff;
    box-shadow: 0 0 24px rgba(0, 122, 255, 0.46);
  }

  .scan-icon-button svg,
  .scan-bottom-nav svg,
  .scan-action-group svg,
  .scan-history-icon svg {
    width: 22px;
    height: 22px;
  }

  .scan-brand {
    display: flex;
    align-items: center;
    gap: 9px;
    color: #fff;
    font-size: 20px;
    font-weight: 800;
    letter-spacing: 0;
    text-shadow: 0 0 18px rgba(0, 122, 255, 0.38);
  }

  .scan-main {
    position: relative;
    z-index: 1;
    width: min(100%, 520px);
    min-height: 100vh;
    margin: 0 auto;
    padding: 112px 20px 232px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .scan-main.is-camera-mode {
    padding-bottom: 208px;
  }

  .scan-hero {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px 0 16px;
    text-align: center;
  }

  .scan-kicker {
    margin: 0 0 10px;
    color: #7ec5ff;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .scan-hero h1 {
    margin: 0 0 8px;
    color: #fff;
    font-size: clamp(36px, 9vw, 48px);
    line-height: 1.05;
    font-weight: 800;
    letter-spacing: 0;
    text-shadow: 0 0 18px rgba(0, 122, 255, 0.42);
  }

  .scan-hero p:not(.scan-kicker) {
    min-height: 24px;
    margin: 0 0 38px;
    color: #c1c6d7;
    font-size: 16px;
    line-height: 1.5;
  }

  .scan-orb {
    position: relative;
    width: min(68vw, 264px);
    height: min(68vw, 264px);
    border-radius: 999px;
    display: grid;
    place-items: center;
    overflow: hidden;
    background: rgba(0, 0, 0, 0.42);
    box-shadow:
      inset 0 18px 34px rgba(0, 0, 0, 0.58),
      inset 0 1px 2px rgba(255, 255, 255, 0.08),
      0 1px 0 rgba(255, 255, 255, 0.1);
  }

  .scan-orb.has-camera {
    background: rgba(0, 0, 0, 0.24);
    box-shadow:
      inset 0 0 0 1px rgba(0, 122, 255, 0.22),
      0 0 80px rgba(0, 122, 255, 0.18);
  }

  .scan-orb.is-detected {
    box-shadow:
      inset 0 0 0 1px rgba(80, 220, 160, 0.55),
      0 0 88px rgba(80, 220, 160, 0.24);
  }

  .scan-ring {
    position: absolute;
    border-radius: 999px;
    border: 1px solid rgba(0, 122, 255, 0.22);
  }

  .scan-ring-one {
    inset: 0;
    animation: scan-spin 10s linear infinite;
  }

  .scan-ring-two {
    inset: 16px;
    border-color: rgba(79, 176, 255, 0.14);
    animation: scan-spin 15s linear infinite reverse;
  }

  .scan-target {
    position: relative;
    width: 128px;
    height: 128px;
    border-radius: 32px;
    display: grid;
    place-items: center;
    overflow: hidden;
    color: #28a3ff;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02));
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 18px 44px rgba(0, 0, 0, 0.38), inset 0 1px 1px rgba(255, 255, 255, 0.1);
  }

  .scan-target svg {
    position: relative;
    z-index: 1;
    width: 54px;
    height: 54px;
    filter: drop-shadow(0 0 14px rgba(0, 122, 255, 0.78));
  }

  .scan-target-glow {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: radial-gradient(circle at 50% 50%, rgba(0, 122, 255, 0.18), transparent 64%);
  }

  .scan-line {
    position: absolute;
    left: 44px;
    right: 44px;
    top: 50%;
    height: 2px;
    background: linear-gradient(90deg, transparent, #35aaff, transparent);
    box-shadow: 0 0 16px rgba(0, 122, 255, 0.9);
  }

  .scan-viewfinder-corner {
    position: absolute;
    width: 36px;
    height: 36px;
    border-color: #45adff;
    border-style: solid;
  }

  .corner-tl {
    top: 42px;
    left: 42px;
    border-width: 3px 0 0 3px;
    border-top-left-radius: 8px;
  }

  .corner-tr {
    top: 42px;
    right: 42px;
    border-width: 3px 3px 0 0;
    border-top-right-radius: 8px;
  }

  .corner-br {
    right: 42px;
    bottom: 42px;
    border-width: 0 3px 3px 0;
    border-bottom-right-radius: 8px;
  }

  .corner-bl {
    left: 42px;
    bottom: 42px;
    border-width: 0 0 3px 3px;
    border-bottom-left-radius: 8px;
  }

  .scan-stack {
    position: relative;
    width: 100%;
    height: 160px;
    margin-top: 4px;
  }

  .scan-stack-card {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 112px;
    border-radius: 28px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: 0 26px 46px rgba(0, 0, 0, 0.36);
  }

  .scan-stack-card-third {
    z-index: 1;
    transform: translateY(32px) scale(0.9);
    opacity: 0.5;
    background: linear-gradient(180deg, #2e3c45, #242f36);
    filter: brightness(0.6);
  }

  .scan-stack-card-second {
    z-index: 2;
    transform: translateY(16px) scale(0.95);
    opacity: 0.82;
    background: linear-gradient(180deg, #242f36, #1a2228);
    filter: brightness(0.8);
  }

  .scan-stack-card-front {
    z-index: 3;
    height: 116px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 22px;
    color: #fff;
    text-align: left;
    background: linear-gradient(180deg, rgba(26, 34, 40, 0.94), rgba(16, 20, 21, 0.94));
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
  }

  .scan-stack-card-front span:nth-child(2) {
    flex: 1;
    min-width: 0;
  }

  .scan-stack-card-front strong,
  .scan-stack-card-front small {
    display: block;
    letter-spacing: 0;
  }

  .scan-stack-card-front strong {
    font-size: 18px;
    line-height: 1.35;
  }

  .scan-stack-card-front small {
    margin-top: 2px;
    color: #c1c6d7;
    font-size: 14px;
  }

  .scan-history-icon {
    width: 50px;
    height: 50px;
    border-radius: 999px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    color: #c1c6d7;
    background: rgba(255, 255, 255, 0.07);
  }

  .scan-history-panel {
    width: 100%;
    position: relative;
    z-index: 1;
    margin-top: 4px;
    padding-bottom: 12px;
  }

  .scan-history-heading {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 14px;
  }

  .scan-history-heading strong,
  .scan-history-heading small {
    display: block;
    letter-spacing: 0;
  }

  .scan-history-heading strong {
    color: #fff;
    font-size: 28px;
    line-height: 1.16;
    font-weight: 800;
    text-shadow: 0 0 18px rgba(242, 169, 0, 0.22);
  }

  .scan-history-heading small {
    margin-top: 3px;
    color: rgba(255, 255, 255, 0.58);
    font-size: 13px;
    line-height: 1.45;
  }

  .scan-history-heading svg {
    width: 24px;
    height: 24px;
    flex: 0 0 auto;
    color: #f2a900;
    opacity: 0.9;
  }

  .scan-history-filters {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 18px;
  }

  .scan-history-filters button {
    height: 48px;
    border-radius: 18px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    color: rgba(255, 255, 255, 0.55);
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02));
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    text-transform: uppercase;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0;
    transition: transform 180ms ease, color 180ms ease, border-color 180ms ease, background 180ms ease;
  }

  .scan-history-filters button:active {
    transform: scale(0.97);
  }

  .scan-history-filters button svg {
    width: 20px;
    height: 20px;
  }

  .scan-history-filters button.is-selected {
    color: #f2a900;
    border-color: rgba(242, 169, 0, 0.36);
    background: linear-gradient(135deg, rgba(242, 169, 0, 0.14), rgba(0, 0, 0, 0.34));
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3), inset 0 0 16px rgba(242, 169, 0, 0.12);
  }

  .scan-history-filters button.is-selected.is-rejected {
    color: #ff6a62;
    border-color: rgba(255, 59, 48, 0.32);
    background: linear-gradient(135deg, rgba(255, 59, 48, 0.12), rgba(0, 0, 0, 0.34));
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3), inset 0 0 16px rgba(255, 59, 48, 0.1);
  }

  .scan-history-list {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 148px;
  }

  .scan-history-backdrop {
    position: absolute;
    left: 16px;
    right: 16px;
    height: 42px;
    border-radius: 24px 24px 0 0;
    background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02));
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.26);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    pointer-events: none;
  }

  .scan-history-backdrop-one {
    top: -7px;
    opacity: 0.5;
    z-index: -1;
  }

  .scan-history-backdrop-two {
    top: -14px;
    left: 32px;
    right: 32px;
    opacity: 0.22;
    z-index: -2;
  }

  .scan-history-card {
    position: relative;
    display: flex;
    align-items: center;
    gap: 14px;
    min-height: 76px;
    padding: 12px 14px;
    overflow: hidden;
    border-radius: 24px;
    color: #fff;
    background: linear-gradient(145deg, rgba(25, 18, 10, 0.92), rgba(5, 5, 5, 0.96));
    border-top: 1px solid rgba(255, 255, 255, 0.15);
    border-left: 1px solid rgba(255, 255, 255, 0.1);
    border-right: 1px solid rgba(0, 0, 0, 0.2);
    border-bottom: 1px solid rgba(0, 0, 0, 0.4);
    box-shadow: 0 14px 34px rgba(0, 0, 0, 0.32);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }

  .scan-history-card.is-scanned {
    background: linear-gradient(145deg, rgba(10, 24, 16, 0.86), rgba(5, 5, 5, 0.96));
  }

  .scan-history-card-glow {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
  }

  .scan-history-card.is-scanned .scan-history-card-glow {
    background: radial-gradient(circle at 100% 0%, rgba(0, 255, 148, 0.12), transparent 58%);
  }

  .scan-history-card.is-rejected .scan-history-card-glow {
    background: radial-gradient(circle at 100% 0%, rgba(255, 59, 48, 0.12), transparent 58%);
  }

  .scan-history-status-icon {
    position: relative;
    z-index: 1;
    width: 36px;
    height: 36px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border-radius: 999px;
  }

  .scan-history-status-icon svg {
    width: 20px;
    height: 20px;
  }

  .scan-history-card.is-scanned .scan-history-status-icon {
    color: #00ff94;
    background: rgba(0, 255, 148, 0.11);
  }

  .scan-history-card.is-rejected .scan-history-status-icon {
    color: #ff3b30;
    background: rgba(255, 59, 48, 0.12);
  }

  .scan-history-copy {
    position: relative;
    z-index: 1;
    flex: 1;
    min-width: 0;
  }

  .scan-history-title-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 6px;
  }

  .scan-history-title-row strong {
    min-width: 0;
    color: #fff;
    font-size: 15px;
    line-height: 1.15;
    font-weight: 800;
    letter-spacing: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .scan-history-title-row code {
    flex: 0 0 auto;
    color: rgba(0, 255, 148, 0.82);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
  }

  .scan-history-card.is-rejected .scan-history-title-row code {
    color: rgba(255, 59, 48, 0.84);
  }

  .scan-history-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    color: rgba(255, 255, 255, 0.5);
  }

  .scan-history-meta small {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 11px;
    line-height: 1.35;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .scan-history-meta svg {
    width: 14px;
    height: 14px;
    flex: 0 0 auto;
  }

  .scan-actions {
    position: fixed;
    left: 50%;
    bottom: 0;
    z-index: 6;
    width: min(100%, 520px);
    transform: translateX(-50%);
    padding: 46px 18px 24px;
    background: linear-gradient(0deg, #0b0f10 0%, rgba(11, 15, 16, 0.94) 58%, transparent 100%);
  }

  .scan-action-group {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 8px;
    border-radius: 32px;
    margin-bottom: 18px;
  }

  .scan-action-group button {
    min-height: 76px;
    border: 0;
    border-radius: 24px;
    color: #fff;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 7px;
    font-size: 14px;
    font-weight: 800;
    letter-spacing: 0;
    transition: transform 180ms ease, background 180ms ease;
  }

  .scan-action-group button:active,
  .scan-bottom-nav button:active {
    transform: scale(0.97);
  }

  .scan-primary-action {
    background: #007aff;
    box-shadow: 0 0 24px rgba(0, 122, 255, 0.42);
  }

  .scan-secondary-action {
    background: rgba(39, 42, 44, 0.72);
    border: 1px solid rgba(255, 255, 255, 0.06) !important;
  }

  .scan-bottom-nav {
    width: 100%;
    height: 64px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: space-around;
    padding: 8px;
  }

  .scan-bottom-nav button {
    width: 48px;
    height: 48px;
    border: 0;
    border-radius: 999px;
    display: grid;
    place-items: center;
    color: #c1c6d7;
    background: transparent;
    transition: transform 180ms ease, background 180ms ease, color 180ms ease;
  }

  .scan-bottom-nav button.is-selected {
    color: #080b0c;
    background: #fff;
    box-shadow: 0 0 22px rgba(255, 255, 255, 0.28);
  }

  .scan-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: flex;
    align-items: flex-end;
    background: rgba(0, 0, 0, 0.64);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }

  .scan-modal {
    width: min(100%, 520px);
    margin: 0 auto;
    padding: 10px 20px 28px;
    border-radius: 28px 28px 0 0;
    background: linear-gradient(180deg, rgba(25, 28, 30, 0.96), rgba(11, 15, 16, 0.98));
  }

  .scan-modal-handle {
    width: 42px;
    height: 4px;
    margin: 0 auto 20px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.22);
  }

  .scan-modal h2 {
    margin: 0 0 14px;
    color: #fff;
    font-size: 18px;
    line-height: 1.35;
    letter-spacing: 0;
  }

  .scan-modal input {
    width: 100%;
    height: 54px;
    margin-bottom: 12px;
    padding: 0 16px;
    border-radius: 18px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    outline: none;
    color: #fff;
    background: rgba(255, 255, 255, 0.06);
  }

  .scan-modal input:focus {
    border-color: rgba(0, 122, 255, 0.82);
    box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.14);
  }

  .scan-modal button {
    width: 100%;
    height: 54px;
    border: 0;
    border-radius: 18px;
    color: #fff;
    background: #007aff;
    font-weight: 800;
    box-shadow: 0 0 24px rgba(0, 122, 255, 0.34);
  }

  @keyframes scan-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-height: 760px) {
    .scan-topbar {
      height: 78px;
      padding-top: 16px;
    }

    .scan-main {
      padding-top: 86px;
      padding-bottom: 214px;
    }

    .scan-hero {
      padding-top: 10px;
    }

    .scan-hero p:not(.scan-kicker) {
      margin-bottom: 24px;
    }

    .scan-orb {
      width: 224px;
      height: 224px;
    }

    .scan-target {
      width: 108px;
      height: 108px;
      border-radius: 28px;
    }

    .corner-tl,
    .corner-tr {
      top: 34px;
    }

    .corner-br,
    .corner-bl {
      bottom: 34px;
    }

    .corner-tl,
    .corner-bl {
      left: 34px;
    }

    .corner-tr,
    .corner-br {
      right: 34px;
    }

    .scan-stack {
      height: 130px;
    }
  }
`

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m20 20-4.2-4.2M18 11a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function LightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2v2M12 20v2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function TicketIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4.5 8.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v1.2a2.3 2.3 0 0 0 0 4.6v1.2a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-1.2a2.3 2.3 0 0 0 0-4.6V8.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M9 9h6M9 12h5M9 15h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function ScanIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 4H5a1 1 0 0 0-1 1v2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
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

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m4 11 8-7 8 7M6.5 10.5V20h11v-9.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
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

function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM5.5 20a6.5 6.5 0 0 1 13 0" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  )
}

function ErrorIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" width="22" height="22">
      <path d="M12 8v5M12 16.5h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.9" />
    </svg>
  )
}
