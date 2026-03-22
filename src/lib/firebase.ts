import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

// Your web app's Firebase configuration
export const firebaseConfig = {
  apiKey: "AIzaSyAWDGgyWhUptH4yTaqsTMVBYR4cKMbQrFc",
  authDomain: "campuscalm-21e71.firebaseapp.com",
  projectId: "campuscalm-21e71",
  storageBucket: "campuscalm-21e71.firebasestorage.app",
  messagingSenderId: "305124990409",
  appId: "1:305124990409:web:b15eb4da89bb33a173dc18",
  measurementId: "G-ME56B3B2MJ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const analytics = typeof window !== "undefined" ? getAnalytics(app) : null;
