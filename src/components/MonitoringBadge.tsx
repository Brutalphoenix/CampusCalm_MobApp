interface MonitoringBadgeProps {
  active: boolean;
}

const MonitoringBadge = ({ active }: MonitoringBadgeProps) => {
  return (
    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${
      active
        ? "bg-success/10 text-success border border-success/20"
        : "bg-muted text-muted-foreground border border-border"
    }`}>
      <span className={`h-2.5 w-2.5 rounded-full ${active ? "bg-success animate-pulse-dot" : "bg-muted-foreground/40"}`} />
      Class Monitoring: {active ? "ON" : "OFF"}
    </div>
  );
};

export default MonitoringBadge;
