const db = require('./Database')

// Writes one log line. This NEVER throws — a logging failure must
// never break a card tap, a scan, or a payment. If the insert fails,
// we just print it to the console and move on.
const log = (type, message, meta = {}) => {
  db.query(
    'INSERT INTO logs (type, message, meta_json) VALUES ($1, $2, $3)',
    [type, message, JSON.stringify(meta)]
  ).catch(error => {
    console.error('Logging failed (ignored):', error.message)
  })
}

module.exports = { log }