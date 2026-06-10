const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const db = require("../Database");

// POST /api/cards/register
router.post("/register", (req, res) => {
  const { uid, owner_name } = req.body;

  if (!uid || !owner_name) {
    return res.status(400).json({ error: "UID and owner name are required" });
  }

  const uid_hash = bcrypt.hashSync(uid, 10);

  try {
    const stmt = db.prepare(
      "INSERT INTO cards (uid_hash, owner_name) VALUES (?, ?)",
    );
    const result = stmt.run(uid_hash, owner_name);
    res.status(201).json({
      message: "Card registered successfully",
      card_id: result.lastInsertRowid,
      owner: owner_name,
    });
  } catch (error) {
    res.status(409).json({ error: "Card already registered" });
  }
});

// POST /api/cards/verify
router.post("/verify", (req, res) => {
  const { uid } = req.body;

  if (!uid) {
    return res.status(400).json({ error: "UID is required" });
  }

  const cards = db.prepare("SELECT * FROM cards").all();

  const matchedCard = cards.find((card) =>
    bcrypt.compareSync(uid, card.uid_hash),
  );

  if (!matchedCard) {
    return res.status(404).json({
      verified: false,
      message: "Card not recognised",
    });
  }

  res.json({
    verified: true,
    card_id: matchedCard.id,
    owner: matchedCard.owner_name,
  });
});

// GET /api/cards
router.get("/", (req, res) => {
  const cards = db
    .prepare("SELECT id, owner_name, registered_at FROM cards")
    .all();
  res.json(cards);
});

module.exports = router;
