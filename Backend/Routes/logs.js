const express = require('express')
const router = express.Router()
const db = require('../Database')

// READ recent logs, newest first. Optional ?type=payment_declined to
// filter, and ?limit=200 to control how many come back (capped at 500).
router.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500)
  const type = req.query.type

  const result = type
    ? await db.query(
        'SELECT * FROM logs WHERE type = $1 ORDER BY created_at DESC LIMIT $2',
        [type, limit]
      )
    : await db.query(
        'SELECT * FROM logs ORDER BY created_at DESC LIMIT $1',
        [limit]
      )

  res.json(result.rows)
})

module.exports = router