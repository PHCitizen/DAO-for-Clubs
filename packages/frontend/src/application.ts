import publicArtifacts from './generated/public-artifacts.json'

// Public application read/action seam. UI and behavioral tests use this API.
// Wallet and RPC adapters will be introduced here when their behaviors arrive.
export function createApplication() {
  return {
    readHome() {
      return {
        title: 'DAO for Clubs',
        description: 'Explore your organization. No wallet required to get started.',
        deploymentMessage: publicArtifacts.daoAddress === null
          ? 'No DAO has been deployed by this scaffold.'
          : 'Public deployment artifacts are available.',
      }
    },
  }
}
