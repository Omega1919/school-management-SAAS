import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  id?: string;
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  color?: 'indigo' | 'emerald' | 'amber' | 'blue' | 'purple';
  onClick?: () => void;
}

export const StatCard: React.FC<StatCardProps> = ({
  id,
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  color = 'indigo',
  onClick,
}) => {
  const colorMap = {
    indigo: {
      bg: 'bg-indigo-50',
      text: 'text-indigo-600',
      border: 'border-indigo-100',
    },
    emerald: {
      bg: 'bg-emerald-50',
      text: 'text-emerald-600',
      border: 'border-emerald-100',
    },
    amber: {
      bg: 'bg-amber-50',
      text: 'text-amber-600',
      border: 'border-amber-100',
    },
    blue: {
      bg: 'bg-blue-50',
      text: 'text-blue-600',
      border: 'border-blue-100',
    },
    purple: {
      bg: 'bg-purple-50',
      text: 'text-purple-600',
      border: 'border-purple-100',
    },
  };

  const scheme = colorMap[color];

  return (
    <div
      id={id}
      onClick={onClick}
      className={`bg-white rounded-xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between ${
        onClick ? 'cursor-pointer hover:border-purple-300' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 tracking-wide uppercase">{title}</p>
          <h4 className="text-2xl font-bold text-slate-900 mt-1.5">{value}</h4>
        </div>
        <div className={`p-3 rounded-xl ${scheme.bg} ${scheme.text}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      {(subtitle || trend) && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
          {subtitle && <span className="text-slate-500">{subtitle}</span>}
          {trend && (
            <span
              className={`font-semibold ${
                trend.isPositive ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {trend.isPositive ? '↑ ' : '↓ '}
              {trend.value}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
