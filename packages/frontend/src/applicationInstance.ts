import { createApplication, type Application } from './application'
import { createBrowserWalletAdapter } from './wallet'

/**
 * One application instance per page load, created outside React so wallet,
 * network, and deployment state are shared by every route.
 */
export const app: Application = createApplication(createBrowserWalletAdapter())
