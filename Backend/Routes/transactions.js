const express = require("express");
const router = express.Router();
const db = require("../Database");

// POST /api/transactions
router.post("/", (req, res) => {
  const { card_id, items, total_amount } = req.body;

  if (!card_id || !items || !total_amount) {
    return res
      .status(400)
      .json({ error: "card_id, items and total_amount are required" });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Items must be a non-empty array" });
  }

  const card = db.prepare("SELECT * FROM cards WHERE id = ?").get(card_id);
  if (!card) {
    return res.status(404).json({ error: "Card not found" });
  }

  const items_json = JSON.stringify(items);

  const stmt = db.prepare(`
    INSERT INTO transactions (card_id, total_amount, items_json, status)
    VALUES (?, ?, ?, 'approved')
  `);

  const result = stmt.run(card_id, parseFloat(total_amount), items_json);

  res.status(201).json({
    message: "Transaction approved",
    transaction_id: result.lastInsertRowid,
    owner: card.owner_name,
    total_amount: parseFloat(total_amount),
    items: items,
    status: "approved",
  });
});

// GET /api/transactions
router.get("/", (req, res) => {
  const transactions = db
    .prepare(
      `
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
  `,
    )
    .all();

  const parsed = transactions.map((t) => ({
    ...t,
    items: JSON.parse(t.items_json),
  }));

  res.json(parsed);
});

// GET /api/transactions/:id
router.get("/:id", (req, res) => {
  const transaction = db
    .prepare(
      `
    SELECT 
      transactions.id,
      transactions.total_amount,
      transactions.items_json,
      transactions.status,
      transactions.created_at,
      cards.owner_name
    FROM transactions
    JOIN cards ON transactions.card_id = cards.id
    WHERE transactions.id = ?
  `,
    )
    .get(req.params.id);

  if (!transaction) {
    return res.status(404).json({ error: "Transaction not found" });
  }

  res.json({
    ...transaction,
    items: JSON.parse(transaction.items_json),
  });
});

module.exports = router;
