import { useEffect, useState } from 'react'
import { authService } from '../services/api'
import type { AuthSession } from '../types'

export function useAuthSession() {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => authService.onSessionChanged(result => {
    setSession(result.data)
    setLoading(false)
  }), [])

  return { session, loading }
}
