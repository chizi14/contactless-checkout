const express = require("express");
const router = express.Router();
const db = require("../Database");

router.get("/", (req, res) => {
  const products = db
    .prepare("SELECT id, barcode, name, price FROM products ORDER BY id DESC")
    .all();
  res.json(products);
});

router.post("/", (req, res) => {
  const { barcode, name, price } = req.body;

  if (!barcode || !name || price === undefined || price === null) {
    return res
      .status(400)
      .json({ error: "barcode, name and price are required" });
  }

  try {
    const stmt = db.prepare(
      "INSERT INTO products (barcode, name, price) VALUES (?, ?, ?)",
    );
    const result = stmt.run(barcode, name, Number(price));

    res.status(201).json({
      message: "Product created successfully",
      product_id: result.lastInsertRowid,
      barcode,
      name,
      price: Number(price),
    });
  } catch (error) {
    res
      .status(409)
      .json({ error: "Product already exists or could not be created" });
  }
});

// POST /api/scanner/item — phone scanner sends barcode here
router.post('/scanner/item', (req, res) => {
  const { barcode } = req.body
  if (!barcode) return res.status(400).json({ error: 'Barcode required' })
  
  const product = db.prepare('SELECT * FROM products WHERE barcode = ?').get(barcode)
  if (!product) return res.status(404).json({ error: 'Product not found' })

  res.json({ 
    success: true,
    product 
  })
})

// GET product by barcode
router.get('/:barcode', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE barcode = ?').get(req.params.barcode)
  if (!product) return res.status(404).json({ error: 'Product not found' })
  res.json(product)
})

// DELETE product by id
router.delete('/:id', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id)
  if (!product) return res.status(404).json({ error: 'Product not found' })
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id)
  res.json({ message: 'Product deleted successfully' })
})

module.exports = router;
