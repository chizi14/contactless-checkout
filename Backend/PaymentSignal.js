// Remembers the result of the most recent card payment, so the ESP32
// reader can show a green or red light after the customer taps.
// Kept in memory only: it is a live signal, not a record. The real
// record of every sale is in the transactions table.

let seq = 0
let last = { seq: 0, result: null, timestamp: 0 }

const record = (result) => {
  seq += 1
  last = { seq, result, timestamp: Date.now() }
}

const current = () => last

module.exports = { record, current }