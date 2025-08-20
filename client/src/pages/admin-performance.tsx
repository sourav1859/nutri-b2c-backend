import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sidebar } from "@/components/admin/Sidebar";
import { TopBar } from "@/components/admin/TopBar";

export default function AdminPerformance() {
  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      
      <main className="flex-1 flex flex-col min-w-0">
        <TopBar />
        
        <div className="flex-1 p-6 overflow-auto">
          <Card>
            <CardHeader>
              <CardTitle>Performance Monitoring</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">Monitor system performance, database queries, and API response times.</p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}