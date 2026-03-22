import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut, Shield, BookOpen, Menu, X } from "lucide-react";
import { useState } from "react";

const AppNavbar = () => {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <nav className="gradient-hero sticky top-0 z-50">
      <div className="container flex items-center justify-between h-14 px-4">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-secondary" />
          <span className="font-bold text-primary-foreground text-lg">ClassTime</span>
        </div>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-4">
          {profile && (
            <>
              <span className="text-sm text-primary-foreground/70">
                {profile.role === "admin" ? "Admin" : profile.name} • {profile.usn}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10"
              >
                <LogOut className="h-4 w-4 mr-1" /> Logout
              </Button>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          className="md:hidden text-primary-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && profile && (
        <div className="md:hidden border-t border-primary-foreground/10 px-4 py-3 space-y-2 animate-fade-in">
          <p className="text-sm text-primary-foreground/70">
            {profile.role === "admin" ? "Admin" : profile.name} • {profile.usn}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-primary-foreground/80 hover:text-primary-foreground hover:bg-primary-foreground/10 w-full justify-start"
          >
            <LogOut className="h-4 w-4 mr-1" /> Logout
          </Button>
        </div>
      )}
    </nav>
  );
};

export default AppNavbar;
