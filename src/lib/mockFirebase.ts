// Mock Firebase implementation for demo purposes
// Replace with real Firebase config when ready for production

import { BehaviorSubject } from "./mockUtils";

export interface MockUser {
  uid: string;
  email: string;
}

export interface MockUserProfile {
  uid: string;
  name: string;
  usn: string;
  role: "student" | "admin";
  email: string;
  phone?: string;
  blocked?: boolean;
}

// In-memory stores
const usersStore: Record<string, MockUserProfile> = {
  "admin-001": {
    uid: "admin-001",
    name: "Dr. Rajesh Kumar",
    usn: "ADMIN001",
    role: "admin",
    email: "admin001@classtime.app",
    phone: "+91 9876543210",
  },
  "student-001": {
    uid: "student-001",
    name: "Aarav Sharma",
    usn: "1BM21CS001",
    role: "student",
    email: "1bm21cs001@classtime.app",
    phone: "+91 9876500001",
  },
  "student-002": {
    uid: "student-002",
    name: "Priya Patel",
    usn: "1BM21CS002",
    role: "student",
    email: "1bm21cs002@classtime.app",
    phone: "+91 9876500002",
  },
  "student-003": {
    uid: "student-003",
    name: "Rohan Gupta",
    usn: "1BM21CS003",
    role: "student",
    email: "1bm21cs003@classtime.app",
    phone: "+91 9876500003",
  },
  "student-004": {
    uid: "student-004",
    name: "Sneha Reddy",
    usn: "1BM21CS004",
    role: "student",
    email: "1bm21cs004@classtime.app",
    phone: "+91 9876500004",
  },
  "student-005": {
    uid: "student-005",
    name: "Karthik Nair",
    usn: "1BM21CS005",
    role: "student",
    email: "1bm21cs005@classtime.app",
    phone: "+91 9876500005",
  },
};

// Passwords store (email -> password)
const passwordsStore: Record<string, string> = {
  "admin001@classtime.app": "admin123",
  "1bm21cs001@classtime.app": "student123",
  "1bm21cs002@classtime.app": "student123",
  "1bm21cs003@classtime.app": "student123",
  "1bm21cs004@classtime.app": "student123",
  "1bm21cs005@classtime.app": "student123",
};

const activityStore: Record<string, { screenTime: number; unlockCount: number; lastActive: Date }> = {
  "student-001": { screenTime: 23, unlockCount: 8, lastActive: new Date(Date.now() - 60000) },
  "student-002": { screenTime: 5, unlockCount: 2, lastActive: new Date(Date.now() - 30000) },
  "student-003": { screenTime: 45, unlockCount: 15, lastActive: new Date(Date.now() - 600000) },
  "student-004": { screenTime: 12, unlockCount: 4, lastActive: new Date(Date.now() - 120000) },
  "student-005": { screenTime: 0, unlockCount: 0, lastActive: new Date(Date.now() - 3600000) },
};

const alertsStore: Array<{
  id: string;
  studentId: string;
  studentName: string;
  message: string;
  timestamp: Date;
  read: boolean;
}> = [];

export interface TimetableEntry {
  id: string;
  day: string; // "Monday", "Tuesday", etc.
  subject: string;
  startTime: string;
  endTime: string;
}

const INITIAL_MONITORING_SETTINGS = {
  startTime: "09:00",
  endTime: "17:00",
  active: true,
  manualOverride: false, // true when admin manually deactivates
  manualOverrideDate: null as string | null, // date string of override, resumes next day
  timetable: [
    { id: "t1", day: "Monday", subject: "Data Structures", startTime: "09:00", endTime: "10:00" },
    { id: "t2", day: "Monday", subject: "Operating Systems", startTime: "11:00", endTime: "12:00" },
    { id: "t3", day: "Tuesday", subject: "DBMS", startTime: "09:00", endTime: "10:00" },
    { id: "t4", day: "Wednesday", subject: "Computer Networks", startTime: "10:00", endTime: "11:00" },
    { id: "t5", day: "Thursday", subject: "Data Structures", startTime: "09:00", endTime: "10:00" },
    { id: "t6", day: "Friday", subject: "Software Engineering", startTime: "14:00", endTime: "15:00" },
  ] as TimetableEntry[],
};

// Load from localStorage or use defaults
const savedSettings = localStorage.getItem("monitoringSettings");
let monitoringSettings: typeof INITIAL_MONITORING_SETTINGS = savedSettings 
  ? JSON.parse(savedSettings) 
  : INITIAL_MONITORING_SETTINGS;

console.log("Initial monitoring settings:", monitoringSettings);

