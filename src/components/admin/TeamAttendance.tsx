/*
 * TeamAttendance.tsx — Admin attendance panel.
 * Left sidebar lists every team member; picking a member shows their
 * personal attendance calendar (month-based) on the right.
 */

import { useState } from "react";
import { Users, Search, ChevronRight, CalendarDays } from "lucide-react";
import AttendanceCalendar from "@/components/admin/Attendencecalendar";

interface TeamMember {
  id: string;
  fullName?: string;
  email: string;
}

interface Props {
  users: TeamMember[];
}

function Initial({ name }: { name?: string }) {
  const ini = (name ?? "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 bg-gradient-to-br from-indigo-500 to-indigo-700">
      {ini}
    </div>
  );
}

export default function TeamAttendance({ users }: Props) {
  const [selected, setSelected] = useState<TeamMember | null>(users[0] ?? null);
  const [query, setQuery] = useState("");

  const activeUser = (selected && users.find(u => u.id === selected.id)) || users[0] || null;

  const filtered = users.filter(u =>
    (u.fullName ?? "").toLowerCase().includes(query.toLowerCase()) ||
    u.email.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="grid lg:grid-cols-[280px_minmax(0,1fr)] gap-4 items-start">
      {/* ── Member list sidebar ── */}
      <div className="pg rounded-2xl overflow-hidden lg:sticky lg:top-4">
        <div className="px-4 py-3 border-b border-white/[0.055] flex items-center gap-2">
          <Users className="w-3.5 h-3.5 text-indigo-400" />
          <span className="ph text-sm font-semibold text-white">Team Members</span>
          <span className="ml-auto text-[10px] text-white/25">{users.length}</span>
        </div>

        <div className="p-2 border-b border-white/[0.04]">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-white/20" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search members…"
              className="w-full pl-8 pr-3 py-2 rounded-xl text-xs text-white bg-transparent pg focus:outline-none focus:ring-1 focus:ring-indigo-500/30 placeholder-white/15"
            />
          </div>
        </div>

        <div className="max-h-[68vh] overflow-y-auto">
          {filtered.length === 0 && (
            <p className="py-10 text-center text-xs text-white/18">No members found</p>
          )}
          {filtered.map(u => {
            const active = activeUser?.id === u.id;
            return (
              <button key={u.id} onClick={() => setSelected(u)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors border-b border-white/[0.03] last:border-0 ${
                  active ? "bg-indigo-500/12" : "hover:bg-white/[0.02]"
                }`}>
                <Initial name={u.fullName} />
                <div className="min-w-0 flex-1">
                  <p className={`text-xs font-semibold truncate ${active ? "text-indigo-300" : "text-white/80"}`}>
                    {u.fullName || u.email || "—"}
                  </p>
                  <p className="text-[9px] text-white/22 truncate">{u.email}</p>
                </div>
                <ChevronRight className={`w-3.5 h-3.5 flex-shrink-0 ${active ? "text-indigo-400" : "text-white/12"}`} />
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Selected member's attendance calendar ── */}
      <div className="min-w-0">
        {activeUser ? (
          <div className="dark">
            <AttendanceCalendar userId={activeUser.id} employeeName={activeUser.fullName} />
          </div>
        ) : (
          <div className="pg rounded-2xl py-20 flex flex-col items-center gap-3 text-center">
            <CalendarDays className="w-8 h-8 text-white/10" />
            <p className="text-sm text-white/18">No team members found</p>
          </div>
        )}
      </div>
    </div>
  );
}
