import React from 'react';

export const ParentPortalIllustration: React.FC<{ className?: string }> = ({ className = '' }) => {
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
          d="M 50 120 C 10 180, 20 280, 70 340 C 120 400, 210 420, 280 370 C 340 320, 310 230, 260 170 C 210 110, 90 80, 50 120 Z"
          fill="white"
          fillOpacity="0.09"
        />
        <path
          d="M 310 50 C 370 20, 460 50, 490 120 C 520 190, 490 280, 440 330 C 390 380, 320 390, 280 340 C 240 290, 250 200, 270 130 C 290 70, 260 60, 310 50 Z"
          fill="white"
          fillOpacity="0.08"
        />

        {/* Central Student Report / Growth Card */}
        <g id="parent-growth-card">
          {/* Card shadow */}
          <rect x="184" y="154" width="230" height="240" rx="16" fill="#18181B" fillOpacity="0.25" />
          {/* Main White Card Body */}
          <rect
            x="180"
            y="150"
            width="230"
            height="240"
            rx="16"
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="3.2"
          />

          {/* Card Header & Badge */}
          <rect x="210" y="174" width="34" height="6" rx="3" fill="#18181B" />
          <rect x="252" y="174" width="55" height="6" rx="3" fill="#E4E4E7" />
          
          {/* Star of Excellence Badge */}
          <circle cx="370" cy="184" r="16" fill="#FEF08A" stroke="#18181B" strokeWidth="2.5" />
          <path
            d="M 370 174 L 372.5 180.5 L 379.5 180.8 L 374 185 L 376 191.5 L 370 187.5 L 364 191.5 L 366 185 L 360.5 180.8 L 367.5 180.5 Z"
            fill="#EAB308"
            stroke="#18181B"
            strokeWidth="1.2"
          />

          {/* Progress Growth Bars */}
          <g id="growth-graph" transform="translate(210, 210)">
            <line x1="0" y1="65" x2="170" y2="65" stroke="#18181B" strokeWidth="2" strokeLinecap="round" />
            
            {/* Bar 1 - Term 1 */}
            <rect x="15" y="32" width="22" height="33" rx="4" fill="#E4E4E7" stroke="#18181B" strokeWidth="2" />
            {/* Bar 2 - Term 2 */}
            <rect x="50" y="20" width="22" height="45" rx="4" fill="#E4E4E7" stroke="#18181B" strokeWidth="2" />
            {/* Bar 3 - Term 3 (Top score) */}
            <rect x="85" y="8" width="22" height="57" rx="4" fill="#BBF7D0" stroke="#18181B" strokeWidth="2.2" />
            {/* Bar 4 - Overall */}
            <rect x="120" y="16" width="22" height="49" rx="4" fill="#E4E4E7" stroke="#18181B" strokeWidth="2" />
            
            {/* Rising Trend Line with Dot Indicator */}
            <path
              d="M 26 30 Q 60 14 96 6 T 131 14"
              fill="none"
              stroke="#059669"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <circle cx="96" cy="6" r="4" fill="#10B981" stroke="#18181B" strokeWidth="1.8" />
          </g>

          {/* Report summary lines */}
          <rect x="210" y="295" width="165" height="6" rx="3" fill="#E4E4E7" />
          <rect x="210" y="312" width="135" height="6" rx="3" fill="#E4E4E7" />
          <rect x="210" y="329" width="150" height="6" rx="3" fill="#E4E4E7" />
          <rect x="210" y="346" width="110" height="6" rx="3" fill="#E4E4E7" />
          
          <circle cx="375" cy="350" r="10" fill="#E4E4E7" stroke="#18181B" strokeWidth="2" />
          <polyline points="371,350 374,353 379,347" fill="none" stroke="#059669" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </g>

        {/* Big Heart & Shield Protector Ring */}
        <g id="family-bond-shield" transform="translate(160, 220)">
          <circle cx="42" cy="42" r="40" fill="#FFFFFF" stroke="#18181B" strokeWidth="3" />
          <circle cx="42" cy="42" r="30" fill="none" stroke="#18181B" strokeWidth="2" strokeDasharray="3 3" />
          {/* Heart icon in center */}
          <path
            d="M 42 50 C 42 50, 28 40, 28 32 C 28 26, 33 22, 38 24 C 40 25, 42 27, 42 27 C 42 27, 44 25, 46 24 C 51 22, 56 26, 56 32 C 56 40, 42 50, 42 50 Z"
            fill="#F43F5E"
            stroke="#18181B"
            strokeWidth="1.8"
          />
        </g>

        {/* Potted Indoor Plant at Right Side */}
        <g id="potted-plant" transform="translate(390, 230)">
          {/* Leaf 1 */}
          <path
            d="M 30 110 C 20 60, 5 30, 40 10 C 65 35, 50 80, 30 110 Z"
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="2.8"
          />
          {/* Leaf 2 */}
          <path
            d="M 30 110 C 50 70, 75 45, 65 15 C 40 25, 30 65, 30 110 Z"
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="2.8"
          />
          {/* Leaf 3 */}
          <path
            d="M 28 110 C 45 95, 75 105, 85 85 C 60 75, 40 85, 28 110 Z"
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="2.8"
          />
          {/* Pot base */}
          <path
            d="M 12 110 L 48 110 L 42 165 L 18 165 Z"
            fill="#18181B"
            stroke="#18181B"
            strokeWidth="2.5"
          />
        </g>

        {/* PERSON 1: PARENT / GUARDIAN (Standing proudly at left, guiding with notebook) */}
        <g id="parent-character">
          {/* Parent Hair */}
          <path
            d="M 100 190 C 95 170, 115 155, 135 160 C 145 165, 150 178, 148 190 C 140 188, 130 192, 125 186 C 115 188, 105 192, 100 190 Z"
            fill="#18181B"
          />

          {/* Parent Face & Neck */}
          <circle cx="125" cy="185" r="14" fill="#FFFFFF" stroke="#18181B" strokeWidth="2.6" />
          <path d="M 120 184 Q 123 186 126 184" stroke="#18181B" strokeWidth="1.6" strokeLinecap="round" fill="none" />
          <path d="M 128 181 L 130 181" stroke="#18181B" strokeWidth="2" strokeLinecap="round" />
          {/* Friendly glasses */}
          <rect x="120" y="179" width="8" height="6" rx="2" fill="none" stroke="#18181B" strokeWidth="1.4" />
          <rect x="130" y="179" width="8" height="6" rx="2" fill="none" stroke="#18181B" strokeWidth="1.4" />
          <line x1="128" y1="182" x2="130" y2="182" stroke="#18181B" strokeWidth="1.4" />

          {/* Parent Upper Torso & Blazer */}
          <path
            d="M 110 205 L 140 205 L 148 275 L 102 275 Z"
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="2.8"
          />
          {/* Blazer Lapel & Collar */}
          <path d="M 125 205 L 125 240 L 115 215" stroke="#18181B" strokeWidth="2" fill="none" />
          <path d="M 125 240 L 135 215" stroke="#18181B" strokeWidth="2" fill="none" />
          
          {/* Left Arm holding Parent Tablet/Clipboard */}
          <path
            d="M 110 215 L 90 250 L 110 260"
            stroke="#18181B"
            strokeWidth="2.8"
            fill="none"
            strokeLinecap="round"
          />
          {/* Tablet */}
          <rect x="80" y="245" width="28" height="36" rx="4" fill="#18181B" transform="rotate(-15 80 245)" />
          <rect x="83" y="248" width="22" height="30" rx="2" fill="#FFFFFF" transform="rotate(-15 80 245)" />

          {/* Right Arm resting warmly on Child's shoulder */}
          <path
            d="M 140 215 C 155 220, 168 230, 175 240"
            stroke="#18181B"
            strokeWidth="3.2"
            fill="none"
            strokeLinecap="round"
          />

          {/* Parent Trousers */}
          <path
            d="M 102 275 L 122 275 L 120 370 L 102 370 Z"
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="2.8"
          />
          <path
            d="M 126 275 L 148 275 L 146 370 L 128 370 Z"
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="2.8"
          />

          {/* Parent Shoes */}
          <path d="M 96 370 L 122 370 L 122 380 L 94 380 Z" fill="#18181B" />
          <path d="M 126 370 L 152 370 L 152 380 L 124 380 Z" fill="#18181B" />
        </g>

        {/* PERSON 2: YOUNG STUDENT (Sitting joyfully on report board reviewing progress) */}
        <g id="child-student-character">
          {/* Student Hair */}
          <path
            d="M 345 130 C 335 115, 360 100, 380 110 C 390 115, 395 130, 390 140 C 382 135, 368 138, 362 132 C 352 135, 348 132, 345 130 Z"
            fill="#18181B"
          />
          {/* Head & Joyful Face */}
          <circle cx="368" cy="135" r="12" fill="#FFFFFF" stroke="#18181B" strokeWidth="2.6" />
          <path d="M 364 136 Q 368 140 372 136" stroke="#18181B" strokeWidth="1.8" strokeLinecap="round" fill="none" />
          <path d="M 370 131 L 372 131" stroke="#18181B" strokeWidth="2" strokeLinecap="round" />

          {/* School Backpack on Back */}
          <path
            d="M 340 150 C 330 155, 332 185, 342 195 L 350 195 Z"
            fill="#18181B"
            stroke="#18181B"
            strokeWidth="2.2"
          />

          {/* Student Shirt */}
          <path
            d="M 352 148 L 382 148 L 388 200 L 348 200 Z"
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="2.8"
          />
          {/* School Tie */}
          <path d="M 367 148 L 369 170 L 366 175 L 364 170 Z" fill="#18181B" />

          {/* Student Left Arm raising a thumbs up */}
          <path
            d="M 382 160 L 405 155 L 415 145"
            stroke="#18181B"
            strokeWidth="2.8"
            fill="none"
            strokeLinecap="round"
          />
          {/* Thumbs up hand */}
          <circle cx="417" cy="143" r="4" fill="#FFFFFF" stroke="#18181B" strokeWidth="2" />
          <path d="M 416 141 L 416 137" stroke="#18181B" strokeWidth="2" strokeLinecap="round" />

          {/* Sitting Legs on the card */}
          <path
            d="M 350 200 L 390 200 L 410 240 L 385 240 Z"
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="2.8"
          />
          {/* Dangling Lower Legs */}
          <path
            d="M 400 240 L 400 285 L 388 285 L 388 240 Z"
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="2.8"
          />
          {/* Shoes */}
          <path d="M 384 285 L 412 285 L 410 296 L 384 296 Z" fill="#18181B" />
        </g>
      </svg>
    </div>
  );
};