// Add cross-tab synchronization
window.addEventListener("storage", (e) => {
  console.log("Storage event received:", e.key, e.newValue);
  if (e.key === "monitoringSettings" && e.newValue) {
    monitoringSettings = JSON.parse(e.newValue);
    // Notify both old and new paths for mock compatibility
    notifyDocListeners("settings/monitoring");
    const savedUser = localStorage.getItem("mockAuthUser");
    if (savedUser) {
      const u = JSON.parse(savedUser);
      notifyDocListeners(`users/${u.uid}/settings/monitoring`);
    }
  }
  if (e.key === "mockAuthUser") {
    currentUser = e.newValue ? JSON.parse(e.newValue) : null;
    notifyAuthListeners();
  }
});

let currentUser: MockUser | null = null;
const authListeners: Array<(user: MockUser | null) => void> = [];

// Auth functions
export const mockAuth = {
  get currentUser() {
    return currentUser;
  },
  onAuthStateChanged(callback: (user: MockUser | null) => void) {
    authListeners.push(callback);
    // Check localStorage for persisted session
    const saved = localStorage.getItem("mockAuthUser");
    if (saved) {
      currentUser = JSON.parse(saved);
      callback(currentUser);
    } else {
      callback(null);
    }
    return () => {
      const idx = authListeners.indexOf(callback);
      if (idx >= 0) authListeners.splice(idx, 1);
    };
  },
};

function notifyAuthListeners() {
  authListeners.forEach((cb) => cb(currentUser));
}

export async function signInWithEmailAndPassword(_auth: unknown, email: string, password: string) {
  const normalEmail = email.toLowerCase();
  if (passwordsStore[normalEmail] !== password) {
    throw new Error("Invalid credentials");
  }
  const profile = Object.values(usersStore).find((u) => u.email === normalEmail);
  if (!profile) throw new Error("User not found");
  currentUser = { uid: profile.uid, email: normalEmail };
  localStorage.setItem("mockAuthUser", JSON.stringify(currentUser));
  notifyAuthListeners();
  return { user: currentUser };
}

export async function createUserWithEmailAndPassword(_auth: unknown, email: string, password: string) {
  const normalEmail = email.toLowerCase();
  if (passwordsStore[normalEmail]) {
    throw new Error("Email already in use");
  }
  const uid = `student-${Date.now()}`;
  passwordsStore[normalEmail] = password;
  currentUser = { uid, email: normalEmail };
  localStorage.setItem("mockAuthUser", JSON.stringify(currentUser));
  notifyAuthListeners();
  return { user: currentUser };
}

export async function signOutUser() {
  currentUser = null;
  localStorage.removeItem("mockAuthUser");
  notifyAuthListeners();
}

// Firestore-like functions
type Listener = (snap: { exists?: () => boolean; data?: () => unknown; id?: string; docs?: unknown[] }) => void;
const docListeners: Record<string, Listener[]> = {};
const collectionListeners: Record<string, Listener[]> = {};

function notifyDocListeners(path: string) {
  (docListeners[path] || []).forEach((cb) => {
    const data = getDocData(path);
    cb({ exists: () => !!data, data: () => data, id: path.split("/").pop() });
  });
}

function notifyCollectionListeners(colPath: string) {
  (collectionListeners[colPath] || []).forEach((cb) => {
    const docs = getCollectionData(colPath);
    cb({
      docs: docs.map((d: Record<string, unknown>) => ({
        id: d._id || d.uid,
        data: () => d,
      })),
    });
  });
}

function getDocData(path: string): Record<string, unknown> | null {
  if (path === "settings/monitoring" || (path.startsWith("users/") && path.endsWith("/settings/monitoring"))) {
    // Check if manual override should expire (it's a new day)
    if (monitoringSettings.manualOverride && monitoringSettings.manualOverrideDate) {
      const today = new Date().toDateString();
      if (today !== monitoringSettings.manualOverrideDate) {
        monitoringSettings.manualOverride = false;
        monitoringSettings.manualOverrideDate = null;
        monitoringSettings.active = true;
        // Persist the reset state
        localStorage.setItem("monitoringSettings", JSON.stringify(monitoringSettings));
      }
    }
    return monitoringSettings;
  }
  if (path.startsWith("users/")) return usersStore[path.replace("users/", "")] as unknown as Record<string, unknown>;
  if (path.startsWith("activity/")) return activityStore[path.replace("activity/", "")];
  return null;
}

function getCollectionData(path: string): Record<string, unknown>[] {
  if (path === "users") return Object.values(usersStore) as unknown as Record<string, unknown>[];
  if (path === "activity") return Object.entries(activityStore).map(([k, v]) => ({ ...v, _id: k })) as Record<string, unknown>[];
  if (path === "alerts") return alertsStore;
  return [];
}

