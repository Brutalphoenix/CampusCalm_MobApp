import { 
  signInWithEmailAndPassword as firebaseSignIn, 
  createUserWithEmailAndPassword as firebaseCreateUser, 
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  User
} from "firebase/auth";
import { 
  doc, 
  onSnapshot, 
  setDoc, 
  collection, 
  addDoc, 
  deleteDoc, 
  query, 
  where,
  getDoc,
  Timestamp
} from "firebase/firestore";
import { auth, db } from "./firebase";
import { setPersistence, browserLocalPersistence } from "firebase/auth";

// Harden session persistence for Capacitor WebView
if (typeof window !== "undefined") {
  setPersistence(auth, browserLocalPersistence).catch(err => 
    console.error("[FIREBASE] Persistence setup failed:", err)
  );
}

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
  year?: "1st" | "2nd" | "3rd" | "4th";
  blocked?: boolean;
  absentDates?: string[];
  createdBy?: string;
}

export interface TimetableEntry {
  id: string;
  day: string; // "Monday", "Tuesday", etc.
  subject: string;
  startTime: string;
  endTime: string;
}

export const mockAuth = {
  get currentUser() {
    const user = auth.currentUser;
    return user ? { uid: user.uid, email: user.email || "" } : null;
  },
  onAuthStateChanged(callback: (user: MockUser | null) => void) {
    return firebaseOnAuthStateChanged(auth, (user) => {
      if (user) {
        callback({ uid: user.uid, email: user.email || "" });
      } else {
        callback(null);
      }
    });
  },
};

export async function signInWithEmailAndPassword(_auth: unknown, email: string, password: string) {
  const cred = await firebaseSignIn(auth, email, password);
  return { user: { uid: cred.user.uid, email: cred.user.email || "" } };
}

export async function createUserWithEmailAndPassword(_auth: unknown, email: string, password: string) {
  const cred = await firebaseCreateUser(auth, email, password);
  return { user: { uid: cred.user.uid, email: cred.user.email || "" } };
}

export async function signOutUser() {
  await firebaseSignOut(auth);
}

export function onDocSnapshot<T = Record<string, unknown>>(path: string, callback: (snap: { exists: () => boolean; data: () => T | undefined; id: string }) => void) {
  if (!path || path.includes("//")) {
    console.warn("Invalid document path for snapshot:", path);
    return () => {};
  }
  const docRef = doc(db, path);
  return onSnapshot(docRef, (snapshot) => {
    callback({
      exists: () => snapshot.exists(),
      data: () => snapshot.data() as T,
      id: snapshot.id
    });
  }, (err) => {
    console.error(`Error in onDocSnapshot for ${path}:`, err);
  });
}

export function onCollectionSnapshot<T = Record<string, unknown>>(path: string, callback: (snap: { docs: { data: () => T; id: string }[] }) => void, _queryOpts?: { where?: [string, unknown] }) {
  if (!path) {
    console.warn("Invalid collection path for snapshot:", path);
    return () => {};
  }
  let q = query(collection(db, path));
  
  if (_queryOpts?.where) {
    if (_queryOpts.where[1] === undefined) {
      console.warn(`Query for ${path} has undefined value for ${_queryOpts.where[0]}`);
      return () => {};
    }
    q = query(q, where(_queryOpts.where[0], "==", _queryOpts.where[1]));
  }
  
  return onSnapshot(q, (snapshot) => {
    callback({
      docs: snapshot.docs.map(d => ({
        id: d.id,
        data: () => d.data() as T
      }))
    });
  }, (err) => {
    console.error(`Error in onCollectionSnapshot for ${path}:`, err);
  });
}

export async function setDocData(path: string, data: Record<string, unknown>) {
  const docRef = doc(db, path);
  // Flatten data if needed, but Firebase setDoc handles objects
  await setDoc(docRef, data, { merge: true });
}

export async function addDocData(colPath: string, data: Record<string, unknown>) {
  const colRef = collection(db, colPath);
  const docRef = await addDoc(colRef, {
    ...data,
    timestamp: Timestamp.now()
  });
  return { id: docRef.id, ...data };
}

export async function deleteDocData(path: string) {
  const docRef = doc(db, path);
  await deleteDoc(docRef);
}
