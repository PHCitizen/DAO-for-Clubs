import { decodeEventLog, getAddress, isAddress, type Abi, type Address, type Hex } from 'viem'

// ---------------------------------------------------------------------------
// Chain seam
// ---------------------------------------------------------------------------
//
// Voting NFT membership reads run through a public RPC seam; mutations sign
// through the connected wallet. Keeping the seam small lets the same action
// run against a real local EVM in behavioral tests.

export interface MembershipReadRequest {
  address: Address
  abi: Abi
  functionName: string
  args?: readonly unknown[]
}

export interface MembershipWriteRequest extends MembershipReadRequest {
  from: Address
}

export interface MembershipTransactionLog {
  address: Address
  data: Hex
  topics: readonly Hex[]
}

export interface MembershipTransactionReceipt {
  status: 'success' | 'reverted'
  blockNumber: bigint
  logs: readonly MembershipTransactionLog[]
}

export interface MembershipChain {
  getChainId(): Promise<number>
  readContract<T = unknown>(request: MembershipReadRequest): Promise<T>
  sendTransaction(request: MembershipWriteRequest): Promise<Hex>
  waitForTransactionReceipt(hash: Hex): Promise<MembershipTransactionReceipt>
}

export interface MembershipConfig {
  /** Deployment identity; reads and mutations reject any other chain. */
  chainId: number
  daoAddress: Address
  daoAbi: Abi
  treasuryAbi: Abi
}

export class MembershipChainMismatchError extends Error {
  readonly kind = 'membership-chain-mismatch' as const
  constructor(
    readonly expectedChainId: number,
    readonly actualChainId: number
  ) {
    super(
      `Voting NFT operations require chain ${expectedChainId}, but the RPC endpoint reported chain ${actualChainId}.`
    )
    this.name = 'MembershipChainMismatchError'
  }
}

export class VotingNftMintRevertedError extends Error {
  readonly kind = 'voting-nft-mint-reverted' as const
  constructor(readonly hash: Hex) {
    super('The mint transaction was confirmed but reverted on-chain. No voting NFT was minted.')
    this.name = 'VotingNftMintRevertedError'
  }
}

export class VotingNftBurnRevertedError extends Error {
  readonly kind = 'voting-nft-burn-reverted' as const
  constructor(readonly hash: Hex) {
    super('The burn transaction reverted. No credential was removed.')
    this.name = 'VotingNftBurnRevertedError'
  }
}

export interface BurnVotingNftInput {
  from: Address
  treasury: string
  tokenId: string
  assertValid?: () => void
}

export type BurnVotingNftOutcome =
  | { status: 'invalid-token'; message: string }
  | Extract<MintVotingNftOutcome, { status: 'unknown-treasury' | 'unauthorized' | 'success' }>

/** Token identity is always the pair (treasury, tokenId), never a global ID. */
export async function burnVotingNft(
  chain: MembershipChain,
  config: MembershipConfig,
  input: BurnVotingNftInput
): Promise<BurnVotingNftOutcome> {
  if (!/^[1-9]\d*$/.test(input.tokenId) || BigInt(input.tokenId) >= 2n ** 256n) {
    return { status: 'invalid-token', message: 'Enter a positive uint256 token ID in this treasury.' }
  }
  if (!isAddress(input.treasury)) return { status: 'unknown-treasury', treasury: input.treasury }
  const treasury = getAddress(input.treasury)
  const tokenId = BigInt(input.tokenId)
  await assertDeploymentChain(chain, config)
  if (!(await isRegisteredTreasury(chain, config, treasury))) {
    return { status: 'unknown-treasury', treasury: input.treasury }
  }
  const administrator = getAddress(await chain.readContract<Address>({
    address: treasury, abi: config.treasuryAbi, functionName: 'administrator',
  }))
  const account = getAddress(input.from)
  if (account !== administrator) return {
    status: 'unauthorized', account, administrator,
    message: 'Only this treasury’s administrator can burn its voting NFTs.',
  }
  input.assertValid?.()
  let hash: Hex
  try {
    hash = await chain.sendTransaction({
      from: account, address: treasury, abi: config.treasuryAbi,
      functionName: 'burnVotingNft', args: [tokenId],
    })
  } catch (error) {
    throw new VotingNftSubmissionError('The burn transaction was not submitted.', error)
  }
  let receipt: MembershipTransactionReceipt
  try {
    receipt = await chain.waitForTransactionReceipt(hash)
  } catch {
    throw new VotingNftConfirmationError('The burn was submitted but could not be confirmed.', hash)
  }
  if (receipt.status !== 'success') throw new VotingNftBurnRevertedError(hash)
  let holder: Address | undefined
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== treasury.toLowerCase()) continue
    try {
      const decoded = decodeEventLog({ abi: config.treasuryAbi, eventName: 'Transfer',
        data: log.data, topics: log.topics as [Hex, ...Hex[]] })
      const args = decoded.args as unknown as { from: Address; to: Address; tokenId: bigint }
      if (args.to.toLowerCase() === ZERO_ADDRESS && args.tokenId === tokenId && args.from.toLowerCase() !== ZERO_ADDRESS) {
        holder = getAddress(args.from)
      }
    } catch { /* Ignore unrelated events. */ }
  }
  if (!holder) throw new VotingNftConfirmationError('No matching credential removal event was found.', hash)
  try {
    const membership = await readVotingMembership(chain, config, treasury, holder)
    if (!membership?.holder || membership.holder.tokenIds.includes(tokenId)) {
      throw new Error('Removed credential is still active or membership is unavailable.')
    }
    return { status: 'success', chainId: config.chainId, hash, blockNumber: receipt.blockNumber,
      treasury, tokenId, holder, totalSupply: membership.totalSupply,
      holderBalance: membership.holder.balance, holderTokenIds: membership.holder.tokenIds }
  } catch (error) {
    throw new VotingNftConfirmationError(`Burn confirmed, but membership could not be verified: ${String(error)}`, hash)
  }
}

