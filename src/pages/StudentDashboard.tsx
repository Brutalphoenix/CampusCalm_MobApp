import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useActivity } from "@/contexts/ActivityContext";
import AppNavbar from "@/components/AppNavbar";
import MonitoringBadge from "@/components/MonitoringBadge";
import StatCard from "@/components/StatCard";
import { Unlock, Clock, Bell, AlertTriangle } from "lucide-react";
import { onCollectionSnapshot, setDocData } from "@/lib/realFirebase";
import { arrayUnion } from "firebase/firestore";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

interface Alert {
  id: string;
  message: string;
  timestamp: unknown; // Use unknown to satisfy ESLint, cast when using
  read: boolean;
}

const StudentDashboard = () => {
  const { profile } = useAuth();
  const { monitoring, activity } = useActivity();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [chartData, setChartData] = useState([
    { day: "Mon", screenTime: 0 },
    { day: "Tue", screenTime: 0 },
    { day: "Wed", screenTime: 0 },
    { day: "Thu", screenTime: 0 },
    { day: "Fri", screenTime: 0 },
  ]);

  useEffect(() => {
    if (!profile) return;

    // Fetch Weekly History
    const fetchHistory = async () => {
      const { collection, query, getDocs } = await import("firebase/firestore");
      const { db } = await import("@/lib/firebase");
      const q = query(collection(db, `users/${profile.uid}/dailyHistory`));
      const snap = await getDocs(q);
      
      const historyMap: Record<string, number> = {};
      snap.forEach(doc => {
        historyMap[doc.id] = doc.data().screenTime || 0;
      });

      const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
      const newData = days.map(day => ({
        day,
        screenTime: historyMap[day] || 0
      }));
      setChartData(newData);
    };

    fetchHistory();

    const alertsUnsub = onCollectionSnapshot("alerts", (snap) => {
      const myAlerts = snap.docs
        .map((d: { id: string; data: () => Record<string, unknown> }) => ({ id: d.id, ...d.data() } as Alert))
        .filter((a: Alert & { studentId?: string }) => a.studentId === profile.uid);
      setAlerts(myAlerts);
    });

    return () => { 
      alertsUnsub();
    };
  }, [profile]);


  return (
    <div className="min-h-screen bg-background">
      <AppNavbar />
      <main className="container px-4 py-6 max-w-2xl mx-auto space-y-6">
        <div className="flex flex-col items-center gap-2 animate-fade-in">
          <MonitoringBadge active={monitoring} />
          <p className="text-xs text-muted-foreground text-center">
            {monitoring ? "Your phone activity is being tracked" : "No active monitoring session"}
          </p>

          {profile?.blocked ? (
            <div className="mt-2 px-4 py-2 bg-destructive/10 text-destructive text-sm rounded-lg font-medium text-center">
              ⚠️ You are marked Absent. Tracking is disabled.
            </div>
          ) : (
            <button 
              onClick={async () => {
                if(window.confirm("Are you sure you want to mark yourself as absent for today? Your admin will see this.")) {
                  await setDocData(`users/${profile?.uid}`, { 
                    blocked: true,
                    absentDates: arrayUnion(new Date().toLocaleDateString())
                  });
                }
              }}
              className="mt-3 px-6 py-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground text-sm rounded-full font-bold shadow-md transition-all active:scale-95"
            >
              I am Absent (Turn off tracking)
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <StatCard title="Screen Time" value={`${activity.screenTime}m`} icon={Clock} variant="primary" />
          <StatCard title="Unlocks" value={activity.unlockCount} icon={Unlock} variant="accent" />
        </div>

        <div className="bg-card rounded-xl p-4 shadow-card animate-fade-in">
          <h3 className="text-sm font-semibold mb-3">Weekly Screen Time (mins)</h3>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 88%)" />
                <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="screenTime" fill="hsl(215, 90%, 42%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card rounded-xl p-4 shadow-card animate-fade-in">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Alerts</h3>
          </div>
          {alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No alerts yet</p>
          ) : (
            <div className="space-y-2">
              {alerts.map((a) => (
                <div key={a.id} className="flex items-start gap-2 p-3 rounded-lg bg-warning/5 border border-warning/10">
                  <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm">{a.message}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {(() => {
                        const ts = a.timestamp as { toDate?: () => Date } | Date | null;
                        if (ts && typeof ts === 'object' && 'toDate' in ts && typeof ts.toDate === 'function') {
                          return ts.toDate().toLocaleString();
                        }
                        if (ts instanceof Date) {
                          return ts.toLocaleString();
                        }
                        return "Just now";
                      })()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="text-center text-xs text-muted-foreground p-3 border border-border rounded-lg">
          <p>🔒 We only monitor screen time & unlock count.</p>
          <p>No access to messages, photos, camera, or personal data.</p>
        </div>
      </main>
    </div>
  );
};

export default StudentDashboard;
