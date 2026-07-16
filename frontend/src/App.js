import { useEffect, useState } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import Layout from "@/components/Layout";
import Home from "@/pages/Home";
import Story from "@/pages/Story";
import Saved from "@/pages/Saved";
import Digest from "@/pages/Digest";
import About from "@/pages/About";
import Admin from "@/pages/Admin";

function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("pulseai_theme") || "dark");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("pulseai_theme", theme);
  }, [theme]);

  return (
    <div className="App noise">
      <Toaster position="bottom-right" richColors />
      <BrowserRouter>
        <Routes>
          <Route element={<Layout theme={theme} setTheme={setTheme} />}>
            <Route path="/" element={<Home />} />
            <Route path="/story/:category/:slug" element={<Story />} />
            <Route path="/saved" element={<Saved />} />
            <Route path="/digest/:date" element={<Digest />} />
            <Route path="/about" element={<About />} />
            <Route path="/admin" element={<Admin />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
