import { useEffect, useRef } from 'react'
import type { GroceryStore } from '../domain/models'

interface Props {
  selectedStore: GroceryStore
  onDismiss: () => void
}

interface WakeLockSentinelLike {
  release: () => Promise<void>
}

export function LoyaltyScreen({ selectedStore, onDismiss }: Props) {
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null)
  const previousBrightnessRef = useRef<number | null>(null)

  useEffect(() => {
    let isClosed = false

    async function enableDeviceHelpers(): Promise<void> {
      const navigatorWithWakeLock = navigator as Navigator & {
        wakeLock?: {
          request: (type: 'screen') => Promise<WakeLockSentinelLike>
        }
      }

      if (navigatorWithWakeLock.wakeLock) {
        try {
          const wakeLock = await navigatorWithWakeLock.wakeLock.request('screen')

          if (isClosed) {
            void wakeLock.release()
            return
          }

          wakeLockRef.current = wakeLock
        } catch {
          wakeLockRef.current = null
        }
      }

      const brightnessScreen = screen as Screen & { brightness?: number }
      if (typeof brightnessScreen.brightness === 'number') {
        previousBrightnessRef.current = brightnessScreen.brightness
        try {
          brightnessScreen.brightness = 1
        } catch {
          previousBrightnessRef.current = null
        }
      }
    }

    void enableDeviceHelpers()

    return () => {
      isClosed = true

      if (wakeLockRef.current) {
        void wakeLockRef.current.release()
      }

      const brightnessScreen = screen as Screen & { brightness?: number }
      if (previousBrightnessRef.current !== null && typeof brightnessScreen.brightness === 'number') {
        try {
          brightnessScreen.brightness = previousBrightnessRef.current
        } catch {
          // Ignore unsupported brightness restore attempts.
        }
      }
    }
  }, [])

  return (
    <section className="loyalty-screen" onClick={onDismiss}>
      <p className="eyebrow loyalty-eyebrow">Loyalitetskort</p>
      <h1 className="loyalty-title">{selectedStore.name}</h1>
      {selectedStore.loyaltyCardImage ? (
        <img
          className="loyalty-card-image"
          src={selectedStore.loyaltyCardImage}
          alt={`Loyalitetskort for ${selectedStore.name}`}
        />
      ) : (
        <div className="loyalty-qr" />
      )}
      <p className="loyalty-dismiss">Tryk hvor som helst for at lukke</p>
    </section>
  )
}
