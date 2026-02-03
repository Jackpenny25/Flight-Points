type Cadet = { id: string; name: string; flight: string; createdAt?: string; updatedAt?: string };
type Point = { id: string; cadetName: string; date: string; flight: string; reason: string; points: number; type: string; givenBy?: string; createdAt?: string; updatedAt?: string };
type Attendance = { id: string; cadetName: string; date: string; flight: string; status: 'present' | 'authorised_absence' | 'absent'; submittedBy?: string; bulkId?: string | null; createdAt?: string };
type AttendanceBulk = { id: string; date: string; flightFilter: string; totalRecords: number; totalPresent: number; submittedBy?: string; createdAt?: string };
type Reward = { id: string; title: string; howToWin: string; prize: string; endsAt?: string | null; createdAt?: string; updatedAt?: string; createdBy?: string; updatedBy?: string };

type Store = {
  cadets: Cadet[];
  points: Point[];
  attendance: Attendance[];
  attendanceBulks: AttendanceBulk[];
  rewards: Reward[];
};

const KEY = 'localStore_73a3871f_v1';

export function readStore(): Store {
  const raw = localStorage.getItem(KEY);
  if (!raw) return { cadets: [], points: [], attendance: [], attendanceBulks: [], rewards: [] };
  try {
    const parsed = JSON.parse(raw);
    return { cadets: [], points: [], attendance: [], attendanceBulks: [], rewards: [], ...parsed } as Store;
  } catch {
    return { cadets: [], points: [], attendance: [], attendanceBulks: [], rewards: [] };
  }
}

export function writeStore(store: Store) {
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function uuid() {
  return crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export type { Cadet, Point, Attendance, AttendanceBulk, Reward, Store };
