import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search,
  Shield,
  Clock,
  Activity,
  Users,
  Layers,
  Code2,
  AlertTriangle,
  CreditCard,
  Tag,
  ExternalLink,
  RotateCcw,
  ChevronRight,
  Wallet,
} from 'lucide-react'
import {
  fetchWalletProfile,
  resolveEns,
  classifyWalletType,
  sybilProbability,
  protocolDiversity,
  contractInteractionLevel,
  paymentReliability,
  exploitExposure,
  formatAge,
  formatUsdShort,
  formatEth,
  type WalletProfile,
  type WalletType,
  type RiskLevel,
} from './walletReputation'
import { isAddress } from 'viem'

// ── helpers ────────────────────────────────────────────────────────────────

function etherscanUrl(addr: string) {
  return `https://etherscan.io/address/${addr}`
}

// ── risk / level colors ────────────────────────────────────────────────────

function riskColor(level: RiskLevel | 'None detected') {
  if (level === 'Low' || level === 'None detected') return 'text-[var(--success)]'
  if (level === 'Medium') return 'text-[var(--warning)]'
  return 'text-[var(--danger)]'
}

function riskDot(level: RiskLevel) {
  if (level === 'Low') return 'bg-[var(--success)]'
  if (level === 'Medium') return 'bg-[var(--warning)]'
  return 'bg-[var(--danger)]'
}

function diversityColor(d: 'High' | 'Medium' | 'Low') {
  if (d === 'High') return 'text-[var(--success)]'
  if (d === 'Medium') return 'text-[var(--warning)]'
  return 'text-[var(--subtle)]'
}

function typeColor(t: WalletType) {
  const map: Record<WalletType, string> = {
    Individual: 'bg-blue-900/40 text-blue-300 border-blue-700/50',
    Treasury: 'bg-amber-900/40 text-amber-300 border-amber-700/50',
    Exchange: 'bg-purple-900/40 text-purple-300 border-purple-700/50',
    Bot: 'bg-red-900/40 text-red-300 border-red-700/50',
    'Smart Contract': 'bg-teal-900/40 text-teal-300 border-teal-700/50',
    'Power User': 'bg-indigo-900/40 text-indigo-300 border-indigo-700/50',
    Unknown: 'bg-gray-900/40 text-gray-400 border-gray-700/50',
  }
  return map[t]
}

// ── reliability ring ───────────────────────────────────────────────────────

function ReliabilityRing({ score }: { score: number }) {
  const r = 36
  const circ = 2 * Math.PI * r
  const dash = (score / 100) * circ
  const color = score >= 90 ? 'var(--success)' : score >= 70 ? 'var(--warning)' : 'var(--danger)'
  return (
    <div className="relative flex items-center justify-center" style={{ width: 96, height: 96 }}>
      <svg width={96} height={96} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={48} cy={48} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={8} />
        <circle
          cx={48} cy={48} r={r}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.8s ease' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="display font-bold text-xl tabular-nums" style={{ color }}>{score}</span>
        <span className="text-[10px] text-[var(--subtle)] tracking-widest uppercase">/ 100</span>
      </div>
    </div>
  )
}

// ── metric row ─────────────────────────────────────────────────────────────

interface MetricRowProps {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  sub?: string
}

function MetricRow({ icon, label, value, sub }: MetricRowProps) {
  return (
    <div className="flex items-start gap-3 py-3.5 border-b border-[var(--border)] last:border-0">
      <div className="flex-shrink-0 mt-0.5 text-[var(--subtle)]">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs uppercase tracking-widest text-[var(--subtle)] mb-0.5">{label}</p>
        <div className="text-sm font-medium text-[var(--ink-2)]">{value}</div>
        {sub && <p className="text-xs text-[var(--subtle)] mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── empty / loading / error ────────────────────────────────────────────────

function Skeleton({ w = '100%', h = 16 }: { w?: string | number; h?: number }) {
  return (
    <div
      className="rounded animate-pulse bg-[var(--surface-strong)]"
      style={{ width: w, height: h }}
    />
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 space-y-4">
      <Skeleton w="40%" h={14} />
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="flex items-center gap-3 py-2">
          <Skeleton w={20} h={20} />
          <div className="flex-1 space-y-2">
            <Skeleton w="30%" h={10} />
            <Skeleton w="50%" h={14} />
          </div>
        </div>
      ))}
    </div>
  )
}

// ── main result view ───────────────────────────────────────────────────────

