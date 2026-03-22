import { useEffect, useState, useRef } from "react";
import AppNavbar from "@/components/AppNavbar";
import StatCard from "@/components/StatCard";
import { Users, Smartphone, Unlock, Clock, Search, Send, AlertTriangle, Settings, Plus, Trash2, Calendar, Power, Phone, Ban, ShieldOff, Database, CheckCircle2, PlusCircle, ChevronLeft, ChevronRight, Edit3 } from "lucide-react";
import { onCollectionSnapshot, onDocSnapshot, setDocData, addDocData, deleteDocData, type TimetableEntry } from "@/lib/realFirebase";
import { generateDailyReport, cleanupOldData, sendReportEmail, getEstimatedUsage, purgeSystemData, purgeMonitorData, generatePlainTextReport } from "@/lib/automation";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

interface StudentData {
  uid: string;
  name: string;
  usn: string;
  phone?: string;
  year?: "1st" | "2nd" | "3rd" | "4th";
  blocked?: boolean;
  absentDates?: string[];
  screenTime: number;
  unlockCount: number;
  lastActive: Date | null;
  online: boolean;
  inClassRoom: boolean;
}

const CHART_COLORS = ["hsl(215, 90%, 42%)", "hsl(174, 62%, 42%)", "hsl(38, 92%, 50%)", "hsl(0, 72%, 51%)"];

