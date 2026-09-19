const express = require('express')
const router = express.Router()
const db = require('../Database')

router.post('/', async (req, res) => {
  const { card_id, items, total_amount } = req.body

  if (!card_id || !items || !total_amount) {
    return res.status(400).json({ error: 'card_id, items and total_amount are required' })
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Items must be a non-empty array' })
  }

  const cardResult = await db.query(
    'SELECT * FROM cards WHERE id = $1',
    [card_id]
  )
  if (cardResult.rows.length === 0) {
    return res.status(404).json({ error: 'Card not found' })
  }

  const items_json = JSON.stringify(items)

  const result = await db.query(
    `INSERT INTO transactions (card_id, total_amount, items_json, status)
     VALUES ($1, $2, $3, 'approved') RETURNING *`,
    [card_id, parseFloat(total_amount), items_json]
  )

  res.status(201).json({
    message: 'Transaction approved',
    transaction_id: result.rows[0].id,
    owner: cardResult.rows[0].owner_name,
    total_amount: parseFloat(total_amount),
    items: items,
    status: 'approved'
  })
})

router.get('/', async (req, res) => {
  const result = await db.query(`
    SELECT 
      transactions.id,
      transactions.total_amount,
      transactions.items_json,
      transactions.status,
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

router.get('/:id', async (req, res) => {
  const result = await db.query(`
    SELECT 
      transactions.id,
      transactions.total_amount,
      transactions.items_json,
      transactions.status,
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