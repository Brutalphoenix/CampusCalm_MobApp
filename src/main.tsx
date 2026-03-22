import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Register Service Worker for Background Support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => console.log('SW registered'))
      .catch(err => console.error('SW registration failed:', err));
  });
}

// Suppress non-essential logs in production for security
if (import.meta.env.PROD) {
  console.log = () => {};
  console.debug = () => {};
  console.info = () => {};
  console.warn = () => {};
  // Keep console.error for debugging critical failures
}

createRoot(document.getElementById("root")!).render(<App />);
