import posthog from "posthog-js";

const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
const posthogHost =
  import.meta.env.VITE_POSTHOG_HOST ||
  "https://app.posthog.com";

if (posthogKey) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    capture_pageview: false,
    capture_pageleave: true,
    person_profiles: "identified_only",
  });
} else if (import.meta.env.DEV) {
  console.info(
    "[PostHog] Analytics disabled because VITE_POSTHOG_KEY is not configured.",
  );
}

export default posthog;