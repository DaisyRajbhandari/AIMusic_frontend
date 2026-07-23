const configuredPlannerApiUrl =
  import.meta.env.VITE_PLANNER_API_URL;

export const PLANNER_API_BASE_URL = (
  configuredPlannerApiUrl ||
  "http://127.0.0.1:8001"
).replace(/\/+$/, "");
