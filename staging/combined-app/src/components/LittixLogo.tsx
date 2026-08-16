import { motion } from 'framer-motion'

interface LittixLogoProps {
  dark?: boolean
  size?: 'sm' | 'md' | 'lg'
  animated?: boolean
}

export default function LittixLogo({ dark = true, size = 'md', animated = true }: LittixLogoProps) {
  const heights = { sm: 28, md: 36, lg: 52 }
  const h = heights[size]

  return (
    <motion.span
      className="inline-flex items-center"
      initial={animated ? { opacity: 0, y: -6 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <img
        src="/logo.png"
        alt="LITTX"
        style={{
          height: h,
          width: 'auto',
          objectFit: 'contain',
          filter: dark ? 'none' : 'brightness(0)',
          display: 'block',
        }}
        draggable={false}
      />
    </motion.span>
  )
}
