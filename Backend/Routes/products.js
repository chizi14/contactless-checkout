const express = require('express')
const router = express.Router()
const db = require('../Database')

let lastScannedProduct = null

// READ all products
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

  // Same idea as latest-tap: ignore a scan from before this customer's session began
  const since = Number(req.query.since)
  if (since && scan.timestamp < since) {
    return res.status(404).json({ error: 'Scan belongs to a previous session' })
  }

  res.json(scan)
})

// READ one product by barcode
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

// CREATE a product
router.post('/', async (req, res) => {
  const { barcode, name, price, stock } = req.body

  if (!barcode || !name || !price) {
    return res.status(400).json({ error: 'Barcode, name and price are required' })
  }

  if (isNaN(price) || price <= 0) {
    return res.status(400).json({ error: 'Price must be a positive number' })
  }

  // Stock is optional on creation; 0 means "not in stock yet" rather than an error
  const stockValue = stock === undefined || stock === '' ? 0 : parseInt(stock, 10)
  if (isNaN(stockValue) || stockValue < 0) {
    return res.status(400).json({ error: 'Stock must be zero or a positive whole number' })
  }

  try {
    const result = await db.query(
      'INSERT INTO products (barcode, name, price, stock) VALUES ($1, $2, $3, $4) RETURNING *',
      [barcode, name, parseFloat(price), stockValue]
    )
    res.status(201).json({
      message: 'Product added successfully',
      product_id: result.rows[0].id,
      name,
      barcode,
      price: parseFloat(price),
      stock: stockValue
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

// UPDATE a product (name, price and stock; the barcode stays fixed)
router.put('/:id', async (req, res) => {
  const { name, price, stock } = req.body

  if (!name || !price) {
    return res.status(400).json({ error: 'Name and price are required' })
  }

  if (isNaN(price) || price <= 0) {
    return res.status(400).json({ error: 'Price must be a positive number' })
  }

  const stockValue = stock === undefined || stock === '' ? 0 : parseInt(stock, 10)
  if (isNaN(stockValue) || stockValue < 0) {
    return res.status(400).json({ error: 'Stock must be zero or a positive whole number' })
  }

  const result = await db.query(
    'UPDATE products SET name = $1, price = $2, stock = $3 WHERE id = $4 RETURNING *',
    [name, parseFloat(price), stockValue, req.params.id]
  )

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Product not found' })
  }

  res.json({ message: 'Product updated successfully', product: result.rows[0] })
})

// DELETE a product
router.delete('/:id', async (req, res) => {
  const result = await db.query(
    'DELETE FROM products WHERE id = $1 RETURNING id',
    [req.params.id]
  )
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Product not found' })
  }
  res.json({ message: 'Product deleted successfully' })
})

module.exports = router