import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Kiosk from './Pages/Kiosk'
import Admin from './Pages/Admin'
import Login from './Pages/Login'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Kiosk />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