export class VotingNftConfirmationError extends Error {
  readonly kind = 'voting-nft-confirmation-error' as const
  constructor(
    message: string,
    readonly hash: Hex | null = null
  ) {
    super(message)
    this.name = 'VotingNftConfirmationError'
  }
}

export class VotingNftSubmissionError extends Error {
  readonly kind = 'voting-nft-submission-error' as const
  constructor(
    message: string,
    readonly cause: unknown
  ) {
    super(message)
    this.name = 'VotingNftSubmissionError'
  }
}

// ---------------------------------------------------------------------------
// Membership inspection
// ---------------------------------------------------------------------------

export interface HolderMembership {
  address: Address
  balance: bigint
  tokenIds: bigint[]
}

export interface VotingMembership {
  /** Checksummed treasury identity; token identity is (treasury, tokenId). */
  treasury: Address
  administrator: Address
  /** Live voting NFT supply used by open proposals of this treasury. */
  totalSupply: bigint
  /** Confirmed credentials of the inspected holder, or null when no holder was requested. */
  holder: HolderMembership | null
}

async function assertDeploymentChain(
  chain: MembershipChain,
  config: MembershipConfig
): Promise<void> {
  const actualChainId = await chain.getChainId()
  if (actualChainId !== config.chainId) {
    throw new MembershipChainMismatchError(config.chainId, actualChainId)
  }
}

async function isRegisteredTreasury(
  chain: MembershipChain,
  config: MembershipConfig,
  treasury: Address
): Promise<boolean> {
  return chain.readContract<boolean>({
    address: config.daoAddress,
    abi: config.daoAbi,
    functionName: 'isTreasury',
    args: [treasury],
  })
}

/**
 * Reads a registered treasury's administrator, live voting NFT supply, and —
 * when a holder is given — that holder's confirmed token IDs. Returns null
 * when the address is not a treasury registered by the configured DAO.
 */
export async function readVotingMembership(
  chain: MembershipChain,
  config: MembershipConfig,
  treasuryAddress: string,
  holderAddress?: string
): Promise<VotingMembership | null> {
  if (!isAddress(treasuryAddress)) return null
  if (holderAddress !== undefined && !isAddress(holderAddress)) return null
  const treasury = getAddress(treasuryAddress)
  const holder = holderAddress === undefined ? null : getAddress(holderAddress)

  await assertDeploymentChain(chain, config)

  if (!(await isRegisteredTreasury(chain, config, treasury))) return null

  const [administrator, totalSupply] = await Promise.all([
    chain.readContract<Address>({
      address: treasury,
      abi: config.treasuryAbi,
      functionName: 'administrator',
    }),
    chain.readContract<bigint>({
      address: treasury,
      abi: config.treasuryAbi,
      functionName: 'totalSupply',
    }),
  ])

  let holderMembership: HolderMembership | null = null
  if (holder !== null) {
    const tokenIds = await chain.readContract<readonly bigint[]>({
      address: treasury,
      abi: config.treasuryAbi,
      functionName: 'tokensOfHolder',
      args: [holder],
    })
    holderMembership = {
      address: holder,
      balance: BigInt(tokenIds.length),
      tokenIds: [...tokenIds],
    }
  }

  return {
    treasury,
    administrator: getAddress(administrator),
    totalSupply,
    holder: holderMembership,
  }
}

// ---------------------------------------------------------------------------
// Mint action
// ---------------------------------------------------------------------------

export interface MintVotingNftInput {
  from: Address
  treasury: string
  holder: string
  /**
   * Optional freshness guard re-asserted immediately before submission, so an
   * account or network change during the pre-mint reads aborts the mint.
   */
  assertValid?: () => void
}

