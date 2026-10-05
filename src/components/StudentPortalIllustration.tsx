import React from 'react';

export const StudentPortalIllustration: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div className={`relative w-full flex items-center justify-center select-none ${className}`}>
      <svg
        viewBox="0 0 520 440"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto max-h-[440px] sm:max-h-[500px] drop-shadow-xl transition-transform duration-300 hover:scale-[1.02]"
      >
        {/* Organic ambient light lilac background patches */}
        <path
          d="M 60 140 C 20 180, 10 260, 50 320 C 90 380, 180 410, 240 370 C 300 330, 280 250, 240 190 C 200 130, 100 100, 60 140 Z"
          fill="white"
          fillOpacity="0.08"
        />
        <path
          d="M 320 40 C 380 20, 460 60, 490 130 C 520 200, 480 280, 430 330 C 380 380, 310 390, 270 340 C 230 290, 240 210, 270 140 C 300 70, 260 60, 320 40 Z"
          fill="white"
          fillOpacity="0.07"
        />

        {/* Central Document / Learning Module Card */}
        <g id="document-board">
          {/* Card shadow */}
          <rect x="204" y="164" width="220" height="230" rx="14" fill="#18181B" fillOpacity="0.25" />
          {/* Main White Card Body */}
          <rect
            x="200"
            y="160"
            width="220"
            height="230"
            rx="14"
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="3.2"
          />

          {/* Card subtle top lines */}
          <rect x="235" y="180" width="30" height="4" rx="2" fill="#18181B" />
          <rect x="272" y="180" width="45" height="4" rx="2" fill="#E4E4E7" />
          <line x1="235" y1="195" x2="295" y2="195" stroke="#18181B" strokeWidth="2.5" strokeLinecap="round" />

          {/* Horizontal content slots */}
          <rect x="280" y="220" width="115" height="6" rx="3" fill="#E4E4E7" />
          <rect x="280" y="240" width="95" height="6" rx="3" fill="#E4E4E7" />
          <rect x="280" y="260" width="120" height="6" rx="3" fill="#E4E4E7" />
          <rect x="280" y="280" width="105" height="6" rx="3" fill="#E4E4E7" />
          <rect x="235" y="310" width="165" height="6" rx="3" fill="#E4E4E7" />
          <rect x="235" y="326" width="130" height="6" rx="3" fill="#E4E4E7" />
          <rect x="235" y="342" width="150" height="6" rx="3" fill="#E4E4E7" />

          {/* Bottom right subtle slash */}
          <line x1="395" y1="365" x2="402" y2="372" stroke="#18181B" strokeWidth="2" strokeLinecap="round" />
        </g>

        {/* Big Magnifying Glass / Ring Symbol over the Document */}
        <g id="magnifier-ring" transform="translate(195, 200)">
          {/* Outer circle */}
          <circle cx="50" cy="50" r="44" fill="#FFFFFF" stroke="#18181B" strokeWidth="3.5" />
          {/* Inner circle */}
          <circle cx="50" cy="50" r="26" fill="#F4F4F5" stroke="#18181B" strokeWidth="3" />
          {/* Inner center dot */}
          <circle cx="50" cy="50" r="7" fill="#18181B" />
          {/* Magnifier Handle pointing down */}
          <path
            d="M 50 94 L 50 120"
            stroke="#18181B"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        </g>

        {/* Potted Plant on the bottom right */}
        <g id="potted-plant" transform="translate(390, 230)">
          {/* Tall background leaf */}
          <path
            d="M 45 90 C 50 20, 85 -20, 105 -60 C 115 10, 85 70, 60 100 Z"
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="3"
          />
          <path d="M 55 85 Q 80 15 103 -55" stroke="#18181B" strokeWidth="2" strokeLinecap="round" />

          {/* Left arched leaf */}
          <path
            d="M 35 95 C 10 50, -20 20, -35 -15 C -10 15, 15 60, 30 105 Z"
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="3"
          />
          <path d="M 30 95 Q -5 35 -33 -10" stroke="#18181B" strokeWidth="2" strokeLinecap="round" />

          {/* Right wide leaf */}
          <path
            d="M 50 100 C 75 60, 105 35, 120 5 C 105 40, 80 80, 55 110 Z"
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="3"
          />
          <path d="M 50 100 Q 85 50 118 8" stroke="#18181B" strokeWidth="2" strokeLinecap="round" />

          {/* Black Planter Pot */}
          <path
            d="M 15 105 C 15 100, 75 100, 75 105 L 68 160 C 68 165, 22 165, 22 160 Z"
            fill="#18181B"
            stroke="#18181B"
            strokeWidth="2.5"
          />
        </g>

        {/* Student 2: Sitting on top of the document with laptop */}
        <g id="seated-student" transform="translate(310, 85)">
          {/* Head & Face */}
          <circle cx="65" cy="28" r="14" fill="#FFFFFF" stroke="#18181B" strokeWidth="3" />
          {/* Black Hair */}
          <path
            d="M 51 28 C 51 15, 63 11, 77 17 C 82 23, 80 32, 75 34 C 70 30, 65 32, 57 35 C 53 32, 51 30, 51 28 Z"
            fill="#18181B"
          />
          {/* Facial feature (eye looking forward/up) */}
          <circle cx="72" cy="27" r="2" fill="#18181B" />
          {/* Smile/Nose */}
          <path d="M 76 30 L 78 32" stroke="#18181B" strokeWidth="1.5" strokeLinecap="round" />

          {/* Torso / White Sweater */}
          <path
            d="M 40 46 C 55 38, 78 38, 88 50 L 80 92 L 32 88 Z"
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="3.2"
            strokeLinejoin="round"
          />

          {/* Left Arm resting toward laptop */}
          <path
            d="M 68 54 C 80 66, 95 78, 108 82 L 98 88 C 85 84, 72 72, 58 62 Z"
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="2.8"
            strokeLinejoin="round"
          />

          {/* Legs stretched / dangling */}
          <path
            d="M 60 84 L 98 90 C 110 94, 118 110, 126 132 L 140 136 C 148 136, 148 148, 136 148 L 118 144 C 110 124, 102 104, 90 100 L 58 96 Z"
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="3.2"
            strokeLinejoin="round"
          />

          {/* Black Shoes */}
          <path
            d="M 136 133 L 154 135 C 160 138, 154 150, 140 150 L 126 146 Z"
            fill="#18181B"
          />
          <path
            d="M 112 144 L 126 147 C 130 151, 124 160, 114 160 L 102 153 Z"
            fill="#18181B"
          />

          {/* Open Laptop on lap */}
          {/* Screen lid angled up */}
          <polygon
            points="98,82 128,50 133,53 103,85"
            fill="#18181B"
            stroke="#18181B"
            strokeWidth="1.5"
          />
          {/* Base */}
          <polygon
            points="82,88 110,84 116,88 88,92"
            fill="#18181B"
            stroke="#18181B"
            strokeWidth="1.5"
          />
        </g>

        {/* Student 1: Walking on the left with backpack & phone */}
        <g id="walking-student" transform="translate(150, 165)">
          {/* Backpack behind back */}
          <path
            d="M 38 70 C 22 80, 18 112, 22 136 C 26 148, 38 148, 42 136 Z"
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="3.2"
          />
          <line x1="30" y1="95" x2="36" y2="112" stroke="#18181B" strokeWidth="2" strokeLinecap="round" />

          {/* Trousers & Walking Legs */}
          {/* Left Leg back */}
          <path
            d="M 40 150 L 32 230 L 44 250 L 54 250 L 50 225 L 60 150 Z"
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="3.2"
            strokeLinejoin="round"
          />
          {/* Right Leg forward */}
          <path
            d="M 60 150 L 76 225 L 92 250 L 102 250 L 88 220 L 70 150 Z"
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="3.2"
            strokeLinejoin="round"
          />

          {/* Black Shoes */}
          <path d="M 38 246 L 58 247 C 60 254, 48 259, 34 255 Z" fill="#18181B" />
          <path d="M 86 246 L 106 247 C 108 254, 96 259, 82 255 Z" fill="#18181B" />

          {/* White Shirt / Torso */}
          <path
            d="M 38 55 L 68 55 L 76 150 L 34 150 Z"
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="3.2"
            strokeLinejoin="round"
          />

          {/* Arm holding mobile phone */}
          <path
            d="M 45 62 L 28 100 L 16 108 L 24 116 L 40 108 L 52 74 Z"
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="2.8"
            strokeLinejoin="round"
          />
          {/* Mobile phone in hand */}
          <rect
            x="8"
            y="100"
            width="18"
            height="11"
            rx="2.5"
            transform="rotate(-25 8 100)"
            fill="#18181B"
          />

          {/* Head & Face */}
          <circle cx="56" cy="30" r="14" fill="#FFFFFF" stroke="#18181B" strokeWidth="3" />
          {/* Black Hair */}
          <path
            d="M 42 28 C 42 14, 56 9, 70 16 C 74 23, 70 34, 63 36 C 60 30, 54 32, 46 37 C 43 33, 42 30, 42 28 Z"
            fill="#18181B"
          />
          {/* Eye */}
          <circle cx="63" cy="30" r="2" fill="#18181B" />
          {/* Backpack strap on shoulder */}
          <path d="M 42 60 C 40 76, 42 104, 45 120" stroke="#18181B" strokeWidth="2.8" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  );
};
