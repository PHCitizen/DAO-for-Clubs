import { defineConfig } from 'hardhat/config'
import nodeTestRunner from '@nomicfoundation/hardhat-node-test-runner'

export default defineConfig({
  plugins: [nodeTestRunner],
  solidity: '0.8.28',
  networks: {
    default: { type: 'edr-simulated', chainType: 'l1', chainId: 31337 },
  },
})