function ResultView({ profile, ensName }: { profile: WalletProfile; ensName: string | null }) {
  const walletType = classifyWalletType(profile)
  const sybil = sybilProbability(profile)
  const diversity = protocolDiversity(profile)
  const ciLevel = contractInteractionLevel(profile)
  const reliability = paymentReliability(profile)
  const exploit = exploitExposure(profile)

  const hasData = profile.txCount !== null

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-4"
    >
      {/* Header identity card */}
      <div className="rounded-2xl border border-[var(--border-strong)] bg-[var(--surface-strong)] p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[var(--surface-muted)] border border-[var(--border)]">
              <Wallet size={18} className="text-[var(--accent)]" />
            </div>
            <div>
              {ensName && (
                <p className="display font-bold text-base text-[var(--ink)] mb-0.5">{ensName}</p>
              )}
              <p className="mono text-xs font-medium text-[var(--subtle)] tabular-nums">
                {profile.address}
              </p>
              <p className="text-xs text-[var(--subtle)] mt-0.5">
                Ethereum Mainnet
                {profile.isContract && <span className="ml-2 text-teal-400">Contract</span>}
              </p>
            </div>
          </div>
          <a
            href={etherscanUrl(profile.address)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 flex items-center gap-1.5 text-xs text-[var(--subtle)] hover:text-[var(--accent)] transition-colors"
          >
            <ExternalLink size={13} />
            Etherscan
          </a>
        </div>

        {/* Type badge */}
        <div className="mt-4 flex flex-wrap gap-2">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${typeColor(walletType)}`}>
            <Tag size={11} />
            {walletType}
          </span>
          {profile.isContract && walletType !== 'Smart Contract' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-teal-700/50 bg-teal-900/30 text-teal-300 text-xs font-semibold">
              <Code2 size={11} />
              Smart Contract
            </span>
          )}
        </div>
      </div>

      {/* Two-column grid on wide screens */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Activity card */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="text-xs uppercase tracking-widest text-[var(--subtle)] mb-2 font-semibold">Activity</p>
          <MetricRow
            icon={<Clock size={16} />}
            label="Wallet age"
            value={profile.walletAgeYears !== null ? formatAge(profile.walletAgeYears) : 'No on-chain history'}
            sub={profile.firstTxTimestamp ? `First tx: ${new Date(profile.firstTxTimestamp * 1000).toLocaleDateString()}${profile.walletAgeEstimated ? ' (estimated — full history not sampled)' : ''}` : undefined}
          />
          <MetricRow
            icon={<Activity size={16} />}
            label="Transaction history"
            value={
              profile.txCount !== null
                ? <span className="tabular-nums">{profile.txCount.toLocaleString()} transactions</span>
                : 'No transactions found'
            }
            sub={
              profile.failedTxCount !== null && profile.txCount
                ? `${profile.failedTxCount} failed (${((profile.failedTxCount / profile.txCount) * 100).toFixed(1)}%)`
                : undefined
            }
          />
          <MetricRow
            icon={<Users size={16} />}
            label="Counterparties"
            value={
              profile.uniqueCounterparties !== null
                ? <span className="tabular-nums">{profile.uniqueCounterparties.toLocaleString()} unique addresses</span>
                : <span className="text-[var(--subtle)]">—</span>
            }
          />
        </div>

        {/* Capital card */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="text-xs uppercase tracking-widest text-[var(--subtle)] mb-2 font-semibold">Capital</p>
          <MetricRow
            icon={<CreditCard size={16} />}
            label="Current portfolio"
            value={
              profile.totalPortfolioUsd !== null
                ? <span className="tabular-nums">{formatUsdShort(profile.totalPortfolioUsd)}</span>
                : <span className="text-[var(--subtle)]">—</span>
            }
            sub={[
              profile.ethBalance !== null ? formatEth(profile.ethBalance) + ' ETH' : null,
              profile.tokenPortfolioUsd !== null && profile.tokenPortfolioUsd > 0
                ? formatUsdShort(profile.tokenPortfolioUsd) + ' in tokens'
                : null,
              `$${profile.ethPriceUsd.toFixed(0)}/ETH`,
            ].filter(Boolean).join(' · ')}
          />
          <MetricRow
            icon={<Activity size={16} />}
            label="Capital historically controlled"
            value={
              profile.maxHistoricalUsd !== null
                ? <span className="tabular-nums">{formatUsdShort(profile.maxHistoricalUsd)}</span>
                : <span className="text-[var(--subtle)]">—</span>
            }
            sub="Current portfolio + sampled outflows at historic ETH/USD rates"
          />
        </div>

        {/* Risk signals card */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="text-xs uppercase tracking-widest text-[var(--subtle)] mb-2 font-semibold">Risk Signals</p>
          <MetricRow
            icon={<Shield size={16} />}
            label="Sybil probability"
            value={
              <span className={`flex items-center gap-2 ${riskColor(sybil)}`}>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${riskDot(sybil)}`} />
                {sybil}
              </span>
            }
          />
          <MetricRow
            icon={<AlertTriangle size={16} />}
            label="Known exploit exposure"
            value={
              <span className={riskColor('None detected')}>{exploit}</span>
            }
            sub="Based on public exploit registries"
          />
          <MetricRow
            icon={<Layers size={16} />}
            label="Protocol diversity"
            value={
              hasData
                ? <span className={diversityColor(diversity)}>{diversity}</span>
                : <span className="text-[var(--subtle)]">—</span>
            }
            sub={profile.uniqueContractsInteracted !== null ? `${profile.uniqueContractsInteracted} unique contracts` : undefined}
          />
        </div>

        {/* Behavior card */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="text-xs uppercase tracking-widest text-[var(--subtle)] mb-2 font-semibold">Behavior</p>
          <MetricRow
            icon={<Code2 size={16} />}
            label="Contract interaction history"
            value={
              hasData
                ? <span className="text-[var(--ink-2)]">{ciLevel}</span>
                : <span className="text-[var(--subtle)]">—</span>
            }
            sub={profile.contractInteractionCount !== null ? `${profile.contractInteractionCount.toLocaleString()} interactions` : undefined}
          />
        </div>
      </div>

      {/* Payment reliability — full width with ring */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="flex items-center justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-widest text-[var(--subtle)] font-semibold mb-1">Payment Reliability</p>
            <p className="text-sm text-[var(--ink-2)] max-w-sm">
              {reliability >= 90
                ? 'Consistently successful transactions with minimal failures.'
                : reliability >= 70
                ? 'Moderate success rate — some transaction failures recorded.'
                : 'Notable failure rate in transaction history.'}
            </p>
            {profile.txCount !== null && profile.failedTxCount !== null && (
              <p className="text-xs text-[var(--subtle)] mt-2 tabular-nums">
                {(profile.txCount - profile.failedTxCount).toLocaleString()} succeeded / {profile.txCount.toLocaleString()} total
              </p>
            )}
          </div>
          {profile.txCount !== null
            ? <ReliabilityRing score={reliability} />
            : <div className="text-[var(--subtle)] text-sm">No data</div>
          }
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-[var(--subtle)] text-center px-2 pb-2">
        Data sourced from Ethereum mainnet via public RPC and Blockscout. Metrics are heuristic estimates, not financial or legal assessments.
      </p>
    </motion.div>
  )
}

