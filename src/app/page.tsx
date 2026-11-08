import Link from 'next/link'
import { Brand } from '@/components/brand'
import { Button } from '@/components/ui/button'
import {
  ArrowRight,
  Store,
  FileSpreadsheet,
  Sparkles,
  ShieldCheck,
  Zap,
  CheckCircle2
} from 'lucide-react'

const steps = [
  {
    title: 'Explore Catalogue & Schemes',
    description:
      'Retailers browse live distributor inventory with pack configurations, trade promotional schemes, and indicative stock levels.',
    icon: Store,
  },
  {
    title: 'Hinglish AI Order Capture',
    description:
      'Dictate or paste multi-line WhatsApp orders. Natural language processing parses SKUs, while requiring explicit human confirmation.',
    icon: Sparkles,
  },
  {
    title: 'Review Desk & ERP Export',
    description:
      'Order desk operators monitor real-time queue snapshots, verify price bases, and export commercial orders to Tally-ready CSV formats.',
    icon: FileSpreadsheet,
  },
]

const highlights = [
  'Deterministic Integer-Paise Financial Math',
  'Unit Ambiguity Safe Confirmations',
  'Simulation Isolation from Tally Exports',
  'Fail-Closed Role-Based Security Gates',
]

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background font-sans">
      {/* Sticky Navbar */}
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Brand />
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="text-xs sm:text-sm font-semibold">
              <Link href="/login">Order desk</Link>
            </Button>
            <Button asChild size="sm" className="h-8 text-xs sm:text-sm font-semibold rounded-lg shadow-2xs">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 sm:px-6">
        {/* Hero Section */}
        <section className="pt-16 pb-16 sm:pt-24 sm:pb-20">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary mb-6">
            <Zap className="h-3.5 w-3.5" />
            <span>Built for Modern FMCG Distribution</span>
          </div>

          <h1 className="max-w-3xl text-3xl sm:text-5xl font-extrabold tracking-tight text-foreground leading-[1.15]">
            Seamless B2B FMCG ordering, without messy phone calls or manual errors.
          </h1>

          <p className="mt-5 max-w-2xl text-base sm:text-lg leading-relaxed text-muted-foreground">
            DukaanFlow unites FMCG distributors and neighbourhood retailers. Instant catalogue
            browsing, Hinglish natural language order capture, and audit-ready Tally ERP export.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="h-11 px-6 font-semibold shadow-xs rounded-xl gap-2">
              <Link href="/login">
                <span>Sign in to Retailer Portal</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-11 px-5 font-semibold rounded-xl text-muted-foreground hover:text-foreground">
              <Link href="/login">Operations Order Desk &rarr;</Link>
            </Button>
          </div>

          {/* Value props checklist */}
          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4 pt-8 border-t border-border/60">
            {highlights.map((h, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                <span>{h}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Workflow 3-Step Section */}
        <section className="border-t border-border/80 pt-16" aria-labelledby="how-heading">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-primary">System Workflow</span>
            <h2 id="how-heading" className="text-2xl font-bold tracking-tight text-foreground">
              How DukaanFlow streamlines distribution
            </h2>
          </div>

          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            {steps.map((step, index) => (
              <div
                key={step.title}
                className="rounded-2xl border border-border bg-card p-6 shadow-2xs transition-all duration-200 hover:border-primary/40 hover:shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4 shadow-2xs">
                    <step.icon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Step 0{index + 1}
                  </span>
                  <h3 className="mt-1.5 text-base font-bold text-foreground">{step.title}</h3>
                  <p className="mt-2 text-xs sm:text-sm leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Audit & Compliance Footer note */}
        <section className="mt-16 rounded-2xl border border-border/80 bg-muted/20 p-6 text-xs text-muted-foreground leading-relaxed">
          <div className="flex items-center gap-2 font-semibold text-foreground mb-1">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span>Architectural Safeguards & Governance</span>
          </div>
          <p>
            Catalogue stock indicators represent unreserved inventory snapshots. Commercial orders are gated
            until distributor operations policy sign-off. Sandboxed simulation orders exercise full routing, validation,
            and UI verification without altering warehouse quantities or appearing in commercial Tally exports.
          </p>
        </section>
      </main>
    </div>
  )
}
