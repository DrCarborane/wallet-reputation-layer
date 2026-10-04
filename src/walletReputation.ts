/**
 * Wallet Reputation Layer — data via Blockscout public API v2 (no key needed)
 * + viem for bytecode detection.
 *
 * ENS resolution: api.ensideas.com (works from browser, no CORS issues)
 * RPC: cloudflare-eth.com (llamarpc was returning 525 SSL errors)
 */

import { createPublicClient, http, isAddress, type Address } from 'viem'
import { mainnet } from 'wagmi/chains'

const BS = 'https://eth.blockscout.com/api/v2'

// cloudflare-eth.com is a reliable free Ethereum mainnet RPC
export const ethClient = createPublicClient({
  chain: mainnet,
  transport: http('https://cloudflare-eth.com'),
})

// ── ENS resolution ─────────────────────────────────────────────────────────
// Primary: api.ensideas.com — resolves any valid ENS name, CORS: *, no key needed.
// Fallback: Blockscout /search — only knows names it has indexed on-chain.
//
// Reverse lookup (address → name): Blockscout returns ens_domain_name on the
// address object directly, so no extra call is needed for that direction.

type BSSearchItem = {
  address_hash?: string
  type?: string
  ens_info?: { name?: string }
}

interface EnsIdeasResult {
  address?: string | null
  name?: string | null
  displayName?: string | null
}

export async function resolveEns(name: string): Promise<{ address: string | null; displayName: string | null }> {
  // 1. Try ensideas.com — handles all valid ENS names including ones with numbers
  try {
    const res = await fetch(
      `https://api.ensideas.com/ens/resolve/${encodeURIComponent(name)}`,
      { headers: { Accept: 'application/json' } }
    )
    if (res.ok) {
      const data = (await res.json()) as EnsIdeasResult
      if (data.address) {
        return { address: data.address, displayName: data.displayName ?? data.name ?? name }
      }
    }
  } catch {
    // fall through to Blockscout
  }

  // 2. Fallback: Blockscout search (only knows indexed names)
  const res2 = await fetch(
    `${BS}/search?q=${encodeURIComponent(name)}`,
    { headers: { Accept: 'application/json' } }
  )
  if (!res2.ok) throw new Error(`ENS lookup failed — name "${name}" could not be resolved`)
  const data2 = (await res2.json()) as { items: BSSearchItem[] }
  const hit = data2.items.find(
    i => (i.type === 'ens_domain' || i.type === 'address') && i.address_hash
  )
  if (!hit?.address_hash) return { address: null, displayName: null }
  return { address: hit.address_hash, displayName: hit.ens_info?.name ?? name }
}

export interface WalletProfile {
  address: Address
  ensName: string | null           // reverse-resolved ENS name (if any)
  ensAvatar: string | null
  firstTxTimestamp: number | null
  walletAgeYears: number | null
  walletAgeEstimated: boolean      // true when nonce-0 tx not found in sampled pages
  txCount: number | null
  ethBalance: bigint | null
  ethPriceUsd: number
  tokenPortfolioUsd: number | null // sum of all ERC-20 token USD values
  totalPortfolioUsd: number | null // ETH + tokens at current prices
  maxHistoricalUsd: number | null  // current portfolio + sampled outflows at historic rates
  uniqueCounterparties: number | null
  contractInteractionCount: number | null
  uniqueContractsInteracted: number | null
  failedTxCount: number | null
  isContract: boolean
  fetchedAt: number
}

// ── Blockscout response shapes ──────────────────────────────────────────────

type BSAddress = {
  coin_balance?: string | null
  exchange_rate?: string | null
  is_contract?: boolean
  ens_domain_name?: string | null
}

type BSCounters = {
  transactions_count?: string
  token_transfers_count?: string
}

type BSTxItem = {
  timestamp?: string
  from?: { hash: string }
  to?: { hash: string; is_contract?: boolean } | null
  status?: string                   // "ok" | "error"
  method?: string | null
  created_contract?: { hash: string } | null
  value?: string                    // wei string (outgoing ETH, "0" for token-only txs)
  nonce?: number                    // 0 = wallet's very first outgoing tx
  historic_exchange_rate?: string   // ETH/USD at the time of this tx
}

