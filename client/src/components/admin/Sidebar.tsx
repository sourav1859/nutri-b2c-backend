import { useState } from "react";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard,
  BookOpen,
  Users,
  MessageSquare,
  Search,
  TrendingUp,
  History,
  Database,
  Shield,
  ShieldQuestion,
  Gauge,
  Utensils,
  LogOut
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface NavItem {
  name: string;
  href: string;
  icon: any;
  badge?: string;
  badgeVariant?: "default" | "destructive" | "outline" | "secondary";
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: "Content Management",
    items: [
      { name: "Recipes", href: "/admin/recipes", icon: BookOpen, badge: "12", badgeVariant: "secondary" as const },
      { name: "Users", href: "/admin/users", icon: Users },
      { name: "User Content", href: "/admin/user-content", icon: MessageSquare, badge: "5", badgeVariant: "destructive" as const },
    ]
  },
  {
    title: "System",
    items: [
      { name: "Search Analytics", href: "/admin/search", icon: Search },
      { name: "Performance", href: "/admin/performance", icon: TrendingUp },
      { name: "Audit Logs", href: "/admin/audit", icon: History },
      { name: "Database", href: "/admin/database", icon: Database },
    ]
  },
  {
    title: "Security",
    items: [
      { name: "Authentication", href: "/admin/auth", icon: Shield },
      { name: "Admin Teams", href: "/admin/teams", icon: ShieldQuestion },
      { name: "Rate Limits", href: "/admin/rate-limits", icon: Gauge },
    ]
  }
];

export function Sidebar() {
  const [location] = useLocation();

  return (
    <aside className="w-64 bg-white shadow-sm border-r border-gray-200 flex flex-col">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <Utensils className="text-white text-lg" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Nutrition Admin</h1>
            <p className="text-xs text-gray-500">Production Backend</p>
          </div>
        </div>
      </div>
      
      <nav className="flex-1 p-4 space-y-2 scrollbar-thin overflow-y-auto">
        <Link 
          href="/admin"
          className={cn(
            "flex items-center space-x-3 px-3 py-2 rounded-lg font-medium",
            location === "/admin" || location === "/admin/"
              ? "bg-blue-50 text-blue-600"
              : "text-gray-700 hover:bg-gray-100"
          )}
          data-testid="nav-dashboard"
        >
          <LayoutDashboard className="w-5 h-5" />
          <span>Dashboard</span>
        </Link>
        
        {navSections.map((section) => (
          <div key={section.title} className="space-y-1">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-3 py-2">
              {section.title}
            </h3>
            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href;
              
              return (
                <Link 
                  key={item.name} 
                  href={item.href}
                  className={cn(
                    "flex items-center space-x-3 px-3 py-2 rounded-lg",
                    isActive
                      ? "bg-blue-50 text-blue-600"
                      : "text-gray-700 hover:bg-gray-100"
                  )}
                  data-testid={`nav-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.name}</span>
                  {item.badge && (
                    <Badge 
                      variant={item.badgeVariant || "default"}
                      className="ml-auto"
                    >
                      {item.badge}
                    </Badge>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
            <Users className="text-gray-600 text-sm" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">Admin User</p>
            <p className="text-xs text-gray-500">Super Admin</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-400 hover:text-gray-600"
            data-testid="logout-button"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </aside>
  );
}
