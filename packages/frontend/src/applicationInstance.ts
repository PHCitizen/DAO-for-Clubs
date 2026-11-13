import { createApplication, type Application } from './application'
import { createPinataIpfsTransport } from './ipfs'
import { createBrowserWalletAdapter } from './wallet'

/**
 * One application instance per page load, created outside React so wallet,
 * network, deployment, and proposal draft state are shared by every route.
 *
 * The IPFS transport carries no credentials: each upload uses the token the
 * proposer types into the pinning form.
 */
export const app: Application = createApplication(createBrowserWalletAdapter(), undefined, undefined, {
  ipfs: createPinataIpfsTransport(),
})
