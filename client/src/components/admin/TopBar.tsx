import { useState } from "react";
import { ChevronRight, UserCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export function TopBar() {
  const [impersonateUserId, setImpersonateUserId] = useState("");

  const handleImpersonation = () => {
    if (impersonateUserId.trim()) {
      // TODO: Set X-Act-As-User header for subsequent requests
      console.log("Impersonating user:", impersonateUserId);
      // In a real implementation, this would set a global header or context
    }
  };

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <nav className="flex items-center space-x-2 text-sm">
            <a href="/admin" className="text-gray-500 hover:text-gray-700" data-testid="breadcrumb-admin">
              Admin
            </a>
            <ChevronRight className="text-gray-400 text-xs" />
            <span className="text-gray-900 font-medium">Dashboard</span>
          </nav>
          <h2 className="text-2xl font-semibold text-gray-900 mt-1">System Overview</h2>
        </div>
        
        <div className="flex items-center space-x-4">
          {/* Impersonation Controls */}
          <div className="flex items-center space-x-2 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
            <UserCheck2 className="text-yellow-600 w-4 h-4" />
            <span className="text-sm text-yellow-800">Act as User</span>
            <Input
              type="text"
              placeholder="User ID"
              value={impersonateUserId}
              onChange={(e) => setImpersonateUserId(e.target.value)}
              className="bg-white border border-yellow-300 rounded px-2 py-1 text-sm w-24 h-8"
              data-testid="impersonate-user-input"
            />
            <Button
              size="sm"
              className="bg-yellow-600 text-white px-3 py-1 rounded text-sm hover:bg-yellow-700"
              onClick={handleImpersonation}
              data-testid="impersonate-user-button"
            >
              Apply
            </Button>
          </div>
          
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full" />
            <span className="text-sm text-gray-600">System Healthy</span>
          </div>
        </div>
      </div>
    </header>
  );
}
