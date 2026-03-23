import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, Activity, RefreshCcw, Database, AlertCircle, Share2, ArrowLeft } from "lucide-react";
import { APP_VERSION } from "@/lib/utils";
import { getStoredErrors } from "@/lib/errorLogger";
import { Preferences } from "@capacitor/preferences";
import { ForegroundService } from "@capawesome-team/capacitor-android-foreground-service";
import { exportLogs } from "@/lib/monitoringService";
import { toast } from "sonner";

const DebugScreen = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    fgsRunning: false,
    lastSync: "Never",
    logCount: 0,
    errorCount: 0,
    batteryOpt: "Unknown"
  });

  const refreshStats = async () => {
    try {
      const { value: isActive } = await Preferences.get({ key: 'fgs_active' });
      const { value: lastSyncTS } = await Preferences.get({ key: 'last_update_ts' });
      const { value: encryptedLogs } = await Preferences.get({ key: 'screen_unlock_logs' });
      const errors = await getStoredErrors();
      
      let count = 0;
      if (encryptedLogs) {
        try {
          count = Buffer.from(encryptedLogs, 'base64').length > 0 ? 1 : 0; // Placeholder for encrypted size info
        } catch(e) { count = encryptedLogs.length > 10 ? Math.floor(encryptedLogs.length / 100) : 0; }
      }

      setStats({
        fgsRunning: isActive === 'true',
        lastSync: lastSyncTS ? new Date(parseInt(lastSyncTS)).toLocaleTimeString() : "Never",
        logCount: count,
        errorCount: errors.length,
        batteryOpt: "Optimized (Check Settings)"
      });
    } catch (e) {
      console.error("[Debug] Failed to refresh stats:", e);
    }
  };

  useEffect(() => {
    refreshStats();
    const interval = setInterval(refreshStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleExport = async () => {
    toast.promise(exportLogs(), {
      loading: 'Packaging system logs...',
      success: 'Logs exported successfully',
      error: 'Export failed'
    });
  };

  return (
    <div className="min-h-screen bg-background p-4 space-y-4">
      <div className="flex items-center space-x-2 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" /> Admin Debug
          </h1>
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{APP_VERSION}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Card className={stats.fgsRunning ? "border-green-500/20 bg-green-500/5 text-green-700" : "border-red-500/20 bg-red-500/5 text-red-700"}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium flex items-center gap-2">
              <Activity className="h-4 w-4" /> Service Engine
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.fgsRunning ? "RUNNING" : "STOPPED"}</p>
            <p className="text-[10px] opacity-70">Foreground Service Status</p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium flex items-center gap-2 text-blue-500">
                <RefreshCcw className="h-4 w-4" /> Sync Stats
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-bold">{stats.lastSync}</p>
              <p className="text-[10px] text-muted-foreground">Last Heartbeat</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium flex items-center gap-2 text-purple-500">
                <Database className="h-4 w-4" /> Local Logs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-bold">{stats.logCount}</p>
              <p className="text-[10px] text-muted-foreground">Buffered Events</p>
            </CardContent>
          </Card>
        </div>

        <Card className={stats.errorCount > 0 ? "border-orange-500/20 bg-orange-500/5" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium flex items-center gap-2 text-primary">
              <AlertCircle className="h-4 w-4" /> Observability
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="flex justify-between items-end">
                <div>
                  <p className="text-2xl font-bold">{stats.errorCount}</p>
                  <p className="text-[10px] text-muted-foreground">Captured JS Errors</p>
                </div>
                <Button size="sm" onClick={handleExport} className="gap-2">
                  <Share2 className="h-3 w-3" /> Export Engine Logs
                </Button>
             </div>
          </CardContent>
        </Card>
      </div>

      <div className="p-4 bg-muted/30 rounded-lg flex items-start gap-3">
        <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5" />
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          DEBUG MODE: Use this screen for presentation and QA only. 
          The data here represents the real-time state of the monitoring engine 
          on this device. No changes made here persist to the server.
        </p>
      </div>
    </div>
  );
};

export default DebugScreen;
