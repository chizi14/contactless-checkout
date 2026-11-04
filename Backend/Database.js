require('dotenv').config()
const { Pool } = require('pg')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

const createTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cards (
      id SERIAL PRIMARY KEY,
      uid_hash TEXT NOT NULL UNIQUE,
      owner_name TEXT NOT NULL,
      registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      barcode TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      price REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      card_id INTEGER NOT NULL REFERENCES cards(id),
      total_amount REAL NOT NULL,
      items_json TEXT NOT NULL,
      status TEXT DEFAULT 'approved',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `)

  await pool.query(`
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS balance NUMERIC(12,2) NOT NULL DEFAULT 0;
    ALTER TABLE cards ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
  `)

  // Stock on hand for each product. Defaults to 0 so existing products
  // don't silently get "unlimited" stock after this update — you set
  // real numbers for them in the admin once this is live.
  await pool.query(`
    ALTER TABLE products ADD COLUMN IF NOT EXISTS stock INTEGER NOT NULL DEFAULT 0;
  `)

  // The level at which a product should be reordered. A supermarket sets
  // this per product (fast sellers need a higher level than slow ones).
  await pool.query(`
    ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_level INTEGER NOT NULL DEFAULT 20;
  `)

  // Records why a sale was declined (card_blocked, insufficient_funds,
  // insufficient_stock, ...). NULL for approved sales.
  await pool.query(`
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS decline_reason TEXT;
  `)

  // Mobile money top-ups made through Paychangu. Each row starts as
  // 'pending' and is only marked 'completed' (and the card credited)
  // after OUR server has verified the payment with Paychangu.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS topups (
      id SERIAL PRIMARY KEY,
      tx_ref TEXT NOT NULL UNIQUE,
      card_id INTEGER NOT NULL REFERENCES cards(id),
      amount NUMERIC(12,2) NOT NULL,
      currency TEXT NOT NULL DEFAULT 'MWK',
      status TEXT NOT NULL DEFAULT 'pending',
      paychangu_reference TEXT,
      failure_reason TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP
    );
  `)

  // A simple activity log: one row per important event, so you can show
  // and explain exactly what happened during a demo or defense.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS logs (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      meta_json TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `)

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_logs_created_at ON logs (created_at DESC);
  `)

  console.log('Database tables ready')
}

createTables().catch(console.error)

module.exports = pool