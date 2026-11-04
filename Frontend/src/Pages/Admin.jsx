import { useState, useEffect, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import api from "../API/Axios";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  CartesianGrid,
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

// ---------- Small shared pieces for charts and logs ----------

const AXIS_TICK = { fontSize: 11, fill: "#6c757d" };

const TipBox = ({ title, rows }) => (
  <div className="bg-secondary border border-border rounded-lg shadow-card px-3 py-2 text-xs">
    {title && <p className="text-text-primary font-semibold mb-1">{title}</p>}
    {rows.map(([label, value]) => (
      <p key={label} className="text-text-secondary">
        {label}: <span className="text-text-primary font-medium">{value}</span>
      </p>
    ))}
  </div>
);

const AmountTip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return <TipBox title={`Sale ${d.name}`} rows={[["Amount", `MWK ${money(d.amount)}`]]} />;
};

const PieTip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;
  return <TipBox title={payload[0].name} rows={[["Count", payload[0].value]]} />;
};

// Stock is judged against each product's own reorder level, like a real
// supermarket: Out = 0, Critical = half the reorder level or less,
// Low = at or below the reorder level, Healthy = above it.
const STOCK_STATUS = {
  out: { label: "Out of stock", color: "#c84c3c", badge: "bg-danger-light text-danger" },
  critical: { label: "Critical", color: "#e07a3a", badge: "bg-orange-100 text-orange-700" },
  low: { label: "Low", color: "#e0a62b", badge: "bg-yellow-100 text-yellow-700" },
  healthy: { label: "Healthy", color: "#2d6a4f", badge: "bg-surface text-text-secondary" },
};

const getStockStatus = (stock, reorderLevel) => {
  const s = Number(stock || 0);
  const r = Number(reorderLevel || 20);
  if (s <= 0) return "out";
  if (s <= Math.ceil(r / 2)) return "critical";
  if (s <= r) return "low";
  return "healthy";
};

const StockTip = ({ active, payload }) => {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <TipBox
      title={d.fullName}
      rows={[
        ["In stock", d.stock],
        ["Reorder level", d.reorder],
        ["Status", STOCK_STATUS[d.status].label],
      ]}
    />
  );
};

