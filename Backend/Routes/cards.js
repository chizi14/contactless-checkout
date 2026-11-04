const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const db = require('../Database')
const crypto = require('crypto')
const { log } = require('../Logger')

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
    log('card_register', `Registered card for ${owner_name}`, { card_id: result.rows[0].id })
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

    // Old cards still have a slow bcrypt hash. Check only those, and
    // upgrade a match to the fast hash so it is slow at most once.
    if (!matchedCard) {
      const legacy = await db.query("SELECT * FROM cards WHERE uid_hash LIKE '$2%'")
      matchedCard = legacy.rows.find(card => bcrypt.compareSync(uid, card.uid_hash))
      if (matchedCard) {
        await db.query('UPDATE cards SET uid_hash = $1 WHERE id = $2', [hmac, matchedCard.id])
      }
    }

    if (!matchedCard) {
      log('tap_denied', 'Unrecognised card tapped')
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
      log('tap_denied', `Blocked card tapped: ${matchedCard.owner_name}`, { card_id: matchedCard.id })
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

    log('tap_success', `Card tapped: ${matchedCard.owner_name}`, { card_id: matchedCard.id })
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

  const result = await db.query(
    'UPDATE cards SET owner_name = $1 WHERE id = $2 RETURNING id, owner_name, balance, status',
    [owner_name.trim(), req.params.id]
  )

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Card not found' })
  }

  log('card_update', `Renamed card #${req.params.id} to ${owner_name.trim()}`, { card_id: req.params.id })
  res.json({ message: 'Card updated successfully', card: result.rows[0] })
})

// UPDATE the status: block or unblock a card
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body

  if (status !== 'active' && status !== 'blocked') {
    return res.status(400).json({ error: "Status must be 'active' or 'blocked'" })
  }

  const result = await db.query(
    'UPDATE cards SET status = $1 WHERE id = $2 RETURNING id, owner_name, balance, status',
    [status, req.params.id]
  )

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Card not found' })
  }

  log('card_status', `Card #${req.params.id} (${result.rows[0].owner_name}) set to ${status}`, { card_id: req.params.id, status })
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

  log('card_topup', `Topped up ${result.rows[0].owner_name} by MWK ${amount}`, { card_id: req.params.id, amount })
  res.json({ message: 'Top-up successful', card: result.rows[0] })
})

// DELETE a card (only if it has no transaction history)
router.delete('/:id', async (req, res) => {
  const history = await db.query(
    'SELECT COUNT(*) AS count FROM transactions WHERE card_id = $1',
    [req.params.id]
  )

  if (Number(history.rows[0].count) > 0) {
    return res.status(409).json({
      error: 'This card has transaction history. Block it instead of deleting it.'
    })
  }

  const result = await db.query(
    'DELETE FROM cards WHERE id = $1 RETURNING id',
    [req.params.id]
  )

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Card not found' })
  }

  log('card_delete', `Deleted card #${req.params.id}`, { card_id: req.params.id })
  res.json({ message: 'Card deleted successfully' })
})

module.exports = router