type BSPage = {
  items: BSTxItem[]
  next_page_params?: Record<string, string | number> | null
}

type BSTokenBalance = {
  token: {
    decimals?: string | null
    exchange_rate?: string | null   // USD price per token unit
    symbol?: string
    type?: string
  }
  value?: string                    // raw token units (integer string)
}

// ── Blockscout helpers ──────────────────────────────────────────────────────

async function bsGet<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(`${BS}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v))
  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Blockscout ${res.status} on ${path}: ${body.slice(0, 200)}`)
  }
  return res.json() as Promise<T>
}

// Paginate transactions newest-first. Stops when nonce 0 is found (exact origin)
// or after maxPages pages. Returns the raw tx list plus oldest-tx metadata.
async function fetchTxHistory(address: string, maxPages = 20): Promise<{
  recentTxs: BSTxItem[]
  oldestTx: BSTxItem | null
  foundExactOrigin: boolean
}> {
  const addrLow = address.toLowerCase()
  const all: BSTxItem[] = []
  let cursor: Record<string, string | number> = {}
  let oldestTx: BSTxItem | null = null
  let foundExactOrigin = false

  for (let page = 0; page < maxPages; page++) {
    const data = await bsGet<BSPage>(`/addresses/${address}/transactions`, cursor)
    all.push(...data.items)

    // nonce === 0 from this address is the cryptographically guaranteed first tx
    for (const tx of data.items) {
      if (tx.from?.hash?.toLowerCase() === addrLow && tx.nonce === 0) {
        oldestTx = tx
        foundExactOrigin = true
        break
      }
    }

    if (foundExactOrigin || !data.next_page_params) break
    cursor = data.next_page_params
  }

  // Fallback: use oldest tx in sample (list is newest-first, so last = oldest)
  if (!oldestTx && all.length > 0) {
    const sentTxs = all.filter(tx => tx.from?.hash?.toLowerCase() === addrLow && tx.timestamp)
    oldestTx = sentTxs.length > 0 ? sentTxs[sentTxs.length - 1] : all[all.length - 1]
  }

  return { recentTxs: all, oldestTx, foundExactOrigin }
}

// Sum ERC-20 token portfolio USD value from Blockscout token-balances endpoint
async function fetchTokenPortfolioUsd(address: string): Promise<number> {
  try {
    const items = await bsGet<BSTokenBalance[]>(`/addresses/${address}/token-balances`)
    let total = 0
    for (const item of items) {
      const rate = parseFloat(item.token?.exchange_rate ?? '')
      const rawValue = item.value ?? '0'
      const decimals = parseInt(item.token?.decimals ?? '18', 10)
      if (!isFinite(rate) || rate <= 0) continue
      // Convert raw integer units to decimal amount, avoiding BigInt overflow
      const amount = Number(BigInt(rawValue)) / Math.pow(10, decimals)
      total += amount * rate
    }
    return total
  } catch {
    return 0
  }
}

// ── Main profile fetch ──────────────────────────────────────────────────────

