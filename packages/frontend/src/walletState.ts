import { useEffect, useState } from 'react'
import type { NetworkState, WalletState } from './application'
import { app } from './applicationInstance'

/** Subscribes a component to the shared wallet connection state. */
export function useWalletState(): WalletState {
  const [state, setState] = useState<WalletState>(() => app.readWalletAccount())
  useEffect(() => {
    setState(app.readWalletAccount())
    return app.onWalletStateChanged(setState)
  }, [])
  return state
}

/** Subscribes a component to the wallet's network state. */
export function useNetworkState(): NetworkState {
  const [state, setState] = useState<NetworkState>(() => app.readNetworkState())
  useEffect(() => {
    setState(app.readNetworkState())
    return app.onNetworkStateChanged(setState)
  }, [])
  return state
}
