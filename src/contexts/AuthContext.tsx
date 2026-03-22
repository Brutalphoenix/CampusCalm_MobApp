import React, { createContext, useContext, useEffect, useState } from "react";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword as firebaseCreateUser, signOut } from "firebase/auth";
import { firebaseConfig } from "@/lib/firebase";
import {
  mockAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOutUser,
  onDocSnapshot,
  setDocData,
  type MockUser,
  type MockUserProfile,
} from "@/lib/realFirebase";
import { initializeMonitoring } from "@/lib/monitoringService";

interface AuthContextType {
  user: MockUser | null;
  profile: MockUserProfile | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<MockUserProfile>;
  signup: (usn: string, name: string, phone: string, password: string, year: "1st" | "2nd" | "3rd" | "4th") => Promise<void>;
  createStudent: (usn: string, name: string, phone: string, password: string, year: "1st" | "2nd" | "3rd" | "4th") => Promise<MockUserProfile>;
  createAdmin: (usn: string, name: string, phone: string, password: string) => Promise<MockUserProfile>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<MockUser | null>(null);
  const [profile, setProfile] = useState<MockUserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = mockAuth.onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        onDocSnapshot(`users/${firebaseUser.uid}`, (snap: { exists: () => boolean; data: () => unknown }) => {
          if (snap.exists()) {
            const p = snap.data() as MockUserProfile;
            setProfile(p);
            
            // NEW: Initialize offline-first monitoring for students
            if (p.role === 'student') {
              initializeMonitoring(p.uid, p.email).catch(err => 
                console.error("[AUTH] Monitoring init check failed:", err)
              );
            }
          }
          setLoading(false);
        });

        // Pass Auth Token to Service Worker for background monitoring
        const authUser = firebaseUser as MockUser & { getIdToken?: () => Promise<string> };
        if (authUser.getIdToken && navigator.serviceWorker?.controller) {
          authUser.getIdToken().then((token: string) => {
            navigator.serviceWorker.controller?.postMessage({
              type: 'SET_AUTH_TOKEN',
              token
            });
          });
        }
      } else {
        setProfile(null);
        setLoading(false);
      }
    });
    return unsub;
  }, []);

  const login = async (email: string, password: string): Promise<MockUserProfile> => {
    const cred = await signInWithEmailAndPassword(null, email, password);
    const { getDoc, doc } = await import("firebase/firestore");
    const { db } = await import("@/lib/firebase");
    const docSnap = await getDoc(doc(db, "users", cred.user.uid));

    if (docSnap.exists()) {
      const p = docSnap.data() as MockUserProfile;
      setProfile(p);
      return p;
    } else {
      throw new Error("User profile not found in database");
    }
  };

  const signup = async (usn: string, name: string, phone: string, password: string, year: "1st" | "2nd" | "3rd" | "4th") => {
    const email = `${usn.toLowerCase().replace(/[^a-z0-9]/g, "")}@classtime.app`;
    const cred = await createUserWithEmailAndPassword(null, email, password);
    const userProfile: MockUserProfile = {
      uid: cred.user.uid,
      name,
      usn,
      role: "student",
      email,
      phone,
      year,
    };
    await setDocData(`users/${cred.user.uid}`, userProfile as unknown as Record<string, unknown>);
    setProfile(userProfile);
  };

  const createStudent = async (usn: string, name: string, phone: string, password: string, year: "1st" | "2nd" | "3rd" | "4th"): Promise<MockUserProfile> => {
    // Create a secondary app instance to avoid signing out the current admin
    const secondaryAppName = `secondary-app-${Date.now()}`;
    const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
    const secondaryAuth = getAuth(secondaryApp);

    try {
      const email = `${usn.toLowerCase().replace(/[^a-z0-9]/g, "")}@classtime.app`;
      const cred = await firebaseCreateUser(secondaryAuth, email, password);

      const userProfile: MockUserProfile = {
        uid: cred.user.uid,
        name,
        usn,
        role: "student",
        email,
        phone,
        year,
        createdBy: profile?.uid, // Link to the admin who created this student
      };

      // Use the primary Firestore instance to save the profile
      await setDocData(`users/${cred.user.uid}`, userProfile as unknown as Record<string, unknown>);

      // Sign out of the secondary app and delete it
      await signOut(secondaryAuth);
      await deleteApp(secondaryApp);

      return userProfile;
    } catch (error) {
      await deleteApp(secondaryApp);
      throw error;
    }
  };

  const createAdmin = async (usn: string, name: string, phone: string, password: string): Promise<MockUserProfile> => {
    const secondaryAppName = `secondary-app-admin-${Date.now()}`;
    const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
    const secondaryAuth = getAuth(secondaryApp);

    try {
      const email = `${usn.toLowerCase().replace(/[^a-z0-9]/g, "")}@classtime.app`;
      const cred = await firebaseCreateUser(secondaryAuth, email, password);

      const userProfile: MockUserProfile = {
        uid: cred.user.uid,
        name,
        usn,
        role: "admin",
        email,
        phone,
      };

      await setDocData(`users/${cred.user.uid}`, userProfile as unknown as Record<string, unknown>);
      await signOut(secondaryAuth);
      await deleteApp(secondaryApp);
      return userProfile;
    } catch (error) {
      await deleteApp(secondaryApp);
      throw error;
    }
  };

  const logout = async () => {
    await signOutUser();
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, signup, createStudent, createAdmin, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
