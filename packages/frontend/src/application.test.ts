import { expect, test } from 'vitest'
import { createApplication } from './application'

test('a visitor can read the welcome content without a wallet or RPC', () => {
  const application = createApplication()
  expect(application.readHome()).toEqual({
    title: 'DAO for Clubs',
    description: 'Explore your organization. No wallet required to get started.',
    deploymentMessage: 'No DAO has been deployed by this scaffold.',
  })
})
