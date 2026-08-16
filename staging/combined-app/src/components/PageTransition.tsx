import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  variant?: 'forward' | 'back' | 'modal' | 'fade'
}

// Kept transforms GPU-friendly (translate only, no scale) and duration short for iPhone snappiness
const variants = {
  forward: {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit:    { opacity: 0, x: -12 },
  },
  back: {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    exit:    { opacity: 0, x: 12 },
  },
  modal: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit:    { opacity: 0, y: -8 },
  },
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit:    { opacity: 0 },
  },
}

export default function PageTransition({ children, variant = 'forward' }: Props) {
  const v = variants[variant]
  return (
    <motion.div
      initial={v.initial}
      animate={v.animate}
      exit={v.exit}
      transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
      style={{ willChange: 'transform, opacity' }}
      className="w-full min-h-screen"
    >
      {children}
    </motion.div>
  )
}
