const express = require('express')
const cors = require('cors')
const http = require('http')
const app = express()

app.use(cors())
app.use(express.json())

const cardRoutes = require('./Routes/cards')
const productRoutes = require('./Routes/products')
const transactionRoutes = require('./Routes/transactions')

app.use('/api/cards', cardRoutes)
app.use('/api/products', productRoutes)
app.use('/api/transactions', transactionRoutes)
app.use('/api/scanner', productRoutes)

app.get('/', (req, res) => {
  res.json({ message: 'Checkout API is running' })
})

http.createServer(app).listen(3000, '0.0.0.0', () => {
  console.log('Server running on port 3000')
})