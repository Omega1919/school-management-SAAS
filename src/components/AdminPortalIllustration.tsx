import React from 'react';

export const AdminPortalIllustration: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`relative w-full flex items-center justify-center select-none ${className}`}>
      <svg
        viewBox="0 0 520 440"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto max-h-[440px] sm:max-h-[500px] drop-shadow-xl transition-transform duration-300 hover:scale-[1.02]"
      >
        {/* Organic ambient light background patches */}
        <path
          d="M 60 120 C 15 170, 15 270, 55 330 C 105 390, 195 410, 265 370 C 325 320, 305 230, 255 170 C 205 110, 105 90, 60 120 Z"
          fill="white"
          fillOpacity="0.08"
        />
        <path
          d="M 320 40 C 380 15, 460 50, 485 120 C 510 190, 480 270, 430 320 C 380 370, 300 380, 260 330 C 220 280, 240 200, 270 130 C 290 70, 260 60, 320 40 Z"
          fill="white"
          fillOpacity="0.07"
        />

        {/* Central Master System Dashboard / Terminal Screen */}
        <g id="admin-master-console">
          {/* Dashboard shadow */}
          <rect x="184" y="144" width="230" height="235" rx="16" fill="#18181B" fillOpacity="0.28" />
          {/* Console Body */}
          <rect
            x="180"
            y="140"
            width="230"
            height="235"
            rx="16"
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="3.2"
          />

          {/* Console Top Bar: Window Controls */}
          <rect x="195" y="155" width="200" height="18" rx="6" fill="#F4F4F5" stroke="#18181B" strokeWidth="1.8" />
          <circle cx="206" cy="164" r="3.5" fill="#EF4444" stroke="#18181B" strokeWidth="1.2" />
          <circle cx="218" cy="164" r="3.5" fill="#FBBF24" stroke="#18181B" strokeWidth="1.2" />
          <circle cx="230" cy="164" r="3.5" fill="#10B981" stroke="#18181B" strokeWidth="1.2" />
          <text x="245" y="167" fill="#52525B" fontSize="8" fontWeight="bold" fontFamily="monospace">SYSTEM.CORE.v4</text>

          {/* Institutional Metric Cards */}
          <g id="admin-metrics" transform="translate(195, 185)">
            {/* Metric Box 1 (Active Enrolled Students) */}
            <rect x="0" y="0" width="62" height="42" rx="6" fill="#FAF5FF" stroke="#18181B" strokeWidth="1.8" />
            <text x="6" y="14" fill="#7C3AED" fontSize="8" fontWeight="bold" fontFamily="sans-serif">STUDENTS</text>
            <text x="6" y="32" fill="#18181B" fontSize="14" fontWeight="900" fontFamily="sans-serif">2,840</text>

            {/* Metric Box 2 (Staff / Faculty) */}
            <rect x="68" y="0" width="62" height="42" rx="6" fill="#F0FDF4" stroke="#18181B" strokeWidth="1.8" />
            <text x="74" y="14" fill="#059669" fontSize="8" fontWeight="bold" fontFamily="sans-serif">FACULTY</text>
            <text x="74" y="32" fill="#18181B" fontSize="14" fontWeight="900" fontFamily="sans-serif">142</text>

            {/* Metric Box 3 (System Status) */}
            <rect x="136" y="0" width="64" height="42" rx="6" fill="#EFF6FF" stroke="#18181B" strokeWidth="1.8" />
            <text x="142" y="14" fill="#2563EB" fontSize="8" fontWeight="bold" fontFamily="sans-serif">HEALTH</text>
            <text x="142" y="32" fill="#18181B" fontSize="13" fontWeight="900" fontFamily="sans-serif">99.9%</text>

            {/* Analytics Area Chart */}
            <g transform="translate(0, 52)">
              <rect x="0" y="0" width="200" height="75" rx="8" fill="#FAFAFA" stroke="#18181B" strokeWidth="1.8" />
              {/* Grid lines */}
              <line x1="10" y1="20" x2="190" y2="20" stroke="#E4E4E7" strokeWidth="1" strokeDasharray="3 3" />
              <line x1="10" y1="42" x2="190" y2="42" stroke="#E4E4E7" strokeWidth="1" strokeDasharray="3 3" />
              <line x1="10" y1="62" x2="190" y2="62" stroke="#18181B" strokeWidth="1.5" />
              
              {/* Chart Curved Wave */}
              <path
                d="M 15 50 Q 50 15 90 35 T 150 18 T 185 10"
                fill="none"
                stroke="#7C3AED"
                strokeWidth="2.8"
                strokeLinecap="round"
              />
              {/* Shaded Area under curve */}
              <path
                d="M 15 50 Q 50 15 90 35 T 150 18 T 185 10 L 185 62 L 15 62 Z"
                fill="#8B5CF6"
                fillOpacity="0.15"
              />
              <circle cx="90" cy="35" r="3.5" fill="#7C3AED" stroke="#18181B" strokeWidth="1.5" />
              <circle cx="150" cy="18" r="3.5" fill="#7C3AED" stroke="#18181B" strokeWidth="1.5" />
              <circle cx="185" cy="10" r="4" fill="#10B981" stroke="#18181B" strokeWidth="1.8" />
            </g>

            {/* Activity Logs row */}
            <g transform="translate(0, 136)">
              <circle cx="6" cy="10" r="3" fill="#10B981" />
              <rect x="15" y="7" width="120" height="6" rx="3" fill="#18181B" />
              <rect x="145" y="7" width="45" height="6" rx="3" fill="#E4E4E7" />

              <circle cx="6" cy="24" r="3" fill="#7C3AED" />
              <rect x="15" y="21" width="105" height="6" rx="3" fill="#18181B" />
              <rect x="130" y="21" width="60" height="6" rx="3" fill="#E4E4E7" />
            </g>
          </g>
        </g>

        {/* Security Shield & Golden Key Badge at Top Right */}
        <g id="admin-security-badge" transform="translate(380, 80)">
          {/* Shield Outline */}
          <path
            d="M 30 10 L 55 20 L 55 45 C 55 65, 30 78, 30 78 C 30 78, 5 65, 5 45 L 5 20 Z"
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="2.8"
          />
          {/* Inner Shield fill */}
          <path
            d="M 30 16 L 49 24 L 49 44 C 49 59, 30 70, 30 70 C 30 70, 11 59, 11 44 L 11 24 Z"
            fill="#7C3AED"
            fillOpacity="0.2"
          />
          {/* Padlock Icon in Center */}
          <rect x="22" y="38" width="16" height="14" rx="3" fill="#18181B" />
          <path d="M 25 38 L 25 31 C 25 28, 35 28, 35 31 L 35 38" fill="none" stroke="#18181B" strokeWidth="2.5" />
          <circle cx="30" cy="44" r="1.5" fill="#FFFFFF" />
        </g>

        {/* Institutional Pillars / Greek Column Symbol at Bottom Right */}
        <g id="institution-pillar" transform="translate(415, 290)">
          {/* Pedestal Base */}
          <rect x="0" y="70" width="55" height="12" rx="2" fill="#FFFFFF" stroke="#18181B" strokeWidth="2.4" />
          {/* Column Flutes */}
          <rect x="6" y="25" width="9" height="45" rx="1.5" fill="#FFFFFF" stroke="#18181B" strokeWidth="2.2" />
          <rect x="18" y="25" width="9" height="45" rx="1.5" fill="#FFFFFF" stroke="#18181B" strokeWidth="2.2" />
          <rect x="30" y="25" width="9" height="45" rx="1.5" fill="#FFFFFF" stroke="#18181B" strokeWidth="2.2" />
          <rect x="42" y="25" width="7" height="45" rx="1.5" fill="#FFFFFF" stroke="#18181B" strokeWidth="2.2" />
          {/* Capital Header */}
          <rect x="0" y="13" width="55" height="12" rx="2" fill="#FFFFFF" stroke="#18181B" strokeWidth="2.4" />
          {/* Arch pediment triangle */}
          <path d="M -4 13 L 27.5 0 L 59 13 Z" fill="#FFFFFF" stroke="#18181B" strokeWidth="2.4" />
        </g>

        {/* CHARACTER: SYSTEM ADMINISTRATOR / DIRECTOR (Executive attire, reviewing terminal) */}
        <g id="admin-director-character">
          {/* Sleek Hair */}
          <path
            d="M 105 160 C 95 140, 125 125, 148 130 C 158 135, 164 150, 160 162 C 152 156, 138 160, 132 155 C 122 158, 112 160, 105 160 Z"
            fill="#18181B"
          />

          {/* Head & Confident Face */}
          <circle cx="138" cy="155" r="15" fill="#FFFFFF" stroke="#18181B" strokeWidth="2.8" />
          <path d="M 132 154 Q 136 158 140 154" stroke="#18181B" strokeWidth="1.8" strokeLinecap="round" fill="none" />
          <path d="M 141 150 L 144 150" stroke="#18181B" strokeWidth="2" strokeLinecap="round" />

          {/* Executive Suit & Collar */}
          <path
            d="M 118 175 L 160 175 L 168 260 L 108 260 Z"
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="3"
          />
          {/* Suit Lapel & Tie */}
          <path d="M 138 175 L 138 220 L 126 190" stroke="#18181B" strokeWidth="2.2" fill="none" />
          <path d="M 138 220 L 150 190" stroke="#18181B" strokeWidth="2.2" fill="none" />
          {/* Royal Purple Tie */}
          <path d="M 136 175 L 140 175 L 141 215 L 138 225 L 135 215 Z" fill="#7C3AED" stroke="#18181B" strokeWidth="1.5" />

          {/* Left Arm: Gesturing confidently toward Admin Dashboard */}
          <path
            d="M 155 185 L 185 195 L 210 185"
            stroke="#18181B"
            strokeWidth="3.2"
            fill="none"
            strokeLinecap="round"
          />
          <circle cx="210" cy="185" r="4" fill="#FFFFFF" stroke="#18181B" strokeWidth="2" />

          {/* Right Arm: Holding Security Card / Master Key fob */}
          <path
            d="M 118 185 L 98 220 L 115 230"
            stroke="#18181B"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
          {/* Smart Master Security Keycard */}
          <rect x="90" y="215" width="22" height="32" rx="3" fill="#18181B" transform="rotate(-15 90 215)" />
          <rect x="93" y="218" width="16" height="26" rx="2" fill="#7C3AED" transform="rotate(-15 90 215)" />
          <circle cx="98" cy="225" r="2.5" fill="#FFFFFF" />

          {/* Tailored Suit Trousers */}
          <path
            d="M 108 260 L 134 260 L 130 365 L 106 365 Z"
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="2.8"
          />
          <path
            d="M 138 260 L 168 260 L 164 365 L 136 365 Z"
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="2.8"
          />

          {/* Formal Leather Shoes */}
          <path d="M 100 365 L 132 365 L 132 376 L 98 376 Z" fill="#18181B" />
          <path d="M 134 365 L 166 365 L 166 376 L 132 376 Z" fill="#18181B" />
        </g>
      </svg>
    </div>
  );
};
