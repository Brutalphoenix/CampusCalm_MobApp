import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

const Login = () => {
  const [usn, setUsn] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usn.trim() || !password) {
      toast.error("Please fill all fields");
      return;
    }
    setLoading(true);
    try {
      const isEmail = usn.includes("@");
      const email = isEmail ? usn.trim() : `${usn.toLowerCase().replace(/[^a-z0-9]/g, "")}@classtime.app`;
      const profile = await login(email, password);
      toast.success("Logged in successfully");
      navigate(profile.role === "admin" ? "/admin" : "/dashboard");
    } catch (err: unknown) {
      const authError = err as { code?: string; message?: string };
      console.error("Login Error:", authError);
      let message = "Invalid credentials. Please try again.";
      
      if (authError?.code === "auth/user-not-found") {
        message = "Account not found. Please sign up.";
      } else if (authError?.code === "auth/wrong-password") {
        message = "Incorrect password.";
      } else if (authError?.message === "User profile not found in database") {
        message = "User found, but profile is missing.";
      }
      
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center gradient-hero px-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl gradient-accent mb-4">
            <Shield className="h-7 w-7 text-accent-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-primary-foreground">ClassTime</h1>
          <p className="text-primary-foreground/60 text-sm mt-1">Phone Monitoring System</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card rounded-xl p-6 shadow-card-hover space-y-4">
          <h2 className="text-lg font-semibold text-center">Sign In</h2>

          <div className="space-y-1.5">
            <Label htmlFor="usn">USN / Admin ID</Label>
            <Input
              id="usn"
              placeholder="Enter your USN"
              value={usn}
              onChange={(e) => setUsn(e.target.value)}
              className="h-11"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPw ? "text" : "password"}
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <Button type="submit" className="w-full h-11 gradient-primary text-primary-foreground" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            New student?{" "}
            <Link to="/signup" className="text-primary font-medium hover:underline">
              Create account
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default Login;
