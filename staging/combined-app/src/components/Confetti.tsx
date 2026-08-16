import { useMemo } from 'react'
import { motion } from 'framer-motion'

const COLORS = ['#A855F7', '#22C55E', '#F59E0B', '#EC4899', '#3B82F6', '#D946EF']

interface Piece {
  id: number
  x: number
  rotate: number
  color: string
  size: number
  delay: number
  duration: number
  drift: number
}

export default function Confetti({ count = 28 }: { count?: number }) {
  const pieces = useMemo<Piece[]>(
    () =>
      Array.from({ length: count }).map((_, i) => ({
        id: i,
        x: 10 + Math.random() * 80,
        rotate: Math.random() * 360,
        color: COLORS[i % COLORS.length],
        size: 5 + Math.random() * 5,
        delay: Math.random() * 0.25,
        duration: 1.4 + Math.random() * 0.9,
        drift: (Math.random() - 0.5) * 120,
      })),
    [count]
  )

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden z-20">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute rounded-sm"
          style={{
            left: `${p.x}%`,
            top: '18%',
            width: p.size,
            height: p.size * 1.6,
            backgroundColor: p.color,
          }}
          initial={{ y: -20, x: 0, opacity: 0, rotate: 0, scale: 0.6 }}
          animate={{
            y: [0, 260 + Math.random() * 120],
            x: [0, p.drift],
            opacity: [0, 1, 1, 0],
            rotate: [0, p.rotate],
            scale: [0.6, 1, 0.9],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: [0.16, 1, 0.3, 1],
          }}
        />
      ))}
    </div>
  )
}
