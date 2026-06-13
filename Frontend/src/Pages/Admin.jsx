import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../API/Axios";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

function Admin() {
  const [activeTab, setActiveTab] = useState("transactions");
  const [transactions, setTransactions] = useState([]);
  const [products, setProducts] = useState([]);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);

  // Product form state
  const [productForm, setProductForm] = useState({
    barcode: "",
    name: "",
    price: "",
  });
  const [productMsg, setProductMsg] = useState("");

  // Card form state
  const [cardForm, setCardForm] = useState({ uid: "", owner_name: "" });
  const [cardMsg, setCardMsg] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    const auth = localStorage.getItem("admin_auth");
    if (!auth) navigate("/login");
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [t, p, c] = await Promise.all([
        api.get("/transactions"),
        api.get("/products"),
        api.get("/cards"),
      ]);
      setTransactions(t.data);
      setProducts(p.data);
      setCards(c.data);
    } catch (err) {
      console.error("Fetch error:", err);
    }
    setLoading(false);
  };

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
      });
      setProductMsg("Product added successfully");
      setProductForm({ barcode: "", name: "", price: "" });
      fetchAll();
    } catch (err) {
      setProductMsg("Failed to add product. Barcode may already exist.");
    }
  };

  const handleDeleteProduct = async (id) => {
  try {
    await api.delete(`/products/${id}`)
    setProducts(prev => prev.filter(p => p.id !== id))
  } catch (err) {
    console.error('Delete error:', err)
  }
}

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

  const handleLogout = () => {
    localStorage.removeItem("admin_auth");
    navigate("/login");
  };

  const chartData = transactions.slice(0, 7).map((t, i) => ({
    name: `#${t.id}`,
    amount: t.total_amount,
  }));

  const tabs = ["transactions", "products", "cards"];

  return (
    <div className="min-h-screen bg-primary">
      {/* Header */}
      <header
        className="bg-secondary border-b border-border px-6 py-4
                         flex items-center justify-between shadow-card"
      >
        <div>
          <h1 className="text-text-primary font-bold text-lg">Admin Panel</h1>
          <p className="text-text-muted text-xs">Contactless Checkout System</p>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="text-text-secondary text-sm hover:text-text-primary
                       transition-colors"
          >
            Kiosk View
          </button>
          <button
            onClick={handleLogout}
            className="bg-danger text-white text-sm px-4 py-2 rounded-lg
                       hover:opacity-90 transition-opacity"
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
              className="bg-secondary rounded-xl p-5 border border-border
                            shadow-card"
            >
              <p
                className="text-text-muted text-xs font-medium uppercase
                            tracking-wide mb-1"
              >
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
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize
                          transition-colors ${
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
                            `MWK ${value.toLocaleString()}`,
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
                          className="px-5 py-4 flex items-center
                                                    justify-between"
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
                              MWK {t.total_amount.toLocaleString()}
                            </p>
                            <span
                              className="text-xs bg-success-light text-accent
                                             px-2 py-0.5 rounded-full"
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
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    {["barcode", "name", "price"].map((field) => (
                      <input
                        key={field}
                        type={field === "price" ? "number" : "text"}
                        placeholder={
                          field.charAt(0).toUpperCase() + field.slice(1)
                        }
                        value={productForm[field]}
                        onChange={(e) =>
                          setProductForm((prev) => ({
                            ...prev,
                            [field]: e.target.value,
                          }))
                        }
                        className="bg-surface text-gray-900 placeholder-gray-400
                                   px-4 py-2.5 rounded-lg border border-border
                                   text-sm focus:outline-none focus:ring-2
                                   focus:ring-accent-light cursor-text"
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
                    className="bg-accent text-white text-sm font-medium px-5
                               py-2.5 rounded-lg hover:bg-accent-light transition-colors"
                  >
                    Add Product
                  </button>
                </div>

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
                          className="px-5 py-3 flex items-center
                                                    justify-between"
                        >
                          <div>
                            <p className="text-text-primary text-sm font-medium">
                              {p.name}
                            </p>
                            <p className="text-text-muted text-xs mt-0.5">
                              Barcode: {p.barcode}
                            </p>
                          </div>
                          <div className="flex items-center gap-4">
                            <p className="text-text-primary font-semibold text-sm">
                              MWK {p.price.toLocaleString()}
                            </p>
                            <button
                              onClick={() => handleDeleteProduct(p.id)}
                              className="text-danger text-xs hover:opacity-70
                                         transition-opacity"
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
                      className="bg-surface text-gray-900 placeholder-gray-400
                                 px-4 py-2.5 rounded-lg border border-border
                                 text-sm focus:outline-none focus:ring-2
                                 focus:ring-accent-light cursor-text"
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
                      className="bg-surface text-gray-900 placeholder-gray-400
                                 px-4 py-2.5 rounded-lg border border-border
                                 text-sm focus:outline-none focus:ring-2
                                 focus:ring-accent-light cursor-text"
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
                    className="bg-accent text-white text-sm font-medium px-5
                               py-2.5 rounded-lg hover:bg-accent-light transition-colors"
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
                          className="px-5 py-3 flex items-center
                                                    justify-between"
                        >
                          <div>
                            <p className="text-text-primary text-sm font-medium">
                              {c.owner_name}
                            </p>
                            <p className="text-text-muted text-xs mt-0.5">
                              Registered:{" "}
                              {new Date(c.registered_at).toLocaleString()}
                            </p>
                          </div>
                          <span
                            className="text-xs bg-accent-lighter text-accent
                                           px-2 py-0.5 rounded-full font-medium"
                          >
                            Active
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default Admin;
