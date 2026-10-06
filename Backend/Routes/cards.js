const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const db = require('../Database')

let lastVerifiedCard = null

// CREATE (register) a card
router.post('/register', async (req, res) => {
  const { uid, owner_name } = req.body

  if (!uid || !owner_name) {
    return res.status(400).json({ error: 'UID and owner name are required' })
  }

  const uid_hash = bcrypt.hashSync(uid, 10)

  try {
    const result = await db.query(
      'INSERT INTO cards (uid_hash, owner_name) VALUES ($1, $2) RETURNING *',
      [uid_hash, owner_name]
    )
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
    const result = await db.query('SELECT * FROM cards')
    const cards = result.rows

    const matchedCard = cards.find(card => bcrypt.compareSync(uid, card.uid_hash))

    if (!matchedCard) {
      lastVerifiedCard = { verified: false, timestamp: Date.now() }
      return res.status(404).json({
        verified: false,
        message: 'Card not recognised'
      })
    }

    if (matchedCard.status === 'blocked') {
      lastVerifiedCard = { verified: false, timestamp: Date.now() }
      return res.status(403).json({
        verified: false,
        message: 'Card is blocked'
      })
    }

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

  res.json({ message: 'Card deleted successfully' })
})

module.exports = router