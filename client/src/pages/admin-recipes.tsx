import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sidebar } from "@/components/admin/Sidebar";
import { TopBar } from "@/components/admin/TopBar";

export default function AdminRecipes() {
  return (
    <div className="min-h-screen flex bg-gray-50">
      <Sidebar />
      
      <main className="flex-1 flex flex-col min-w-0">
        <TopBar />
        
        <div className="flex-1 p-6 overflow-auto">
          <Card>
            <CardHeader>
              <CardTitle>Recipe Management</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">Manage recipes, nutritional information, and recipe approvals.</p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}