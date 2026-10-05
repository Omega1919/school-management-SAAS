import React from 'react';

interface BadgeProps {
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'purple';
  status?: string;
  label?: string;
  children?: React.ReactNode;
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  status,
  label,
  children,
  size = 'sm',
}) => {
  let effectiveVariant = variant;
  if (status) {
    if (status === 'success' || status === 'active' || status === 'paid' || status === 'present') {
      effectiveVariant = 'success';
    } else if (status === 'warning' || status === 'partial' || status === 'late' || status === 'pending') {
      effectiveVariant = 'warning';
    } else if (status === 'danger' || status === 'unpaid' || status === 'absent' || status === 'suspended') {
      effectiveVariant = 'danger';
    } else {
      effectiveVariant = 'neutral';
    }
  }

  const content = label || children;

  const variantStyles = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger: 'bg-rose-50 text-rose-700 border-rose-200',
    info: 'bg-blue-50 text-blue-700 border-blue-200',
    neutral: 'bg-slate-100 text-slate-700 border-slate-200',
    purple: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  };

  const sizeStyles = {
    sm: 'text-xs px-2.5 py-0.5',
    md: 'text-sm px-3 py-1',
  };

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border whitespace-nowrap ${variantStyles[effectiveVariant]} ${sizeStyles[size]}`}
    >
      {content}
    </span>
  );
};

export function getStatusBadge(status: string) {
  switch (status.toLowerCase()) {
    case 'active':
    case 'paid':
    case 'present':
      return <Badge variant="success">{status}</Badge>;
    case 'partially_paid':
    case 'late':
    case 'pending':
      return <Badge variant="warning">{status.replace('_', ' ')}</Badge>;
    case 'unpaid':
    case 'absent':
    case 'suspended':
      return <Badge variant="danger">{status}</Badge>;
    case 'excused':
      return <Badge variant="info">{status}</Badge>;
    default:
      return <Badge variant="neutral">{status}</Badge>;
  }
}
