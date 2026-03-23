# CampusCalm: Advanced Student Monitoring & Discipline Engine

CampusCalm is a production-grade, offline-first student monitoring application designed to ensure focused learning environments. Built with a "Security-First" philosophy, it leverages hardware-level attestation, AES-256 encryption, and zero-traffic monitoring to provide a tamper-proof solution for educational institutions.

## 📖 Table of Contents
- [Core Functions](#core-functions)
- [Zero-Traffic Architecture](#zero-traffic-architecture)
- [Administrative Oversight](#administrative-oversight)
- [Technology Stack](#technology-stack)
- [Security & Integrity](#security--integrity)
- [Installation & Deployment](#installation--deployment)

---

## 🚀 Core Functions

### For Students
- **Smart Monitoring**: Automatic activation based on student-specific timetables.
- **Break Detection**: Non-intrusive AI that pauses monitoring during intervals labeled as "Break".
- **Activity Insight**: Real-time local view of screen time and unlock counts.
- **Attendance Management**: Students can mark themselves "Absent" to disable tracking for the day (noted for admin audit).

### For Administrators
- **Real-Time Oversight**: Dashboard for tracking Online/Offline status and active monitoring sessions.
- **Dynamic Scheduling**: Create and manage weekly class schedules with a custom Timetable Wizard.
- **Evasion Detection**: Instant alerts for students who stop reporting during class or attempt to wipe app data.
- **Batch Reporting**: Generate detailed daily reports including per-class metrics (Unlocks, Screen Time, and Network events).

---

## 🛡️ Zero-Traffic Architecture

To optimize battery life and ensure privacy, CampusCalm implements a **Synchronous Batch-Update** model:

1.  **Local Buffering**: All activity metrics (Screen Time, Unlocks) and event traces are encrypted and stored locally in the phone's secure preferences.
2.  **Zero Live Writes**: No data is sent to Firestore during an active monitoring session, preventing network overhead and potential "live tracking" privacy concerns.
3.  **Final Daily Sync**: Once the last class of the day ends or the session is manually closed, the app performs **one single batch write** containing the entire day's data.

---

## ⚙️ Administrative Oversight (Master Admin)

CampusCalm supports a multi-tier hierarchy:
- **School Admins**: Manage their assigned students and schedules.
- **Master Admin (ADMIN001)**: Overlooks all system administrators, audits their students, and manages global system settings.
- **Storage Management**: Visual warnings when Firebase usage exceeds 50%, with automated tools to purge data older than 7 days.

---

## 🛠️ Technology Stack

### Frameworks & UI
- **React 18 & Vite**: Component-based architecture with ultra-fast builds.
- **Tailwind CSS & Shadcn UI**: Premium, responsive dark-mode themed design.
- **Lucide Icons**: Modern, consistent iconography.

### Mobile & Background
- **Capacitor 8**: Native bridge for Android hardware access.
- **@capawesome Foreground Service**: Ensures monitoring persists on Android 11-15.
- **AES-256 (CryptoJS)**: Military-grade encryption for local data-at-rest.

### Backend (Firebase 12)
- **Firestore**: Real-time NoSQL database with strict path-based security rules.
- **App Check (Play Integrity)**: Ensures only official APKs can communicate with the backend.
- **Cloud Messaging (FCM)**: Real-time push alerts for session starts and report readiness.

---

## 🛠️ Installation & Deployment

1.  **Environment Setup**:
    - **Requirement**: Install **Java 17** (mandatory for modern Gradle compatibility).
    - Install Android Studio and the latest SDK platforms.
    - Run `npm install` to fetch dependencies.

2.  **Firebase Configuration**:
    - Place your `google-services.json` in `android/app/`.
    - Update `firebase.ts` with your web configuration keys.

3.  **Build & Release**:
    - `npm run build`
    - `npx cap sync android`
    - Generate a Signed APK via Android Studio using your production `.jks` file.

---

**Developed as a BCA Final Year Project.**  
*CampusCalm - Empowering Focused Education through Technology.*

