import { useLayoutEffect, useState } from 'react'

const useCountdown = (targetDate) => {
  const targetTime = new Date(targetDate).getTime()
  const [countDown, setCountDown] = useState(0)

  useLayoutEffect(() => {
    let interval
    const update = () => {
      const remaining = targetTime - Date.now()
      setCountDown(remaining)
      if (remaining <= 0) clearInterval(interval)
    }

    update()
    if (!Number.isFinite(targetTime) || targetTime <= Date.now()) return

    interval = setInterval(update, 1000)

    return () => clearInterval(interval)
  }, [targetTime])

  return Number.isFinite(targetTime) ? toString(countDown) : 'INVALID DATE'
}

const toString = (countdown) => {
  if (countdown < 1) return 'EXPIRED'
  const portions = []

  const msInHour = 1000 * 60 * 60
  const hours = Math.trunc(countdown / msInHour)
  if (hours > 0) {
    portions.push(hours + 'h')
    countdown = countdown - hours * msInHour
  }

  const msInMinute = 1000 * 60
  const minutes = Math.trunc(countdown / msInMinute)
  if (minutes > 0) {
    portions.push(minutes + 'm')
    countdown = countdown - minutes * msInMinute
  }

  const seconds = Math.trunc(countdown / 1000)
  if (seconds > 0) {
    portions.push(seconds + 's')
  }

  return portions.join(' ')
}

export default useCountdown
