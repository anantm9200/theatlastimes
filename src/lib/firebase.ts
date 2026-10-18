import { initializeApp, getApps, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import defaultConfig from "../../firebase-applet-config.json";

function configuration(): FirebaseOptions {
  const raw = (import.meta as ImportMeta & { env?: { VITE_FIREBASE_CONFIG?: string } }).env?.VITE_FIREBASE_CONFIG;
  let config: FirebaseOptions = defaultConfig;
  if (raw) {
    try { config = JSON.parse(raw); }
    catch { throw new Error("Editor sign-in is not configured correctly. Ask the site operator to check the Firebase configuration."); }
  }
  if (!config || typeof config.apiKey !== "string" || typeof config.projectId !== "string" || typeof config.authDomain !== "string" || typeof config.appId !== "string") {
    throw new Error("Editor sign-in requires a complete Firebase web configuration.");
  }
  return config;
}

// Loaded only when a reader opens the editorial sign-in flow.
export function getFirebaseAuth() {
  const app = getApps().find(app => app.name === "atlas-editorial") || initializeApp(configuration(), "atlas-editorial");
  return getAuth(app);
}
