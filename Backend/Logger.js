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

// Who made this request: the IP address and what kind of device it was.
// The ESP32 reader identifies itself, so we can tell reader taps from
// browser actions. Never put card UIDs, hashes or secrets in a log.
const requestInfo = (req) => {
  const agent = String(req.headers['user-agent'] || '')
  return {
    ip: req.ip,
    source: /esp32/i.test(agent) ? 'ESP32 reader' : 'Browser / app',
    device: agent.slice(0, 120)
  }
}

module.exports = { log, requestInfo }