export function onDocSnapshot(path: string, callback: Listener) {
  if (!docListeners[path]) docListeners[path] = [];
  docListeners[path].push(callback);
  // Initial call
  const data = getDocData(path);
  callback({ exists: () => !!data, data: () => data, id: path.split("/").pop() });
  return () => {
    docListeners[path] = (docListeners[path] || []).filter((cb) => cb !== callback);
  };
}

export function onCollectionSnapshot(path: string, callback: Listener, _queryOpts?: { where?: [string, unknown] }) {
  if (!collectionListeners[path]) collectionListeners[path] = [];
  collectionListeners[path].push(callback);
  // Initial call
  const docs = getCollectionData(path);
  const filteredDocs = _queryOpts?.where
    ? docs.filter((d: Record<string, unknown>) => d[_queryOpts.where[0]] === _queryOpts.where[1])
    : docs;
  callback({
    docs: filteredDocs.map((d: Record<string, unknown>) => ({
      id: (d.id as string) || (d._id as string) || (d.uid as string),
      data: () => d,
    })),
  });
  return () => {
    collectionListeners[path] = (collectionListeners[path] || []).filter((cb) => cb !== callback);
  };
}

export async function setDocData(path: string, data: Record<string, unknown>) {
  console.log("setDocData called:", path, data);
  if (path === "settings/monitoring" || (path.startsWith("users/") && path.endsWith("/settings/monitoring"))) {
    monitoringSettings = { ...monitoringSettings, ...data };
    localStorage.setItem("monitoringSettings", JSON.stringify(monitoringSettings));
    console.log("monitoringSettings saved to localStorage:", monitoringSettings);
    notifyDocListeners(path);
    return;
  }
  if (path.startsWith("users/")) {
    const uid = path.replace("users/", "");
    usersStore[uid] = data as unknown as MockUserProfile;
    activityStore[uid] = { screenTime: 0, unlockCount: 0, lastActive: new Date() };
    notifyDocListeners(path);
    notifyCollectionListeners("users");
    notifyCollectionListeners("activity");
    return;
  }
}

export async function deleteDocData(path: string) {
  if (path.startsWith("users/")) {
    const uid = path.replace("users/", "");
    delete usersStore[uid];
    delete activityStore[uid];
    notifyCollectionListeners("users");
    notifyCollectionListeners("activity");
  }
}

export async function addDocData(colPath: string, data: Record<string, unknown>) {
  if (colPath === "alerts") {
    const alert = {
      ...data,
      id: `alert-${Date.now()}`,
      timestamp: new Date(),
    };
    alertsStore.unshift(alert as unknown as { id: string; studentId: string; studentName: string; message: string; timestamp: Date; read: boolean; });
    notifyCollectionListeners("alerts");
    return alert;
  }
}

// Simulate activity changes every 15 seconds
setInterval(() => {
  const now = new Date();
  const today = now.toLocaleDateString("en-US", { weekday: "long" });

  // Check if monitoring is active globally
  if (!monitoringSettings.active) return;

  // Check global window
  const [osh, osm] = (monitoringSettings.startTime || "00:00").split(":").map(Number);
  const [oeh, oem] = (monitoringSettings.endTime || "00:00").split(":").map(Number);
  const overrideStart = new Date(); overrideStart.setHours(osh, osm, 0);
  const overrideEnd = new Date(); overrideEnd.setHours(oeh, oem, 0);
  const inOverrideWindow = now >= overrideStart && now <= overrideEnd;

  // Check timetable
  const timetable = monitoringSettings.timetable || [];
  const todayClasses = timetable.filter((t: TimetableEntry) => t.day === today);
  const inClass = todayClasses.some((entry: TimetableEntry) => {
    const [sh, sm] = entry.startTime.split(":").map(Number);
    const [eh, em] = entry.endTime.split(":").map(Number);
    const start = new Date(); start.setHours(sh, sm, 0);
    const end = new Date(); end.setHours(eh, em, 0);
    return now >= start && now <= end;
  });

  if (!inOverrideWindow && !inClass) return;

  Object.keys(activityStore).forEach((uid) => {
    // Admin is not monitored
    if (usersStore[uid]?.role === "admin") return;
    
    // Blocked users still report? Usually yes, for monitoring. 
    // But if we want to simulate "monitoring is on", we update activity.
    if (Math.random() > 0.5) {
      const act = activityStore[uid];
      act.screenTime += Math.floor(Math.random() * 3);
      if (Math.random() > 0.7) act.unlockCount += 1;
      act.lastActive = new Date();
      notifyDocListeners(`activity/${uid}`);
    }
  });
  notifyCollectionListeners("activity");
}, 15000);
