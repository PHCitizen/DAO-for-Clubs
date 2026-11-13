import {
  decodeEventLog,
  formatUnits,
  getAddress,
  isAddress,
  parseUnits,
  type Abi,
  type Address,
  type Hex,
} from 'viem'

// ---------------------------------------------------------------------------
// Chain seam
// ---------------------------------------------------------------------------
//
// The mint action reads token metadata and balances through a public RPC seam,
// but signing always goes through the connected wallet. Keeping the seam small
// lets the same action run against a real local EVM in behavioral tests.

export interface TestUsdReadRequest {
  address: Address
  abi: Abi
  functionName: string
  args?: readonly unknown[]
}

export interface TestUsdWriteRequest extends TestUsdReadRequest {
  from: Address
}

export interface TestUsdTransactionLog {
  address: Address
  data: Hex
  topics: readonly Hex[]
}

export interface TestUsdTransactionReceipt {
  status: 'success' | 'reverted'
  blockNumber: bigint
  logs: readonly TestUsdTransactionLog[]
}

export interface TestUsdChain {
  getChainId(): Promise<number>
  readContract<T = unknown>(request: TestUsdReadRequest): Promise<T>
  sendTransaction(request: TestUsdWriteRequest): Promise<Hex>
  waitForTransactionReceipt(hash: Hex): Promise<TestUsdTransactionReceipt>
}

export interface TestUsdConfig {
  /** Deployment identity; reads and mints reject any other chain. */
  chainId: number
  testUsdAddress: Address
  abi: Abi
}

export interface TestUsdInfo {
  address: Address
  symbol: string
  decimals: number
  currencyAdmin: Address
}

export class TestUsdChainMismatchError extends Error {
  readonly kind = 'testusd-chain-mismatch' as const
  constructor(
    readonly expectedChainId: number,
    readonly actualChainId: number
  ) {
    super(
      `TestUSD operations require chain ${expectedChainId}, but the RPC endpoint reported chain ${actualChainId}.`
    )
    this.name = 'TestUsdChainMismatchError'
  }
}

export class TestUsdMintRevertedError extends Error {
  readonly kind = 'testusd-mint-reverted' as const
  constructor(readonly hash: Hex) {
    super('The mint transaction was confirmed but reverted on-chain. No currency was minted.')
    this.name = 'TestUsdMintRevertedError'
  }
}

export class TestUsdConfirmationError extends Error {
  readonly kind = 'testusd-confirmation-error' as const
  constructor(
    message: string,
    readonly hash: Hex | null = null
  ) {
    super(message)
    this.name = 'TestUsdConfirmationError'
  }
}

export class TestUsdSubmissionError extends Error {
  readonly kind = 'testusd-submission-error' as const
  constructor(
    message: string,
    readonly cause: unknown
  ) {
    super(message)
    this.name = 'TestUsdSubmissionError'
  }
}

// ---------------------------------------------------------------------------
// Token metadata and amount handling
// ---------------------------------------------------------------------------

async function assertDeploymentChain(
  chain: TestUsdChain,
  config: TestUsdConfig
): Promise<void> {
  const actualChainId = await chain.getChainId()
  if (actualChainId !== config.chainId) {
    throw new TestUsdChainMismatchError(config.chainId, actualChainId)
  }
}

export async function readTestUsdInfo(
  chain: TestUsdChain,
  config: TestUsdConfig
): Promise<TestUsdInfo> {
  await assertDeploymentChain(chain, config)

  const [symbol, decimals, currencyAdmin] = await Promise.all([
    chain.readContract<string>({
      address: config.testUsdAddress,
      abi: config.abi,
      functionName: 'symbol',
    }),
    chain.readContract<number>({
      address: config.testUsdAddress,
      abi: config.abi,
      functionName: 'decimals',
    }),
    chain.readContract<Address>({
      address: config.testUsdAddress,
      abi: config.abi,
      functionName: 'currencyAdmin',
    }),
  ])

  return {
    address: getAddress(config.testUsdAddress),
    symbol,
    decimals: Number(decimals),
    currencyAdmin: getAddress(currencyAdmin),
  }
}

export type ParsedTestUsdAmount =
  | {
      ok: true
      amount: bigint
      formattedAmount: string
    }
  | {
      ok: false
      message: string
    }

/**
 * Parses a user-entered decimal amount using the token's actual decimals.
 * BigInt parsing avoids binary floating-point amount errors.
 */
