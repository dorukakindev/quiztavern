import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ActivityApp } from "./activity/ActivityApp";
import { ActivityErrorBoundary } from "./activity/ActivityErrorBoundary";
import { installClientErrorReporting } from "./lib/clientErrors";
import "./activity/activity.css";
import "./activity/layout-fixes.css";
import "@fontsource-variable/bricolage-grotesque/wght.css";
import "./activity/polish.css";

installClientErrorReporting();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ActivityErrorBoundary>
      <ActivityApp />
    </ActivityErrorBoundary>
  </StrictMode>,
);
