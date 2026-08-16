import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import jsQR from 'jsqr'
import LittixLogo from '../components/LittixLogo'

interface Props {
  onBack: () => void
  onScan: (raw: string) => void
}

export default function QRScanner({ onBack, onScan }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number | null>(null)
  const scannedRef = useRef(false)

  const [cameraError, setCameraError] = useState<string | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [manualId, setManualId] = useState('')
  const [torchOn, setTorchOn] = useState(false)
  const [detected, setDetected] = useState(false)

  const cornerColor = '#A855F7'
  const frameSize = 220

  useEffect(() => {
    let cancelled = false

    async function start() {
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
            onScan(code.data)
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
  }, [onScan])

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
    if (manualId.trim()) {
      onScan(manualId.trim())
    }
  }

  return (
    <div className="flex flex-col relative overflow-hidden w-full min-h-screen" style={{ fontFamily: 'Inter, sans-serif', backgroundColor: '#000' }}>
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
        animate={{ backgroundColor: detected ? 'rgba(168,85,247,0.2)' : 'rgba(0,0,0,0.45)' }}
        transition={{ duration: 0.2 }}
      />

      <div className="relative flex flex-col min-h-screen">
        <motion.div
          className="flex items-center justify-between px-4 pt-6 pb-4"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <motion.button
            onClick={onBack}
            whileTap={{ scale: 0.9 }}
            whileHover={{ scale: 1.05 }}
            className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/15 backdrop-blur border border-white/25"
          >
            <svg width="9" height="15" viewBox="0 0 7 12" fill="none">
              <path d="M6 1L1 6l5 5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.button>
          <LittixLogo dark={true} size="sm" />
          <motion.button
            onClick={toggleTorch}
            whileTap={{ scale: 0.85 }}
            whileHover={{ scale: 1.08 }}
            animate={{ backgroundColor: torchOn ? '#A855F7' : 'rgba(255,255,255,0.1)' }}
            className="w-9 h-9 flex items-center justify-center rounded-full backdrop-blur"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.22 3.22l1.42 1.42M13.36 13.36l1.42 1.42M3.22 14.78l1.42-1.42M13.36 4.64l1.42-1.42" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="9" cy="9" r="3" stroke="white" strokeWidth="1.4" />
            </svg>
          </motion.button>
        </motion.div>

        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          <motion.div
            className="relative"
            style={{ width: frameSize, height: frameSize }}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: detected ? 1.06 : 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          >
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
                  borderColor: detected ? '#A855F7' : cornerColor,
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
                  height: 2,
                  background: `linear-gradient(to right, transparent, ${cornerColor}, transparent)`,
                  boxShadow: `0 0 12px ${cornerColor}`,
                }}
                animate={{ top: ['8%', '90%', '8%'] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
          </motion.div>

          <motion.p
            className="text-white/70 text-sm font-medium tracking-wide text-center px-8"
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2.2, repeat: cameraError || detected ? 0 : Infinity }}
          >
            {detected ? 'Ticket detected!' : cameraError ? cameraError : 'Align QR code within frame'}
          </motion.p>
        </div>

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
            className="bg-white/10 backdrop-blur border border-white/20 text-white text-sm font-semibold px-8 py-3 rounded-2xl"
          >
            Enter ID Manually
          </motion.button>
        </motion.div>
      </div>

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