// ── search bar ─────────────────────────────────────────────────────────────

interface SearchBarProps {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  loading: boolean
  error: string | null
}

function isEns(v: string) { return v.trim().endsWith('.eth') && v.trim().length > 4 }
function isValidInput(v: string) { return isAddress(v) || isEns(v) }

function SearchBar({ value, onChange, onSubmit, loading, error }: SearchBarProps) {
  const invalid = value !== '' && !isValidInput(value)
  const handleKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') onSubmit() }

  return (
    <div className="w-full">
      <div className={`flex items-center gap-3 rounded-xl border bg-[var(--surface-strong)] px-4 py-3 transition-colors ${
        invalid ? 'border-[var(--danger)]' : 'border-[var(--border-strong)]'
      } focus-within:border-[var(--accent)]`}>
        <Search size={18} className="flex-shrink-0 text-[var(--subtle)]" />
        <input
          type="text"
          placeholder="0x... address or vitalik.eth"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKey}
          spellCheck={false}
          className="flex-1 bg-transparent outline-none text-sm font-medium text-[var(--ink)] placeholder:text-[var(--subtle)] mono"
        />
        <button
          onClick={onSubmit}
          disabled={loading || !isValidInput(value)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'var(--accent)', color: '#0d1b2f' }}
        >
          {loading
            ? <><RotateCcw size={13} className="animate-spin" /> Checking</>
            : <><ChevronRight size={13} /> Analyze</>
          }
        </button>
      </div>
      {invalid && (
        <p className="text-xs text-[var(--danger)] mt-1.5 ml-1">Enter a valid 0x address or ENS name (e.g. vitalik.eth)</p>
      )}
      {error && (
        <p className="text-xs text-[var(--danger)] mt-1.5 ml-1">{error}</p>
      )}
    </div>
  )
}

