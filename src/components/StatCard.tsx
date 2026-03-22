import { LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  variant?: "default" | "primary" | "accent" | "warning" | "destructive";
}

const variantStyles = {
  default: "bg-card",
  primary: "gradient-primary text-primary-foreground",
  accent: "gradient-accent text-accent-foreground",
  warning: "bg-warning text-warning-foreground",
  destructive: "bg-destructive text-destructive-foreground",
};

const iconBg = {
  default: "bg-muted",
  primary: "bg-primary-foreground/20",
  accent: "bg-accent-foreground/20",
  warning: "bg-warning-foreground/20",
  destructive: "bg-destructive-foreground/20",
};

const StatCard = ({ title, value, icon: Icon, trend, variant = "default" }: StatCardProps) => {
  return (
    <div className={`rounded-lg p-4 shadow-card hover:shadow-card-hover transition-shadow animate-fade-in ${variantStyles[variant]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-medium uppercase tracking-wider ${variant === "default" ? "text-muted-foreground" : "opacity-80"}`}>
          {title}
        </span>
        <div className={`p-2 rounded-md ${iconBg[variant]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {trend && (
        <p className={`text-xs mt-1 ${variant === "default" ? "text-muted-foreground" : "opacity-70"}`}>
          {trend}
        </p>
      )}
    </div>
  );
};

export default StatCard;
