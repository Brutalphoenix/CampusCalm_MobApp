import { onDocSnapshot, setDocData, onCollectionSnapshot } from "./realFirebase";
import { doc, getDoc, collection, getDocs, query, where, writeBatch, Timestamp, deleteDoc } from "firebase/firestore";
import { db } from "./firebase";

export interface StudentReportDetail {
  name: string;
  usn: string;
  screenTime: number;
  unlockCount: number;
}

export interface SystemReport {
  id: string;
  date: string;
  totalStudents: number;
  avgScreenTime: number;
  totalUnlocks: number;
  studentDetails: StudentReportDetail[];
  timestamp: Timestamp;
}

// Free tier limit is often 1GB (1024 MB).
// We'll treat 1GB as 100% and estimate based on document sizes (approx 0.5KB per doc)
export const getEstimatedUsage = async () => {
  try {
    const collections = ["users", "activity", "alerts", "reports", "notifications"];
    const counts = await Promise.all(collections.map(col => getDocs(collection(db, col))));
    const totalDocs = counts.reduce((sum, snap) => sum + snap.size, 0);

    // 1GB = 1,024 MB.
    // Each document is estimated at 1MB (high for demo purposes to show usage)
    const estimatedMB = totalDocs * 1;
    const limitMB = 1 * 1024; // 1GB
    return (estimatedMB / limitMB);
  } catch (error) {
    console.error("Failed to estimate usage:", error);
    return 0;
  }
};

// Deletes all data except essential user profile data (USN, Email, UID)
export const purgeSystemData = async () => {
  try {
    console.log("[AUTOMATION] Usage > 50%. Purging non-essential data...");

    // 1. Delete all documents in non-user collections
    const collectionsToClear = ["activity", "alerts", "reports", "notifications"];

    for (const colName of collectionsToClear) {
      const snap = await getDocs(collection(db, colName));
      const batch = writeBatch(db);
      snap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }

    // 2. We keep the 'users' collection as per requirement (USN, Email, Password/Auth is separate)
    // However, if there was extra non-essential data in 'users' we could clear fields, 
    // but the requirement says 'excluding user data' so we keep that collection intact.

    await setDocData(`notifications/${Date.now()}`, {
      type: "SYSTEM_PURGE",
      message: `System storage exceeded 50%. Non-essential data has been automatically purged.`,
      timestamp: Timestamp.now(),
      read: false
    });

    return true;
  } catch (error) {
    console.error("Purge failed:", error);
    return false;
  }
};

export const generateDailyReport = async (adminId?: string) => {
  if (!adminId) {
    console.error("Cannot generate report without adminId");
    throw new Error("Admin ID is required");
  }
  try {
    const [usersSnap, activitySnap] = await Promise.all([
      getDocs(query(collection(db, "users"), where("role", "==", "student"), where("createdBy", "==", adminId))),
      getDocs(collection(db, "activity"))
    ]);

    const actMap: Record<string, { screenTime?: number; unlockCount?: number; lastActive?: unknown }> = {};
    activitySnap.docs.forEach(d => { actMap[d.id] = d.data(); });

    const studentDetails: StudentReportDetail[] = [];
    let totalScreenTime = 0;
    let totalUnlocks = 0;

    usersSnap.docs.forEach(uDoc => {
      const u = uDoc.data();
      const act = actMap[u.uid] || {};
      const detail = {
        name: u.name,
        usn: u.usn,
        screenTime: act.screenTime || 0,
        unlockCount: act.unlockCount || 0
      };
      studentDetails.push(detail);
      totalScreenTime += detail.screenTime;
      totalUnlocks += detail.unlockCount;
    });

    const report: SystemReport = {
      id: `report-${new Date().toISOString().split('T')[0]}`,
      date: new Date().toLocaleDateString(),
      totalStudents: studentDetails.length,
      avgScreenTime: studentDetails.length ? Math.round(totalScreenTime / studentDetails.length) : 0,
      totalUnlocks,
      studentDetails,
      timestamp: Timestamp.now()
    };

    setDocData(`reports/${report.id}`, report as unknown as Record<string, unknown>).catch(err => console.error("Report save failed:", err));
    return report;
  } catch (error) {
    console.error("Failed to generate report:", error);
    throw error;
  }
};

// Clears ALL monitor data (activity, alerts) after report is sent
export const purgeMonitorData = async () => {
  try {
    const collectionsToClear = ["activity", "alerts"];
    for (const colName of collectionsToClear) {
      const snap = await getDocs(collection(db, colName));
      const batch = writeBatch(db);
      snap.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    }
    return true;
  } catch (error) {
    console.error("Automated purge failed:", error);
    return false;
  }
};
export const cleanupOldData = async (daysToKeep = 7) => {
  try {
    const batch = writeBatch(db);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysToKeep);

    // In this specific system, we mostly want to clear 'alerts' or 'activity' history if it exists
    // For now, we'll clear read alerts older than cutoff
    const alertsSnap = await getDocs(query(collection(db, "alerts"), where("read", "==", true)));
    alertsSnap.docs.forEach(d => {
      const data = d.data();
      const ts = data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp);
      if (ts < cutoff) {
        batch.delete(d.ref);
      }
    });

    await batch.commit();
    return true;
  } catch (error) {
    console.error("Cleanup failed:", error);
    return false;
  }
};

// Generates a plain-text version of the report, properly aligned for email bodies
export const generatePlainTextReport = (report: SystemReport) => {
  let text = `CAMPUSCALM MONITORING REPORT\n`;
  text += `============================\n`;
  text += `Date: ${report.date}\n`;
  text += `Total Students: ${report.totalStudents}\n`;
  text += `Avg Screen Time: ${report.avgScreenTime} mins\n`;
  text += `Total Unlocks: ${report.totalUnlocks}\n\n`;

  text += `STUDENT DETAILS\n`;
  text += `----------------------------\n`;
  text += `${"NAME".padEnd(15)} | ${"USN".padEnd(12)} | ${"TIME".padEnd(6)} | ${"UNLOCKS"}\n`;
  text += `----------------------------\n`;

  report.studentDetails.forEach(s => {
    text += `${s.name.substring(0, 15).padEnd(15)} | ${s.usn.padEnd(12)} | ${s.screenTime.toString().padStart(4)}m | ${s.unlockCount.toString().padStart(7)}\n`;
  });

  text += `----------------------------\n`;
  text += `Generated automatically by CampusCalm Admin Panel.`;

  return text;
};

// Simulated Automated Email Trigger
export const sendReportEmail = async (report: SystemReport, adminEmail: string) => {
  // Now mostly used for logging or if a backend exists.
  // The actual manual sending happens via mailto: in the UI.
  console.log(`[AUTOMATION] Report ready for manual/background sending to ${adminEmail}...`);

  await setDocData(`notifications/${Date.now()}`, {
    type: "REPORT_STATUS",
    message: `Report for ${report.date} is ready. Manual trigger used.`,
    timestamp: Timestamp.now(),
    read: false
  });

  return true;
};
