const express = require('express')
const cors = require('cors')
const https = require('https')
const fs = require('fs')
const path = require('path')
const app = express()
const PORT = 3000

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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`)
})