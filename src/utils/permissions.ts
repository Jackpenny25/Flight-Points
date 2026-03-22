export type PermissionTabKey =
  | 'leaderboards'
  | 'rewards'
  | 'points'
  | 'attendance'
  | 'cadets'
  | 'reports'
  | 'integrity'
  | 'tickets'
  | 'admin'
  | 'signups'
  | 'presentation'
  | 'mypoints'
  | 'myattendance';

export type PermissionActionKey =
  | 'givePoints'
  | 'editPoints'
  | 'deletePoints'
  | 'markAttendance'
  | 'editAttendance'
  | 'deleteAttendanceSessions'
  | 'manageCadets'
  | 'manageAccounts'
  | 'unlockAdmin';

export type PermissionTabs = Record<PermissionTabKey, boolean>;
export type PermissionActions = Record<PermissionActionKey, boolean>;

export interface StoredPermissionOverrides {
  tabs?: Partial<Record<PermissionTabKey, boolean>>;
  actions?: Partial<Record<PermissionActionKey, boolean>>;
}

export interface EffectivePermissions {
  tabs: PermissionTabs;
  actions: PermissionActions;
}

export const PERMISSION_TAB_META: Array<{ key: PermissionTabKey; label: string }> = [
  { key: 'leaderboards', label: 'Leaderboards tab' },
  { key: 'rewards', label: 'Rewards tab' },
  { key: 'points', label: 'Points tab' },
  { key: 'attendance', label: 'Attendance tab' },
  { key: 'cadets', label: 'Cadets tab' },
  { key: 'reports', label: 'Reports tab' },
  { key: 'integrity', label: 'Integrity tab' },
  { key: 'tickets', label: 'Tickets tab' },
  { key: 'admin', label: 'NCOs tab' },
  { key: 'signups', label: 'Accounts tab' },
  { key: 'presentation', label: 'Presentation tab' },
  { key: 'mypoints', label: 'My Points tab (cadet)' },
  { key: 'myattendance', label: 'My Attendance tab (cadet)' },
];

export const PERMISSION_ACTION_META: Array<{ key: PermissionActionKey; label: string }> = [
  { key: 'givePoints', label: 'Give points' },
  { key: 'editPoints', label: 'Edit points' },
  { key: 'deletePoints', label: 'Delete points' },
  { key: 'markAttendance', label: 'Submit attendance bulk' },
  { key: 'editAttendance', label: 'Edit saved attendance' },
  { key: 'deleteAttendanceSessions', label: 'Delete attendance sessions' },
  { key: 'manageCadets', label: 'Manage cadets, reports, integrity' },
  { key: 'manageAccounts', label: 'Manage accounts and roles' },
  { key: 'unlockAdmin', label: 'Use admin safeguard unlock' },
];

