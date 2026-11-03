import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserWithRole } from '@/lib/auth/session'
import { getAllOrders } from '@/lib/order-service'
import { generateTallyCsvData } from '@/lib/tally-export'
import { OrderStatus } from '@/generated/prisma/enums'

export async function GET(req: NextRequest) {
  const user = await getCurrentUserWithRole()
  if (!user || user.role !== 'ORDER_DESK') {
    return new NextResponse('Unauthorized: only ORDER_DESK can export Tally CSV', { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const statusParam = searchParams.get('status')
  const status = Object.values(OrderStatus).includes(statusParam as OrderStatus)
    ? (statusParam as OrderStatus)
    : undefined

  // Critical Safeguard: Always filter isSimulation: false and priceBasisConfirmed: true for commercial Tally export
  const orders = await getAllOrders({
    status,
    isSimulation: false,
  })
  // Ensure unconfirmed or ineligible commercial orders cannot be exported
  const eligibleOrders = orders.filter((o) => !o.isSimulation && o.priceBasisConfirmed)
  const csvData = generateTallyCsvData(eligibleOrders)

  const filename = `tally-orders-${new Date().toISOString().split('T')[0]}.csv`

  return new NextResponse(csvData, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
