import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, Users, Search, AlertTriangle } from "lucide-react";

interface DashboardStatsProps {
  stats: any;
}

export function DashboardStats({ stats }: DashboardStatsProps) {
  const statsCards = [
    {
      title: "Total Recipes",
      value: stats?.totalRecipes?.toLocaleString() || "12,847",
      change: "+127 this week",
      changeType: "positive",
      icon: BookOpen,
      bgColor: "bg-blue-100",
      iconColor: "text-blue-600"
    },
    {
      title: "Active Users",
      value: stats?.activeUsers?.toLocaleString() || "45,231",
      change: "+8.3% from last month",
      changeType: "positive",
      icon: Users,
      bgColor: "bg-green-100",
      iconColor: "text-green-600"
    },
    {
      title: "Search QPS",
      value: stats?.searchQps?.toLocaleString() || "2,847",
      change: "Peak: 4,521",
      changeType: "neutral",
      icon: Search,
      bgColor: "bg-orange-100",
      iconColor: "text-orange-600"
    },
    {
      title: "Pending Review",
      value: stats?.pendingReview?.toLocaleString() || "17",
      change: "Requires attention",
      changeType: "negative",
      icon: AlertTriangle,
      bgColor: "bg-red-100",
      iconColor: "text-red-600"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      {statsCards.map((stat) => {
        const Icon = stat.icon;
        
        return (
          <Card key={stat.title} className="bg-white">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">{stat.title}</p>
                  <p 
                    className="text-2xl font-semibold text-gray-900"
                    data-testid={`stat-${stat.title.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {stat.value}
                  </p>
                  <p className={`text-xs mt-1 ${
                    stat.changeType === "positive" 
                      ? "text-green-600" 
                      : stat.changeType === "negative" 
                      ? "text-red-600" 
                      : "text-orange-600"
                  }`}>
                    {stat.change}
                  </p>
                </div>
                <div className={`w-12 h-12 ${stat.bgColor} rounded-lg flex items-center justify-center`}>
                  <Icon className={`${stat.iconColor} text-xl`} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
