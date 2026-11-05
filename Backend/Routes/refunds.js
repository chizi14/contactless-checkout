const express = require('express')
const router = express.Router()
const db = require('../Database')
const { log, requestInfo } = require('../Logger')

// Refunds. The original sale is NEVER edited or deleted: a refund is a new
// record that points at it. A sale can be refunded only once (full refund).

// Issue a full refund for an approved sale
router.post('/', async (req, res) => {
  const transactionId = Number(req.body.transaction_id)
  const reason = String(req.body.reason || '').trim()
  const restock = req.body.restock !== false

  if (!Number.isInteger(transactionId)) {
    return res.status(400).json({ error: 'A valid transaction is required' })
  }
  if (!reason) {
    return res.status(400).json({ error: 'A reason is required' })
  }

  const client = await db.connect()
  try {
    await client.query('BEGIN')

    // Lock the sale so two refunds can't run at the same moment
    const found = await client.query(
      `SELECT t.*, c.owner_name
       FROM transactions t LEFT JOIN cards c ON c.id = t.card_id
       WHERE t.id = $1 FOR UPDATE OF t`,
      [transactionId]
    )
    if (found.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Transaction not found' })
    }
    const sale = found.rows[0]

    if (sale.status !== 'approved') {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Only approved sales can be refunded' })
    }

    const already = await client.query('SELECT id FROM refunds WHERE transaction_id = $1', [transactionId])
    if (already.rows.length > 0) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'This sale has already been refunded' })
    }

    const amount = Number(sale.total_amount)
    const items = JSON.parse(sale.items_json || '[]')
    const isCard = sale.payment_method === 'card' && sale.card_id

    // Put the items back on the shelf (admin's choice)
    let restockedLines = 0
    if (restock) {
      for (const line of items) {
        const r = await client.query(
          'UPDATE products SET stock = stock + $1 WHERE barcode = $2',
          [line.quantity, line.barcode]
        )
        restockedLines += r.rowCount
      }
    }

    // Card sales: give the money back to the card balance
    let balanceBefore, balanceAfter
    if (isCard) {
      const updated = await client.query(
        'UPDATE cards SET balance = balance + $1 WHERE id = $2 RETURNING balance',
        [amount, sale.card_id]
      )
      balanceAfter = Number(updated.rows[0].balance)
      balanceBefore = Math.round((balanceAfter - amount) * 100) / 100
    }

    const method = isCard ? 'card_balance' : 'mobile_money_manual'
    await client.query(
      `INSERT INTO refunds (transaction_id, amount, reason, restocked, refund_method)
       VALUES ($1, $2, $3, $4, $5)`,
      [transactionId, amount, reason, restock, method]
    )
    await client.query('COMMIT')

    const receipt = `RCP-${String(transactionId).padStart(6, '0')}`
    const who = sale.owner_name || 'Mobile Money customer'
    log('refund_issued', `Refund of MWK ${amount} issued for ${receipt} (${who}). Reason: ${reason}`, {
      transaction_id: transactionId,
      receipt,
      owner_name: who,
      amount,
      reason,
      refund_method: isCard ? 'Returned to card balance' : 'Mobile money: must be paid back manually',
      items_returned_to_stock: restock ? restockedLines : 0,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      ...requestInfo(req)
    })

    res.status(201).json({
      message: isCard
        ? 'Refund issued and added back to the card balance'
        : 'Refund recorded. Pay the customer back manually (mobile money)',
      refund_method: method,
      amount
    })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('Refund error:', error.message)
    res.status(500).json({ error: 'Failed to issue the refund' })
  } finally {
    client.release()
  }
})

// Mobile money sales that were PAID but could not be completed
// (an item sold out in the meantime), so the customer is owed money back
router.get('/pending-mobile', async (req, res) => {
  const result = await db.query(
    `SELECT tx_ref, total, failure_reason, created_at
     FROM mobile_sales WHERE status = 'needs_refund'
     ORDER BY created_at DESC`
  )
  res.json(result.rows)
})

// Mark one of those as paid back to the customer
router.post('/mobile-sales/:tx_ref/resolve', async (req, res) => {
  const note = String(req.body.note || '').trim()
  if (!note) {
    return res.status(400).json({ error: 'A note is required (how was the customer paid back?)' })
  }

  const result = await db.query(
    `UPDATE mobile_sales
     SET status = 'refunded', failure_reason = COALESCE(failure_reason, '') || ' | Refunded: ' || $2
     WHERE tx_ref = $1 AND status = 'needs_refund'
     RETURNING tx_ref, total`,
    [req.params.tx_ref, note]
  )
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'No refund is pending for this payment' })
  }

  log('refund_issued', `Customer paid back MWK ${Number(result.rows[0].total)} for an unfulfilled mobile money payment. ${note}`, {
    tx_ref: result.rows[0].tx_ref,
    amount: Number(result.rows[0].total),
    refund_method: 'Mobile money: paid back manually',
    note,
    ...requestInfo(req)
  })
  res.json({ message: 'Marked as refunded' })
})

module.exports = router