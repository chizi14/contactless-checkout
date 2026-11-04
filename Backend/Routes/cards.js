const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const db = require('../Database')
const crypto = require('crypto')
const { log, requestInfo } = require('../Logger')

// Fast, one-way fingerprint of a card UID. The secret lives ONLY in the
// UID_SECRET environment variable on Render, never in the code.
const hashUid = (uid) => {
  const secret = process.env.UID_SECRET
  if (!secret) throw new Error('UID_SECRET is not set')
  return crypto.createHmac('sha256', secret).update(String(uid).trim().toUpperCase()).digest('hex')
}

let lastVerifiedCard = null

// CREATE (register) a card
router.post('/register', async (req, res) => {
  const { uid, owner_name } = req.body

  if (!uid || !owner_name) {
    return res.status(400).json({ error: 'UID and owner name are required' })
  }

  try {
    const uid_hash = hashUid(uid)
    const result = await db.query(
      'INSERT INTO cards (uid_hash, owner_name) VALUES ($1, $2) RETURNING *',
      [uid_hash, owner_name]
    )
    log('card_register', `Registered new card for ${owner_name} (card #${result.rows[0].id})`, {
      card_id: result.rows[0].id,
      owner_name,
      ...requestInfo(req)
    })
    res.status(201).json({
      message: 'Card registered successfully',
      card_id: result.rows[0].id,
      owner: owner_name
    })
  } catch (error) {
    res.status(409).json({ error: 'Card already registered' })
  }
})

// Used by the ESP32 when a card is tapped
router.post('/verify', async (req, res) => {
  const { uid } = req.body

  if (!uid) {
    return res.status(400).json({ error: 'UID is required' })
  }

  try {
    const hmac = hashUid(uid)

    // Fast path: one indexed lookup (uid_hash is UNIQUE)
    const found = await db.query('SELECT * FROM cards WHERE uid_hash = $1', [hmac])
    let matchedCard = found.rows[0]
    let upgraded = false

    // Old cards still have a slow bcrypt hash. Check only those, and
    // upgrade a match to the fast hash so it is slow at most once.
    if (!matchedCard) {
      const legacy = await db.query("SELECT * FROM cards WHERE uid_hash LIKE '$2%'")
      matchedCard = legacy.rows.find(card => bcrypt.compareSync(uid, card.uid_hash))
      if (matchedCard) {
        upgraded = true
        await db.query('UPDATE cards SET uid_hash = $1 WHERE id = $2', [hmac, matchedCard.id])
      }
    }

    if (!matchedCard) {
      log('tap_denied', 'Tap denied: card is not registered in the system', {
        reason: 'card_not_recognised',
        ...requestInfo(req)
      })
      lastVerifiedCard = {
        verified: false,
        message: 'Card not recognised',
        timestamp: Date.now()
      }
      return res.status(404).json({
        verified: false,
        message: 'Card not recognised'
      })
    }

    if (matchedCard.status === 'blocked') {
      log('tap_denied', `Tap denied: card #${matchedCard.id} (${matchedCard.owner_name}) is blocked`, {
        card_id: matchedCard.id,
        owner_name: matchedCard.owner_name,
        reason: 'card_blocked',
        ...requestInfo(req)
      })
      lastVerifiedCard = {
        verified: false,
        message: 'This card is blocked',
        timestamp: Date.now()
      }
      return res.status(403).json({
        verified: false,
        message: 'Card is blocked'
      })
    }

    log('tap_success', `Card #${matchedCard.id} (${matchedCard.owner_name}) tapped and verified`, {
      card_id: matchedCard.id,
      owner_name: matchedCard.owner_name,
      balance: Number(matchedCard.balance),
      security_upgrade: upgraded ? 'card fingerprint upgraded to the fast format' : undefined,
      ...requestInfo(req)
    })
    lastVerifiedCard = {
      verified: true,
      card_id: matchedCard.id,
      owner: matchedCard.owner_name,
      timestamp: Date.now()
    }

    res.json({
      verified: true,
      card_id: matchedCard.id,
      owner: matchedCard.owner_name
    })
  } catch (error) {
    console.error('Verify error:', error.message)
    res.status(500).json({ verified: false, message: 'Server error' })
  }
})

router.get('/latest-tap', (req, res) => {
  if (!lastVerifiedCard) {
    return res.status(404).json({ error: 'No tap yet' })
  }

  const tap = lastVerifiedCard
  lastVerifiedCard = null

  // Ignore taps older than 15 seconds so an old tap can never pay for a new cart
  if (Date.now() - tap.timestamp > 15000) {
    return res.status(404).json({ error: 'Tap expired' })
  }

  // "since" is the moment THIS customer's checkout started (sent by the kiosk).
  // A tap from before that moment belongs to a previous customer, not this one.
  const since = Number(req.query.since)
  if (since && tap.timestamp < since) {
    return res.status(404).json({ error: 'Tap belongs to a previous session' })
  }

  res.json(tap)
})

// READ all cards
router.get('/', async (req, res) => {
  const result = await db.query(
    'SELECT id, owner_name, balance, status, registered_at FROM cards ORDER BY id'
  )
  res.json(result.rows)
})

// READ one card
router.get('/:id', async (req, res) => {
  const result = await db.query(
    'SELECT id, owner_name, balance, status, registered_at FROM cards WHERE id = $1',
    [req.params.id]
  )
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Card not found' })
  }
  res.json(result.rows[0])
})

