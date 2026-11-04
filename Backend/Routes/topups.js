const express = require('express')
const router = express.Router()
const crypto = require('crypto')
const db = require('../Database')
const { log, requestInfo } = require('../Logger')

// Mobile money top-ups through Paychangu "Standard Checkout".
// The secret key lives ONLY in the PAYCHANGU_SECRET_KEY environment
// variable on Render. The browser never sees it.

const PAYCHANGU_URL = 'https://api.paychangu.com'
const MIN_TOPUP = 100
const MAX_TOPUP = 1000000

const paychanguHeaders = () => {
  const key = process.env.PAYCHANGU_SECRET_KEY
  if (!key) throw new Error('PAYCHANGU_SECRET_KEY is not set')
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${key}`
  }
}

// STEP 1: create a pending top-up and ask Paychangu for a payment link
router.post('/start', async (req, res) => {
  const cardId = Number(req.body.card_id)
  const amount = Number(req.body.amount)

  if (!Number.isInteger(cardId)) {
    return res.status(400).json({ error: 'A valid card is required' })
  }
  if (!Number.isInteger(amount) || amount < MIN_TOPUP || amount > MAX_TOPUP) {
    return res.status(400).json({
      error: `Amount must be a whole number between MWK ${MIN_TOPUP} and MWK ${MAX_TOPUP}`
    })
  }

  const frontendUrl = (process.env.FRONTEND_URL || '').replace(/\/+$/, '')
  if (!frontendUrl) {
    return res.status(500).json({ error: 'Server is missing FRONTEND_URL' })
  }

  const cardResult = await db.query(
    'SELECT id, owner_name, status FROM cards WHERE id = $1',
    [cardId]
  )
  if (cardResult.rows.length === 0) {
    return res.status(404).json({ error: 'Card not found' })
  }
  const card = cardResult.rows[0]
  if (card.status === 'blocked') {
    return res.status(409).json({ error: 'This card is blocked' })
  }

  // A unique reference for this payment. Paychangu requires it to be unique.
  const txRef = `TOPUP-${cardId}-${crypto.randomUUID()}`

  await db.query(
    `INSERT INTO topups (tx_ref, card_id, amount, currency, status)
     VALUES ($1, $2, $3, 'MWK', 'pending')`,
    [txRef, cardId, amount]
  )

  try {
    const response = await fetch(`${PAYCHANGU_URL}/payment`, {
      method: 'POST',
      headers: paychanguHeaders(),
      body: JSON.stringify({
        amount,
        currency: 'MWK',
        tx_ref: txRef,
        callback_url: `${frontendUrl}/topup-result`,
        return_url: `${frontendUrl}/topup-result`,
        customization: {
          title: 'Card Top-Up',
          description: 'Prepaid checkout card top-up'
        },
        meta: { card_id: String(cardId) }
      })
    })
    const data = await response.json().catch(() => null)

    if (!response.ok || !data || data.status !== 'success' || !data.data || !data.data.checkout_url) {
      const reason = data && data.message ? JSON.stringify(data.message) : `HTTP ${response.status}`
      throw new Error(`Paychangu refused the request: ${reason}`)
    }

    log('topup_started', `Mobile money top-up of MWK ${amount} started for card #${cardId} (${card.owner_name})`, {
      tx_ref: txRef,
      card_id: cardId,
      owner_name: card.owner_name,
      amount,
      currency: 'MWK',
      provider: 'Paychangu',
      mode: data.data.data ? data.data.data.mode : undefined,
      ...requestInfo(req)
    })

    res.json({ checkout_url: data.data.checkout_url, tx_ref: txRef })
  } catch (error) {
    console.error('Top-up start error:', error.message)
    await db.query(
      `UPDATE topups SET status = 'failed', failure_reason = $2
       WHERE tx_ref = $1 AND status = 'pending'`,
      [txRef, 'Could not create the payment link']
    ).catch(() => {})
    log('topup_failed', `Could not start the top-up for card #${cardId}: ${error.message}`, {
      tx_ref: txRef,
      card_id: cardId,
      amount,
      error: error.message,
      ...requestInfo(req)
    })
    res.status(502).json({ error: 'Could not start the payment. Please try again.' })
  }
})

