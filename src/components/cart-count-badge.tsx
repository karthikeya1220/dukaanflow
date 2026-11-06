'use client'

import { useEffect, useState } from 'react'

/**
 * Live cart-count badge for the server-rendered storefront header. The
 * catalogue client broadcasts `dukaanflow:cart-count` after each mutation;
 * this island keeps the header number accurate without lifting state up.
 */
export function CartCountBadge({ initial }: { initial: number }) {
  const [count, setCount] = useState(initial)

  useEffect(() => {
    function onCartUpdate(event: Event) {
      const detail = (event as CustomEvent<number>).detail
      if (typeof detail === 'number') setCount(detail)
    }
    window.addEventListener('dukaanflow:cart-count', onCartUpdate)
    return () => window.removeEventListener('dukaanflow:cart-count', onCartUpdate)
  }, [])

  if (count <= 0) return null
  return <span className="ml-1 tabular-nums">({count})</span>
}
