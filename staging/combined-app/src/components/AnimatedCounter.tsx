import { useEffect, useRef } from 'react'
import { motion, useMotionValue, useTransform, animate } from 'framer-motion'

interface Props {
  value: number
  className?: string
  style?: React.CSSProperties
}

export default function AnimatedCounter({ value, className, style }: Props) {
  const mv = useMotionValue(0)
  const rounded = useTransform(mv, (v) => Math.round(v).toString())
  const prev = useRef(0)

  useEffect(() => {
    const controls = animate(mv, value, {
      duration: 0.7,
      ease: [0.16, 1, 0.3, 1],
    })
    prev.current = value
    return controls.stop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <motion.span className={className} style={style}>
      {rounded}
    </motion.span>
  )
}
