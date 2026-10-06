const express = require('express')
const router = express.Router()
const bcrypt = require('bcryptjs')
const db = require('../Database')

let lastVerifiedCard = null

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

router.post('/verify', async (req, res) => {
  const { uid } = req.body

  if (!uid) {
    return res.status(400).json({ error: 'UID is required' })
  }

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
})

router.get('/latest-tap', (req, res) => {
  if (!lastVerifiedCard) {
    return res.status(404).json({ error: 'No tap yet' })
  }
  const tap = lastVerifiedCard
  lastVerifiedCard = null
  res.json(tap)
})

router.get('/', async (req, res) => {
  const result = await db.query(
    'SELECT id, owner_name, balance, registered_at FROM cards ORDER BY id'
  )
  res.json(result.rows)
})


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

module.exports = router