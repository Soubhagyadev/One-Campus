// Optional Firebase AI Logic configuration only. Supabase owns Auth and all database data.
import { initializeApp } from "firebase/app";
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
};
export const configured = Boolean(
  config.apiKey && config.projectId && config.appId && config.authDomain,
);
export const firebaseApp = configured ? initializeApp(config) : null;