export type MintVotingNftOutcome =
  | {
      status: 'success'
      chainId: number
      hash: Hex
      blockNumber: bigint
      treasury: Address
      tokenId: bigint
      holder: Address
      totalSupply: bigint
      holderBalance: bigint
      holderTokenIds: bigint[]
    }
  | {
      status: 'invalid-holder'
      message: string
    }
  | {
      status: 'unknown-treasury'
      treasury: string
    }
  | {
      status: 'unauthorized'
      message: string
      account: Address
      administrator: Address
    }

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

function findMintedTokenId(
  receipt: MembershipTransactionReceipt,
  treasury: Address,
  holder: Address,
  treasuryAbi: Abi
): bigint | null {
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== treasury.toLowerCase()) continue
    try {
      const decoded = decodeEventLog({
        abi: treasuryAbi,
        eventName: 'Transfer',
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      })
      const args = decoded.args as unknown as { from: Address; to: Address; tokenId: bigint }
      if (
        args.from.toLowerCase() === ZERO_ADDRESS &&
        args.to.toLowerCase() === holder.toLowerCase()
      ) {
        return args.tokenId
      }
    } catch {
      // Ignore logs from other events or contracts.
    }
  }
  return null
}

/**
 * Mints a fresh non-transferable voting NFT from the connected treasury
 * administrator to a holder, then confirms the token ID, the live supply,
 * and the holder's credentials from the chain.
 */
export async function mintVotingNft(
  chain: MembershipChain,
  config: MembershipConfig,
  input: MintVotingNftInput
): Promise<MintVotingNftOutcome> {
  if (!isAddress(input.holder) || input.holder.toLowerCase() === ZERO_ADDRESS) {
    return { status: 'invalid-holder', message: 'Enter a valid, non-zero holder address.' }
  }
  const holder = getAddress(input.holder)

  if (!isAddress(input.treasury)) {
    return { status: 'unknown-treasury', treasury: input.treasury }
  }
  const treasury = getAddress(input.treasury)

  await assertDeploymentChain(chain, config)

  if (!(await isRegisteredTreasury(chain, config, treasury))) {
    return { status: 'unknown-treasury', treasury: input.treasury }
  }

  const administrator = getAddress(
    await chain.readContract<Address>({
      address: treasury,
      abi: config.treasuryAbi,
      functionName: 'administrator',
    })
  )

  const account = getAddress(input.from)
  if (account.toLowerCase() !== administrator.toLowerCase()) {
    return {
      status: 'unauthorized',
      message: 'Only this treasury’s administrator can mint its voting NFTs.',
      account,
      administrator,
    }
  }

  // The reads above span several async round trips; re-assert that the
  // prepared wallet/chain snapshot is still valid immediately before sending.
  input.assertValid?.()

  let hash: Hex
  try {
    hash = await chain.sendTransaction({
      from: account,
      address: treasury,
      abi: config.treasuryAbi,
      functionName: 'mintVotingNft',
      args: [holder],
    })
  } catch (error) {
    throw new VotingNftSubmissionError(
      `The mint transaction was not submitted: ${
        error instanceof Error ? error.message : String(error)
      }`,
      error
    )
  }

  let receipt: MembershipTransactionReceipt
  try {
    receipt = await chain.waitForTransactionReceipt(hash)
  } catch (error) {
    throw new VotingNftConfirmationError(
      `The mint transaction was submitted but could not be confirmed: ${
        error instanceof Error ? error.message : String(error)
      }`,
      hash
    )
  }

  if (receipt.status !== 'success') {
    throw new VotingNftMintRevertedError(hash)
  }

  const tokenId = findMintedTokenId(receipt, treasury, holder, config.treasuryAbi)
  if (tokenId === null) {
    throw new VotingNftConfirmationError(
      'The mint transaction succeeded but no matching voting NFT mint event was found.',
      hash
    )
  }

  let totalSupply: bigint
  let holderTokenIds: readonly bigint[]
  try {
    ;[totalSupply, holderTokenIds] = await Promise.all([
      chain.readContract<bigint>({
        address: treasury,
        abi: config.treasuryAbi,
        functionName: 'totalSupply',
      }),
      chain.readContract<readonly bigint[]>({
        address: treasury,
        abi: config.treasuryAbi,
        functionName: 'tokensOfHolder',
        args: [holder],
      }),
    ])
  } catch (error) {
    throw new VotingNftConfirmationError(
      `The mint was confirmed, but the updated membership could not be read: ${
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
    treasury,
    tokenId,
    holder,
    totalSupply,
    holderBalance: BigInt(holderTokenIds.length),
    holderTokenIds: [...holderTokenIds],
  }
}