export function parseTestUsdAmount(input: string, decimals: number): ParsedTestUsdAmount {
  const value = input.trim()
  if (value.length === 0) {
    return { ok: false, message: 'Enter an amount.' }
  }
  if (!/^\d+(?:\.\d+)?$/.test(value)) {
    return { ok: false, message: 'Enter a positive decimal amount.' }
  }

  const fraction = value.split('.')[1] ?? ''
  if (fraction.length > decimals) {
    return {
      ok: false,
      message: `Enter an amount with at most ${decimals} decimal places.`,
    }
  }

  let amount: bigint
  try {
    amount = parseUnits(value, decimals)
  } catch {
    return {
      ok: false,
      message: `Enter an amount with at most ${decimals} decimal places.`,
    }
  }

  if (amount <= 0n) {
    return { ok: false, message: 'Amount must be greater than zero.' }
  }
  if (amount > 2n ** 256n - 1n) {
    return { ok: false, message: 'Amount is too large.' }
  }

  return {
    ok: true,
    amount,
    formattedAmount: formatUnits(amount, decimals),
  }
}

// ---------------------------------------------------------------------------
// Mint action
// ---------------------------------------------------------------------------

export interface MintTestUsdInput {
  from: Address
  recipient: string
  amount: string
}

export type MintTestUsdOutcome =
  | {
      status: 'success'
      chainId: number
      hash: Hex
      blockNumber: bigint
      recipient: Address
      amount: bigint
      formattedAmount: string
      recipientBalance: bigint
      formattedRecipientBalance: string
      symbol: string
      decimals: number
      currencyAdmin: Address
    }
  | {
      status: 'invalid-recipient'
      message: string
    }
  | {
      status: 'invalid-amount'
      message: string
    }
  | {
      status: 'unauthorized'
      message: string
      account: Address
      currencyAdmin: Address
    }

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

function findMintedAmount(
  receipt: TestUsdTransactionReceipt,
  config: TestUsdConfig,
  recipient: Address
): bigint | null {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== config.testUsdAddress.toLowerCase()) continue
    try {
      const decoded = decodeEventLog({
        abi: config.abi,
        eventName: 'Transfer',
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      })
      const args = decoded.args as unknown as {
        from: Address
        to: Address
        value: bigint
      }
      if (
        args.from.toLowerCase() === ZERO_ADDRESS &&
        args.to.toLowerCase() === recipient.toLowerCase()
      ) {
        return args.value
      }
    } catch {
      // Ignore logs from other events or contracts.
    }
  }
  return null
}

export async function mintTestUsd(
  chain: TestUsdChain,
  config: TestUsdConfig,
  input: MintTestUsdInput
): Promise<MintTestUsdOutcome> {
  if (!isAddress(input.recipient)) {
    return { status: 'invalid-recipient', message: 'Enter a valid recipient address.' }
  }
  const recipient = getAddress(input.recipient)

  const info = await readTestUsdInfo(chain, config)

  const parsed = parseTestUsdAmount(input.amount, info.decimals)
  if (!parsed.ok) {
    return { status: 'invalid-amount', message: parsed.message }
  }

  const account = getAddress(input.from)
  if (account.toLowerCase() !== info.currencyAdmin.toLowerCase()) {
    return {
      status: 'unauthorized',
      message: 'Only the designated TestUSD currency administrator can mint.',
      account,
      currencyAdmin: info.currencyAdmin,
    }
  }

  let hash: Hex
  try {
    hash = await chain.sendTransaction({
      from: account,
      address: info.address,
      abi: config.abi,
      functionName: 'mint',
      args: [recipient, parsed.amount],
    })
  } catch (error) {
    throw new TestUsdSubmissionError(
      `The mint transaction was not submitted: ${
        error instanceof Error ? error.message : String(error)
      }`,
      error
    )
  }

  let receipt: TestUsdTransactionReceipt
  try {
    receipt = await chain.waitForTransactionReceipt(hash)
  } catch (error) {
    throw new TestUsdConfirmationError(
      `The mint transaction was submitted but could not be confirmed: ${
        error instanceof Error ? error.message : String(error)
      }`,
      hash
    )
  }

  if (receipt.status !== 'success') {
    throw new TestUsdMintRevertedError(hash)
  }

  const mintedAmount = findMintedAmount(receipt, config, recipient)
  if (mintedAmount === null) {
    throw new TestUsdConfirmationError(
      'The mint transaction succeeded but no matching TestUSD mint event was found.',
      hash
    )
  }

  let recipientBalance: bigint
  try {
    recipientBalance = await chain.readContract<bigint>({
      address: info.address,
      abi: config.abi,
      functionName: 'balanceOf',
      args: [recipient],
    })
  } catch (error) {
    throw new TestUsdConfirmationError(
      `The mint was confirmed, but the updated recipient balance could not be read: ${
        error instanceof Error ? error.message : String(error)
      }`,
      hash
    )
  }

  return {
    status: 'success',
    chainId: config.chainId,
    hash,
    blockNumber: receipt.blockNumber,
    recipient,
    amount: mintedAmount,
    formattedAmount: formatUnits(mintedAmount, info.decimals),
    recipientBalance,
    formattedRecipientBalance: formatUnits(recipientBalance, info.decimals),
    symbol: info.symbol,
    decimals: info.decimals,
    currencyAdmin: info.currencyAdmin,
  }
}
