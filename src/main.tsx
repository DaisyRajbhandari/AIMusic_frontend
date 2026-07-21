import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import { toast } from "sonner";

import App from "./App.tsx";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";

import "./index.css";
import "./App.css";
import "./analytics/posthog";
import "./analytics/ga4";

// Handle dynamic import errors, such as missing chunks after deployment.
window.addEventListener("vite:preloadError", () => {
  window.location.reload();
});

// Register the Progressive Web App service worker.
const updateSW = registerSW({
  onNeedRefresh() {
    toast.message("Update Available 🚀", {
      description: "A new version of SoLuna is ready.",
      action: {
        label: "Update Now",
        onClick: () => updateSW(true),
      },
      duration: Infinity,
    });
  },
});

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error('The root element with id "root" was not found.');
}

createRoot(rootElement).render(
  <BrowserRouter>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </BrowserRouter>,
);