// ── example addresses ──────────────────────────────────────────────────────

const EXAMPLES = [
  { label: 'vitalik.eth', addr: 'vitalik.eth' },
  { label: 'nick.eth', addr: 'nick.eth' },
  { label: 'Uniswap v3 pool', addr: '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640' },
]

// ── root app ───────────────────────────────────────────────────────────────

export default function App() {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<WalletProfile | null>(null)
  const [ensName, setEnsName] = useState<string | null>(null)
  const [loadingPhase, setLoadingPhase] = useState('')

  const analyze = useCallback(async (input?: string) => {
    const raw = (input ?? query).trim()
    if (!isValidInput(raw)) return

    setLoading(true)
    setError(null)
    setProfile(null)
    setEnsName(null)

    try {
      let resolved = raw
      let detectedEns: string | null = null

      if (isEns(raw)) {
        setLoadingPhase('Resolving ENS name...')
        const ensData = await resolveEns(raw)
        if (!ensData.address) throw new Error(`ENS name "${raw}" could not be resolved`)
        resolved = ensData.address
        detectedEns = ensData.displayName ?? raw
      }

      setLoadingPhase('Fetching on-chain data...')
      const p = await fetchWalletProfile(resolved)
      // Use ENS from input if provided; otherwise use reverse-resolved name from profile
      setProfile(p)
      setEnsName(detectedEns ?? p.ensName)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to fetch data'
      setError(msg)
    } finally {
      setLoading(false)
      setLoadingPhase('')
    }
  }, [query])

  const handleExample = (addr: string) => {
    setQuery(addr)
    void analyze(addr)
  }

  return (
    <div
      className="min-h-dvh flex flex-col"
      style={{ background: 'var(--bg-gradient)' }}
    >
      {/* Header */}
      <header className="border-b border-[var(--border)] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent)' }}>
            <Shield size={16} style={{ color: '#0d1b2f' }} />
          </div>
          <span className="display font-bold text-base text-[var(--ink)]">Wallet Reputation Layer</span>
        </div>
        <span className="text-xs text-[var(--subtle)] hidden sm:block">Ethereum Mainnet</span>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-3xl mx-auto w-full px-4 py-8 space-y-6">

        {/* Hero */}
        <div className="text-center space-y-2">
          <h1 className="display font-bold text-3xl sm:text-4xl text-[var(--ink)]" style={{ letterSpacing: '-0.03em' }}>
            Understand any wallet
          </h1>
          <p className="text-sm text-[var(--subtle)] max-w-md mx-auto">
            Not a good/bad label. Real heuristic signals from on-chain history — age, activity, capital, behavior, and type classification.
          </p>
        </div>

        {/* Search */}
        <SearchBar
          value={query}
          onChange={setQuery}
          onSubmit={() => void analyze()}
          loading={loading}
          error={error}
        />

        {/* Example chips */}
        {!profile && !loading && (
          <div className="flex flex-wrap gap-2 justify-center">
            <span className="text-xs text-[var(--subtle)] self-center">Try:</span>
            {EXAMPLES.map(ex => (
              <button
                key={ex.addr}
                onClick={() => handleExample(ex.addr)}
                className="px-3 py-1.5 rounded-full border border-[var(--border)] text-xs text-[var(--muted)] hover:border-[var(--border-strong)] hover:text-[var(--ink-2)] transition-colors mono"
              >
                {ex.label}
              </button>
            ))}
          </div>
        )}

        {/* Loading skeletons */}
        <AnimatePresence>
          {loading && (
            <motion.div
              key="skeleton"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              <div className="text-center">
                <p className="text-sm text-[var(--subtle)] animate-pulse">{loadingPhase}</p>
              </div>
              <SkeletonCard />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SkeletonCard />
                <SkeletonCard />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Result */}
        <AnimatePresence>
          {profile && !loading && (
            <ResultView key={profile.address} profile={profile} ensName={ensName} />
          )}
        </AnimatePresence>

        {/* Empty state */}
        {!loading && !profile && !error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-3 py-12 text-center"
          >
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center border border-[var(--border)] bg-[var(--surface)]">
              <Search size={28} className="text-[var(--subtle)]" />
            </div>
            <p className="text-sm text-[var(--subtle)] max-w-xs">
              Paste any Ethereum address or ENS name to see its reputation profile — no good/bad score, just the raw signal.
            </p>
          </motion.div>
        )}
      </main>
    </div>
  )
}
