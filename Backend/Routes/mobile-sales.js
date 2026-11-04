const express = require('express')
const router = express.Router()
const crypto = require('crypto')
const db = require('../Database')
const { log, requestInfo } = require('../Logger')

// Pay for a whole basket with mobile money (Airtel Money / TNM Mpamba)
// through Paychangu Standard Checkout, with no card involved.
// The secret key lives ONLY in PAYCHANGU_SECRET_KEY on Render.

const PAYCHANGU_URL = 'https://api.paychangu.com'

const paychanguHeaders = () => {
  const key = process.env.PAYCHANGU_SECRET_KEY
  if (!key) throw new Error('PAYCHANGU_SECRET_KEY is not set')
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`
  }
}

const REFUND_MESSAGE =
  'Payment was received but an item ran out of stock. Please see the attendant for a refund.'

// STEP 1: the kiosk sends the basket. The SERVER works out the total from
// its own prices, saves a pending sale and asks Paychangu for a payment link.
router.post('/start', async (req, res) => {
  const { items } = req.body

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'items are required' })
  }
  for (const i of items) {
    if (!i.barcode || !Number.isInteger(i.quantity) || i.quantity < 1) {
      return res.status(400).json({ message: 'Each item needs a barcode and a whole-number quantity' })
    }
  }

  const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/+$/, '')
  if (!frontendUrl) {
    return res.status(500).json({ message: 'Server is missing FRONTEND_URL' })
  }

  try {
    const barcodes = items.map(i => i.barcode)
    const productResult = await db.query(
      'SELECT barcode, name, price, stock FROM products WHERE barcode = ANY($1)',
      [barcodes]
    )
    const productMap = {}
    productResult.rows.forEach(p => { productMap[p.barcode] = p })

    const lines = []
    let total = 0
    for (const i of items) {
      const product = productMap[i.barcode]
      if (!product) {
        return res.status(404).json({ message: `Product ${i.barcode} was not found` })
      }
      if (Number(product.stock) < i.quantity) {
        return res.status(409).json({
          reason: 'insufficient_stock',
          message: `Not enough stock for ${product.name} (${product.stock} left)`
        })
      }
      lines.push({ barcode: i.barcode, name: product.name, price: product.price, quantity: i.quantity })
      total += product.price * i.quantity
    }
    total = Math.round(total * 100) / 100

    // Paychangu takes whole Kwacha amounts only
    if (!Number.isInteger(total) || total < 1) {
      return res.status(400).json({
        message: 'The cart total must be a whole number of Kwacha to pay with mobile money'
      })
    }

    const txRef = `SALE-${crypto.randomUUID()}`
    const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0)

    await db.query(
      `INSERT INTO mobile_sales (tx_ref, total, items_json, status)
       VALUES ($1, $2, $3, 'pending')`,
      [txRef, total, JSON.stringify(lines)]
    )

    try {
      const response = await fetch(`${PAYCHANGU_URL}/payment`, {
        method: 'POST',
        headers: paychanguHeaders(),
        body: JSON.stringify({
          amount: total,
          currency: 'MWK',
          tx_ref: txRef,
          callback_url: `${frontendUrl}/sale-result`,
          return_url: `${frontendUrl}/sale-result`,
          customization: {
            title: 'Self Checkout Payment',
            description: `${itemCount} item${itemCount === 1 ? '' : 's'} at Demo Store`
          },
          meta: { type: 'self_checkout' }
        })
      })
      const data = await response.json().catch(() => null)

      if (!response.ok || !data || data.status !== 'success' || !data.data || !data.data.checkout_url) {
        const reason = data && data.message ? JSON.stringify(data.message) : `HTTP ${response.status}`
        throw new Error(`Paychangu refused the request: ${reason}`)
      }

      log('payment_momo_started', `Mobile money payment of MWK ${total} started for ${itemCount} item${itemCount === 1 ? '' : 's'}`, {
        tx_ref: txRef,
        items: lines,
        item_count: itemCount,
        total,
        currency: 'MWK',
        provider: 'Paychangu',
        mode: data.data.data ? data.data.data.mode : undefined,
        ...requestInfo(req)
      })

      res.json({ tx_ref: txRef, checkout_url: data.data.checkout_url, total })
    } catch (error) {
      console.error('Mobile sale start error:', error.message)
      await db.query(
        `UPDATE mobile_sales SET status = 'failed', failure_reason = $2
         WHERE tx_ref = $1 AND status = 'pending'`,
        [txRef, 'Could not create the payment link']
      ).catch(() => {})
      log('payment_momo_failed', `Could not start the mobile money payment: ${error.message}`, {
        tx_ref: txRef,
        total,
        error: error.message,
        ...requestInfo(req)
      })
      res.status(502).json({ message: 'Could not start the mobile money payment. Please try again.' })
    }
  } catch (error) {
    console.error('Mobile sale error:', error.message)
    res.status(500).json({ message: 'Server error. Please try again.' })
  }
})

// Works out the current state of a sale. This is the ONLY place a mobile
// sale is completed, and it never trusts the browser: it asks Paychangu
// directly. Safe to call many times (kiosk polling, phone redirect page,
// cancel): a sale can only be completed once.
async function settle(txRef, req) {
  const found = await db.query('SELECT * FROM mobile_sales WHERE tx_ref = $1', [txRef])
  if (found.rows.length === 0) {
    return { code: 404, body: { status: 'not_found', message: 'Sale not found' } }
  }
  const sale = found.rows[0]
  const expected = Number(sale.total)
  const lines = JSON.parse(sale.items_json)

  if (sale.status === 'completed') {
    const t = await db.query(
      'SELECT id, total_amount, items_json, created_at FROM transactions WHERE id = $1',
      [sale.transaction_id]
    )
    return {
      code: 200,
      body: {
        status: 'completed',
        sale: {
          transaction_id: t.rows[0].id,
          total_amount: Number(t.rows[0].total_amount),
          items: JSON.parse(t.rows[0].items_json),
          created_at: t.rows[0].created_at,
          payment_method: 'mobile_money',
          status: 'approved'
        }
      }
    }
  }
  if (sale.status === 'needs_refund') {
    return { code: 200, body: { status: 'failed', message: REFUND_MESSAGE } }
  }
  if (sale.status === 'failed') {
    return { code: 200, body: { status: 'failed', message: sale.failure_reason || 'Payment failed' } }
  }

  // pending or cancelled: ask Paychangu what really happened
  let response, data
  try {
    response = await fetch(`${PAYCHANGU_URL}/verify-payment/${encodeURIComponent(txRef)}`, {
      method: 'GET',
      headers: paychanguHeaders()
    })
    data = await response.json().catch(() => null)
  } catch (error) {
    console.error('Mobile sale verify error:', error.message)
    return { code: 502, body: { status: 'error', message: 'Could not reach Paychangu' } }
  }

  const pc = data && data.data
  if (!response.ok || !pc) {
    return { code: 200, body: { status: 'pending', message: 'Waiting for payment' } }
  }
  const pcStatus = String(pc.status || '').toLowerCase()

  if (['failed', 'cancelled', 'canceled'].includes(pcStatus)) {
    if (sale.status === 'pending') {
      await db.query(
        `UPDATE mobile_sales SET status = 'failed', failure_reason = $2
         WHERE tx_ref = $1 AND status = 'pending'`,
        [txRef, `Paychangu status: ${pcStatus}`]
      )
      log('payment_momo_failed', `Mobile money payment of MWK ${expected} was not completed (${pcStatus})`, {
        tx_ref: txRef, total: expected, paychangu_status: pcStatus, ...requestInfo(req)
      })
    }
    return { code: 200, body: { status: 'failed', message: 'The payment was not completed' } }
  }

  if (pcStatus !== 'success') {
    return { code: 200, body: { status: 'pending', message: 'Waiting for payment' } }
  }

  // Paychangu says success. Is it really OUR payment, in MWK, for the
  // right amount?
  const matches = pc.tx_ref === txRef && pc.currency === 'MWK' && Number(pc.amount) >= expected
  if (!matches) {
    await db.query(
      `UPDATE mobile_sales SET status = 'failed', failure_reason = 'Verification mismatch'
       WHERE tx_ref = $1 AND status = 'pending'`,
      [txRef]
    )
    log('payment_momo_failed', 'Mobile money verification mismatch', {
      tx_ref: txRef,
      expected_amount: expected,
      paid_amount: Number(pc.amount),
      paid_currency: pc.currency,
      returned_tx_ref: pc.tx_ref,
      ...requestInfo(req)
    })
    return { code: 200, body: { status: 'failed', message: 'Payment could not be verified' } }
  }

  // Paid, but the kiosk already cancelled this sale: the customer must be refunded
  if (sale.status === 'cancelled') {
    await db.query(
      `UPDATE mobile_sales SET status = 'needs_refund', paychangu_reference = $2
       WHERE tx_ref = $1 AND status = 'cancelled'`,
      [txRef, pc.reference ? String(pc.reference) : null]
    )
    log('payment_refund_needed', `Payment of MWK ${expected} arrived AFTER the sale was cancelled. Refund needed.`, {
      tx_ref: txRef, paychangu_reference: pc.reference, total: expected, ...requestInfo(req)
    })
    return { code: 200, body: { status: 'failed', message: REFUND_MESSAGE } }
  }

  // Complete the sale in ONE database transaction: claim it, take the
  // stock, save the transaction record.
  const client = await db.connect()
  try {
    await client.query('BEGIN')

    const claimed = await client.query(
      `UPDATE mobile_sales
       SET status = 'completed', completed_at = NOW(), paychangu_reference = $2
       WHERE tx_ref = $1 AND status = 'pending'
       RETURNING id`,
      [txRef, pc.reference ? String(pc.reference) : null]
    )
    if (claimed.rows.length === 0) {
      // Someone else completed it a moment ago
      await client.query('ROLLBACK')
      return await settle(txRef, req)
    }

    const stockAlerts = []
    for (const line of lines) {
      const upd = await client.query(
        `UPDATE products SET stock = stock - $1
         WHERE barcode = $2 AND stock >= $1
         RETURNING stock, reorder_level`,
        [line.quantity, line.barcode]
      )
      if (upd.rows.length === 0) {
        // Paid, but an item sold out in the meantime: undo everything and
        // flag the sale so the customer can be refunded.
        await client.query('ROLLBACK')
        await db.query(
          `UPDATE mobile_sales
           SET status = 'needs_refund', failure_reason = $2, paychangu_reference = $3
           WHERE tx_ref = $1 AND status = 'pending'`,
          [txRef, `Out of stock after payment: ${line.name}`, pc.reference ? String(pc.reference) : null]
        )
        log('payment_refund_needed', `Payment of MWK ${expected} received but ${line.name} was out of stock. Refund needed.`, {
          tx_ref: txRef,
          paychangu_reference: pc.reference,
          total: expected,
          out_of_stock_item: line.name,
          items: lines,
          ...requestInfo(req)
        })
        return { code: 200, body: { status: 'failed', message: REFUND_MESSAGE } }
      }
      const left = Number(upd.rows[0].stock)
      const reorderAt = Number(upd.rows[0].reorder_level)
      if (left <= reorderAt) {
        stockAlerts.push({ name: line.name, barcode: line.barcode, stock_left: left, reorder_level: reorderAt })
      }
    }

    const inserted = await client.query(
      `INSERT INTO transactions (card_id, total_amount, items_json, status, payment_method, payment_ref)
       VALUES (NULL, $1, $2, 'approved', 'mobile_money', $3)
       RETURNING id, created_at`,
      [expected, JSON.stringify(lines), txRef]
    )
    await client.query(
      'UPDATE mobile_sales SET transaction_id = $1 WHERE tx_ref = $2',
      [inserted.rows[0].id, txRef]
    )
    await client.query('COMMIT')

    const receipt = `RCP-${String(inserted.rows[0].id).padStart(6, '0')}`
    const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0)
    const auth = pc.authorization || {}

    log('payment_approved', `Sale approved by mobile money: ${receipt}, ${itemCount} item${itemCount === 1 ? '' : 's'}, MWK ${expected}`, {
      transaction_id: inserted.rows[0].id,
      receipt,
      payment_method: 'Mobile money (Paychangu)',
      tx_ref: txRef,
      paychangu_reference: pc.reference,
      items: lines,
      item_count: itemCount,
      total: expected,
      amount_paid: Number(pc.amount),
      charges: pc.charges !== undefined ? Number(pc.charges) : undefined,
      channel: auth.channel,
      provider: auth.provider,
      mode: pc.mode,
      ...requestInfo(req)
    })
    stockAlerts.forEach(a => {
      log('stock_alert', `${a.name} is ${a.stock_left === 0 ? 'out of stock' : `down to ${a.stock_left}`} (reorder level ${a.reorder_level})`, {
        ...a,
        triggered_by: receipt
      })
    })

    return {
      code: 200,
      body: {
        status: 'completed',
        sale: {
          transaction_id: inserted.rows[0].id,
          total_amount: expected,
          items: lines,
          created_at: inserted.rows[0].created_at,
          payment_method: 'mobile_money',
          status: 'approved'
        }
      }
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('Mobile sale completion error:', error.message)
    log('server_error', `Mobile sale completion error for ${txRef}: ${error.message}`, {
      tx_ref: txRef, error: error.message
    })
    return { code: 500, body: { status: 'error', message: 'Server error while completing the sale' } }
  } finally {
    client.release()
  }
}

// STEP 2: the kiosk (and the customer's phone) ask whether the sale is paid
router.get('/verify/:tx_ref', async (req, res) => {
  try {
    const result = await settle(req.params.tx_ref, req)
    res.status(result.code).json(result.body)
  } catch (error) {
    console.error('Mobile sale verify route error:', error.message)
    res.status(500).json({ status: 'error', message: 'Server error' })
  }
})

// The customer walked away. First double-check Paychangu, so a payment
// that just went through is never lost; otherwise mark the sale cancelled.
router.post('/cancel/:tx_ref', async (req, res) => {
  const txRef = req.params.tx_ref
  try {
    const result = await settle(txRef, req)
    if (result.body.status === 'pending') {
      await db.query(
        `UPDATE mobile_sales SET status = 'cancelled'
         WHERE tx_ref = $1 AND status = 'pending'`,
        [txRef]
      )
      log('payment_momo_failed', 'Mobile money payment cancelled at the kiosk', {
        tx_ref: txRef, reason: 'cancelled_by_customer', ...requestInfo(req)
      })
      return res.json({ status: 'cancelled' })
    }
    res.status(result.code).json(result.body)
  } catch (error) {
    console.error('Mobile sale cancel error:', error.message)
    res.status(500).json({ status: 'error', message: 'Server error' })
  }
})

module.exports = router