import Link from 'next/link'
import { Brand } from '@/components/brand'
import { Button } from '@/components/ui/button'
import { ArrowRight, Store, ClipboardCheck, FileSpreadsheet } from 'lucide-react'

const steps = [
  {
    title: 'Build the order',
    description:
      'Retailers browse the distributor catalogue with indicative stock, trade schemes, and catalogue pricing — or describe an order in plain language and review proposed SKU mappings.',
    icon: Store,
  },
  {
    title: 'Confirm explicitly',
    description:
      'Every order requires explicit human confirmation. AI suggestions are proposals only — quantities, SKUs, and ambiguous units are always reviewed before anything is submitted.',
    icon: ClipboardCheck,
  },
  {
    title: 'Process and export',
    description:
      'The order desk reviews the queue snapshot, monitors incoming orders, and exports approved commercial orders to Tally-format CSV. Duplicate submissions are deduplicated by idempotency keys.',
    icon: FileSpreadsheet,
  },
]

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex h-12 w-full max-w-6xl items-center justify-between px-4 lg:px-6">
          <Brand />
          <Button asChild size="sm" className="h-8">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-20 lg:px-6">
        <section className="pt-16 pb-12">
          <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-foreground">
            Ordering between FMCG distributors and retailers, without the phone calls.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            DukaanFlow is a B2B ordering tool for FMCG distribution. Retailers place
            orders against indicative distributor stock; the distributor&apos;s order desk
            reviews and settles them.
          </p>
          <div className="mt-6 flex items-center gap-2">
            <Button asChild size="sm">
              <Link href="/login">
                Sign in to get started
                <ArrowRight />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Order desk sign in</Link>
            </Button>
          </div>
        </section>

        <section className="border-t border-border pt-10" aria-labelledby="how-heading">
          <h2 id="how-heading" className="text-sm font-medium text-foreground">
            How an order flows
          </h2>
          <ol className="mt-4 grid gap-6 sm:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.title} className="border-t border-border pt-3 sm:border-t-0 sm:pt-0">
                <div className="flex items-center gap-2">
                  <step.icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <p className="text-xs font-medium text-muted-foreground">
                    Step {index + 1}
                  </p>
                </div>
                <p className="mt-1.5 text-sm font-medium text-foreground">{step.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-12 border-t border-border pt-6">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Scope notes: catalogue stock is indicated only — no inventory is reserved
            or committed by this workflow until the order desk releases stock.
            Simulation orders are clearly labelled demo data and excluded from
            commercial Tally exports.
          </p>
        </section>
      </main>
    </div>
  )
}
