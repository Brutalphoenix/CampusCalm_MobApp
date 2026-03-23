import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { logErrorToStorage } from "./lib/errorLogger";

// Global Crash Handlers for Enterprise Observability
window.onerror = (message, source, lineno, colno, error) => {
  logErrorToStorage(error || message, 'CRASH');
};

window.onunhandledrejection = (event) => {
  logErrorToStorage(event.reason, 'UNHANDLED_REJECTION');
};

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
