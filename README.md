# CampusCalm: Advanced Student Monitoring & Discipline Engine

CampusCalm is a production-grade, offline-first student monitoring application designed to ensure focused learning environments. Built with a "Security-First" philosophy, it leverages hardware-level attestation and AES-256 encryption to provide a tamper-proof monitoring solution for educational institutions.

## 📖 Table of Contents
- [Core Features](#core-features)
- [Security Architecture](#security-architecture)
- [Data Lifecycle & Algorithms](#data-lifecycle--algorithms)
- [Technology Stack](#technology-stack)
- [Firestore Security Rules](#firestore-security-rules)
- [Installation & Deployment](#installation--deployment)

---

## 🚀 Core Features

- **Automated Monitoring**: Schedule-based foreground service that tracks device activity during class hours.
- **Offline-First Engine**: Full data integrity during network outages via local encrypted buffering.
- **Evasion Detection**: Real-time logging of Network (Online/Offline) and Screen events with absolute timestamps.
- **3-Day Rolling Sync**: Optimizes cloud storage by maintaining a strict 72-hour sliding window of report data.
- **Multi-Admin Hierarchy**: Administrators can only monitor and manage students explicitly assigned to them.
- **Real-Time Push Alerts**: Instant notifications for Admins when a student starts a session or a report is ready.

---

## 🛡️ Security Architecture

The application implements a defense-in-depth strategy across three layers: Local, Transit, and Cloud.

| Security Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Data-at-Rest** | AES-256 (CryptoJS) | Encrypts local log buffers using a dynamic hardware-salted key. |
| **Data-in-Transit** | Firebase App Check | Ensures only the official, signed APK can communicate with the backend. |
| **Logic Integrity** | Server Timestamps | Prevent "Clock Cheating" by ignoring local device time for sync metadata. |
| **Access Control** | Firestore Rules | Path-based identity enforcement (UID-isolated). |
| **Tamper Detection** | Android ID Check | Detects manual app data wipes or unauthorized device switches. |

### Encryption Flow Example
```typescript
// Dynamic Key Generation
const key = CryptoJS.SHA256(student_uid + android_device_id).toString();

// Secure Local Storage
const encrypted = CryptoJS.AES.encrypt(JSON.stringify(logs), key).toString();
await Preferences.set({ key: 'secure_logs', value: encrypted });
```

---

## ⚙️ Data Lifecycle & Algorithms

### 1. Offline-First Batching
Monitoring data is never sent life to Firestore to save battery and bandwidth. Instead:
- Logs are appended to an encrypted local array in `@capacitor/preferences`.
- A `SyncService` triggers once the **final class of the day** is completed or upon **network recovery**.
- Local logs are only cleared after the Firestore `setDoc` operation is confirmed successful.

### 2. 3-Day Rolling Retention
To prevent database bloat and ensure privacy, the system enforces a strict retention algorithm:
```javascript
// Immediately after syncing Today's report
const retentionTarget = new Date();
retentionTarget.setDate(retentionTarget.getDate() - 3);
const oldDateStr = retentionTarget.toISOString().split('T')[0];

// Automated Wipe
await deleteDoc(doc(db, `activity/${uid}/daily_reports/${oldDateStr}`));
```

---

## 🛠️ Technology Stack

### Frameworks & UI
- **React 18**: Component-based architecture with Hooks for state management.
- **Vite**: Ultra-fast build tool for modern web development.
- **Tailwind CSS & Shadcn UI**: Premium, responsive design system.

### Mobile & Background
- **Capacitor 8**: Native bridge for Android hardware access.
- **Foreground Service**: Ensures monitoring persists even when the app is in the background.
- **Background Task**: Handles the final data sync when the user exits the app.

### Backend (Firebase 12)
- **Firebase Authentication**: Secure MFA-ready student/admin login.
- **Cloud Firestore**: Real-time, NoSQL document database.
- **Cloud Messaging (FCM)**: Real-time push notifications for administrators.
- **App Check**: Play Integrity attestation for backend security.

---

## 📜 Firestore Security Rules

Our production-ready rules ensure that student data is treated as private and immutable to unauthorized actors.

```javascript
match /activity/{studentId}/daily_reports/{reportDate} {
  // 1. Students can only append to their OWN reports
  allow create, update: if request.auth.uid == studentId;
  
  // 2. Admins can ONLY read students they personally created
  allow read: if get(/databases/$(database)/documents/users/$(studentId)).data.createdBy == request.auth.uid;
  
  // 3. Manual deletion is forbidden for students
  allow delete: if request.auth.uid != studentId;
}
```

---

## 🛠️ Installation & Deployment

1. **Environment Setup**:
   - Install Android Studio and Java 17.
   - Run `npm install` to fetch dependencies.

2. **Firebase Configuration**:
   - Place `google-services.json` in `android/app/`.
   - Update `firebase.ts` with your API config.

3. **Build & Release**:
   - `npm run build`
   - `npx cap sync android`
   - Signed APK generation via Android Studio (using `.jks` file provided).

---

**Developed as a BCA Final Year Project.**  
*CampusCalm - Empowering Focused Education through Technology.*
