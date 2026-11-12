import { expect, test } from 'vitest'
import { createApplication } from './application'

test('funding without a connected wallet fails rather than claiming success', async () => {
  const app = createApplication()
  await app.fundTreasury('0x0000000000000000000000000000000000000001', '1')
  expect(app.readFundingState().status).toBe('failed')
})
