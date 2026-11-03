import Link from "next/link";
import { Store, ArrowRight, ShieldCheck, ShoppingCart, FileSpreadsheet, Bot, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-muted/20 text-foreground font-sans">
      {/* Header */}
      <header className="border-b border-border/80 bg-background/95 backdrop-blur-xs sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-xs">
              <Store className="h-5 w-5" />
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight">DukaanFlow</span>
              <span className="ml-1.5 rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">B2B</span>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/login" className="flex items-center gap-1.5">
                <span>Enter Portal</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-6xl mx-auto px-4 py-16 sm:py-24 flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary mb-6">
          <span className="flex h-1.5 w-1.5 rounded-full bg-primary" />
          Production-Ready FMCG Distributor & Retailer Platform
        </div>

        <h1 className="max-w-3xl text-4xl sm:text-5xl font-extrabold tracking-tight text-foreground leading-[1.15]">
          Intelligent order capture & fulfillment for FMCG distributors.
        </h1>
        <p className="mt-5 max-w-2xl text-base sm:text-lg text-muted-foreground">
          Empower neighbourhood kirana retailers to order via natural Hindi/English text while giving distributors real-time queue approvals, scheme calculations, and deterministic Tally ERP export.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Button asChild size="lg" className="h-11 px-6 shadow-xs gap-2">
            <Link href="/login">
              <span>Start Retailer Session</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-11 px-6">
            <Link href="/login">
              <span>Open Order Desk</span>
            </Link>
          </Button>
        </div>

        {/* Feature Grid */}
        <div className="mt-20 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-left w-full">
          <div className="rounded-xl border border-border bg-card p-6 shadow-xs">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-4">
              <Bot className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-sm mb-1.5">AI Natural Language Orders</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Order via Hinglish and English text like &ldquo;10 peti Parle-G aur 5 packet Surf Excel&rdquo;. Human review required before cart placement.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 shadow-xs">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-4">
              <ShoppingCart className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-sm mb-1.5">Deterministic Schemes</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Automated Buy-X-Get-Y and threshold percentage schemes calculated deterministically in integer paise with zero floating-point error.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 shadow-xs">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-4">
              <FileSpreadsheet className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-sm mb-1.5">Tally ERP Compatible</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              One-click RFC-4180 CSV export formatted directly for FMCG distributor ERP ingestion, strictly isolating simulation data.
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-6 shadow-xs">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-4">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h3 className="font-semibold text-sm mb-1.5">Enterprise Safeguards</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Fail-closed inventory reservation and price basis gates protect real commercial inventory while allowing full simulation testing.
            </p>
          </div>
        </div>

        {/* System Capabilities List */}
        <div className="mt-16 rounded-2xl border border-border bg-card p-8 w-full max-w-4xl text-left shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/80 pb-6">
            <div>
              <h2 className="text-lg font-bold tracking-tight">Enterprise Safety & Integrity Architecture</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Built according to strict FMCG distributor operating parameters</p>
            </div>
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 self-start sm:self-auto">
              Production Verified
            </span>
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span><strong>Server-Enforced RBAC:</strong> Strict role boundaries separating RETAILER and ORDER_DESK views.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span><strong>Simulation Isolation:</strong> Demo orders never decrement real inventory or leak into Tally exports.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span><strong>Idempotent Transactions:</strong> Duplicate order submissions and double decrement protection.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span><strong>Zero Magic Pricing:</strong> Per-pack / per-case price basis confirmed before commercial submission.</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/80 bg-background py-8 text-center text-xs text-muted-foreground">
        <p>© 2026 DukaanFlow FMCG B2B Ordering Platform. All rights reserved.</p>
      </footer>
    </div>
  );
}
