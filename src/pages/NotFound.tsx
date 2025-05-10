
import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-space-background">
      <div className="text-center p-8 bg-black/20 backdrop-blur-sm rounded-lg border border-space-secondary/20">
        <h1 className="text-6xl font-bold mb-6 text-space-danger">404</h1>
        <div className="flex items-center justify-center mb-6">
          <div className="h-2 w-16 bg-space-primary animate-pulse-glow rounded"></div>
        </div>
        <p className="text-2xl text-space-white mb-6">
          Space sector not found
        </p>
        <p className="text-space-white/70 mb-8 max-w-md">
          The cosmic coordinates you're looking for don't exist in this universe.
          Return to base command to continue your mission.
        </p>
        <Button 
          asChild
          className="bg-space-primary hover:bg-space-secondary text-white px-6 py-3 rounded-lg transition-colors flex items-center gap-2"
        >
          <a href="/">
            <Home size={20} />
            Return to Base
          </a>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
