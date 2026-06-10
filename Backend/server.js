const express = require("express");
const cors = require("cors");
const app = express();
const PORT = 3000;

// Middlewares
app.use(cors());
app.use(express.json());

// Routes
const cardRoutes = require("./Routes/cards");
const productRoutes = require("./Routes/products");
const transactionRoutes = require("./Routes/transactions");

app.use("/api/cards", cardRoutes);
app.use("/api/products", productRoutes);
app.use("/api/transactions", transactionRoutes);

// Health check
app.get("/", (req, res) => {
  res.json({ message: "Checkout API is running" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