// STEP 2: the customer comes back from Paychangu. We do NOT trust the
// redirect. We ask Paychangu directly whether the payment succeeded, and
// only then add the money to the card. Safe to call many times: a top-up
// can only ever be credited once.
router.get('/verify/:tx_ref', async (req, res) => {
  const txRef = req.params.tx_ref

  const found = await db.query(
    `SELECT t.*, c.owner_name, c.balance AS card_balance
     FROM topups t JOIN cards c ON c.id = t.card_id
     WHERE t.tx_ref = $1`,
    [txRef]
  )
  if (found.rows.length === 0) {
    return res.status(404).json({ status: 'not_found', message: 'Top-up not found' })
  }
  const topup = found.rows[0]
  const expected = Number(topup.amount)

  if (topup.status === 'completed') {
    return res.json({
      status: 'completed',
      amount: expected,
      owner: topup.owner_name,
      balance: Number(topup.card_balance),
      message: 'Top-up completed'
    })
  }
  if (topup.status === 'failed') {
    return res.json({
      status: 'failed',
      amount: expected,
      message: topup.failure_reason || 'Payment failed'
    })
  }

  // Ask Paychangu what really happened
  let response, data
  try {
    response = await fetch(`${PAYCHANGU_URL}/verify-payment/${encodeURIComponent(txRef)}`, {
      method: 'GET',
      headers: paychanguHeaders()
    })
    data = await response.json().catch(() => null)
  } catch (error) {
    console.error('Top-up verify error:', error.message)
    return res.status(502).json({ status: 'error', message: 'Could not reach Paychangu. Try again.' })
  }

  const pc = data && data.data
  if (!response.ok || !pc) {
    return res.json({
      status: 'pending',
      amount: expected,
      message: 'Payment not confirmed yet'
    })
  }

  const pcStatus = String(pc.status || '').toLowerCase()

  // Failed or cancelled at Paychangu
  if (['failed', 'cancelled', 'canceled'].includes(pcStatus)) {
    await db.query(
      `UPDATE topups SET status = 'failed', failure_reason = $2
       WHERE tx_ref = $1 AND status = 'pending'`,
      [txRef, `Paychangu status: ${pcStatus}`]
    )
    log('topup_failed', `Top-up of MWK ${expected} for card #${topup.card_id} was not paid (${pcStatus})`, {
      tx_ref: txRef,
      card_id: topup.card_id,
      owner_name: topup.owner_name,
      amount: expected,
      paychangu_status: pcStatus,
      ...requestInfo(req)
    })
    return res.json({ status: 'failed', amount: expected, message: 'The payment was not completed' })
  }

  if (pcStatus !== 'success') {
    return res.json({ status: 'pending', amount: expected, message: 'Payment is still being processed' })
  }

  // Paychangu says success. Check it is really OUR payment, in MWK, for
  // at least the amount we expected.
  const matches =
    pc.tx_ref === txRef &&
    pc.currency === 'MWK' &&
    Number(pc.amount) >= expected

  if (!matches) {
    await db.query(
      `UPDATE topups SET status = 'failed', failure_reason = $2
       WHERE tx_ref = $1 AND status = 'pending'`,
      [txRef, 'Verification mismatch']
    )
    log('topup_failed', `Top-up verification mismatch for card #${topup.card_id}`, {
      tx_ref: txRef,
      card_id: topup.card_id,
      expected_amount: expected,
      paid_amount: Number(pc.amount),
      paid_currency: pc.currency,
      returned_tx_ref: pc.tx_ref,
      ...requestInfo(req)
    })
    return res.json({ status: 'failed', amount: expected, message: 'Payment could not be verified' })
  }

  // Credit the card exactly once: flip pending -> completed and add the
  // money in ONE database transaction.
  const client = await db.connect()
  try {
    await client.query('BEGIN')

    const claimed = await client.query(
      `UPDATE topups
       SET status = 'completed', completed_at = NOW(), paychangu_reference = $2
       WHERE tx_ref = $1 AND status = 'pending'
       RETURNING id`,
      [txRef, pc.reference ? String(pc.reference) : null]
    )

    if (claimed.rows.length === 0) {
      // Someone else completed it a moment ago. Nothing more to do.
      await client.query('ROLLBACK')
      const latest = await db.query('SELECT balance FROM cards WHERE id = $1', [topup.card_id])
      return res.json({
        status: 'completed',
        amount: expected,
        owner: topup.owner_name,
        balance: Number(latest.rows[0].balance),
        message: 'Top-up completed'
      })
    }

    const updated = await client.query(
      'UPDATE cards SET balance = balance + $1 WHERE id = $2 RETURNING balance',
      [expected, topup.card_id]
    )
    await client.query('COMMIT')

    const balanceAfter = Number(updated.rows[0].balance)
    const auth = pc.authorization || {}

    log('topup_completed', `Mobile money top-up of MWK ${expected} completed for card #${topup.card_id} (${topup.owner_name})`, {
      tx_ref: txRef,
      paychangu_reference: pc.reference,
      card_id: topup.card_id,
      owner_name: topup.owner_name,
      amount: expected,
      amount_paid: Number(pc.amount),
      charges: pc.charges !== undefined ? Number(pc.charges) : undefined,
      balance_before: Math.round((balanceAfter - expected) * 100) / 100,
      balance_after: balanceAfter,
      channel: auth.channel,
      provider: auth.provider,
      mode: pc.mode,
      ...requestInfo(req)
    })

    res.json({
      status: 'completed',
      amount: expected,
      owner: topup.owner_name,
      balance: balanceAfter,
      message: 'Top-up completed'
    })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('Top-up credit error:', error.message)
    log('server_error', `Top-up credit error for ${txRef}: ${error.message}`, { tx_ref: txRef, error: error.message })
    res.status(500).json({ status: 'error', message: 'Server error while crediting the card' })
  } finally {
    client.release()
  }
})

module.exports = router