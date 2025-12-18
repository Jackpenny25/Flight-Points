import { useState } from 'react';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { LogOut, Award, TrendingUp, Users, CalendarDays, Shield, FileSpreadsheet } from 'lucide-react';
import { PointsManager } from './PointsManager';
import { Leaderboards } from './Leaderboards';
import { CadetsManager } from './CadetsManager';
import { AttendanceManager } from './AttendanceManager';
import { DataIntegrity } from './DataIntegrity';
import { ReportsExport } from './ReportsExport';

interface DashboardProps {
  user: any;
  accessToken: string;
  onLogout: () => void;
}

export function Dashboard({ user, accessToken, onLogout }: DashboardProps) {
  const userRole = user?.user_metadata?.role || 'cadet';
  const userName = user?.user_metadata?.name || user?.email || 'User';
  
  const canGivePoints = userRole === 'pointgiver' || userRole === 'snco' || userRole === 'staff';
  const canManageCadets = userRole === 'snco' || userRole === 'staff';

  const tabCount = 1 + (canGivePoints ? 2 : 0) + (canManageCadets ? 3 : 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <Award className="size-8 text-blue-600" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">RAF Air Cadet Squadron</h1>
                <p className="text-sm text-gray-500">Flight Points System</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">{userName}</p>
                <p className="text-xs text-gray-500 capitalize">{userRole}</p>
              </div>
              <Button variant="outline" size="sm" onClick={onLogout}>
                <LogOut className="size-4 mr-2" />
                Logout
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs defaultValue="leaderboards" className="space-y-6">
          <TabsContent value="leaderboards">
            <Leaderboards accessToken={accessToken} />
          </TabsContent>

          {canGivePoints && (
            <>
              <TabsContent value="points">
                <PointsManager accessToken={accessToken} userRole={userRole} />
              </TabsContent>

              <TabsContent value="attendance">
                <AttendanceManager accessToken={accessToken} userRole={userRole} />
              </TabsContent>
            </>
          )}

          {canManageCadets && (
            <>
              <TabsContent value="cadets">
                <CadetsManager accessToken={accessToken} />
              </TabsContent>

              <TabsContent value="reports">
                <ReportsExport accessToken={accessToken} userRole={userRole} />
              </TabsContent>

              <TabsContent value="integrity">
                <DataIntegrity accessToken={accessToken} />
              </TabsContent>
            </>
          )}

          {/* centered tab triggers underneath the content */}
          <div className="flex justify-center mt-6">
            <TabsList className="flex items-center gap-3">
              <TabsTrigger value="leaderboards">
                <TrendingUp className="size-4 mr-2" />
                Leaderboards
              </TabsTrigger>
              {canGivePoints && (
                <>
                  <TabsTrigger value="points">
                    <Award className="size-4 mr-2" />
                    Points
                  </TabsTrigger>
                  <TabsTrigger value="attendance">
                    <CalendarDays className="size-4 mr-2" />
                    Attendance
                  </TabsTrigger>
                </>
              )}
              {canManageCadets && (
                <>
                  <TabsTrigger value="cadets">
                    <Users className="size-4 mr-2" />
                    Cadets
                  </TabsTrigger>
                  <TabsTrigger value="reports">
                    <FileSpreadsheet className="size-4 mr-2" />
                    Reports
                  </TabsTrigger>
                  <TabsTrigger value="integrity">
                    <Shield className="size-4 mr-2" />
                    Integrity
                  </TabsTrigger>
                </>
              )}
            </TabsList>
          </div>
        </Tabs>
      </main>
    </div>
  );
}