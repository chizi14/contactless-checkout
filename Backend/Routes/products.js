const express = require('express')
const router = express.Router()
const db = require('../Database')

let lastScannedProduct = null

router.get('/', async (req, res) => {
  const result = await db.query('SELECT * FROM products ORDER BY id DESC')
  res.json(result.rows)
})

router.get('/latest-scan', (req, res) => {
  if (!lastScannedProduct) {
    return res.status(404).json({ error: 'No scan yet' })
  }
  const scan = lastScannedProduct
  lastScannedProduct = null
  res.json(scan)
})

router.get('/:barcode', async (req, res) => {
  const result = await db.query(
    'SELECT * FROM products WHERE barcode = $1',
    [req.params.barcode]
  )
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Product not found' })
  }
  res.json(result.rows[0])
})

router.post('/', async (req, res) => {
  const { barcode, name, price } = req.body

  if (!barcode || !name || !price) {
    return res.status(400).json({ error: 'Barcode, name and price are required' })
  }

  if (isNaN(price) || price <= 0) {
    return res.status(400).json({ error: 'Price must be a positive number' })
  }

  try {
    const result = await db.query(
      'INSERT INTO products (barcode, name, price) VALUES ($1, $2, $3) RETURNING *',
      [barcode, name, parseFloat(price)]
    )
    res.status(201).json({
      message: 'Product added successfully',
      product_id: result.rows[0].id,
      name,
      barcode,
      price: parseFloat(price)
    })
  } catch (error) {
    res.status(409).json({ error: 'Product with this barcode already exists' })
  }
})

router.post('/scanner/item', async (req, res) => {
  const { barcode } = req.body
  if (!barcode) return res.status(400).json({ error: 'Barcode required' })

  const result = await db.query(
    'SELECT * FROM products WHERE barcode = $1',
    [barcode]
  )
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Product not found' })
  }

  lastScannedProduct = { ...result.rows[0], timestamp: Date.now() }
  res.json({ success: true, product: result.rows[0] })
})

router.delete('/:id', async (req, res) => {
  const result = await db.query(
    'SELECT * FROM products WHERE id = $1',
    [req.params.id]
  )
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Product not found' })
  }
  await db.query('DELETE FROM products WHERE id = $1', [req.params.id])
  res.json({ message: 'Product deleted successfully' })
})

module.exports = router