const AdminDashboard = () => {
  const { profile, createStudent, createAdmin } = useAuth();
  const [students, setStudents] = useState<StudentData[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline" | "absent">("all");
  const [selectedStudent, setSelectedStudent] = useState<StudentData | null>(null);
  const [alertMsg, setAlertMsg] = useState("");
  const [sendingAlert, setSendingAlert] = useState(false);
  const [tab, setTab] = useState<"overview" | "students" | "schedule" | "system">("overview");

  const [schedActive, setSchedActive] = useState(true);
  const [manualOverride, setManualOverride] = useState(false);
  const [manualOverrideDate, setManualOverrideDate] = useState<string | null>(null);
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardDay, setWizardDay] = useState(0); 
  const [newEntry, setNewEntry] = useState({ day: "Monday", subject: "", startTime: "09:00", endTime: "10:00" });
  const [showAddForm, setShowAddForm] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastRecommendedActive, setLastRecommendedActive] = useState<boolean | null>(null);
  const lastManualActionTime = useRef<number>(0);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000); // Check every 1s
    return () => clearInterval(timer);
  }, []);

  // Create Student states
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newStudentUsn, setNewStudentUsn] = useState("");
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentPhone, setNewStudentPhone] = useState("");
  const [newStudentPassword, setNewStudentPassword] = useState("");
  const [newStudentYear, setNewStudentYear] = useState<"1st" | "2nd" | "3rd" | "4th">("1st");
  const [creatingStudent, setCreatingStudent] = useState(false);

  // Create Admin states (Master Admin only)
  const [showAdminForm, setShowAdminForm] = useState(false);
  const [newAdminUsn, setNewAdminUsn] = useState("");
  const [newAdminName, setNewAdminName] = useState("");
  const [newAdminPhone, setNewAdminPhone] = useState("");
  const [newAdminPassword, setNewAdminPassword] = useState("");
  const [creatingAdmin, setCreatingAdmin] = useState(false);

  // Oversight states (Master Admin only)
  const [allAdmins, setAllAdmins] = useState<any[]>([]);
  const [allStudentsRaw, setAllStudentsRaw] = useState<any[]>([]);
  const [viewAdminStudents, setViewAdminStudents] = useState<string | null>(null);

  // Automation states
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastReportDate, setLastReportDate] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState("admin001@classtime.app");
  const [usage, setUsage] = useState(0.0002); // Default mock for initial render
  const [showCleanupDialog, setShowCleanupDialog] = useState(false);
  const [rawStudentUsers, setRawStudentUsers] = useState<any[]>([]);
  const [actMap, setActMap] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!profile?.uid) return;
    
    let usersUnsub: any;
    let actUnsub: any;
    let schedUnsub: any;

    try {
      usersUnsub = onCollectionSnapshot("users", (snap: { docs: { data: () => unknown; id: string }[] }) => {
        const studentUsers = snap.docs
          .map((d) => d.data() as Record<string, unknown>)
          .filter((u) => u.role === "student" && (profile?.usn === "ADMIN001" || u.createdBy === profile?.uid));

        setRawStudentUsers(studentUsers);

        if (profile?.usn === "ADMIN001") {
          const admins = snap.docs
            .map((d) => d.data() as Record<string, unknown>)
            .filter((u) => u.role === "admin" && u.usn !== "ADMIN001");
          setAllAdmins(admins);
          
          const allStuds = snap.docs
            .map((d) => d.data() as Record<string, unknown>)
            .filter((u) => u.role === "student");
          setAllStudentsRaw(allStuds);
        }
      });

      actUnsub = onCollectionSnapshot("activity", (actSnap: { docs: { data: () => unknown; id: string }[] }) => {
        const mapping: Record<string, any> = {};
        actSnap.docs.forEach((d) => { if (d.id) mapping[d.id] = d.data(); });
        setActMap(mapping);
      });

      schedUnsub = onDocSnapshot(`users/${profile?.uid}/settings/monitoring`, (snap: { exists: () => boolean; data: () => Record<string, unknown> }) => {
        if (snap.exists()) {
          const d = snap.data() as Record<string, unknown>;
          setSchedActive(Boolean(d.active ?? true));
          setManualOverride(Boolean(d.manualOverride ?? false));
          setManualOverrideDate(d.manualOverrideDate ? String(d.manualOverrideDate) : null);
          setTimetable((d.timetable as TimetableEntry[]) || []);
          setLastReportDate(d.lastReportDate ? String(d.lastReportDate) : null);
          setAdminEmail(String(d.adminEmail || "admin001@classtime.app"));
          setLastRecommendedActive(d.lastRecommendedActive !== undefined ? Boolean(d.lastRecommendedActive) : null);
        }
      });
    } catch (e) {
      console.error("Subscription setup error", e);
    }

    return () => { 
      if (typeof usersUnsub === "function") usersUnsub(); 
      if (typeof actUnsub === "function") actUnsub(); 
      if (typeof schedUnsub === "function") schedUnsub(); 
    };
  }, [profile?.uid]);

  // DERIVED: Calculate merged student data
  useEffect(() => {
    try {
      const now = new Date();
      const currentHours = now.getHours();
      const currentMinutes = now.getMinutes();
      const currentTimeInMinutes = currentHours * 60 + currentMinutes;
      const today = now.toLocaleDateString("en-US", { weekday: "long" });

      const activeEntries = (timetable || []).filter((t: TimetableEntry) => {
        if (!t || t.day !== today) return false;
        const [sh, sm] = (t.startTime || "00:00").split(":").map(Number);
        const [eh, em] = (t.endTime || "23:59").split(":").map(Number);
        return currentTimeInMinutes >= (sh * 60 + sm) && currentTimeInMinutes < (eh * 60 + em);
      });

      const hasBreak = activeEntries.some((e: TimetableEntry) => e.subject?.toLowerCase().includes("break"));
      const hasClass = activeEntries.some((e: TimetableEntry) => e.subject && !e.subject.toLowerCase().includes("break"));
      const inClass = hasClass && !hasBreak;

      const merged: StudentData[] = (rawStudentUsers || []).map((u) => {
        const act = (actMap[String(u.uid)] || {}) as Record<string, unknown>;
        let lastActiveDate: Date | null = null;
        const lastActive = act.lastActive as { toDate?: () => Date } | Date | null;

        if (lastActive) {
          if (lastActive instanceof Date) {
            lastActiveDate = lastActive;
          } else if (typeof lastActive === "object" && lastActive !== null && "toDate" in lastActive && typeof (lastActive as Record<string, unknown>).toDate === "function") {
            lastActiveDate = (lastActive as { toDate: () => Date }).toDate();
          } else if (typeof lastActive === "string" || typeof lastActive === "number") {
            lastActiveDate = new Date(lastActive);
          }
        }

        const online = lastActiveDate ? (Date.now() - lastActiveDate.getTime()) < 5 * 60 * 1000 : false;
        return {
          uid: String(u.uid || ""),
          name: String(u.name || ""),
          usn: String(u.usn || ""),
          phone: String(u.phone || ""),
          blocked: Boolean(u.blocked || false),
          absentDates: (u.absentDates as string[]) || [],
          screenTime: Number(act.screenTime || 0),
          unlockCount: Number(act.unlockCount || 0),
          lastActive: lastActiveDate,
          online,
          inClassRoom: inClass && schedActive,
        };
      });
      setStudents(merged);
    } catch (e) {
      console.error("Merged status calculation error", e);
    }
  }, [rawStudentUsers, actMap, timetable, schedActive]);

  // Automation: Run daily check
  useEffect(() => {
    const runDailyAutomation = async () => {
      const currentUsage = await getEstimatedUsage();
      setUsage(currentUsage);
      const today = new Date().toISOString().split('T')[0];
      if (lastReportDate !== today && students.length > 0) {
        console.log("Daily report window reached.");
        if (usage > 0.5) {
          toast.warning("Storage is > 50% full. Please generate a report and clear data manually.");
        }
      }
    };
    runDailyAutomation();
    const automationInterval = setInterval(runDailyAutomation, 30000); // Check every 30s
    return () => clearInterval(automationInterval);
  }, [students.length, lastReportDate, usage]);

  useEffect(() => {
    const checkAutoToggle = async () => {
      // 0. Protection from race condition: Skip if user JUST clicked manual toggle
      if (Date.now() - lastManualActionTime.current < 5000) {
        return;
      }

      if (timetable.length === 0) return;

      const now = new Date();
      const today = now.toLocaleDateString("en-US", { weekday: "long" });
      const todayStr = now.toDateString();
      
      const currentHours = now.getHours();
      const currentMinutes = now.getMinutes();
      const currentTimeInMinutes = currentHours * 60 + currentMinutes;
      const dayClasses = timetable.filter(t => t.day === today);

      const currentClass = dayClasses.find(c => {
        const [sh, sm] = c.startTime.split(":").map(Number);
        const [eh, em] = c.endTime.split(":").map(Number);
        const start = sh * 60 + sm;
        const end = eh * 60 + em;
        return currentTimeInMinutes >= start && currentTimeInMinutes < end;
      });

      const isBreak = currentClass?.subject.toLowerCase().includes("break");
      const recommendedActive = !!currentClass && !isBreak;
      
      let updates: Record<string, any> = {};

      // 1. Reset manual override if it's a new day
      if (manualOverride && manualOverrideDate !== todayStr) {
        console.log("[AUTO-TOGGLE] New day detected. Resetting manual override.");
        updates.manualOverride = false;
        updates.manualOverrideDate = null;
        updates.active = recommendedActive;
      } else if (!manualOverride) {
        // 2. Only auto-toggle if NO manual override is active for today
        if (schedActive !== recommendedActive) {
          console.log("[AUTO-TOGGLE] Following schedule (Break status:", isBreak, ")");
          updates.active = recommendedActive;
        }
      }

      if (Object.keys(updates).length > 0 && profile?.uid) {
        await setDocData(`adminSettings/${profile.uid}/monitoring`, updates);
      }
    };

    const interval = setInterval(checkAutoToggle, 5000);
    checkAutoToggle();
    return () => clearInterval(interval);
  }, [timetable, schedActive, manualOverride, lastRecommendedActive, manualOverrideDate]);


  const handleConfirmCleanup = async () => {
    setShowCleanupDialog(false);
    setIsProcessing(true);
    try {
      await purgeMonitorData();
      const today = new Date().toISOString().split('T')[0];
      await setDocData(`users/${profile?.uid}/settings/monitoring`, { lastReportDate: today });
      toast.success("Monitoring data cleared successfully");
      const currentUsage = await getEstimatedUsage();
      setUsage(currentUsage);
    } catch {
      toast.error("Failed to clear data");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleManualReport = async () => {
    setIsProcessing(true);
    try {
      const report = await generateDailyReport(profile?.uid);
      const plainText = generatePlainTextReport(report);

      const subject = encodeURIComponent(`CampusCalm Daily Report - ${report.date}`);
      const body = encodeURIComponent(plainText);
      const mailtoUrl = `mailto:${adminEmail}?subject=${subject}&body=${body}`;

      window.location.href = mailtoUrl;
      setIsProcessing(false);
      setShowCleanupDialog(true);

    } catch (err) {
      console.error("Report generation failed:", err);
      toast.error("Failed to generate report");
      setIsProcessing(false);
    }
  };

  const saveAdminEmail = async () => {
    if (!adminEmail.includes("@")) {
      toast.error("Please enter a valid email");
      return;
    }
    setIsProcessing(true);
    try {
      if (profile?.uid) await setDocData(`adminSettings/${profile.uid}/monitoring`, { adminEmail });
      toast.success("Administrator email saved");
    } catch {
      toast.error("Failed to save email");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCleanup = async () => {
    if (!window.confirm("Clean up data older than 7 days? This helps maintain 1GB limit.")) return;
    setIsProcessing(true);
    const success = await cleanupOldData(7);
    setIsProcessing(false);
    if (success) toast.success("Old data cleaned up successfully");
    else toast.error("Cleanup failed");
  };

  const filteredStudents = students.filter((s) => {
    const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.usn.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" ||
      (statusFilter === "online" ? s.online && !s.blocked :
        statusFilter === "offline" ? !s.online && !s.blocked :
          statusFilter === "absent" ? s.blocked : false);
    return matchesSearch && matchesStatus;
  }).sort((a, b) => {
    const yearOrder = { "1st": 1, "2nd": 2, "3rd": 3, "4th": 4 };
    const aYear = a.year || "1st";
    const bYear = b.year || "1st";
    if (aYear !== bYear) return yearOrder[aYear] - yearOrder[bYear];
    return a.name.localeCompare(b.name);
  });

  const totalScreen = students.reduce((a, b) => a + b.screenTime, 0);
  const totalUnlocks = students.reduce((a, b) => a + b.unlockCount, 0);
  const avgScreen = students.length ? Math.round(totalScreen / students.length) : 0;
  const activeStudents = students.filter((s) => s.online).length;

  const pieData = [
    { name: "Active", value: activeStudents },
    { name: "Inactive", value: students.length - activeStudents },
  ];

  const barData = filteredStudents.slice(0, 8).map((s) => ({
    name: s.usn.slice(-4),
    screenTime: s.screenTime,
  }));

  const sendAlert = async () => {
    if (!selectedStudent || !alertMsg.trim()) {
      toast.error("Select a student and type a message");
      return;
    }
    setSendingAlert(true);
    try {
      await addDocData("alerts", {
        studentId: selectedStudent.uid,
        studentName: selectedStudent.name,
        message: alertMsg.trim(),
        read: false,
      });
      toast.success(`Alert sent to ${selectedStudent.name}`);
      setAlertMsg("");
    } catch {
      toast.error("Failed to send alert");
    } finally {
      setSendingAlert(false);
    }
  };

  const blockStudent = async (student: StudentData) => {
    const newBlocked = !student.blocked;
    await setDocData(`users/${student.uid}`, {
      uid: student.uid,
      name: student.name,
      usn: student.usn,
      phone: student.phone,
      role: "student" as const,
      email: `${student.usn.toLowerCase().replace(/[^a-z0-9]/g, "")}@classtime.app`,
      blocked: newBlocked,
    });
    toast.success(newBlocked ? `${student.name} marked Absent (Tracking disabled)` : `${student.name} marked Present (Tracking enabled)`);
    if (selectedStudent?.uid === student.uid) {
      setSelectedStudent({ ...student, blocked: newBlocked });
    }
  };

  const deleteStudent = async (student: StudentData) => {
    if (!window.confirm(`Are you sure you want to permanently delete ${student.name} (${student.usn})? This cannot be undone.`)) return;
    await deleteDocData(`users/${student.uid}`);
    toast.success(`${student.name} has been deleted`);
    if (selectedStudent?.uid === student.uid) {
      setSelectedStudent(null);
    }
  };

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentUsn || !newStudentName || !newStudentPhone || !newStudentPassword) {
      toast.error("Please fill all fields");
      return;
    }

    setCreatingStudent(true);
    try {
      await createStudent(newStudentUsn, newStudentName, newStudentPhone, newStudentPassword, newStudentYear);
      toast.success("Student account created successfully");
      setShowCreateForm(false);
      setNewStudentName("");
      setNewStudentUsn("");
      setNewStudentPhone("");
      setNewStudentPassword("");
    } catch (error: any) {
      toast.error(error.message || "Failed to create student");
    } finally {
      setCreatingStudent(false);
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminUsn || !newAdminName || !newAdminPhone || !newAdminPassword) {
      toast.error("Please fill all fields");
      return;
    }

    setCreatingAdmin(true);
    try {
      await createAdmin(newAdminUsn, newAdminName, newAdminPhone, newAdminPassword);
      toast.success("Administrator account created successfully");
      setShowAdminForm(false);
      setNewAdminName("");
      setNewAdminUsn("");
      setNewAdminPhone("");
      setNewAdminPassword("");
    } catch (error: any) {
      toast.error(error.message || "Failed to create admin");
    } finally {
      setCreatingAdmin(false);
    }
  };
  const saveSchedule = async () => {
    try {
      await setDocData(`users/${profile?.uid}/settings/monitoring`, {
        timetable,
        manualOverride: false, // Resume auto-schedule immediately when saved
        manualOverrideDate: null,
      });
      setIsWizardOpen(false);
      toast.success("Weekly schedule saved and activated!");
    } catch (err: any) {
      console.error("Save schedule error:", err);
      toast.error(`Failed to save schedule: ${err.message || 'Check permissions'}`);
    }
  };

  const toggleAppActive = async () => {
    lastManualActionTime.current = Date.now();
    const newActive = !schedActive;
    try {
      await setDocData(`users/${profile?.uid}/settings/monitoring`, {
        active: newActive,
        manualOverride: true,
        manualOverrideDate: new Date().toDateString(),
      });
      toast.success(newActive ? "App activated manually! Schedule resumes at next transition." : "App deactivated manually! Schedule resumes at next transition.");
    } catch (err: any) {
      console.error("Toggle update error:", err);
      toast.error(`Failed to update: ${err.message || 'Check permissions'}`);
    }
  };

  const addTimetableEntry = async () => {
    lastManualActionTime.current = Date.now();
    try {
      const entry: TimetableEntry = {
        id: `t-${Date.now()}`,
        ...newEntry,
        day: DAYS[wizardDay],
        subject: newEntry.subject.trim(),
      };
      const updated = [...timetable, entry];
      setTimetable(updated);
      await setDocData(`users/${profile?.uid}/settings/monitoring`, {
        timetable: updated,
      });
      setNewEntry({ day: "Monday", subject: "", startTime: "09:00", endTime: "10:00" });
      setShowAddForm(false);
      toast.success("Class added to timetable");
    } catch (err: any) {
      console.error("Add entry error:", err);
      toast.error(`Failed to add: ${err.message || 'Check permissions'}`);
    }
  };

  const removeTimetableEntry = async (id: string) => {
    lastManualActionTime.current = Date.now();
    const updated = timetable.filter((t) => t.id !== id);
    setTimetable(updated);
    await setDocData(`adminSettings/${profile?.uid}/monitoring`, {
      timetable: updated,
    });
    toast.success("Class removed");
  };

  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  const formatAMPM = (time24: string) => {
    const [hours, minutes] = time24.split(':').map(Number);
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h12 = hours % 12 || 12;
    return `${h12}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  const tabs = [
    { key: "overview" as const, label: "Overview", icon: Settings },
    { key: "students" as const, label: "Students", icon: Users },
    { key: "schedule" as const, label: "Schedule", icon: Clock },
    { key: "system" as const, label: "System", icon: Database },
  ];

  return (
    <div className="min-h-screen bg-background">
      <AppNavbar />

      <div className="border-b border-border bg-card sticky top-14 z-40">
        <div className="container flex gap-0 max-w-4xl mx-auto px-4">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <main className="container px-4 py-6 max-w-4xl mx-auto space-y-6">
        {tab === "overview" && (
          <div className="space-y-6">
            {usage > 0.5 && (
              <Alert variant="destructive" className="mb-6 border-destructive/50 bg-destructive/5 animate-fade-in">
                <AlertTriangle className="h-5 w-5" />
                <div>
                  <AlertTitle className="font-bold">Storage Limit Warning ({Math.round(usage * 100)}%)</AlertTitle>
                  <AlertDescription className="text-sm">
                    Firebase storage is nearly half full. Please <b>generate a report</b> and clear data manually to prevent system suspension.
                  </AlertDescription>
                </div>
              </Alert>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard title="Students" value={students.length} icon={Users} variant="primary" />
              <StatCard title="Active" value={activeStudents} icon={Smartphone} variant="accent" />
              <StatCard title="Avg Screen" value={`${avgScreen}m`} icon={Clock} />
              <StatCard title="Total Unlocks" value={totalUnlocks} icon={Unlock} variant="warning" />
            </div>

            {profile?.usn === "ADMIN001" && (
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 shadow-sm animate-fade-in">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <PlusCircle className="h-5 w-5 text-primary" />
                    <h3 className="font-bold text-primary">Master Admin: Account Management</h3>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setShowAdminForm(!showAdminForm)}>
                    {showAdminForm ? "Cancel" : "Create New Administrator"}
                  </Button>
                </div>

                {showAdminForm && (
                  <form onSubmit={handleCreateAdmin} className="space-y-4 bg-card p-4 rounded-lg border border-border animate-in slide-in-from-top-2">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="admin-usn">Admin ID / USN</Label>
                        <Input id="admin-usn" placeholder="e.g. ADMIN002" value={newAdminUsn} onChange={(e) => setNewAdminUsn(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="admin-name">Full Name</Label>
                        <Input id="admin-name" placeholder="e.g. John Doe" value={newAdminName} onChange={(e) => setNewAdminName(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="admin-phone">Phone Number</Label>
                        <Input id="admin-phone" placeholder="e.g. 9876543210" value={newAdminPhone} onChange={(e) => setNewAdminPhone(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="admin-pass">Login Password</Label>
                        <Input id="admin-pass" type="password" placeholder="••••••••" value={newAdminPassword} onChange={(e) => setNewAdminPassword(e.target.value)} />
                      </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={creatingAdmin}>
                      {creatingAdmin ? "Creating..." : "Confirm & Create Administrator"}
                    </Button>
                  </form>
                )}
              </div>
            )}

            {profile?.usn === "ADMIN001" && (
              <div className="bg-card rounded-xl p-4 shadow-card animate-fade-in border border-border">
                <div className="flex items-center gap-2 mb-4">
                  <Database className="h-5 w-5 text-primary" />
                  <h3 className="font-bold text-sm">System Administrators Oversight</h3>
                </div>
                
                <div className="grid gap-3">
                  {allAdmins.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4 italic">No other administrators found</p>
                  ) : (
                    allAdmins.map((admin) => (
                      <div key={admin.uid} className="space-y-3">
                        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-xs">
                              AD
                            </div>
                            <div>
                              <p className="text-sm font-bold">{admin.name}</p>
                              <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-tighter">{admin.usn} • {admin.phone || "No phone"}</p>
                            </div>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-xs h-8 gap-1.5"
                            onClick={() => setViewAdminStudents(viewAdminStudents === admin.uid ? null : admin.uid)}
                          >
                            <Users className="h-3.5 w-3.5" />
                            {viewAdminStudents === admin.uid ? "Hide Students" : "View Students"}
                          </Button>
                        </div>
                        
                        {viewAdminStudents === admin.uid && (
                          <div className="pl-6 space-y-2 border-l-2 border-primary/20 animate-in slide-in-from-left-2 duration-200">
                            <p className="text-[10px] font-bold uppercase text-primary/60 tracking-widest pl-2">Connected Students</p>
                            {allStudentsRaw.filter(s => s.createdBy === admin.uid).length === 0 ? (
                              <p className="text-xs text-muted-foreground pl-2 italic">No students connected to this admin</p>
                            ) : (
                              allStudentsRaw.filter(s => s.createdBy === admin.uid).map(s => (
                                <div key={s.uid} className="flex items-center justify-between p-2.5 rounded-md bg-card border border-border/40 text-xs">
                                  <span className="font-medium">{s.name}</span>
                                  <span className="text-muted-foreground font-mono">{s.usn}</span>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-card rounded-xl p-4 shadow-card animate-fade-in border border-border">
                <h3 className="text-sm font-semibold mb-3 text-foreground/80">Report Status</h3>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10">
                  <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Daily Automation Active</p>
                    <p className="text-xs text-muted-foreground">Last report: {lastReportDate || "Pending..."}</p>
                  </div>
                </div>
              </div>

              <div className="bg-card rounded-xl p-4 shadow-card animate-fade-in border border-border">
                <h3 className="text-sm font-semibold mb-3">Student Presence</h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                        {pieData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-xl p-4 shadow-card animate-fade-in border border-border">
              <h3 className="text-sm font-semibold mb-3">Screen Time by Student</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 88%)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="screenTime" fill="hsl(215, 90%, 42%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="bg-card rounded-xl p-4 shadow-card animate-fade-in border border-border">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <h3 className="text-sm font-semibold">Inactive / Tamper Alerts</h3>
              </div>
              {students.filter((s) => !s.online).length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-3">All students reporting normally</p>
              ) : (
                <div className="space-y-2">
                  {students.filter((s) => !s.online).map((s) => (
                    <div key={s.uid} className="flex items-center justify-between p-3 rounded-lg bg-destructive/5 border border-destructive/10">
                      <div>
                        <p className="text-sm font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.usn} • Stopped reporting</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive border-destructive/30"
                        onClick={() => { setSelectedStudent(s); setTab("students"); }}
                      >
                        View
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "students" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name or USN..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-10"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => setShowCreateForm(!showCreateForm)}
                  className="gradient-accent text-accent-foreground h-10 gap-2 shrink-0"
                >
                  <Plus className="h-4 w-4" />
                  Create Student
                </Button>
                <div className="flex bg-muted rounded-lg p-1 h-10 w-fit shrink-0 border border-border">
                  {(["all", "online", "offline", "absent"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setStatusFilter(f)}
                      className={`px-4 text-xs font-medium rounded-md capitalize transition-all ${statusFilter === f
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted-foreground/5"
                        }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {showCreateForm && (
              <div className="bg-card rounded-xl p-6 shadow-card animate-fade-in border-2 border-primary/20 space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Plus className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-bold">Create New Student Account</h3>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="newName">Full Name</Label>
                    <Input
                      id="newName"
                      placeholder="e.g. John Doe"
                      value={newStudentName}
                      onChange={(e) => setNewStudentName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="newUsn">USN (University Seat Number)</Label>
                    <Input
                      id="newUsn"
                      placeholder="e.g. 1BM21CS001"
                      value={newStudentUsn}
                      onChange={(e) => setNewStudentUsn(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="newPhone">Phone Number (Optional)</Label>
                    <Input
                      id="newPhone"
                      placeholder="e.g. 9876543210"
                      value={newStudentPhone}
                      onChange={(e) => setNewStudentPhone(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="newPass">Account Password</Label>
                    <Input
                      id="newPass"
                      type="password"
                      placeholder="Min 6 characters"
                      value={newStudentPassword}
                      onChange={(e) => setNewStudentPassword(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Course Year</Label>
                    <div className="flex bg-muted rounded-lg p-1 w-full sm:w-fit border border-border">
                      {(["1st", "2nd", "3rd", "4th"] as const).map((y) => (
                        <button
                          key={y}
                          type="button"
                          onClick={() => setNewStudentYear(y)}
                          className={`flex-1 sm:flex-none px-4 py-1.5 text-[10px] font-black uppercase tracking-tighter rounded-md transition-all ${newStudentYear === y
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted-foreground/5"
                            }`}
                        >
                          {y} Year
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={handleCreateStudent}
                    disabled={creatingStudent}
                    className="flex-1 gradient-primary text-primary-foreground h-11"
                  >
                    {creatingStudent ? "Creating Account..." : "Create Student Account"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowCreateForm(false)}
                    className="h-11 px-6"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            <div className="bg-card rounded-xl shadow-card overflow-hidden border border-border">
              <div className="hidden sm:grid grid-cols-8 gap-2 px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border bg-muted/30">
                <span>Name</span><span>Year</span><span>USN</span><span>Phone</span><span>Screen Time</span><span>Unlocks</span><span>Status</span><span>Actions</span>
              </div>
              <div className="divide-y divide-border">
                {filteredStudents.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No students found</p>
                ) : (
                  filteredStudents.map((s) => (
                    <div
                      key={s.uid}
                      className={`w-full grid grid-cols-2 sm:grid-cols-8 gap-1 sm:gap-2 px-4 py-3 hover:bg-muted/50 transition-colors ${selectedStudent?.uid === s.uid ? "bg-primary/5" : ""
                        } ${s.blocked ? "opacity-60" : ""}`}
                    >
                      <button onClick={() => setSelectedStudent(s)} className="text-left col-span-2 sm:col-span-1">
                        <span className="font-medium text-sm block truncate">{s.name}</span>
                        {s.blocked && <span className="text-[10px] text-warning font-bold">(ABSENT)</span>}
                      </button>
                      <span className="flex items-center">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                          {s.year || "1st"}
                        </span>
                      </span>
                      <button onClick={() => setSelectedStudent(s)} className="text-left">
                        <span className="text-xs text-muted-foreground font-mono">{s.usn}</span>
                      </button>
                      <span className="text-sm text-muted-foreground">
                        {s.phone ? (
                          <a href={`tel:${s.phone}`} className="inline-flex items-center gap-1 text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
                            <Phone className="h-3 w-3" />{s.phone}
                          </a>
                        ) : "—"}
                      </span>
                      <span className="text-sm font-medium">{s.screenTime}m</span>
                      <span className="text-sm font-medium">{s.unlockCount}</span>
                      <span>
                        {s.blocked ? (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-warning/10 text-warning font-bold uppercase tracking-tighter">
                            Absent
                          </span>
                        ) : !schedActive ? (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-bold uppercase tracking-tighter border border-border">
                            Disabled
                          </span>
                        ) : !s.inClassRoom ? (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-accent/20 text-accent-foreground font-bold uppercase tracking-tighter">
                            <span className="h-1 w-1 rounded-full bg-accent animate-pulse" />
                            Break
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter ${s.online ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive border border-destructive/20"
                            }`}>
                            <span className={`h-1 w-1 rounded-full ${s.online ? "bg-success animate-pulse" : "bg-destructive"}`} />
                            {s.online ? "Monitoring" : "Offline"}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedStudent(s); }}
                          title="View Actions"
                          className="p-1.5 rounded-md bg-secondary/10 text-secondary hover:bg-secondary/20 transition-colors"
                        >
                          <Settings className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); blockStudent(s); }}
                          title={s.blocked ? "Mark Present" : "Mark Absent"}
                          className={`p-1.5 rounded-md transition-colors ${s.blocked ? "bg-success/10 text-success hover:bg-success/20" : "bg-warning/10 text-warning hover:bg-warning/20"}`}
                        >
                          {s.blocked ? <ShieldOff className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteStudent(s); }}
                          title="Delete student"
                          className="p-1.5 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {selectedStudent && (
              <div className="bg-card rounded-xl p-5 shadow-card animate-fade-in border-2 border-primary/20 space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold">{selectedStudent.name}</h3>
                    <p className="text-xs text-muted-foreground">{selectedStudent.usn} • {selectedStudent.phone || "No phone"}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedStudent(null)} className="h-8 w-8 p-0">
                    <Trash2 className="h-4 w-4" /> {/* Close icon would be better but Trash works for now */}
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-muted/30 rounded-lg border border-border">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Absence History</p>
                    {selectedStudent.absentDates && selectedStudent.absentDates.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {selectedStudent.absentDates.map((date, idx) => (
                          <span key={idx} className="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded font-bold">{date}</span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] italic text-muted-foreground">No absences recorded</p>
                    )}
                  </div>
                  <div className="p-3 bg-muted/30 rounded-lg border border-border">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Stats Today</p>
                    <p className="text-sm font-bold">{selectedStudent.screenTime}m Screen • {selectedStudent.unlockCount} Unlocks</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-sm font-bold flex items-center gap-2">
                    <Send className="h-4 w-4 text-primary" /> Send Custom Alert
                  </h4>
                  <div className="flex gap-2">
                    <Input placeholder="Type message..." value={alertMsg} onChange={(e) => setAlertMsg(e.target.value)} className="h-10" />
                    <Button onClick={sendAlert} disabled={sendingAlert} className="gradient-primary h-10 px-4">
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {["Phone usage detected.", "Stay focused on class.", "Put away devices."].map((msg) => (
                      <button key={msg} onClick={() => setAlertMsg(msg)} className="text-[10px] px-2 py-1 rounded bg-muted hover:bg-muted/70 text-muted-foreground transition-all">
                        {msg}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "schedule" && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className={`rounded-xl p-5 shadow-card animate-fade-in border-2 ${schedActive ? "bg-success/5 border-success/20" : "bg-destructive/5 border-destructive/20"}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-lg ${schedActive ? "bg-success/10" : "bg-destructive/10"}`}>
                    <Power className={`h-5 w-5 ${schedActive ? "text-success" : "text-destructive"}`} />
                  </div>
                  <div>
                    <h3 className="font-semibold">Monitoring App</h3>
                    {(() => {
                      const now = currentTime;
                      const hours = now.getHours();
                      const mins = now.getMinutes();
                      const timeInMins = hours * 60 + mins;
                      const today = now.toLocaleDateString("en-US", { weekday: "long" });

                      const activeEntries = timetable.filter(t => {
                        if (t.day !== today) return false;
                        const [sh, sm] = t.startTime.split(":").map(Number);
                        const [eh, em] = t.endTime.split(":").map(Number);
                        // Changed <= to < for precision
                        return timeInMins >= (sh * 60 + sm) && timeInMins < (eh * 60 + em);
                      });

                      const isBreakNow = activeEntries.some(e => e.subject.toLowerCase().includes("break"));
                      const isClassNow = activeEntries.some(e => !e.subject.toLowerCase().includes("break"));
                      const isMonitoringNow = isClassNow && !isBreakNow;

                      return (
                        <div className="flex flex-col">
                          <p className="text-[10px] font-bold uppercase tracking-wider">
                            {!schedActive ? (
                              <span className="text-destructive">System Inactive</span>
                            ) : isBreakNow ? (
                              <span className="text-blue-500 animate-pulse">● Currently on Break</span>
                            ) : isMonitoringNow ? (
                              <span className="text-success animate-pulse">● Monitoring Active</span>
                            ) : (
                              <span className="text-warning">● No Classes Scheduled</span>
                            )}
                          </p>
                          <p className="text-[9px] text-muted-foreground mt-0.5">
                            {schedActive ? "Tracking students" : "Monitoring disabled"}
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                </div>
                <button
                  onClick={toggleAppActive}
                  className={`relative w-14 h-7 rounded-full transition-colors ${schedActive ? "bg-success" : "bg-muted-foreground/30"}`}
                >
                  <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-card shadow transition-transform ${schedActive ? "left-7" : "left-0.5"}`} />
                </button>
              </div>
              {manualOverride && (
                <div className="mt-3 text-[10px] font-bold uppercase tracking-wider bg-warning/10 text-warning rounded-lg p-2.5 flex items-center gap-2 border border-warning/20">
                  <AlertTriangle className="h-4 w-4" />
                  Manual Override Active &bull; Resumes Auto Weekly Schedule Tomorrow
                </div>
              )}
            </div>

            {(!isWizardOpen && timetable.length > 0) ? (
              <div className="bg-card rounded-xl border border-border p-6 shadow-sm animate-fade-in space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-success animate-pulse" />
                      <h3 className="font-bold text-lg">Weekly Schedule Active</h3>
                    </div>
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                       <Clock className="h-3.5 w-3.5" /> {timetable.length} classes scheduled throughout the week
                    </p>
                  </div>
                  <Button 
                    onClick={() => setIsWizardOpen(true)}
                    className="w-full sm:w-auto gap-2 h-11 px-6 gradient-primary shadow-lg"
                  >
                    <Edit3 className="h-4 w-4" /> Edit Weekly Classes
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                  {DAYS.map(day => {
                    const dayClasses = timetable.filter(t => t.day === day);
                    if (dayClasses.length === 0) return null;
                    return (
                      <div key={day} className="p-3 rounded-xl bg-primary/5 border border-primary/10">
                        <p className="text-xs font-bold text-primary mb-1 uppercase tracking-wider">{day}</p>
                        <p className="text-[10px] text-muted-foreground">{dayClasses.length} {dayClasses.length === 1 ? 'class' : 'classes'}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-card rounded-xl border border-border p-5 shadow-sm animate-fade-in space-y-5">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl gradient-primary text-primary-foreground flex items-center justify-center font-bold shadow-md">
                      {wizardDay + 1}
                    </div>
                    <div>
                      <h3 className="font-bold text-lg leading-none">Setup {DAYS[wizardDay]}</h3>
                      <p className="text-[11px] text-muted-foreground mt-1 uppercase tracking-wider font-semibold">Step {wizardDay + 1} of 7</p>
                    </div>
                  </div>
                  <div className="hidden sm:flex gap-1.5">
                    {DAYS.map((_, idx) => (
                      <div
                        key={idx}
                        className={`h-2 w-6 rounded-full transition-all duration-300 ${idx === wizardDay ? "bg-primary w-10" : idx < wizardDay ? "bg-primary/40" : "bg-muted"
                          }`}
                      />
                    ))}
                  </div>
                </div>

                <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-4">
                  <h4 className="text-sm font-semibold flex items-center gap-2 text-primary">
                    <PlusCircle className="h-4 w-4" /> Add Class
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      placeholder="Subject Name"
                      value={newEntry.subject}
                      onChange={(e) => setNewEntry({ ...newEntry, subject: e.target.value })}
                      className="h-10"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <p className="text-[10px] text-primary font-bold px-1">{formatAMPM(newEntry.startTime)}</p>
                        <Input type="time" value={newEntry.startTime} onChange={(e) => setNewEntry({ ...newEntry, startTime: e.target.value })} className="h-10 border-primary/20 bg-background" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] text-primary font-bold px-1">{formatAMPM(newEntry.endTime)}</p>
                        <Input type="time" value={newEntry.endTime} onChange={(e) => setNewEntry({ ...newEntry, endTime: e.target.value })} className="h-10 border-primary/20 bg-background" />
                      </div>
                    </div>
                  </div>
                  <Button onClick={addTimetableEntry} className="w-full h-10 gradient-primary text-primary-foreground font-semibold">
                    Add to {DAYS[wizardDay]}
                  </Button>
                </div>

                <div className="space-y-2">
                  <h4 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground pb-1 border-b">Schedule for {DAYS[wizardDay]}</h4>
                  {timetable.filter(t => t.day === DAYS[wizardDay]).length === 0 ? (
                    <p className="text-xs text-muted-foreground py-6 text-center border-2 border-dashed rounded-xl">No classes scheduled yet.</p>
                  ) : (
                    <div className="grid gap-2">
                      {timetable.filter(t => t.day === DAYS[wizardDay]).sort((a, b) => a.startTime.localeCompare(b.startTime)).map((entry) => (
                        <div key={entry.id} className="flex items-center justify-between p-3 rounded-lg border bg-card shadow-sm hover:border-primary/30 transition-all">
                          <div>
                            <p className="text-sm font-bold">{entry.subject}</p>
                            <p className="text-[11px] text-muted-foreground">{formatAMPM(entry.startTime)} – {formatAMPM(entry.endTime)}</p>
                          </div>
                          <button onClick={() => removeTimetableEntry(entry.id)} className="p-2 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-3 pt-4 border-t">
                  {wizardDay > 0 && (
                    <Button variant="ghost" onClick={() => setWizardDay(wizardDay - 1)} className="flex-1 h-12 text-muted-foreground">
                      <ChevronLeft className="h-4 w-4 mr-1" /> Back
                    </Button>
                  )}
                  {wizardDay < 6 ? (
                    <Button
                      onClick={() => setWizardDay(wizardDay + 1)}
                      className="flex-[2] h-12 gradient-accent text-accent-foreground font-bold shadow-md rounded-xl"
                    >
                      Set for {DAYS[wizardDay]} & Next <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  ) : (
                    <Button
                      onClick={saveSchedule}
                      className="flex-[2] h-12 gradient-primary text-primary-foreground font-bold shadow-xl animate-pulse-subtle rounded-xl"
                    >
                      <CheckCircle2 className="h-5 w-5 mr-2" /> Keep as Weekly Schedule
                    </Button>
                  )}
                </div>
              </div>
            )}

            <div className="bg-card rounded-xl p-5 shadow-card border border-border">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" /> Full Week Preview
              </h3>
              <div className="grid grid-cols-7 gap-1">
                {DAYS.map((day) => {
                  const isToday = day === new Date().toLocaleDateString("en-US", { weekday: "long" });
                  const hasClasses = timetable.some(t => t.day === day);
                  return (
                    <div 
                      key={day} 
                      className={`p-1.5 rounded-md border text-center transition-all duration-300 ${
                        isToday 
                          ? "border-primary bg-primary/10 ring-2 ring-primary/20 scale-105 z-10" 
                          : hasClasses 
                            ? "bg-primary/5 border-primary/20" 
                            : "bg-muted/10 border-border"
                      }`}
                    >
                      <p className={`text-[9px] font-bold uppercase ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                        {day.substring(0, 3)}
                      </p>
                      <div className={`mt-1 h-1.5 w-1.5 rounded-full mx-auto ${
                        isToday 
                          ? "bg-primary animate-pulse" 
                          : hasClasses 
                            ? "bg-primary/60" 
                            : "bg-muted-foreground/20"
                      }`} />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {tab === "system" && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-card rounded-xl p-6 shadow-card border border-border space-y-6">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-primary/10">
                  <Database className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">Maintenance & Storage</h3>
                  <p className="text-sm text-muted-foreground">Manage your 1GB database limit</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 space-y-3">
                  <Label className="text-xs font-bold uppercase tracking-wider text-primary">Automated Report Destination</Label>
                  <div className="flex gap-2">
                    <Input value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} className="bg-background" />
                    <Button onClick={saveAdminEmail} disabled={isProcessing} className="gradient-primary px-6">
                      {isProcessing ? "..." : "Save"}
                    </Button>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-muted/30 border border-border">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold">Storage Usage</span>
                    <span className="text-xs font-bold">{(usage * 100).toFixed(2)}% of 1GB</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.min(100, usage * 100)}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Button onClick={handleManualReport} disabled={isProcessing} className="h-11 gradient-primary text-primary-foreground font-bold">
                    Generate Report & Mail
                  </Button>
                  <Button variant="outline" onClick={() => setShowCleanupDialog(true)} disabled={isProcessing} className="h-11 border-destructive text-destructive hover:bg-destructive/5 font-bold">
                    Clear Data Manually
                  </Button>
                </div>
              </div>
            </div>

            <div className="bg-primary/5 rounded-xl p-5 border border-primary/10">
              <h4 className="text-sm font-bold mb-3">System Policies</h4>
              <ul className="space-y-2 text-[11px] text-muted-foreground">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-success" /> Auto-purges older than 7 days.</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-success" /> Reports sent at end of class day.</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-3 w-3 text-success" /> Encryption active for all monitor data.</li>
              </ul>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminDashboard;
