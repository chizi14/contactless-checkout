const express = require('express')
const router = express.Router()
const db = require('../Database')
const { log, requestInfo } = require('../Logger')

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
  const { barcode, name, price, stock, reorder_level } = req.body

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

  // The stock level at which this product should be reordered (default 20)
  const reorderValue = reorder_level === undefined || reorder_level === '' ? 20 : parseInt(reorder_level, 10)
  if (isNaN(reorderValue) || reorderValue < 1) {
    return res.status(400).json({ error: 'Reorder level must be a whole number of 1 or more' })
  }

  try {
    const result = await db.query(
      'INSERT INTO products (barcode, name, price, stock, reorder_level) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [barcode, name, parseFloat(price), stockValue, reorderValue]
    )
    log('product_create', `Added product "${name}" (barcode ${barcode}) at MWK ${parseFloat(price)} with ${stockValue} in stock`, {
      product_id: result.rows[0].id,
      name,
      barcode,
      price: parseFloat(price),
      stock: stockValue,
      reorder_level: reorderValue,
      ...requestInfo(req)
    })
    res.status(201).json({
      message: 'Product added successfully',
      product_id: result.rows[0].id,
      name,
      barcode,
      price: parseFloat(price),
      stock: stockValue,
      reorder_level: reorderValue
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
    log('scan_denied', `Scan denied: barcode ${barcode} is not in the product list`, {
      barcode,
      reason: 'product_not_found',
      ...requestInfo(req)
    })
    return res.status(404).json({ error: 'Product not found' })
  }

  const scanned = result.rows[0]
  log('scan_success', `Scanned "${scanned.name}" (MWK ${scanned.price}, ${scanned.stock} in stock)`, {
    product_id: scanned.id,
    name: scanned.name,
    barcode,
    price: Number(scanned.price),
    stock: Number(scanned.stock),
    ...requestInfo(req)
  })
  lastScannedProduct = { ...result.rows[0], timestamp: Date.now() }
  res.json({ success: true, product: result.rows[0] })
})

// UPDATE a product (name, price and stock; the barcode stays fixed)
router.put('/:id', async (req, res) => {
  const { name, price, stock, reorder_level } = req.body

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

  const before = await db.query('SELECT * FROM products WHERE id = $1', [req.params.id])
  if (before.rows.length === 0) {
    return res.status(404).json({ error: 'Product not found' })
  }
  const old = before.rows[0]

  // If no reorder level is sent, keep the one the product already has
  const reorderValue = reorder_level === undefined || reorder_level === '' ? Number(old.reorder_level) : parseInt(reorder_level, 10)
  if (isNaN(reorderValue) || reorderValue < 1) {
    return res.status(400).json({ error: 'Reorder level must be a whole number of 1 or more' })
  }

  const result = await db.query(
    'UPDATE products SET name = $1, price = $2, stock = $3, reorder_level = $4 WHERE id = $5 RETURNING *',
    [name, parseFloat(price), stockValue, reorderValue, req.params.id]
  )

  // Record exactly what changed, old value to new value
  const changes = {}
  if (old.name !== name) changes.name = { from: old.name, to: name }
  if (Number(old.price) !== parseFloat(price)) changes.price = { from: Number(old.price), to: parseFloat(price) }
  if (Number(old.stock) !== stockValue) changes.stock = { from: Number(old.stock), to: stockValue }
  if (Number(old.reorder_level) !== reorderValue) changes.reorder_level = { from: Number(old.reorder_level), to: reorderValue }
  const changedList = Object.keys(changes).join(', ') || 'nothing changed'

  log('product_update', `Updated product #${req.params.id} "${old.name}": ${changedList}`, {
    product_id: req.params.id,
    barcode: old.barcode,
    changes,
    ...requestInfo(req)
  })
  res.json({ message: 'Product updated successfully', product: result.rows[0] })
})

// DELETE a product
router.delete('/:id', async (req, res) => {
  const result = await db.query(
    'DELETE FROM products WHERE id = $1 RETURNING id, name, barcode, price, stock',
    [req.params.id]
  )
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Product not found' })
  }
  const gone = result.rows[0]
  log('product_delete', `Deleted product #${req.params.id} "${gone.name}" (barcode ${gone.barcode})`, {
    product_id: req.params.id,
    name: gone.name,
    barcode: gone.barcode,
    price: Number(gone.price),
    stock_at_deletion: Number(gone.stock),
    ...requestInfo(req)
  })
  res.json({ message: 'Product deleted successfully' })
})

module.exports = router