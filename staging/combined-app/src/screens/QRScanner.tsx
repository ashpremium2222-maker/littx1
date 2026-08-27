import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import jsQR from 'jsqr'
import LittixLogo from '../components/LittixLogo'

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
  } | null
  onScanNext?: () => void
}

export default function QRScanner({ onBack, onScan, showBack = true, premium = false, scanFeedback, onScanNext }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const scannedRef = useRef(false)
  const onScanRef = useRef(onScan)

  const [cameraError, setCameraError] = useState<string | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualId, setManualId] = useState('')
  const [torchOn, setTorchOn] = useState(false)
  const [detected, setDetected] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [cameraRetry, setCameraRetry] = useState(0)

  const accent = premium ? '#007AFF' : '#A855F7'
  const cornerColor = premium ? '#61A8FF' : '#A855F7'
  const frameSize = premium ? 248 : 220

  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    let cancelled = false

    async function start() {
      scannedRef.current = false
      setDetected(false)
      setVerifying(false)
      setCameraError(null)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: 'environment',
            width: { ideal: 720 },
            height: { ideal: 720 }
          },
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        tick()
      } catch (err) {
        setCameraError('Camera access unavailable. Use manual entry below.')
      }
    }

    function tick() {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA && !scannedRef.current) {
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (ctx) {
          const maxDim = 500
          const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight))
          const w = Math.floor(video.videoWidth * scale)
          const h = Math.floor(video.videoHeight * scale)
          
          canvas.width = w
          canvas.height = h
          ctx.drawImage(video, 0, 0, w, h)
          const imageData = ctx.getImageData(0, 0, w, h)
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "dontInvert"
          })
          if (code && code.data) {
            scannedRef.current = true
            setDetected(true)
            setVerifying(true)
            Promise.resolve(onScanRef.current(code.data)).finally(() => {
              if (!cancelled) setVerifying(false)
            })
            return
          }
        }
      }
      rafRef.current = setTimeout(tick, 250) as any
    }

    start()

    return () => {
      cancelled = true
      if (rafRef.current) clearTimeout(rafRef.current)
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [cameraRetry])

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0]
    if (!track) return
    try {
      const capabilities = track.getCapabilities?.() as any
      if (capabilities?.torch) {
        await track.applyConstraints({ advanced: [{ torch: !torchOn }] } as any)
        setTorchOn((v) => !v)
      }
    } catch {
      // torch not supported on this device/browser
    }
  }

  function submitManual() {
    if (manualId.trim() && !scannedRef.current) {
      scannedRef.current = true
      setDetected(true)
      setManualOpen(false)
      setVerifying(true)
      Promise.resolve(onScanRef.current(manualId.trim())).finally(() => setVerifying(false))
    }
  }

  function retryCamera() {
    setCameraRetry((value) => value + 1)
  }

  return (
    <div
      className="flex flex-col relative overflow-hidden w-full min-h-screen"
      style={{
        fontFamily: premium ? '"Hanken Grotesk", Inter, sans-serif' : 'Inter, sans-serif',
        background: premium
          ? 'radial-gradient(700px 420px at 50% -10%, rgba(0,122,255,0.2), transparent 65%), linear-gradient(180deg, #07111b 0%, #05090d 48%, #020405 100%)'
          : '#000',
      }}
    >
      <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" style={{ opacity: cameraError ? 0.15 : 0.9 }} />
      <canvas ref={canvasRef} className="hidden" />

      {cameraError && (
        <img
          src="https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=750&h=1624&fit=crop&auto=format"
          alt="Camera viewfinder background"
          className="absolute inset-0 w-full h-full object-cover opacity-70"
        />
      )}

      <motion.div
        className="absolute inset-0"
        animate={{ backgroundColor: detected ? (premium ? 'rgba(0,122,255,0.16)' : 'rgba(168,85,247,0.2)') : 'rgba(0,0,0,0.45)' }}
        transition={{ duration: 0.2 }}
      />

      {premium && (
        <motion.div
          className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(0,122,255,0.16), transparent 66%)', filter: 'blur(24px)' }}
          animate={{ opacity: [0.55, 0.9, 0.55], scale: [0.95, 1.04, 0.95] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      <div className={`relative flex flex-col min-h-screen ${premium ? 'pb-40' : ''}`}>
        <motion.div
          className={`flex items-center justify-between px-4 ${premium ? 'pt-8 pb-6' : 'pt-6 pb-4'}`}
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          {showBack ? (
            <motion.button
              onClick={onBack}
              whileTap={{ scale: 0.9 }}
              whileHover={{ scale: 1.05 }}
              className={`w-11 h-11 flex items-center justify-center ${premium ? 'rounded-full bg-white/8 backdrop-blur-2xl border border-white/15' : 'rounded-xl bg-white/15 backdrop-blur border border-white/25'}`}
            >
              <svg width="9" height="15" viewBox="0 0 7 12" fill="none">
                <path d="M6 1L1 6l5 5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </motion.button>
          ) : (
            <div className="w-11 h-11" />
          )}
          <LittixLogo dark={true} size="sm" />
          <motion.button
            onClick={toggleTorch}
            whileTap={{ scale: 0.85 }}
            whileHover={{ scale: 1.08 }}
            animate={{ backgroundColor: torchOn ? accent : 'rgba(255,255,255,0.1)' }}
            className={`${premium ? 'w-11 h-11 border border-white/15 bg-white/8 backdrop-blur-2xl' : 'w-9 h-9'} flex items-center justify-center rounded-full backdrop-blur`}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.22 3.22l1.42 1.42M13.36 13.36l1.42 1.42M3.22 14.78l1.42-1.42M13.36 4.64l1.42-1.42" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="9" cy="9" r="3" stroke="white" strokeWidth="1.4" />
            </svg>
          </motion.button>
        </motion.div>

        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          <div className="text-center px-8">
            <motion.h1
              className={`${premium ? 'text-[40px] font-black tracking-tight' : 'text-xl font-black'} text-white`}
              animate={{ opacity: cameraError ? 0.9 : [0.86, 1, 0.86] }}
              transition={{ duration: 2.4, repeat: cameraError || detected ? 0 : Infinity }}
            >
              {scanFeedback ? scanFeedback.title : verifying ? 'Verifying Ticket' : detected ? 'Ticket Detected' : cameraError ? 'Camera Access Required' : 'Scan Ticket'}
            </motion.h1>
            <p className={`${premium ? 'text-base' : 'text-sm'} text-white/60 font-medium mt-2`}>
              {scanFeedback ? scanFeedback.message : verifying ? 'Checking ticket status with the gate system' : cameraError ? cameraError : 'Position the ticket QR code inside the frame'}
            </p>
            {cameraError && (
              <motion.button
                type="button"
                onClick={retryCamera}
                whileTap={{ scale: 0.96 }}
                className={`${premium ? 'bg-white text-[#06111a] rounded-full' : 'bg-white/10 text-white rounded-2xl border border-white/20'} mt-5 px-7 py-3 text-sm font-bold`}
              >
                Try Again
              </motion.button>
            )}
          </div>

          <motion.div
            className="relative"
            style={{ width: frameSize, height: frameSize }}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: detected ? 1.06 : 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
            {premium && (
              <>
                <motion.div
                  className="absolute inset-[-30px] rounded-full border border-[#007AFF]/25"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
                />
                <motion.div
                  className="absolute inset-[-12px] rounded-full border border-[#61A8FF]/10"
                  animate={{ rotate: -360 }}
                  transition={{ duration: 18, repeat: Infinity, ease: 'linear' }}
                />
                <div
                  className="absolute inset-0 rounded-[34px] border border-white/10 backdrop-blur-[2px]"
                  style={{
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.015))',
                    boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.18), 0 24px 90px rgba(0,122,255,0.18)',
                  }}
                />
              </>
            )}
            {/* Viewfinder corner lines */}
            {[
              { top: 0, left: 0, rotate: '0deg' },
              { top: 0, right: 0, rotate: '90deg' },
              { bottom: 0, right: 0, rotate: '180deg' },
              { bottom: 0, left: 0, rotate: '270deg' },
            ].map((style, i) => (
              <motion.div
                key={i}
                className="absolute"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 + i * 0.06, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  ...style,
                  width: 36,
                  height: 36,
                  borderColor: detected ? accent : cornerColor,
                  borderTopWidth: 3,
                  borderLeftWidth: 3,
                  borderTopLeftRadius: 6,
                  transform: `rotate(${style.rotate})`,
                  transformOrigin: 'center',
                  transition: 'border-color 0.3s',
                }}
              />
            ))}
            {!detected && (
              <motion.div
                className="absolute left-2 right-2"
                style={{
                  height: premium ? 3 : 2,
                  background: `linear-gradient(to right, transparent, ${cornerColor}, transparent)`,
                  boxShadow: `0 0 ${premium ? 28 : 12}px ${cornerColor}`,
                }}
                animate={{ top: ['8%', '90%', '8%'] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
            {verifying && (
              <motion.div
                className="absolute inset-8 rounded-[28px] border border-white/10"
                animate={{ opacity: [0.2, 0.85, 0.2], scale: [0.92, 1, 0.92] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                style={{ boxShadow: 'inset 0 0 28px rgba(0,122,255,0.22)' }}
              />
            )}
          </motion.div>
        </div>

        {!scanFeedback && !verifying && (
        <motion.div
          className="pb-16 px-6 flex flex-col items-center gap-4"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <div className="flex items-center gap-3">
            <div className="w-px h-8 bg-white/20" />
            <span className="text-white/40 text-xs">or enter ticket ID manually</span>
            <div className="w-px h-8 bg-white/20" />
          </div>
          <motion.button
            onClick={() => setManualOpen(true)}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.96 }}
            className={`${premium ? 'bg-white/8 border-white/15 rounded-full px-9 py-3.5' : 'bg-white/10 border-white/20 rounded-2xl px-8 py-3'} backdrop-blur border text-white text-sm font-semibold`}
          >
            Enter ID Manually
          </motion.button>
        </motion.div>
        )}
      </div>

      <AnimatePresence>
        {scanFeedback && (
          <motion.div
            className={`absolute inset-0 z-20 bg-black/65 backdrop-blur-sm flex items-end px-4 ${premium ? 'pb-36' : 'pb-6'}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full border border-white/10 bg-[#111]/95 rounded-3xl p-5 shadow-2xl"
              initial={{ y: 28, scale: 0.98 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: 20, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 360, damping: 32 }}
              style={premium ? {
                background: 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))',
                backdropFilter: 'blur(28px)',
                WebkitBackdropFilter: 'blur(28px)',
                boxShadow: '0 24px 80px rgba(0,0,0,0.42), inset 0 1px 1px rgba(255,255,255,0.16)',
              } : undefined}
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: scanFeedback.status === 'success' ? 'rgba(34,197,94,0.16)' : 'rgba(239,68,68,0.15)',
                  }}
                >
                  {scanFeedback.status === 'success' ? (
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
                  <p className="text-white text-lg font-black leading-tight">{scanFeedback.title}</p>
                  <p className="text-white/60 text-sm leading-snug mt-1">{scanFeedback.message}</p>
                  {scanFeedback.code && (
                    <p className="text-white/45 text-xs font-mono mt-2 truncate">#{scanFeedback.code}</p>
                  )}
                </div>
              </div>

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
            className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-end z-10"
            onClick={() => setManualOpen(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full bg-[#111] rounded-t-3xl p-5 pb-8"
              onClick={(e) => e.stopPropagation()}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            >
              <p className="text-white text-sm font-bold mb-3">Enter Ticket ID</p>
              <input
                autoFocus
                value={manualId}
                onChange={(e) => setManualId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitManual()}
                placeholder="e.g. TML-2025-00847"
                className="w-full rounded-2xl px-4 py-3.5 text-sm border bg-[#1A1A1A] border-[#2A2A2A] text-white placeholder-[#555] outline-none focus:border-[#A855F7] mb-3"
              />
              <motion.button
                onClick={submitManual}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="w-full bg-[#A855F7] text-white font-bold text-sm py-3.5 rounded-2xl"
              >
                Verify Ticket
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
