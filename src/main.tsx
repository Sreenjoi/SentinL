import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./utils/clientErrorHandler";
import App from "./App";
import "./index.css";
import { ErrorBoundary } from "./utils/ErrorBoundary";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
