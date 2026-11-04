const express = require('express')
const router = express.Router()
const db = require('../Database')
const { log, requestInfo } = require('../Logger')

// Transactions are financial records: they can be created and read,
// but never edited or deleted. Mistakes are fixed with a void/refund.

// CREATE a transaction = pay with a card.
// The SERVER works out the total from its own prices and decides
// whether the payment is approved or declined.
router.post('/', async (req, res) => {
  const { card_id, items } = req.body

  if (!card_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      approved: false,
      reason: 'bad_request',
      message: 'card_id and items are required'
    })
  }

  for (const i of items) {
    if (!i.barcode || !Number.isInteger(i.quantity) || i.quantity < 1) {
      return res.status(400).json({
        approved: false,
        reason: 'bad_request',
        message: 'Each item needs a barcode and a whole-number quantity'
      })
    }
  }

  // 1. Look up the real prices in the database (never trust the browser)
  const barcodes = items.map(i => i.barcode)
  const productResult = await db.query(
    'SELECT barcode, name, price FROM products WHERE barcode = ANY($1)',
    [barcodes]
  )
  const productMap = {}
  productResult.rows.forEach(p => { productMap[p.barcode] = p })

  const lines = []
  let total = 0
  for (const i of items) {
    const product = productMap[i.barcode]
    if (!product) {
      return res.status(404).json({
        approved: false,
        reason: 'product_not_found',
        message: `Product ${i.barcode} was not found`
      })
    }
    lines.push({ barcode: i.barcode, name: product.name, price: product.price, quantity: i.quantity })
    total += product.price * i.quantity
  }
  total = Math.round(total * 100) / 100

  // 2. Check the card and stock, and take the money/stock in ONE safe step
  const client = await db.connect()
  try {
    await client.query('BEGIN')

    // FOR UPDATE locks this card's row, so two payments at the same
    // moment cannot spend the same money twice
    const cardResult = await client.query(
      'SELECT id, owner_name, balance, status FROM cards WHERE id = $1 FOR UPDATE',
      [card_id]
    )

    if (cardResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({
        approved: false,
        reason: 'card_not_found',
        message: 'Card not found'
      })
    }

    const card = cardResult.rows[0]
    const balance = Number(card.balance)

    const reasonText = {
      card_blocked: 'card is blocked',
      insufficient_funds: 'insufficient funds',
      insufficient_stock: 'not enough stock'
    }

    // Declined: save a record of the attempt, then tell the kiosk why
    const decline = async (httpStatus, reason, message, extra = {}) => {
      await client.query(
        `INSERT INTO transactions (card_id, total_amount, items_json, status, decline_reason)
         VALUES ($1, $2, $3, 'declined', $4)`,
        [card_id, total, JSON.stringify(lines), reason]
      )
      await client.query('COMMIT')
      log('payment_declined', `Sale declined for ${card.owner_name} (card #${card_id}): ${reasonText[reason] || reason}, total MWK ${total}`, {
        card_id,
        owner_name: card.owner_name,
        reason,
        reason_detail: message,
        total,
        card_balance: balance,
        shortfall: reason === 'insufficient_funds' ? Math.round((total - balance) * 100) / 100 : undefined,
        items: lines,
        ...extra,
        ...requestInfo(req)
      })
      return res.status(httpStatus).json({
        approved: false,
        reason,
        message,
        balance,
        total,
        ...extra
      })
    }

    if (card.status === 'blocked') {
      return await decline(403, 'card_blocked', 'This card is blocked')
    }

    if (balance < total) {
      return await decline(402, 'insufficient_funds', 'Insufficient balance')
    }

    // Take stock for each item ONE AT A TIME. The WHERE clause only succeeds
    // if there's enough stock left, so this can't be tricked by two sales
    // happening at the same moment (Postgres locks the row during the update).
    const stockAlerts = []
    for (const line of lines) {
      const stockUpdate = await client.query(
        `UPDATE products SET stock = stock - $1
         WHERE barcode = $2 AND stock >= $1
         RETURNING stock, reorder_level`,
        [line.quantity, line.barcode]
      )

      if (stockUpdate.rows.length === 0) {
        // Undo any stock already taken for earlier items in this basket,
        // then record the decline in a fresh step
        await client.query('ROLLBACK')
        await client.query('BEGIN')
        return await decline(
          409,
          'insufficient_stock',
          `Not enough stock for ${line.name}`,
          { out_of_stock_item: line.name }
        )
      }

      const left = Number(stockUpdate.rows[0].stock)
      const reorderAt = Number(stockUpdate.rows[0].reorder_level)
      if (left <= reorderAt) {
        stockAlerts.push({ name: line.name, barcode: line.barcode, stock_left: left, reorder_level: reorderAt })
      }
    }

    // Approved: take the money and record the sale
    const updated = await client.query(
      'UPDATE cards SET balance = balance - $1 WHERE id = $2 RETURNING balance',
      [total, card_id]
    )

    const inserted = await client.query(
      `INSERT INTO transactions (card_id, total_amount, items_json, status)
       VALUES ($1, $2, $3, 'approved') RETURNING *`,
      [card_id, total, JSON.stringify(lines)]
    )

    await client.query('COMMIT')

    const receipt = `RCP-${String(inserted.rows[0].id).padStart(6, '0')}`
    const balanceAfter = Number(updated.rows[0].balance)
    const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0)

    log('payment_approved', `Sale approved for ${card.owner_name} (card #${card_id}): ${receipt}, ${itemCount} item${itemCount === 1 ? '' : 's'}, MWK ${total}`, {
      transaction_id: inserted.rows[0].id,
      receipt,
      card_id,
      owner_name: card.owner_name,
      items: lines,
      item_count: itemCount,
      total,
      balance_before: balance,
      balance_after: balanceAfter,
      ...requestInfo(req)
    })

    stockAlerts.forEach(a => {
      log('stock_alert', `${a.name} is ${a.stock_left === 0 ? 'out of stock' : `down to ${a.stock_left}`} (reorder level ${a.reorder_level})`, {
        ...a,
        triggered_by: receipt
      })
    })

    res.status(201).json({
      approved: true,
      message: 'Transaction approved',
      transaction_id: inserted.rows[0].id,
      owner: card.owner_name,
      total_amount: total,
      balance_after: Number(updated.rows[0].balance),
      items: lines,
      created_at: inserted.rows[0].created_at,
      status: 'approved'
    })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('Payment error:', error.message)
    log('server_error', `Payment error for card #${card_id}: ${error.message}`, {
      card_id,
      error: error.message,
      items,
      ...requestInfo(req)
    })
    res.status(500).json({
      approved: false,
      reason: 'server_error',
      message: 'Server error. Please try again.'
    })
  } finally {
    client.release()
  }
})

// READ all transactions
router.get('/', async (req, res) => {
  const result = await db.query(`
    SELECT 
      transactions.id,
      transactions.total_amount,
      transactions.items_json,
      transactions.status,
      transactions.decline_reason,
      transactions.created_at,
      cards.owner_name
    FROM transactions
    JOIN cards ON transactions.card_id = cards.id
    ORDER BY transactions.created_at DESC
  `)

  const parsed = result.rows.map(t => ({
    ...t,
    items: JSON.parse(t.items_json)
  }))

  res.json(parsed)
})

// READ one transaction
router.get('/:id', async (req, res) => {
  const result = await db.query(`
    SELECT 
      transactions.id,
      transactions.total_amount,
      transactions.items_json,
      transactions.status,
      transactions.decline_reason,
      transactions.created_at,
      cards.owner_name
    FROM transactions
    JOIN cards ON transactions.card_id = cards.id
    WHERE transactions.id = $1
  `, [req.params.id])

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Transaction not found' })
  }

  res.json({
    ...result.rows[0],
    items: JSON.parse(result.rows[0].items_json)
  })
})

module.exports = router