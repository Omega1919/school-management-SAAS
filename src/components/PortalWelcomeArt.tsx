import React from 'react';
import { Award, BookOpen, CalendarCheck, CheckCircle2, FileText, GraduationCap, Heart, School, ShieldCheck, Users } from 'lucide-react';

type PortalRole = 'super_admin' | 'teacher' | 'parent' | 'student';

const roleArt = {
  super_admin: { primary: School, secondary: Users, accent: ShieldCheck, colors: 'from-violet-200 to-indigo-100 text-violet-700', bubble: 'bg-white text-indigo-700' },
  teacher: { primary: GraduationCap, secondary: BookOpen, accent: CalendarCheck, colors: 'from-sky-200 to-indigo-100 text-indigo-700', bubble: 'bg-white text-sky-700' },
  parent: { primary: Users, secondary: Heart, accent: Award, colors: 'from-emerald-200 to-teal-100 text-emerald-700', bubble: 'bg-white text-rose-600' },
  student: { primary: BookOpen, secondary: FileText, accent: CheckCircle2, colors: 'from-blue-200 to-violet-100 text-blue-700', bubble: 'bg-white text-violet-700' },
} satisfies Record<PortalRole, { primary: React.ElementType; secondary: React.ElementType; accent: React.ElementType; colors: string; bubble: string }>;

export const PortalWelcomeArt: React.FC<{ role: PortalRole; className?: string }> = ({ role, className = '' }) => {
  const art = roleArt[role];
  const PrimaryIcon = art.primary;
  const SecondaryIcon = art.secondary;
  const AccentIcon = art.accent;

  return (
    <div aria-hidden="true" className={`relative flex aspect-square items-center justify-center ${className}`}>
      <div className="absolute inset-3 rounded-full border border-white/70 bg-white/30" />
      <div className={`relative grid h-[72%] w-[72%] place-items-center rounded-[32%] bg-gradient-to-br ${art.colors} shadow-lg shadow-slate-900/10`}>
        <div className="absolute inset-2 rounded-[29%] border border-white/50" />
        <PrimaryIcon className="relative h-[46%] w-[46%] stroke-[1.6]" />
      </div>
      <span className={`absolute right-[5%] top-[12%] grid h-[27%] w-[27%] place-items-center rounded-2xl shadow-md shadow-slate-900/10 ${art.bubble}`}>
        <SecondaryIcon className="h-[48%] w-[48%] stroke-[1.8]" />
      </span>
      <span className="absolute bottom-[8%] left-[7%] grid h-[24%] w-[24%] place-items-center rounded-2xl border border-white/80 bg-white/90 text-amber-600 shadow-md shadow-slate-900/10">
        <AccentIcon className="h-[48%] w-[48%] stroke-[1.8]" />
      </span>
      <span className="absolute right-[12%] bottom-[12%] h-2.5 w-2.5 rounded-full bg-white shadow-sm" />
      <span className="absolute left-[15%] top-[18%] h-2 w-2 rounded-full bg-white/90" />
    </div>
  );
};
