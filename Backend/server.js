const express = require('express')
const cors = require('cors')
const http = require('http')
const app = express()

// Render sits behind a proxy; this makes req.ip the real client address
app.set('trust proxy', 1)

app.use(cors())
app.use(express.json())

const cardRoutes = require('./Routes/cards')
const productRoutes = require('./Routes/products')
const transactionRoutes = require('./Routes/transactions')
const logRoutes = require('./Routes/logs')
const topupRoutes = require('./Routes/topups')
const mobileSaleRoutes = require('./Routes/mobile-sales')
const refundRoutes = require('./Routes/refunds')

app.use('/api/cards', cardRoutes)
app.use('/api/products', productRoutes)
app.use('/api/transactions', transactionRoutes)
app.use('/api/scanner', productRoutes)
app.use('/api/logs', logRoutes)
app.use('/api/topups', topupRoutes)
app.use('/api/mobile-sales', mobileSaleRoutes)
app.use('/api/refunds', refundRoutes)

app.get('/', (req, res) => {
  res.json({ message: 'Checkout API is running' })
})

http.createServer(app).listen(3000, '0.0.0.0', () => {
  console.log('Server running on port 3000')
})