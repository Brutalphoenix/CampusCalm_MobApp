# CampusCalm - Student Activity Monitoring System

CampusCalm is a comprehensive mobile and web platform designed for educational administrators to monitor and manage student device usage during school hours. It provides real-time visibility into screen time and unlock activity, ensuring a focused learning environment.

## 🚀 Purpose
The primary goal of CampusCalm is to help institutions maintain digital discipline by tracking device interaction during designated monitoring windows and class periods, while providing administrators with automated tools for reporting and maintenance.

## ✨ Key Features

### 👨‍🏫 Administrator Dashboard
- **Real-time Overview**: Live stats for total students, active reporting sessions, average screen time, and total device unlocks.
- **Analytics**: Visual charts for student presence (Online/Offline/Absent) and screen time distribution (powered by Recharts).
- **Student Management**: Create new student accounts, mark students as absent (suspending tracking), and view individual history.
- **Alert System**: Send direct warnings or custom messages to students flagging high-risk activity.

### 📱 Student Monitoring
- **Automatic Tracking**: Real-time heartbeat monitoring for screen time (minutes) and device unlock counts.
- **Presence Status**: Accurate Online/Offline status based on recent activity heartbeats.
- **Background Persistence**: Integrated with Capacitor Foreground Services for persistent tracking on Android.

### 📅 Smart Scheduling & Automation
- **Monitoring Windows**: Global start/end times for school-wide monitoring.
- **Dynamic Timetable**: Subject-specific tracking windows (Mathematics, Physics, etc.) that activate/deactivate monitoring automatically.
- **Manual Overrides**: Instant activation/deactivation for the entire system or individual students.
- **Automated Reporting**: Generates daily system reports and emails them to the administrator.

### 🛠️ System Maintenance
- **Storage Management**: Real-time tracking of Firestore storage usage against a 10GB limit.
- **Auto-Cleanup**: Automated purging of historical data older than 7 days to keep the database slim.
- **Manual Purge**: Tools to clear all monitoring logs after a report has been successfully archived.

## 💻 Tech Stack

- **Frontend**: [React 18](https://reactjs.org/), [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Mobile Foundation**: [Capacitor](https://capacitorjs.com/) (Android Bridge)
- **Database & Auth**: [Firebase](https://firebase.google.com/) (Firestore, Authentication)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Charts**: [Recharts](https://recharts.org/)
- **Notifications**: [Sonner](https://sonner.emilkowal.ski/)

## 🛠️ Local Setup

1. **Clone the repository**:
   ```sh
   git clone <YOUR_GIT_URL>
   cd CampusCalm_MobApp-main
   ```

2. **Install dependencies**:
   ```sh
   npm install
   ```

3. **Start Development Server**:
   ```sh
   npm run dev
   ```

4. **Android Build**:
   ```sh
   npx cap sync
   npx cap open android
   ```

## 📂 Project Architecture

- `src/contexts/`: Global state management for Authentication and Activity heartbeats.
- `src/lib/`: Core logic for Firebase integration (`realFirebase.ts`) and system automation (`automation.ts`).
- `src/pages/`: Main application views including Admin and Student Dashboards.
- `src/components/`: Reusable primitive and composite UI components.
- `android/`: Native Android project configuration and Gradle settings.

---
Built with focus on performance, scalability, and digital wellness.
