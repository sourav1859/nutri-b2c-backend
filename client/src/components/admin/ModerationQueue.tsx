import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, Clock, Utensils, Leaf, Dumbbell } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ModerationQueueProps {
  reports: any[];
  loading: boolean;
}

export function ModerationQueue({ reports, loading }: ModerationQueueProps) {
  const handleApprove = async (id: string) => {
    try {
      const response = await fetch(`/api/v1/admin/user-recipes/${id}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reviewNotes: "Approved via admin dashboard"
        })
      });
      
      if (response.ok) {
        // Refresh the data
        window.location.reload();
      }
    } catch (error) {
      console.error("Failed to approve content:", error);
    }
  };

  const handleReject = async (id: string) => {
    try {
      const response = await fetch(`/api/v1/admin/user-recipes/${id}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reviewNotes: "Rejected - does not meet quality standards"
        })
      });
      
      if (response.ok) {
        // Refresh the data
        window.location.reload();
      }
    } catch (error) {
      console.error("Failed to reject content:", error);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-gray-200 rounded w-1/3"></div>
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="border rounded-lg p-4">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // For demo purposes, showing some sample moderation items
  // In real implementation, this would come from the reports prop
  const moderationItems = [
    {
      id: "1",
      title: "Homemade Pizza Recipe",
      author: "user@example.com",
      submitted: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      totalTimeMinutes: 30,
      cuisines: ["Italian"],
      dietTags: ["Vegetarian"]
    },
    {
      id: "2", 
      title: "Vegan Smoothie Bowl",
      author: "healthyfoodie@example.com",
      submitted: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
      totalTimeMinutes: 10,
      cuisines: [],
      dietTags: ["Vegan"]
    }
  ];

  return (
    <Card>
      <CardHeader className="border-b border-gray-200">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900">
            Content Moderation
          </CardTitle>
          <Badge 
            variant="destructive"
            className="bg-red-500 text-white"
          >
            {moderationItems.length} pending
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-4">
          {moderationItems.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No content pending moderation
            </div>
          ) : (
            moderationItems.map((item) => (
              <div
                key={item.id}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                data-testid={`moderation-item-${item.id}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-gray-900">{item.title}</h4>
                    <p className="text-xs text-gray-500 mt-1">by {item.author}</p>
                    <p className="text-xs text-gray-500">
                      Submitted {formatDistanceToNow(item.submitted)} ago
                    </p>
                  </div>
                  <div className="flex space-x-2 ml-4">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-green-600 hover:text-green-700 hover:bg-green-50"
                      onClick={() => handleApprove(item.id)}
                      data-testid={`approve-content-${item.id}`}
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={() => handleReject(item.id)}
                      data-testid={`reject-content-${item.id}`}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex items-center space-x-4 text-xs text-gray-500">
                  <span className="flex items-center">
                    <Clock className="w-3 h-3 mr-1" />
                    {item.totalTimeMinutes} min cook time
                  </span>
                  {item.cuisines.length > 0 && (
                    <span className="flex items-center">
                      <Utensils className="w-3 h-3 mr-1" />
                      {item.cuisines[0]} cuisine
                    </span>
                  )}
                  {item.dietTags.includes("Vegetarian") && (
                    <span className="flex items-center">
                      <Leaf className="w-3 h-3 mr-1" />
                      Vegetarian
                    </span>
                  )}
                  {item.dietTags.includes("Vegan") && (
                    <span className="flex items-center">
                      <Leaf className="w-3 h-3 mr-1" />
                      Vegan
                    </span>
                  )}
                  {item.dietTags.includes("High Protein") && (
                    <span className="flex items-center">
                      <Dumbbell className="w-3 h-3 mr-1" />
                      High protein
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
          
          <div className="mt-6">
            <Button
              variant="outline"
              className="w-full text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-600"
              data-testid="view-all-pending-content-button"
            >
              View All Pending Content
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
