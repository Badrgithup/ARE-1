'use client'

import confetti from 'canvas-confetti'

export function useConfetti() {
  const defaults = {
    particleCount: 100,
    spread: 70,
    origin: { y: 0.6 },
    colors: ['#F2B900', '#F5F5F5', '#C49600']
  }

  const fire = (options?: confetti.Options) => {
    confetti({ ...defaults, ...options })
  }

  const fireWinner = () => {
    fire({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0, y: 0.6 } })
    fire({ particleCount: 50, angle: 120, spread: 55, origin: { x: 1, y: 0.6 } })
  }

  const fireChampion = () => {
    setTimeout(() => fire({ particleCount: 100, spread: 80, origin: { y: 0.7 } }), 0);
    setTimeout(() => fire({ particleCount: 200, spread: 100, origin: { y: 0.6 } }), 500);
    setTimeout(() => fire({ particleCount: 300, spread: 120, origin: { y: 0.5 } }), 1000);
  }

  return { fire, fireWinner, fireChampion }
}