export const ROLE_PERMISSION_DEFAULTS: Record<string, EffectivePermissions> = {
  snco: {
    tabs: {
      leaderboards: true,
      rewards: true,
      points: true,
      attendance: true,
      cadets: true,
      reports: true,
      integrity: true,
      tickets: true,
      admin: true,
      signups: true,
      presentation: true,
      mypoints: false,
      myattendance: false,
    },
    actions: {
      givePoints: true,
      editPoints: true,
      deletePoints: true,
      markAttendance: true,
      editAttendance: true,
      deleteAttendanceSessions: true,
      manageCadets: true,
      manageAccounts: true,
      unlockAdmin: true,
    },
  },
  admin: {
    tabs: {
      leaderboards: true,
      rewards: true,
      points: true,
      attendance: true,
      cadets: true,
      reports: true,
      integrity: true,
      tickets: true,
      admin: true,
      signups: true,
      presentation: true,
      mypoints: false,
      myattendance: false,
    },
    actions: {
      givePoints: true,
      editPoints: true,
      deletePoints: true,
      markAttendance: true,
      editAttendance: true,
      deleteAttendanceSessions: true,
      manageCadets: true,
      manageAccounts: true,
      unlockAdmin: true,
    },
  },
  pointgiver: {
    tabs: {
      leaderboards: true,
      rewards: true,
      points: true,
      attendance: true,
      cadets: false,
      reports: false,
      integrity: false,
      tickets: false,
      admin: false,
      signups: false,
      presentation: false,
      mypoints: false,
      myattendance: false,
    },
    actions: {
      givePoints: true,
      editPoints: false,
      deletePoints: false,
      markAttendance: true,
      editAttendance: true,
      deleteAttendanceSessions: false,
      manageCadets: false,
      manageAccounts: false,
      unlockAdmin: false,
    },
  },
  staff: {
    tabs: {
      leaderboards: true,
      rewards: true,
      points: true,
      attendance: false,
      cadets: false,
      reports: false,
      integrity: false,
      tickets: false,
      admin: false,
      signups: false,
      presentation: false,
      mypoints: false,
      myattendance: false,
    },
    actions: {
      givePoints: true,
      editPoints: false,
      deletePoints: false,
      markAttendance: false,
      editAttendance: false,
      deleteAttendanceSessions: false,
      manageCadets: false,
      manageAccounts: false,
      unlockAdmin: false,
    },
  },
  cadet: {
    tabs: {
      leaderboards: true,
      rewards: true,
      points: false,
      attendance: false,
      cadets: false,
      reports: false,
      integrity: false,
      tickets: true,
      admin: false,
      signups: false,
      presentation: false,
      mypoints: true,
      myattendance: true,
    },
    actions: {
      givePoints: false,
      editPoints: false,
      deletePoints: false,
      markAttendance: false,
      editAttendance: false,
      deleteAttendanceSessions: false,
      manageCadets: false,
      manageAccounts: false,
      unlockAdmin: false,
    },
  },
  presentation: {
    tabs: {
      leaderboards: false,
      rewards: false,
      points: false,
      attendance: false,
      cadets: false,
      reports: false,
      integrity: false,
      tickets: false,
      admin: false,
      signups: false,
      presentation: true,
      mypoints: false,
      myattendance: false,
    },
    actions: {
      givePoints: false,
      editPoints: false,
      deletePoints: false,
      markAttendance: false,
      editAttendance: false,
      deleteAttendanceSessions: false,
      manageCadets: false,
      manageAccounts: false,
      unlockAdmin: false,
    },
  },
};

export function getRoleDefaultPermissions(role: string): EffectivePermissions {
  const normalized = String(role || '').toLowerCase();
  const defaults = ROLE_PERMISSION_DEFAULTS[normalized] || ROLE_PERMISSION_DEFAULTS.cadet;
  return {
    tabs: { ...defaults.tabs },
    actions: { ...defaults.actions },
  };
}

export function sanitizePermissionOverrides(raw: any): StoredPermissionOverrides {
  const output: StoredPermissionOverrides = {};
  if (!raw || typeof raw !== 'object') return output;

  if (raw.tabs && typeof raw.tabs === 'object') {
    output.tabs = {};
    for (const item of PERMISSION_TAB_META) {
      const value = raw.tabs[item.key];
      if (typeof value === 'boolean') {
        output.tabs[item.key] = value;
      }
    }
  }

  if (raw.actions && typeof raw.actions === 'object') {
    output.actions = {};
    for (const item of PERMISSION_ACTION_META) {
      const value = raw.actions[item.key];
      if (typeof value === 'boolean') {
        output.actions[item.key] = value;
      }
    }
  }

  return output;
}

export function getEffectivePermissions(role: string, overrides?: StoredPermissionOverrides | null): EffectivePermissions {
  const effective = getRoleDefaultPermissions(role);
  const clean = sanitizePermissionOverrides(overrides || {});

  if (clean.tabs) {
    for (const item of PERMISSION_TAB_META) {
      if (typeof clean.tabs[item.key] === 'boolean') {
        effective.tabs[item.key] = clean.tabs[item.key] as boolean;
      }
    }
  }

  if (clean.actions) {
    for (const item of PERMISSION_ACTION_META) {
      if (typeof clean.actions[item.key] === 'boolean') {
        effective.actions[item.key] = clean.actions[item.key] as boolean;
      }
    }
  }

  return effective;
}
