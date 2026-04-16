import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Shield, Check, X } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';

const ROLES = ['snco', 'pointgiver', 'staff', 'cadet', 'presentation'] as const;

const ROLE_LABELS: Record<string, string> = {
  snco: 'Flight Point Lead (SNCO)',
  pointgiver: 'Point Giver',
  staff: 'Staff',
  cadet: 'Cadet',
  presentation: 'Presentation',
};

interface Permission {
  area: string;
  action: string;
  snco: boolean;
  pointgiver: boolean;
  staff: boolean;
  cadet: boolean;
  presentation: boolean;
}

const PERMISSIONS: Permission[] = [
  // Dashboard & Navigation
  { area: 'Dashboard', action: 'View leaderboards', snco: true, pointgiver: true, staff: true, cadet: true, presentation: false },
  { area: 'Dashboard', action: 'View presentation mode', snco: true, pointgiver: false, staff: false, cadet: false, presentation: true },

  // Points
  { area: 'Points', action: 'View all points', snco: true, pointgiver: true, staff: true, cadet: false, presentation: false },
  { area: 'Points', action: 'View own points', snco: true, pointgiver: true, staff: true, cadet: true, presentation: false },
  { area: 'Points', action: 'Give points (own flight)', snco: true, pointgiver: true, staff: false, cadet: false, presentation: false },
  { area: 'Points', action: 'Give points (any flight)', snco: true, pointgiver: false, staff: true, cadet: false, presentation: false },
  { area: 'Points', action: 'Edit points', snco: true, pointgiver: false, staff: false, cadet: false, presentation: false },
  { area: 'Points', action: 'Delete points', snco: true, pointgiver: false, staff: false, cadet: false, presentation: false },

  // Attendance
  { area: 'Attendance', action: 'View attendance', snco: true, pointgiver: true, staff: false, cadet: false, presentation: false },
  { area: 'Attendance', action: 'View own attendance', snco: true, pointgiver: true, staff: false, cadet: true, presentation: false },
  { area: 'Attendance', action: 'Mark attendance', snco: true, pointgiver: true, staff: false, cadet: false, presentation: false },
  { area: 'Attendance', action: 'Edit attendance records', snco: true, pointgiver: true, staff: false, cadet: false, presentation: false },
  { area: 'Attendance', action: 'Delete attendance sessions', snco: true, pointgiver: false, staff: false, cadet: false, presentation: false },

  // Cadets
  { area: 'Cadets', action: 'View cadet list', snco: true, pointgiver: true, staff: true, cadet: false, presentation: false },
  { area: 'Cadets', action: 'Add/edit cadets', snco: true, pointgiver: false, staff: false, cadet: false, presentation: false },
  { area: 'Cadets', action: 'Delete cadets', snco: true, pointgiver: false, staff: false, cadet: false, presentation: false },
  { area: 'Cadets', action: 'Toggle NCO status', snco: true, pointgiver: false, staff: false, cadet: false, presentation: false },
  { area: 'Cadets', action: 'Bulk remove cadets', snco: true, pointgiver: false, staff: false, cadet: false, presentation: false },

  // Rewards
  { area: 'Rewards', action: 'View rewards', snco: true, pointgiver: true, staff: true, cadet: true, presentation: false },
  { area: 'Rewards', action: 'Create rewards', snco: true, pointgiver: false, staff: false, cadet: false, presentation: false },
  { area: 'Rewards', action: 'Delete rewards', snco: true, pointgiver: false, staff: false, cadet: false, presentation: false },
  { area: 'Rewards', action: 'Set reward winner', snco: true, pointgiver: false, staff: false, cadet: false, presentation: false },
  { area: 'Rewards', action: 'Suggest rewards', snco: true, pointgiver: true, staff: true, cadet: true, presentation: false },
  { area: 'Rewards', action: 'Vote on suggestions', snco: true, pointgiver: true, staff: true, cadet: true, presentation: false },
  { area: 'Rewards', action: 'Moderate suggestions', snco: true, pointgiver: false, staff: false, cadet: false, presentation: false },

  // Tickets
  { area: 'Tickets', action: 'Submit tickets', snco: true, pointgiver: true, staff: true, cadet: true, presentation: false },
  { area: 'Tickets', action: 'View all tickets', snco: true, pointgiver: false, staff: true, cadet: false, presentation: false },
  { area: 'Tickets', action: 'View own tickets', snco: true, pointgiver: true, staff: true, cadet: true, presentation: false },
  { area: 'Tickets', action: 'Approve/reject tickets', snco: true, pointgiver: false, staff: true, cadet: false, presentation: false },

  // Admin
  { area: 'Admin', action: 'Admin mode (PIN unlock)', snco: true, pointgiver: false, staff: false, cadet: false, presentation: false },
  { area: 'Admin', action: 'Create accounts', snco: true, pointgiver: false, staff: false, cadet: false, presentation: false },
  { area: 'Admin', action: 'Reset passwords', snco: true, pointgiver: false, staff: false, cadet: false, presentation: false },
  { area: 'Admin', action: 'Delete accounts', snco: true, pointgiver: false, staff: false, cadet: false, presentation: false },
  { area: 'Admin', action: 'Change user roles', snco: true, pointgiver: false, staff: false, cadet: false, presentation: false },
  { area: 'Admin', action: 'View data integrity', snco: true, pointgiver: false, staff: false, cadet: false, presentation: false },
  { area: 'Admin', action: 'View reports', snco: true, pointgiver: false, staff: false, cadet: false, presentation: false },
  { area: 'Admin', action: 'View revision history', snco: true, pointgiver: false, staff: false, cadet: false, presentation: false },
];

export function EffectivePermissions() {
  const areas = [...new Set(PERMISSIONS.map(p => p.area))];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="size-5" />
          Effective Permissions by Role
        </CardTitle>
        <CardDescription>
          Shows exactly what each role can do across all areas of the system
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[120px]">Area</TableHead>
                <TableHead className="min-w-[180px]">Action</TableHead>
                {ROLES.map(role => (
                  <TableHead key={role} className="text-center min-w-[100px]">
                    <div className="flex flex-col items-center gap-1">
                      <Badge variant="outline" className="text-xs">
                        {ROLE_LABELS[role]}
                      </Badge>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {areas.map(area => {
                const areaPerms = PERMISSIONS.filter(p => p.area === area);
                return areaPerms.map((perm, idx) => (
                  <TableRow key={`${area}-${perm.action}`} className={idx === 0 ? 'border-t-2' : ''}>
                    {idx === 0 && (
                      <TableCell rowSpan={areaPerms.length} className="font-semibold align-top bg-slate-50">
                        {area}
                      </TableCell>
                    )}
                    <TableCell className="text-sm">{perm.action}</TableCell>
                    {ROLES.map(role => (
                      <TableCell key={role} className="text-center">
                        {perm[role] ? (
                          <Check className="size-4 text-green-600 mx-auto" />
                        ) : (
                          <X className="size-4 text-red-300 mx-auto" />
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ));
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
