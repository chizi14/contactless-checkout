import { Component } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Kiosk from "./Pages/Kiosk";
import Admin from "./Pages/Admin";
import Login from "./Pages/Login";
import Scanner from "./Pages/Scanner";

// Shows the real error on screen instead of a blank page
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, color: "#fff", fontFamily: "monospace" }}>
          <h2 style={{ marginBottom: 12 }}>Something went wrong</h2>
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {String(this.state.error)}
            {"\n\n"}
            {String(this.state.error.stack || "").split("\n").slice(0, 6).join("\n")}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Kiosk />} />
          <Route path="/login" element={<Login />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/scanner" element={<Scanner />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;