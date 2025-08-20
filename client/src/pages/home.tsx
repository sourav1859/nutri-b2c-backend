import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Utensils, Users, BarChart } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-green-50 to-blue-50">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Nutrition App
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Your comprehensive platform for recipe management, nutritional insights, and personalized food recommendations.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-12">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Utensils className="h-6 w-6 text-green-600" />
                Recipe Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Discover, create, and manage your favorite recipes with advanced search capabilities and dietary filters.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-6 w-6 text-blue-600" />
                User Community
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Share your recipes with the community and discover new favorites from other food enthusiasts.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart className="h-6 w-6 text-purple-600" />
                Analytics & Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600">
                Get detailed nutritional information and personalized recommendations based on your preferences.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="text-center">
          <Link href="/admin">
            <Button size="lg" className="bg-green-600 hover:bg-green-700">
              Access Admin Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}