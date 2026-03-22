import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAWDGgyWhUptH4yTaqsTMVBYR4cKMbQrFc",
  authDomain: "campuscalm-21e71.firebaseapp.com",
  projectId: "campuscalm-21e71",
  storageBucket: "campuscalm-21e71.firebasestorage.app",
  messagingSenderId: "305124990409",
  appId: "1:305124990409:web:b15eb4da89bb33a173dc18",
  measurementId: "G-ME56B3B2MJ"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function setup() {
  console.log("Starting Firebase setup...");

  const users = [
    {
      id: "ADMIN001",
      email: "admin001@classtime.app",
      password: "AdminPassword123",
      role: "admin",
      name: "System Admin"
    },
    {
      id: "STU001",
      email: "stu001@classtime.app",
      password: "StudentPassword123",
      role: "student",
      name: "Test Student",
      phone: "+91 9876543210"
    }
  ];

  for (const user of users) {
    let uid = "";
    try {
      console.log(`Creating/Signing in auth user: ${user.email}...`);
      const cred = await createUserWithEmailAndPassword(auth, user.email, user.password);
      uid = cred.user.uid;
      console.log(`Auth user created: ${uid}`);
    } catch (error: unknown) {
      const err = error as { code?: string; message?: string };
      if (err.code === 'auth/email-already-in-use') {
        const cred = await signInWithEmailAndPassword(auth, user.email, user.password);
        uid = cred.user.uid;
        console.log(`Auth user already exists, signed in: ${uid}`);
      } else {
        console.error(`Auth failed for ${user.email}:`, err.message);
        continue;
      }
    }

    try {
      console.log(`Setting Firestore profile for ${user.email}...`);
      await setDoc(doc(db, "users", uid), {
        uid,
        name: user.name,
        usn: user.id,
        role: user.role,
        email: user.email,
        ...(user.role === 'student' ? { phone: user.phone } : {})
      });
      
      if (user.role === 'student') {
        await setDoc(doc(db, "activity", uid), {
          screenTime: 0,
          unlockCount: 0,
          lastActive: new Date()
        });
      }
      console.log(`Firestore profile created for ${user.email}`);
    } catch (error: unknown) {
      const err = error as { message?: string };
      console.error(`Firestore failed for ${user.email}:`, err.message);
    }
  }

  try {
    console.log("Initializing monitoring settings...");
    await setDoc(doc(db, "settings", "monitoring"), {
      startTime: "09:00",
      endTime: "17:00",
      active: true,
      manualOverride: false,
      timetable: [
        { id: "t1", day: "Monday", subject: "Mathematics", startTime: "09:00", endTime: "10:00" },
        { id: "t2", day: "Tuesday", subject: "Physics", startTime: "10:00", endTime: "11:00" },
      ],
    });
    console.log("Monitoring settings initialized.");
  } catch (error: unknown) {
    const err = error as { message?: string };
    console.error("Settings initialization failed:", err.message);
  }

  console.log("Setup complete.");
}

setup().catch(console.error);