// UPDATE the owner name
router.put('/:id', async (req, res) => {
  const { owner_name } = req.body

  if (!owner_name || !owner_name.trim()) {
    return res.status(400).json({ error: 'Owner name is required' })
  }

  const before = await db.query('SELECT owner_name FROM cards WHERE id = $1', [req.params.id])
  const result = await db.query(
    'UPDATE cards SET owner_name = $1 WHERE id = $2 RETURNING id, owner_name, balance, status',
    [owner_name.trim(), req.params.id]
  )

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Card not found' })
  }

  const oldName = before.rows[0]?.owner_name
  log('card_update', `Card #${req.params.id} renamed from "${oldName}" to "${owner_name.trim()}"`, {
    card_id: req.params.id,
    old_name: oldName,
    new_name: owner_name.trim(),
    ...requestInfo(req)
  })
  res.json({ message: 'Card updated successfully', card: result.rows[0] })
})

// UPDATE the status: block or unblock a card
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body

  if (status !== 'active' && status !== 'blocked') {
    return res.status(400).json({ error: "Status must be 'active' or 'blocked'" })
  }

  const before = await db.query('SELECT status FROM cards WHERE id = $1', [req.params.id])
  const result = await db.query(
    'UPDATE cards SET status = $1 WHERE id = $2 RETURNING id, owner_name, balance, status',
    [status, req.params.id]
  )

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Card not found' })
  }

  log('card_status', `Card #${req.params.id} (${result.rows[0].owner_name}) changed from ${before.rows[0]?.status} to ${status}`, {
    card_id: req.params.id,
    owner_name: result.rows[0].owner_name,
    old_status: before.rows[0]?.status,
    new_status: status,
    ...requestInfo(req)
  })
  res.json({ message: `Card ${status} successfully`, card: result.rows[0] })
})

// UPDATE the balance: top up a card
router.post('/:id/topup', async (req, res) => {
  const amount = Number(req.body.amount)

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Enter a valid amount' })
  }

  const result = await db.query(
    'UPDATE cards SET balance = balance + $1 WHERE id = $2 RETURNING id, owner_name, balance',
    [amount, req.params.id]
  )

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Card not found' })
  }

  const balanceAfter = Number(result.rows[0].balance)
  log('card_topup', `Topped up card #${req.params.id} (${result.rows[0].owner_name}) by MWK ${amount}`, {
    card_id: req.params.id,
    owner_name: result.rows[0].owner_name,
    amount,
    balance_before: Math.round((balanceAfter - amount) * 100) / 100,
    balance_after: balanceAfter,
    method: 'Manual top-up (admin)',
    ...requestInfo(req)
  })
  res.json({ message: 'Top-up successful', card: result.rows[0] })
})

// UPDATE the balance: set it to an exact amount (admin correction).
// A reason is required and the old and new values are logged, so every
// manual change leaves a record.
router.patch('/:id/balance', async (req, res) => {
  const newBalance = Number(req.body.balance)
  const reason = String(req.body.reason || '').trim()

  if (req.body.balance === '' || req.body.balance === null || !Number.isFinite(newBalance) || newBalance < 0) {
    return res.status(400).json({ error: 'Enter a valid balance (0 or more)' })
  }
  if (newBalance > 10000000) {
    return res.status(400).json({ error: 'Balance is too large' })
  }
  if (!reason) {
    return res.status(400).json({ error: 'A reason is required' })
  }

  const client = await db.connect()
  try {
    await client.query('BEGIN')

    // Lock the card row so a payment can't change the balance while we edit it
    const current = await client.query(
      'SELECT id, owner_name, balance FROM cards WHERE id = $1 FOR UPDATE',
      [req.params.id]
    )
    if (current.rows.length === 0) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Card not found' })
    }

    const oldBalance = Number(current.rows[0].balance)
    const result = await client.query(
      'UPDATE cards SET balance = $1 WHERE id = $2 RETURNING id, owner_name, balance, status',
      [newBalance, req.params.id]
    )
    await client.query('COMMIT')

    log(
      'balance_adjust',
      `Balance of ${result.rows[0].owner_name} changed from MWK ${oldBalance} to MWK ${newBalance}. Reason: ${reason}`,
      {
        card_id: req.params.id,
        owner_name: result.rows[0].owner_name,
        old_balance: oldBalance,
        new_balance: newBalance,
        difference: Math.round((newBalance - oldBalance) * 100) / 100,
        reason,
        ...requestInfo(req)
      }
    )
    res.json({ message: 'Balance updated', card: result.rows[0] })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    console.error('Balance update error:', error.message)
    res.status(500).json({ error: 'Failed to update balance' })
  } finally {
    client.release()
  }
})

// DELETE a card (only if it has no transaction history)
router.delete('/:id', async (req, res) => {
  const history = await db.query(
    `SELECT (SELECT COUNT(*) FROM transactions WHERE card_id = $1)
          + (SELECT COUNT(*) FROM topups WHERE card_id = $1) AS count`,
    [req.params.id]
  )

  if (Number(history.rows[0].count) > 0) {
    return res.status(409).json({
      error: 'This card has transaction or top-up history. Block it instead of deleting it.'
    })
  }

  const result = await db.query(
    'DELETE FROM cards WHERE id = $1 RETURNING id, owner_name, balance',
    [req.params.id]
  )

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Card not found' })
  }

  log('card_delete', `Deleted card #${req.params.id} (${result.rows[0].owner_name})`, {
    card_id: req.params.id,
    owner_name: result.rows[0].owner_name,
    balance_at_deletion: Number(result.rows[0].balance),
    ...requestInfo(req)
  })
  res.json({ message: 'Card deleted successfully' })
})

module.exports = router