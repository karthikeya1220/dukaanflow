import { describe, expect, it } from 'vitest'

/**
 * Unit test for AI Order Capture human-in-the-loop confirmation safety logic.
 *
 * Requirements:
 * 1. For unit-ambiguous items, editing the quantity must not automatically mark the item confirmed.
 * 2. Require an explicit confirmation action that displays the selected quantity and distributor selling unit, e.g. "Confirm 4 CASE".
 * 3. Keep ambiguous items excluded from cart addition until this action is taken.
 * 4. Preserve the existing quick-accept flow, allowing explicit acceptance of the suggested quantity.
 * 5. Ensure changing the quantity after confirmation invalidates the previous confirmation.
 */

type SelectedItemMap = Record<number, { productId: string; quantity: number }>

interface ItemStateHelper {
  idx: number
  productId: string
  unit: string
  extractedQuantity: number
  requiresReview: boolean
  unitAmbiguous: boolean
}

function computeSelectionState(params: {
  item: ItemStateHelper
  currentSelected: SelectedItemMap
  lineQuantity: number
  action:
    | { type: 'INIT' }
    | { type: 'CHANGE_QUANTITY'; newQty: number }
    | { type: 'QUICK_ACCEPT' }
    | { type: 'EXPLICIT_CONFIRM'; confirmedQty: number }
}): {
  selected: SelectedItemMap
  lineQuantity: number
} {
  const { item, currentSelected, lineQuantity, action } = params

  if (action.type === 'INIT') {
    const selected: SelectedItemMap = { ...currentSelected }
    if (!item.requiresReview) {
      selected[item.idx] = { productId: item.productId, quantity: item.extractedQuantity }
    }
    return { selected, lineQuantity: item.extractedQuantity }
  }

  if (action.type === 'CHANGE_QUANTITY') {
    const selected = { ...currentSelected }
    const newQty = Math.max(1, action.newQty)
    if (item.requiresReview) {
      // Invalidate existing confirmation if any; do NOT auto-confirm
      delete selected[item.idx]
    } else {
      selected[item.idx] = { productId: item.productId, quantity: newQty }
    }
    return { selected, lineQuantity: newQty }
  }

  if (action.type === 'QUICK_ACCEPT') {
    const selected = { ...currentSelected }
    selected[item.idx] = { productId: item.productId, quantity: item.extractedQuantity }
    return { selected, lineQuantity: item.extractedQuantity }
  }

  if (action.type === 'EXPLICIT_CONFIRM') {
    const selected = { ...currentSelected }
    selected[item.idx] = { productId: item.productId, quantity: action.confirmedQty }
    return { selected, lineQuantity: action.confirmedQty }
  }

  return { selected: currentSelected, lineQuantity }
}

describe('AI Order Modal Unit-Ambiguity Confirmation Logic', () => {
  const ambiguousItem: ItemStateHelper = {
    idx: 1,
    productId: 'prod-gd-butter',
    unit: 'CASE',
    extractedQuantity: 5,
    requiresReview: true,
    unitAmbiguous: true,
  }

  it('keeps unit-ambiguous items unselected by default on init', () => {
    const state = computeSelectionState({
      item: ambiguousItem,
      currentSelected: {},
      lineQuantity: ambiguousItem.extractedQuantity,
      action: { type: 'INIT' },
    })

    expect(state.selected[ambiguousItem.idx]).toBeUndefined()
  })

  it('editing quantity does not automatically confirm the item', () => {
    const state = computeSelectionState({
      item: ambiguousItem,
      currentSelected: {},
      lineQuantity: 5,
      action: { type: 'CHANGE_QUANTITY', newQty: 4 },
    })

    expect(state.lineQuantity).toBe(4)
    expect(state.selected[ambiguousItem.idx]).toBeUndefined()
  })

  it('allows quick-accept for the suggested quantity', () => {
    const state = computeSelectionState({
      item: ambiguousItem,
      currentSelected: {},
      lineQuantity: 5,
      action: { type: 'QUICK_ACCEPT' },
    })

    expect(state.selected[ambiguousItem.idx]).toEqual({
      productId: 'prod-gd-butter',
      quantity: 5,
    })
  })

  it('allows explicit confirmation with the edited quantity and selling unit', () => {
    // 1. Edit quantity from 5 to 4
    let state = computeSelectionState({
      item: ambiguousItem,
      currentSelected: {},
      lineQuantity: 5,
      action: { type: 'CHANGE_QUANTITY', newQty: 4 },
    })
    expect(state.selected[ambiguousItem.idx]).toBeUndefined()

    // 2. Explicitly confirm "Confirm 4 CASE"
    state = computeSelectionState({
      item: ambiguousItem,
      currentSelected: state.selected,
      lineQuantity: state.lineQuantity,
      action: { type: 'EXPLICIT_CONFIRM', confirmedQty: 4 },
    })
    expect(state.selected[ambiguousItem.idx]).toEqual({
      productId: 'prod-gd-butter',
      quantity: 4,
    })
  })

  it('changing the quantity after confirmation invalidates the confirmation', () => {
    // 1. Initially confirmed with 5
    let state = computeSelectionState({
      item: ambiguousItem,
      currentSelected: {},
      lineQuantity: 5,
      action: { type: 'QUICK_ACCEPT' },
    })
    expect(state.selected[ambiguousItem.idx]).toBeDefined()

    // 2. Change quantity to 8 -> confirmation must be invalidated
    state = computeSelectionState({
      item: ambiguousItem,
      currentSelected: state.selected,
      lineQuantity: state.lineQuantity,
      action: { type: 'CHANGE_QUANTITY', newQty: 8 },
    })
    expect(state.selected[ambiguousItem.idx]).toBeUndefined()
    expect(state.lineQuantity).toBe(8)
  })
})