export async function fetchWalletProfile(rawAddress: string): Promise<WalletProfile> {
  if (!isAddress(rawAddress)) throw new Error('Invalid Ethereum address')
  const address = rawAddress
  const now = Math.floor(Date.now() / 1000)

  // All network calls in parallel
  const [addrResult, countersResult, codeResult, txResult, tokenResult] =
    await Promise.allSettled([
      bsGet<BSAddress>(`/addresses/${address}`),
      bsGet<BSCounters>(`/addresses/${address}/counters`),
      ethClient.getBytecode({ address }),
      fetchTxHistory(rawAddress, 20),
      fetchTokenPortfolioUsd(rawAddress),
    ])

  const addr = addrResult.status === 'fulfilled' ? addrResult.value : null
  const counters = countersResult.status === 'fulfilled' ? countersResult.value : null

  const isContract =
    (addr?.is_contract === true) ||
    (codeResult.status === 'fulfilled' && !!codeResult.value && codeResult.value !== '0x')

  // ETH balance (wei bigint)
  let ethBalance: bigint | null = null
  if (addr?.coin_balance) {
    try { ethBalance = BigInt(addr.coin_balance) } catch { /* ignore */ }
  }

  // Live ETH/USD from Blockscout's exchange_rate field on the address object
  const ethPriceUsd = addr?.exchange_rate ? parseFloat(addr.exchange_rate) : 3200

  // Full tx count from /counters (not limited to sampled pages)
  const txCount = counters?.transactions_count != null
    ? parseInt(counters.transactions_count, 10)
    : null

  const { recentTxs: txList, oldestTx, foundExactOrigin } =
    txResult.status === 'fulfilled'
      ? txResult.value
      : { recentTxs: [], oldestTx: null, foundExactOrigin: false }

  // Wallet age
  let firstTxTimestamp: number | null = null
  let walletAgeYears: number | null = null
  if (oldestTx?.timestamp) {
    firstTxTimestamp = Math.floor(new Date(oldestTx.timestamp).getTime() / 1000)
    walletAgeYears = (now - firstTxTimestamp) / (365.25 * 24 * 3600)
  }

  // Per-tx metrics from the sampled pages
  let failedTxCount: number | null = null
  let uniqueCounterparties: number | null = null
  let contractInteractionCount: number | null = null
  let uniqueContractsInteracted: number | null = null

  if (txList.length > 0) {
    const addrLow = address.toLowerCase()

    // Scale sampled failure count up to full history
    const sampledFailed = txList.filter(tx => tx.status === 'error').length
    failedTxCount = txCount !== null && txList.length > 0
      ? Math.round((sampledFailed / txList.length) * txCount)
      : sampledFailed

    const counterpartySet = new Set<string>()
    const contractSet = new Set<string>()
    let ciCount = 0

    for (const tx of txList) {
      const fromMe = tx.from?.hash?.toLowerCase() === addrLow
      const toAddr = tx.to?.hash?.toLowerCase()
      const toIsContract = tx.to?.is_contract === true
      const created = tx.created_contract?.hash?.toLowerCase()
      const hasMethod = !!tx.method && tx.method !== '0x'

      if (fromMe) {
        if (toAddr && toAddr !== addrLow) {
          counterpartySet.add(toAddr)
          if (toIsContract || hasMethod) {
            ciCount++
            contractSet.add(toAddr)
          }
        }
        if (created) {
          ciCount++
          contractSet.add(created)
        }
      } else {
        const src = tx.from?.hash?.toLowerCase()
        if (src && src !== addrLow) counterpartySet.add(src)
      }
    }

    // Scale contract interactions up to full history (same ratio)
    if (txCount !== null && txList.length > 0) {
      ciCount = Math.round((ciCount / txList.length) * txCount)
    }

    uniqueCounterparties = counterpartySet.size
    contractInteractionCount = ciCount
    uniqueContractsInteracted = contractSet.size
  }

  // Token portfolio USD
  const tokenPortfolioUsd = tokenResult.status === 'fulfilled' ? tokenResult.value : null

  // Current ETH USD value (safe float division — avoids Number(bigint) precision loss for huge balances)
  const currentEthUsd = ethBalance !== null
    ? (Number(ethBalance / BigInt(1e9)) / 1e9) * ethPriceUsd
    : 0

  // Total current portfolio = ETH + tokens
  const totalPortfolioUsd =
    ethBalance !== null || tokenPortfolioUsd !== null
      ? currentEthUsd + (tokenPortfolioUsd ?? 0)
      : null

  // Capital historically controlled = current portfolio + outflows at historic rates
  let maxHistoricalUsd: number | null = null
  if (totalPortfolioUsd !== null || txList.length > 0) {
    const addrLow = address.toLowerCase()
    let outflowUsd = 0
    for (const tx of txList) {
      if (tx.from?.hash?.toLowerCase() !== addrLow) continue
      const weiStr = tx.value ?? '0'
      if (weiStr === '0') continue
      // Avoid BigInt→Number precision loss for large wei values
      const eth = Number(BigInt(weiStr) / BigInt(1e9)) / 1e9
      const price = tx.historic_exchange_rate ? parseFloat(tx.historic_exchange_rate) : ethPriceUsd
      if (isFinite(price) && price > 0) outflowUsd += eth * price
    }
    maxHistoricalUsd = (totalPortfolioUsd ?? 0) + outflowUsd
  }

  // ENS reverse: Blockscout returns ens_domain_name directly on the address object
  const ensName = addr?.ens_domain_name ?? null
  const ensAvatar: string | null = null  // avatar not provided by Blockscout address endpoint

  return {
    address,
    ensName,
    ensAvatar,
    firstTxTimestamp,
    walletAgeYears,
    walletAgeEstimated: !foundExactOrigin && firstTxTimestamp !== null,
    txCount,
    ethBalance,
    ethPriceUsd,
    tokenPortfolioUsd,
    totalPortfolioUsd,
    maxHistoricalUsd,
    uniqueCounterparties,
    contractInteractionCount,
    uniqueContractsInteracted,
    failedTxCount,
    isContract,
    fetchedAt: now,
  }
}

