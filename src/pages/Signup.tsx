import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Shield, AlertTriangle } from "lucide-react";

const Signup = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center gradient-hero px-4 py-8">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl gradient-accent mb-4">
            <Shield className="h-7 w-7 text-accent-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-primary-foreground">Student Signup</h1>
          <p className="text-primary-foreground/60 text-sm mt-1">Create your monitoring account</p>
        </div>

        <div className="bg-card rounded-xl p-8 shadow-card-hover space-y-6 text-center">
          <div className="p-3 rounded-full bg-warning/10 w-fit mx-auto">
            <AlertTriangle className="h-8 w-8 text-warning" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Signup Disabled</h2>
            <p className="text-sm text-muted-foreground">
              Student accounts can only be created by an administrator. Please contact your administrator to get your credentials.
            </p>
          </div>

          <Button asChild className="w-full h-11 gradient-primary text-primary-foreground">
            <Link to="/login">Go to Login</Link>
          </Button>

          <p className="text-xs text-muted-foreground italic">
            Note: Once your administrator creates your account, you can use your USN-based email and the provided password to sign in.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Signup;
