import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../API/Axios";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// Safe money formatter: never crashes if a value is missing
const money = (n) => Number(n || 0).toLocaleString();

function Admin() {
  const [activeTab, setActiveTab] = useState("transactions");
  const [transactions, setTransactions] = useState([]);
  const [products, setProducts] = useState([]);
  const [cards, setCards] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Product state
  const [productForm, setProductForm] = useState({
    barcode: "",
    name: "",
    price: "",
    stock: "",
  });
  const [productMsg, setProductMsg] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", price: "", stock: "" });

  // Card state
  const [cardForm, setCardForm] = useState({ uid: "", owner_name: "" });
  const [cardMsg, setCardMsg] = useState("");
  const [topupAmounts, setTopupAmounts] = useState({});
  const [editingCardId, setEditingCardId] = useState(null);
  const [cardEditName, setCardEditName] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    const auth = localStorage.getItem("admin_auth");
    if (!auth) navigate("/login");
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [t, p, c, l] = await Promise.all([
        api.get("/transactions"),
        api.get("/products"),
        api.get("/cards"),
        api.get("/logs?limit=150"),
      ]);
      setTransactions(t.data);
      setProducts(p.data);
      setCards(c.data);
      setLogs(l.data);
    } catch (err) {
      console.error("Fetch error:", err);
    }
    setLoading(false);
  };

  // ---------- Products ----------
  const handleAddProduct = async () => {
    if (!productForm.barcode || !productForm.name || !productForm.price) {
      setProductMsg("All fields are required");
      return;
    }
    try {
      await api.post("/products", {
        barcode: productForm.barcode,
        name: productForm.name,
        price: parseFloat(productForm.price),
        stock: productForm.stock === "" ? 0 : parseInt(productForm.stock, 10),
      });
      setProductMsg("Product added successfully");
      setProductForm({ barcode: "", name: "", price: "", stock: "" });
      fetchAll();
    } catch (err) {
      setProductMsg("Failed to add product. Barcode may already exist.");
    }
  };

  const startEdit = (p) => {
    setEditingId(p.id);
    setEditForm({ name: p.name, price: String(p.price), stock: String(p.stock ?? 0) });
  };

  const handleUpdateProduct = async (id) => {
    if (!editForm.name || !editForm.price) {
      setProductMsg("Name and price are required");
      return;
    }
    try {
      await api.put(`/products/${id}`, {
        name: editForm.name,
        price: parseFloat(editForm.price),
        stock: editForm.stock === "" ? 0 : parseInt(editForm.stock, 10),
      });
      setProductMsg("Product updated successfully");
      setEditingId(null);
      fetchAll();
    } catch (err) {
      setProductMsg("Failed to update product");
    }
  };

  const handleDeleteProduct = async (id) => {
    if (!window.confirm("Delete this product?")) return;
    try {
      await api.delete(`/products/${id}`);
      setProductMsg("Product deleted successfully");
      fetchAll();
    } catch (err) {
      setProductMsg("Failed to delete product");
    }
  };

  // ---------- Cards ----------
  const handleRegisterCard = async () => {
    if (!cardForm.uid || !cardForm.owner_name) {
      setCardMsg("All fields are required");
      return;
    }
    try {
      await api.post("/cards/register", {
        uid: cardForm.uid,
        owner_name: cardForm.owner_name,
      });
      setCardMsg("Card registered successfully");
      setCardForm({ uid: "", owner_name: "" });
      fetchAll();
    } catch (err) {
      setCardMsg("Failed to register card. UID may already exist.");
    }
  };

  const handleTopUp = async (cardId) => {
    const amount = Number(topupAmounts[cardId]);
    if (!amount || amount <= 0) {
      setCardMsg("Enter a valid top-up amount");
      return;
    }
    try {
      await api.post(`/cards/${cardId}/topup`, { amount });
      setCardMsg("Top-up successful");
      setTopupAmounts((prev) => ({ ...prev, [cardId]: "" }));
      fetchAll();
    } catch (err) {
      setCardMsg("Top-up failed");
    }
  };

  const startCardEdit = (c) => {
    setEditingCardId(c.id);
    setCardEditName(c.owner_name);
  };

  const handleRenameCard = async (id) => {
    if (!cardEditName.trim()) {
      setCardMsg("Owner name is required");
      return;
    }
    try {
      await api.put(`/cards/${id}`, { owner_name: cardEditName });
      setCardMsg("Card renamed successfully");
      setEditingCardId(null);
      fetchAll();
    } catch (err) {
      setCardMsg("Failed to rename card");
    }
  };

  const handleToggleBlock = async (c) => {
    const next = c.status === "blocked" ? "active" : "blocked";
    try {
      await api.patch(`/cards/${c.id}/status`, { status: next });
      setCardMsg(`Card ${next} successfully`);
      fetchAll();
    } catch (err) {
      setCardMsg("Failed to change card status");
    }
  };

  const handleDeleteCard = async (id) => {
    if (!window.confirm("Delete this card?")) return;
    try {
      await api.delete(`/cards/${id}`);
      setCardMsg("Card deleted successfully");
      fetchAll();
    } catch (err) {
      setCardMsg(err.response?.data?.error || "Failed to delete card");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("admin_auth");
    navigate("/login");
  };

  const chartData = transactions
    .filter((t) => t.status === "approved")
    .slice(0, 7)
    .map((t) => ({
    name: `#${t.id}`,
    amount: Number(t.total_amount || 0),
  }));

  const approvedCount = transactions.filter((t) => t.status === "approved").length;
  const declinedCount = transactions.filter((t) => t.status === "declined").length;
  const statusPieData = [
    { name: "Approved", value: approvedCount },
    { name: "Declined", value: declinedCount },
  ].filter((d) => d.value > 0);

  const reasonLabels = {
    card_blocked: "Card blocked",
    insufficient_funds: "Insufficient funds",
    insufficient_stock: "Out of stock",
    card_not_found: "Unknown card",
    product_not_found: "Unknown product",
    bad_request: "Bad request",
    server_error: "Server error",
  };
  const reasonCounts = {};
  transactions
    .filter((t) => t.status === "declined" && t.decline_reason)
    .forEach((t) => {
      const label = reasonLabels[t.decline_reason] || t.decline_reason;
      reasonCounts[label] = (reasonCounts[label] || 0) + 1;
    });
  const reasonPieData = Object.entries(reasonCounts).map(([name, value]) => ({
    name,
    value,
  }));

  const PIE_COLORS = ["#2d6a4f", "#e07a5f", "#f2cc8f", "#3d405b", "#81b29a"];

  const stockBarData = products.map((p) => ({
    name: p.name.length > 10 ? p.name.slice(0, 10) + "…" : p.name,
    stock: Number(p.stock || 0),
  }));

  const stockColor = (stock) => {
    if (stock === 0) return "#c84c3c";
    if (stock <= 5) return "#e0a62b";
    return "#2d6a4f";
  };

  const logTypeStyle = {
    tap_success: { emoji: "💳", color: "bg-success-light text-accent" },
    tap_denied: { emoji: "🚫", color: "bg-danger-light text-danger" },
    scan_success: { emoji: "📦", color: "bg-success-light text-accent" },
    scan_denied: { emoji: "❓", color: "bg-yellow-100 text-yellow-700" },
    payment_approved: { emoji: "✅", color: "bg-success-light text-accent" },
    payment_declined: { emoji: "❌", color: "bg-danger-light text-danger" },
    product_create: { emoji: "🆕", color: "bg-surface text-text-secondary" },
    product_update: { emoji: "✏️", color: "bg-surface text-text-secondary" },
    product_delete: { emoji: "🗑️", color: "bg-surface text-text-secondary" },
    card_register: { emoji: "🪪", color: "bg-surface text-text-secondary" },
    card_update: { emoji: "✏️", color: "bg-surface text-text-secondary" },
    card_status: { emoji: "🔒", color: "bg-surface text-text-secondary" },
    card_topup: { emoji: "💰", color: "bg-success-light text-accent" },
    card_delete: { emoji: "🗑️", color: "bg-surface text-text-secondary" },
    server_error: { emoji: "⚠️", color: "bg-danger-light text-danger" },
  };

  const tabs = ["transactions", "products", "cards", "logs"];

  const inputClass =
    "bg-surface text-gray-900 placeholder-gray-400 px-4 py-2.5 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-accent-light cursor-text";
  const smallInputClass =
    "bg-surface text-gray-900 placeholder-gray-400 px-3 py-1.5 rounded-lg border border-border text-sm focus:outline-none focus:ring-2 focus:ring-accent-light";

  return (
    <div className="min-h-screen bg-primary">
      {/* Header */}
      <header className="bg-secondary border-b border-border px-6 py-4 flex items-center justify-between shadow-card">
        <div>
          <h1 className="text-text-primary font-bold text-lg">Admin Panel</h1>
          <p className="text-text-muted text-xs">Contactless Checkout System</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="text-text-secondary text-sm hover:text-text-primary transition-colors"
          >
            Kiosk View
          </button>
          <button
            onClick={handleLogout}
            className="bg-danger text-white text-sm px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "Total Transactions", value: transactions.length },
            { label: "Products in System", value: products.length },
            { label: "Registered Cards", value: cards.length },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-secondary rounded-xl p-5 border border-border shadow-card"
            >
              <p className="text-text-muted text-xs font-medium uppercase tracking-wide mb-1">
                {stat.label}
              </p>
              <p className="text-text-primary text-3xl font-bold">
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                activeTab === tab
                  ? "bg-accent text-white"
                  : "bg-secondary text-text-secondary border border-border hover:text-text-primary"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-20 text-text-muted">Loading...</div>
        ) : (
          <>
            {/* Transactions tab */}
            {activeTab === "transactions" && (
              <div className="space-y-6">
                {transactions.length > 0 && (
                  <div className="bg-secondary rounded-xl p-5 border border-border">
                    <h3 className="text-text-primary font-semibold mb-4">
                      Transaction Amounts
                    </h3>
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={chartData}>
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip
                          formatter={(value) => [
                            `MWK ${money(value)}`,
                            "Amount",
                          ]}
                        />
                        <Bar
                          dataKey="amount"
                          fill="#2d6a4f"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {transactions.length > 0 && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-secondary rounded-xl p-5 border border-border">
                      <h3 className="text-text-primary font-semibold mb-4">
                        Approved vs Declined
                      </h3>
                      <ResponsiveContainer width="100%" height={220}>
                        <PieChart>
                          <Pie
                            data={statusPieData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={75}
                            label={({ name, value }) => `${name}: ${value}`}
                          >
                            {statusPieData.map((entry, i) => (
                              <Cell
                                key={entry.name}
                                fill={entry.name === "Approved" ? "#2d6a4f" : "#c84c3c"}
                              />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="bg-secondary rounded-xl p-5 border border-border">
                      <h3 className="text-text-primary font-semibold mb-4">
                        Why Sales Were Declined
                      </h3>
                      {reasonPieData.length === 0 ? (
                        <div className="h-[220px] flex items-center justify-center text-text-muted text-sm">
                          No declines yet
                        </div>
                      ) : (
                        <ResponsiveContainer width="100%" height={220}>
                          <PieChart>
                            <Pie
                              data={reasonPieData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              outerRadius={75}
                              label={({ name, value }) => `${name}: ${value}`}
                            >
                              {reasonPieData.map((entry, i) => (
                                <Cell
                                  key={entry.name}
                                  fill={PIE_COLORS[i % PIE_COLORS.length]}
                                />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                )}

                <div className="bg-secondary rounded-xl border border-border overflow-hidden">
                  <div className="px-5 py-4 border-b border-border">
                    <h3 className="text-text-primary font-semibold">
                      All Transactions
                    </h3>
                  </div>
                  {transactions.length === 0 ? (
                    <div className="px-5 py-10 text-center text-text-muted text-sm">
                      No transactions yet
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {transactions.map((t) => (
                        <div
                          key={t.id}
                          className="px-5 py-4 flex items-center justify-between"
                        >
                          <div>
                            <p className="text-text-primary text-sm font-medium">
                              {t.owner_name}
                            </p>
                            <p className="text-text-muted text-xs mt-0.5">
                              {new Date(t.created_at).toLocaleString()} ·
                              Transaction #{t.id}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-accent font-bold">
                              MWK {money(t.total_amount)}
                            </p>
                            <span
                              className={`text-xs px-2 py-0.5 rounded-full ${
                                t.status === "approved"
                                  ? "bg-success-light text-accent"
                                  : "bg-danger-light text-danger"
                              }`}
                            >
                              {t.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Products tab */}
            {activeTab === "products" && (
              <div className="space-y-6">
                <div className="bg-secondary rounded-xl p-5 border border-border">
                  <h3 className="text-text-primary font-semibold mb-4">
                    Add New Product
                  </h3>
                  <div className="grid grid-cols-4 gap-3 mb-3">
                    {["barcode", "name", "price", "stock"].map((field) => (
                      <input
                        key={field}
                        type={
                          field === "price" || field === "stock"
                            ? "number"
                            : "text"
                        }
                        placeholder={
                          field === "stock"
                            ? "Stock (0 if unset)"
                            : field.charAt(0).toUpperCase() + field.slice(1)
                        }
                        value={productForm[field]}
                        onChange={(e) =>
                          setProductForm((prev) => ({
                            ...prev,
                            [field]: e.target.value,
                          }))
                        }
                        className={inputClass}
                      />
                    ))}
                  </div>
                  {productMsg && (
                    <p
                      className={`text-sm mb-3 ${
                        productMsg.includes("success")
                          ? "text-accent"
                          : "text-danger"
                      }`}
                    >
                      {productMsg}
                    </p>
                  )}
                  <button
                    onClick={handleAddProduct}
                    className="bg-accent text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-accent-light transition-colors"
                  >
                    Add Product
                  </button>
                </div>

                {products.length > 0 && (
                  <div className="bg-secondary rounded-xl p-5 border border-border">
                    <h3 className="text-text-primary font-semibold mb-1">
                      Stock Levels
                    </h3>
                    <p className="text-text-muted text-xs mb-4">
                      Green: healthy · Yellow: 5 or fewer · Red: out of stock
                    </p>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={stockBarData}>
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 11 }}
                          interval={0}
                          angle={-20}
                          textAnchor="end"
                          height={50}
                        />
                        <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="stock" radius={[4, 4, 0, 0]}>
                          {stockBarData.map((entry, i) => (
                            <Cell key={i} fill={stockColor(entry.stock)} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="bg-secondary rounded-xl border border-border overflow-hidden">
                  <div className="px-5 py-4 border-b border-border">
                    <h3 className="text-text-primary font-semibold">
                      Product List
                    </h3>
                  </div>
                  {products.length === 0 ? (
                    <div className="px-5 py-10 text-center text-text-muted text-sm">
                      No products added yet
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {products.map((p) => (
                        <div
                          key={p.id}
                          className="px-5 py-3 flex items-center justify-between"
                        >
                          <div>
                            <p className="text-text-primary text-sm font-medium">
                              {p.name}
                            </p>
                            <p className="text-text-muted text-xs mt-0.5">
                              Barcode: {p.barcode}
                            </p>
                          </div>
                          {editingId === p.id ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={editForm.name}
                                onChange={(e) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    name: e.target.value,
                                  }))
                                }
                                className={`${smallInputClass} w-40`}
                              />
                              <input
                                type="number"
                                value={editForm.price}
                                onChange={(e) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    price: e.target.value,
                                  }))
                                }
                                className={`${smallInputClass} w-24`}
                              />
                              <input
                                type="number"
                                placeholder="Stock"
                                value={editForm.stock}
                                onChange={(e) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    stock: e.target.value,
                                  }))
                                }
                                className={`${smallInputClass} w-20`}
                              />
                              <button
                                onClick={() => handleUpdateProduct(p.id)}
                                className="text-accent text-xs font-medium hover:opacity-70"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="text-text-muted text-xs hover:opacity-70"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-4">
                              <p className="text-text-primary font-semibold text-sm">
                                MWK {money(p.price)}
                              </p>
                              <span
                                className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  Number(p.stock) === 0
                                    ? "bg-danger-light text-danger"
                                    : Number(p.stock) <= 5
                                    ? "bg-yellow-100 text-yellow-700"
                                    : "bg-surface text-text-secondary"
                                }`}
                              >
                                {Number(p.stock) === 0
                                  ? "Out of stock"
                                  : `${p.stock} in stock`}
                              </span>
                              <button
                                onClick={() => startEdit(p)}
                                className="text-accent text-xs font-medium hover:opacity-70"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteProduct(p.id)}
                                className="text-danger text-xs hover:opacity-70"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Cards tab */}
            {activeTab === "cards" && (
              <div className="space-y-6">
                <div className="bg-secondary rounded-xl p-5 border border-border">
                  <h3 className="text-text-primary font-semibold mb-4">
                    Register New Card
                  </h3>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <input
                      type="text"
                      placeholder="Card UID (e.g. A3F211CC)"
                      value={cardForm.uid}
                      onChange={(e) =>
                        setCardForm((prev) => ({
                          ...prev,
                          uid: e.target.value,
                        }))
                      }
                      className={inputClass}
                    />
                    <input
                      type="text"
                      placeholder="Owner Name"
                      value={cardForm.owner_name}
                      onChange={(e) =>
                        setCardForm((prev) => ({
                          ...prev,
                          owner_name: e.target.value,
                        }))
                      }
                      className={inputClass}
                    />
                  </div>
                  {cardMsg && (
                    <p
                      className={`text-sm mb-3 ${
                        cardMsg.includes("success")
                          ? "text-accent"
                          : "text-danger"
                      }`}
                    >
                      {cardMsg}
                    </p>
                  )}
                  <button
                    onClick={handleRegisterCard}
                    className="bg-accent text-white text-sm font-medium px-5 py-2.5 rounded-lg hover:bg-accent-light transition-colors"
                  >
                    Register Card
                  </button>
                </div>

                <div className="bg-secondary rounded-xl border border-border overflow-hidden">
                  <div className="px-5 py-4 border-b border-border">
                    <h3 className="text-text-primary font-semibold">
                      Registered Cards
                    </h3>
                  </div>
                  {cards.length === 0 ? (
                    <div className="px-5 py-10 text-center text-text-muted text-sm">
                      No cards registered yet
                    </div>
                  ) : (
                    <div className="divide-y divide-border">
                      {cards.map((c) => (
                        <div
                          key={c.id}
                          className="px-5 py-3 flex flex-wrap items-center justify-between gap-3"
                        >
                          <div>
                            {editingCardId === c.id ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={cardEditName}
                                  onChange={(e) =>
                                    setCardEditName(e.target.value)
                                  }
                                  className={`${smallInputClass} w-48`}
                                />
                                <button
                                  onClick={() => handleRenameCard(c.id)}
                                  className="text-accent text-xs font-medium hover:opacity-70"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingCardId(null)}
                                  className="text-text-muted text-xs hover:opacity-70"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <p className="text-text-primary text-sm font-medium">
                                  {c.owner_name}
                                </p>
                                <span
                                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                    c.status === "blocked"
                                      ? "bg-danger-light text-danger"
                                      : "bg-accent-lighter text-accent"
                                  }`}
                                >
                                  {c.status === "blocked" ? "Blocked" : "Active"}
                                </span>
                              </div>
                            )}
                            <p className="text-text-muted text-xs mt-0.5">
                              Registered:{" "}
                              {new Date(c.registered_at).toLocaleString()}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-3">
                            <span className="text-text-primary text-sm font-semibold">
                              MWK {money(c.balance)}
                            </span>
                            <input
                              type="number"
                              placeholder="Amount"
                              value={topupAmounts[c.id] || ""}
                              onChange={(e) =>
                                setTopupAmounts((prev) => ({
                                  ...prev,
                                  [c.id]: e.target.value,
                                }))
                              }
                              className={`${smallInputClass} w-28`}
                            />
                            <button
                              onClick={() => handleTopUp(c.id)}
                              className="bg-accent text-white text-xs font-medium px-3 py-2 rounded-lg hover:bg-accent-light transition-colors"
                            >
                              Top Up
                            </button>
                            <button
                              onClick={() => startCardEdit(c)}
                              className="text-accent text-xs font-medium hover:opacity-70"
                            >
                              Rename
                            </button>
                            <button
                              onClick={() => handleToggleBlock(c)}
                              className="text-text-secondary text-xs font-medium hover:opacity-70"
                            >
                              {c.status === "blocked" ? "Unblock" : "Block"}
                            </button>
                            <button
                              onClick={() => handleDeleteCard(c.id)}
                              className="text-danger text-xs hover:opacity-70"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Logs tab */}
            {activeTab === "logs" && (
              <div className="bg-secondary rounded-xl border border-border overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h3 className="text-text-primary font-semibold">
                    Activity Log
                  </h3>
                  <p className="text-text-muted text-xs mt-0.5">
                    Every card tap, scan, payment and admin action, newest first
                  </p>
                </div>
                {logs.length === 0 ? (
                  <div className="px-5 py-10 text-center text-text-muted text-sm">
                    No activity yet
                  </div>
                ) : (
                  <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
                    {logs.map((entry) => {
                      const style = logTypeStyle[entry.type] || {
                        emoji: "•",
                        color: "bg-surface text-text-secondary",
                      };
                      return (
                        <div
                          key={entry.id}
                          className="px-5 py-3 flex items-start gap-3"
                        >
                          <span
                            className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${style.color}`}
                          >
                            {style.emoji} {entry.type.replace(/_/g, " ")}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-text-primary text-sm">
                              {entry.message}
                            </p>
                          </div>
                          <span className="text-text-muted text-xs shrink-0">
                            {new Date(entry.created_at).toLocaleString()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default Admin;