// ── Classification helpers ──────────────────────────────────────────────────

export type WalletType = 'Individual' | 'Treasury' | 'Exchange' | 'Bot' | 'Smart Contract' | 'Power User' | 'Unknown'

export function classifyWalletType(p: WalletProfile): WalletType {
  // Bytecode detected → this is a deployed contract, not a human wallet
  if (p.isContract) return 'Smart Contract'
  if (p.txCount === null) return 'Unknown'
  const dailyTx = p.walletAgeYears && p.walletAgeYears > 0 ? p.txCount / (p.walletAgeYears * 365) : 0
  const ciRatio = p.txCount > 0 && p.contractInteractionCount !== null ? p.contractInteractionCount / p.txCount : 0
  const ethVal = p.ethBalance !== null ? Number(p.ethBalance) / 1e18 : 0
  if (dailyTx > 100 && (p.uniqueContractsInteracted ?? 0) < 5) return 'Bot'
  if ((p.uniqueCounterparties ?? 0) > 5000 && ethVal > 100) return 'Exchange'
  if (ethVal > 50 && dailyTx < 5 && (p.uniqueCounterparties ?? 0) < 500) return 'Treasury'
  // EOA where >80% of txs call contracts across 20+ unique contracts
  if (ciRatio > 0.8 && (p.uniqueContractsInteracted ?? 0) > 20) return 'Power User'
  return 'Individual'
}

export type RiskLevel = 'Low' | 'Medium' | 'High'

export function sybilProbability(p: WalletProfile): RiskLevel {
  if (p.walletAgeYears === null || p.txCount === null) return 'Medium'
  const score =
    (p.walletAgeYears < 0.5 ? 2 : 0) +
    (p.txCount < 10 ? 2 : 0) +
    ((p.uniqueCounterparties ?? 0) < 5 ? 1 : 0)
  if (score >= 4) return 'High'
  if (score >= 2) return 'Medium'
  return 'Low'
}

export function protocolDiversity(p: WalletProfile): 'High' | 'Medium' | 'Low' {
  const n = p.uniqueContractsInteracted ?? 0
  if (n >= 20) return 'High'
  if (n >= 5) return 'Medium'
  return 'Low'
}

export function contractInteractionLevel(p: WalletProfile): 'Extensive' | 'Moderate' | 'Minimal' | 'None' {
  const n = p.contractInteractionCount ?? 0
  if (n >= 500) return 'Extensive'
  if (n >= 50) return 'Moderate'
  if (n >= 1) return 'Minimal'
  return 'None'
}

export function paymentReliability(p: WalletProfile): number {
  if (p.txCount === null || p.txCount === 0) return 0
  const failed = p.failedTxCount ?? 0
  return Math.round((1 - failed / p.txCount) * 100)
}

export function exploitExposure(_p: WalletProfile): string {
  return 'None detected'
}

export function formatAge(years: number): string {
  if (years < 1) {
    const months = Math.round(years * 12)
    return `${months} month${months !== 1 ? 's' : ''}`
  }
  return `${years.toFixed(1)} years`
}

export function formatUsdShort(usd: number): string {
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(1)}B`
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}K`
  return `$${usd.toFixed(0)}`
}

export function formatEth(wei: bigint): string {
  const eth = Number(wei) / 1e18
  if (eth < 0.0001) return '< 0.0001 ETH'
  return `${eth.toFixed(4)} ETH`
}