function DonutCard({ title, data, colorFor, emptyText }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  return (
    <div className="bg-secondary rounded-xl p-5 border border-border">
      <h3 className="text-text-primary font-semibold mb-4">{title}</h3>
      {data.length === 0 ? (
        <div className="h-[240px] flex items-center justify-center text-text-muted text-sm">
          {emptyText}
        </div>
      ) : (
        <>
          <div className="relative">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={58}
                  outerRadius={84}
                  paddingAngle={3}
                  cornerRadius={6}
                  stroke="none"
                >
                  {data.map((d, i) => (
                    <Cell key={d.name} fill={colorFor(d, i)} />
                  ))}
                </Pie>
                <Tooltip content={<PieTip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-text-primary text-2xl font-bold">{total}</span>
              <span className="text-text-muted text-xs">total</span>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-3">
            {data.map((d, i) => (
              <span key={d.name} className="flex items-center gap-1.5 text-xs text-text-secondary">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: colorFor(d, i) }}
                />
                {d.name}
                <span className="text-text-primary font-medium">{d.value}</span>
                <span className="text-text-muted">({Math.round((d.value / total) * 100)}%)</span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ----- Activity log helpers -----

const logCategory = (type) => {
  if (type.startsWith("tap_")) return "taps";
  if (type.startsWith("scan_")) return "scans";
  if (type.startsWith("payment_")) return "payments";
  if (type.startsWith("card_") || type.startsWith("topup_") || type === "balance_adjust") return "cards";
  if (type.startsWith("product_") || type === "stock_alert") return "products";
  if (type === "server_error") return "errors";
  return "other";
};

const LOG_FILTERS = [
  ["all", "All"],
  ["taps", "Taps"],
  ["scans", "Scans"],
  ["payments", "Payments"],
  ["cards", "Cards"],
  ["products", "Products & Stock"],
  ["errors", "Errors"],
];

const parseMeta = (raw) => {
  try {
    const m = typeof raw === "string" ? JSON.parse(raw) : raw;
    return m && typeof m === "object" ? m : {};
  } catch {
    return {};
  }
};

const MONEY_KEYS = [
  "balance", "balance_before", "balance_after", "total", "amount", "price",
  "old_balance", "new_balance", "difference", "shortfall", "card_balance",
  "balance_at_deletion", "amount_paid", "charges", "expected_amount", "paid_amount",
];

function MetaValue({ k, v }) {
  if (Array.isArray(v)) {
    return (
      <div className="space-y-0.5">
        {v.map((item, i) =>
          item && typeof item === "object" && item.name ? (
            <div key={i}>
              {item.quantity} × {item.name}
              {item.price !== undefined ? ` @ MWK ${money(item.price)}` : ""}
            </div>
          ) : (
            <div key={i}>{JSON.stringify(item)}</div>
          )
        )}
      </div>
    );
  }
  if (v && typeof v === "object") {
    if ("from" in v && "to" in v) {
      const fmt = (x) => (MONEY_KEYS.includes(k) ? `MWK ${money(x)}` : String(x));
      return <span>{fmt(v.from)} → {fmt(v.to)}</span>;
    }
    return (
      <div className="space-y-0.5">
        {Object.entries(v).map(([key, val]) => (
          <div key={key}>
            <span className="text-text-muted capitalize">{key.replace(/_/g, " ")}: </span>
            <MetaValue k={key} v={val} />
          </div>
        ))}
      </div>
    );
  }
  if (MONEY_KEYS.includes(k) && v !== "" && !isNaN(Number(v))) {
    return <span>MWK {money(v)}</span>;
  }
  return <span>{String(v)}</span>;
}

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
    reorder_level: "",
  });
  const [productMsg, setProductMsg] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", price: "", stock: "", reorder_level: "" });

  // Card state
  const [cardForm, setCardForm] = useState({ uid: "", owner_name: "" });
  const [cardMsg, setCardMsg] = useState("");
  const [topupAmounts, setTopupAmounts] = useState({});
  const [editingCardId, setEditingCardId] = useState(null);
  const [cardEditName, setCardEditName] = useState("");
  const [logFilter, setLogFilter] = useState("all");
  const [logSearch, setLogSearch] = useState("");
  const [expandedLogId, setExpandedLogId] = useState(null);
  const [balanceEditId, setBalanceEditId] = useState(null);
  const [balanceEditValue, setBalanceEditValue] = useState("");
  const [balanceEditReason, setBalanceEditReason] = useState("");

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
        api.get("/logs?limit=300"),
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
        reorder_level: productForm.reorder_level === "" ? 20 : parseInt(productForm.reorder_level, 10),
      });
      setProductMsg("Product added successfully");
      setProductForm({ barcode: "", name: "", price: "", stock: "", reorder_level: "" });
      fetchAll();
    } catch (err) {
      setProductMsg("Failed to add product. Barcode may already exist.");
    }
  };

  const startEdit = (p) => {
    setEditingId(p.id);
    setEditForm({
      name: p.name,
      price: String(p.price),
      stock: String(p.stock ?? 0),
      reorder_level: String(p.reorder_level ?? 20),
    });
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
        reorder_level: editForm.reorder_level === "" ? 20 : parseInt(editForm.reorder_level, 10),
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

  const handleMobileMoneyTopUp = async (cardId) => {
    const amount = Number(topupAmounts[cardId]);
    if (!Number.isInteger(amount) || amount < 100) {
      setCardMsg("Enter a whole-number amount of MWK 100 or more");
      return;
    }
    try {
      const res = await api.post("/topups/start", { card_id: cardId, amount });
      // Send the customer to Paychangu's secure payment page
      window.location.href = res.data.checkout_url;
    } catch (err) {
      setCardMsg(err.response?.data?.error || "Could not start the mobile money payment");
    }
  };

  const startBalanceEdit = (c) => {
    setBalanceEditId(c.id);
    setBalanceEditValue(String(Number(c.balance || 0)));
    setBalanceEditReason("");
  };

  const handleSaveBalance = async (id) => {
    const value = balanceEditValue === "" ? NaN : Number(balanceEditValue);
    if (!Number.isFinite(value) || value < 0) {
      setCardMsg("Enter a valid balance (0 or more)");
      return;
    }
    if (!balanceEditReason.trim()) {
      setCardMsg("Enter a reason for changing the balance");
      return;
    }
    try {
      await api.patch(`/cards/${id}/balance`, {
        balance: value,
        reason: balanceEditReason,
      });
      setCardMsg("Balance updated successfully");
      setBalanceEditId(null);
      fetchAll();
    } catch (err) {
      setCardMsg(err.response?.data?.error || "Failed to update balance");
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
    .slice(0, 10)
    .reverse()
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

  const PIE_COLORS = ["#2d6a4f", "#e07a5f", "#f2b84b", "#5b6c8f", "#81b29a"];

  const stockBarData = products.map((p) => {
    const status = getStockStatus(p.stock, p.reorder_level);
    return {
      name: p.name.length > 10 ? p.name.slice(0, 10) + "…" : p.name,
      fullName: p.name,
      stock: Number(p.stock || 0),
      reorder: Number(p.reorder_level ?? 20),
      status,
    };
  });

  const stockCounts = { out: 0, critical: 0, low: 0, healthy: 0 };
  stockBarData.forEach((d) => {
    stockCounts[d.status] += 1;
  });

  const logTypeStyle = {
    tap_success: { color: "bg-success-light text-accent" },
    tap_denied: { color: "bg-danger-light text-danger" },
    scan_success: { color: "bg-success-light text-accent" },
    scan_denied: { color: "bg-yellow-100 text-yellow-700" },
    payment_approved: { color: "bg-success-light text-accent" },
    payment_declined: { color: "bg-danger-light text-danger" },
    product_create: { color: "bg-surface text-text-secondary" },
    product_update: { color: "bg-surface text-text-secondary" },
    product_delete: { color: "bg-surface text-text-secondary" },
    stock_alert: { color: "bg-yellow-100 text-yellow-700" },
    card_register: { color: "bg-surface text-text-secondary" },
    card_update: { color: "bg-surface text-text-secondary" },
    card_status: { color: "bg-surface text-text-secondary" },
    card_topup: { color: "bg-success-light text-accent" },
    topup_started: { color: "bg-surface text-text-secondary" },
    topup_completed: { color: "bg-success-light text-accent" },
    topup_failed: { color: "bg-danger-light text-danger" },
    balance_adjust: { color: "bg-surface text-text-secondary" },
    card_delete: { color: "bg-surface text-text-secondary" },
    server_error: { color: "bg-danger-light text-danger" },
  };

  const filteredLogs = logs.filter((entry) => {
    if (logFilter !== "all" && logCategory(entry.type) !== logFilter) return false;
    const q = logSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      entry.message.toLowerCase().includes(q) ||
      entry.type.toLowerCase().includes(q) ||
      String(entry.meta_json || "").toLowerCase().includes(q)
    );
  });

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
                      Recent Sales (MWK)
                    </h3>
                    <ResponsiveContainer width="100%" height={240}>
                      <AreaChart
                        data={chartData}
                        margin={{ top: 10, right: 12, left: -8, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="amountFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#2d6a4f" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="#2d6a4f" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e9ecef" />
                        <XAxis dataKey="name" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} />
                        <Tooltip content={<AmountTip />} />
                        <Area
                          type="monotone"
                          dataKey="amount"
                          stroke="#2d6a4f"
                          strokeWidth={3}
                          fill="url(#amountFill)"
                          dot={{ r: 4, fill: "#ffffff", stroke: "#2d6a4f", strokeWidth: 2 }}
                          activeDot={{ r: 6 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {transactions.length > 0 && (
                  <div className="grid grid-cols-2 gap-4">
                    <DonutCard
                      title="Approved vs Declined"
                      data={statusPieData}
                      colorFor={(d) => (d.name === "Approved" ? "#2d6a4f" : "#c84c3c")}
                      emptyText="No sales yet"
                    />
                    <DonutCard
                      title="Why Sales Were Declined"
                      data={reasonPieData}
                      colorFor={(d, i) => PIE_COLORS[i % PIE_COLORS.length]}
                      emptyText="No declines yet"
                    />
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
                  <div className="grid grid-cols-5 gap-3 mb-3">
                    {["barcode", "name", "price", "stock", "reorder_level"].map((field) => (
                      <input
                        key={field}
                        type={
                          field === "price" || field === "stock" || field === "reorder_level"
                            ? "number"
                            : "text"
                        }
                        placeholder={
                          field === "stock"
                            ? "Stock (0 if unset)"
                            : field === "reorder_level"
                            ? "Reorder level (default 20)"
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
                    <p className="text-text-muted text-xs mb-3">
                      Each product is checked against its own reorder level
                    </p>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {Object.entries(STOCK_STATUS).map(([key, st]) => (
                        <span
                          key={key}
                          className={`text-xs px-2.5 py-1 rounded-full font-medium ${st.badge}`}
                        >
                          {st.label}: {stockCounts[key]}
                        </span>
                      ))}
                    </div>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart
                        data={stockBarData}
                        margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                      >
                        <defs>
                          {Object.entries(STOCK_STATUS).map(([key, st]) => (
                            <linearGradient key={key} id={`stock-${key}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={st.color} stopOpacity={1} />
                              <stop offset="100%" stopColor={st.color} stopOpacity={0.55} />
                            </linearGradient>
                          ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e9ecef" />
                        <XAxis
                          dataKey="name"
                          tick={AXIS_TICK}
                          interval={0}
                          angle={-20}
                          textAnchor="end"
                          height={50}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis tick={AXIS_TICK} allowDecimals={false} axisLine={false} tickLine={false} />
                        <Tooltip content={<StockTip />} cursor={{ fill: "rgba(45,106,79,0.06)" }} />
                        <Bar dataKey="stock" radius={[8, 8, 0, 0]} maxBarSize={36}>
                          {stockBarData.map((entry, i) => (
                            <Cell key={i} fill={`url(#stock-${entry.status})`} />
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
                              <input
                                type="number"
                                placeholder="Reorder"
                                value={editForm.reorder_level}
                                onChange={(e) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    reorder_level: e.target.value,
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
                                  STOCK_STATUS[getStockStatus(p.stock, p.reorder_level)].badge
                                }`}
                              >
                                {(() => {
                                  const st = getStockStatus(p.stock, p.reorder_level);
                                  if (st === "out") return "Out of stock";
                                  if (st === "healthy") return `${p.stock} in stock`;
                                  return `${p.stock} left · ${STOCK_STATUS[st].label}`;
                                })()}
                              </span>
                              <span className="text-text-muted text-xs">
                                Reorder at {p.reorder_level ?? 20}
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
                            {balanceEditId === c.id ? (
                              <div className="flex flex-wrap items-center gap-2">
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="New balance"
                                  value={balanceEditValue}
                                  onChange={(e) =>
                                    setBalanceEditValue(e.target.value)
                                  }
                                  className={`${smallInputClass} w-28`}
                                />
                                <input
                                  type="text"
                                  placeholder="Reason"
                                  value={balanceEditReason}
                                  onChange={(e) =>
                                    setBalanceEditReason(e.target.value)
                                  }
                                  className={`${smallInputClass} w-40`}
                                />
                                <button
                                  onClick={() => handleSaveBalance(c.id)}
                                  className="bg-accent text-white text-xs font-medium px-3 py-2 rounded-lg hover:bg-accent-light transition-colors"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setBalanceEditId(null)}
                                  className="text-text-muted text-xs hover:opacity-70"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <>
                                <span className="text-text-primary text-sm font-semibold">
                                  MWK {money(c.balance)}
                                </span>
                                <button
                                  onClick={() => startBalanceEdit(c)}
                                  className="text-accent text-xs font-medium hover:opacity-70"
                                >
                                  Edit Balance
                                </button>
                              </>
                            )}
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
                              Cash Top Up
                            </button>
                            <button
                              onClick={() => handleMobileMoneyTopUp(c.id)}
                              className="bg-surface text-accent text-xs font-medium px-3 py-2 rounded-lg border border-border hover:opacity-70 transition-colors"
                            >
                              Mobile Money
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
                <div className="px-5 py-4 border-b border-border space-y-3">
                  <div>
                    <h3 className="text-text-primary font-semibold">Activity Log</h3>
                    <p className="text-text-muted text-xs mt-0.5">
                      Every card tap, scan, payment, stock alert and admin action, newest first.
                      Click an entry to see its full details.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {LOG_FILTERS.map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setLogFilter(key)}
                        className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                          logFilter === key
                            ? "bg-accent text-white"
                            : "bg-surface text-text-secondary hover:opacity-70"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                    <input
                      type="text"
                      placeholder="Search logs"
                      value={logSearch}
                      onChange={(e) => setLogSearch(e.target.value)}
                      className={`${smallInputClass} w-48 ml-auto`}
                    />
                  </div>
                  <p className="text-text-muted text-xs">
                    Showing {filteredLogs.length} of {logs.length} entries
                  </p>
                </div>
                {filteredLogs.length === 0 ? (
                  <div className="px-5 py-10 text-center text-text-muted text-sm">
                    {logs.length === 0 ? "No activity yet" : "No entries match this filter"}
                  </div>
                ) : (
                  <div className="divide-y divide-border max-h-[640px] overflow-y-auto">
                    {filteredLogs.map((entry) => {
                      const style = logTypeStyle[entry.type] || {
                        color: "bg-surface text-text-secondary",
                      };
                      const meta = parseMeta(entry.meta_json);
                      const open = expandedLogId === entry.id;
                      return (
                        <div key={entry.id}>
                          <div
                            onClick={() => setExpandedLogId(open ? null : entry.id)}
                            className="px-5 py-3 flex items-start gap-3 cursor-pointer hover:bg-surface"
                          >
                            <span
                              className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${style.color}`}
                            >
                              {entry.type.replace(/_/g, " ")}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-text-primary text-sm">{entry.message}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-text-muted text-xs">
                                {new Date(entry.created_at).toLocaleString()}
                              </p>
                              <p className="text-accent text-xs mt-0.5">
                                {open ? "Hide details" : "View details"}
                              </p>
                            </div>
                          </div>
                          {open && (
                            <div className="px-5 pb-4 bg-surface">
                              <div className="grid grid-cols-[170px_1fr] gap-y-1.5 gap-x-4 text-xs pt-3">
                                <span className="text-text-muted">Log ID</span>
                                <span className="text-text-primary">#{entry.id}</span>
                                <span className="text-text-muted">Type</span>
                                <span className="text-text-primary">{entry.type}</span>
                                <span className="text-text-muted">Time</span>
                                <span className="text-text-primary">
                                  {new Date(entry.created_at).toLocaleString()}
                                </span>
                                {Object.entries(meta).map(([k, v]) =>
                                  v === undefined || v === null ? null : (
                                    <Fragment key={k}>
                                      <span className="text-text-muted capitalize">
                                        {k.replace(/_/g, " ")}
                                      </span>
                                      <span className="text-text-primary break-words">
                                        <MetaValue k={k} v={v} />
                                      </span>
                                    </Fragment>
                                  )
                                )}
                              </div>
                            </div>
                          )}
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