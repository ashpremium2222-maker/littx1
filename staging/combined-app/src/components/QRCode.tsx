import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { generateQrDataUrl } from '../lib/qr'

interface Props {
  value: string
  size?: number
}

export default function QRCode({ value, size = 160 }: Props) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setSrc(null)
    generateQrDataUrl(value).then((url) => {
      if (!cancelled) setSrc(url)
    })
    return () => {
      cancelled = true
    }
  }, [value])

  return (
    <div style={{ width: size, height: size }} className="relative flex items-center justify-center">
      <AnimatePresence mode="wait">
        {!src ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center rounded"
            style={{ background: '#fff' }}
          >
            <div className="w-6 h-6 rounded-full border-2 border-[#eee] border-t-[#A855F7] animate-spin" />
          </motion.div>
        ) : (
          <motion.img
            key="qr"
            src={src}
            width={size}
            height={size}
            alt={`QR code for ${value}`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            style={{ display: 'block' }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
