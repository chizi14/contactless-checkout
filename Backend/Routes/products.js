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

module.exports = router;
