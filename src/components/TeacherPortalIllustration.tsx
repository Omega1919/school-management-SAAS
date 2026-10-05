import React from 'react';

export const TeacherPortalIllustration: React.FC<{ className?: string }> = ({ className = '' }) => {
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
          d="M 70 110 C 20 160, 20 260, 60 320 C 110 380, 200 400, 270 360 C 330 310, 310 220, 260 160 C 210 100, 110 80, 70 110 Z"
          fill="white"
          fillOpacity="0.08"
        />
        <path
          d="M 330 40 C 390 15, 470 50, 495 120 C 520 190, 490 270, 440 320 C 390 370, 310 380, 270 330 C 230 280, 250 200, 280 130 C 300 70, 270 60, 330 40 Z"
          fill="white"
          fillOpacity="0.07"
        />

        {/* Central Teacher Classroom Board / Smart Lesson Screen */}
        <g id="classroom-whiteboard">
          {/* Board Stand / Legs */}
          <line x1="220" y1="360" x2="190" y2="400" stroke="#18181B" strokeWidth="4" strokeLinecap="round" />
          <line x1="380" y1="360" x2="410" y2="400" stroke="#18181B" strokeWidth="4" strokeLinecap="round" />
          
          {/* Board shadow */}
          <rect x="184" y="144" width="230" height="220" rx="14" fill="#18181B" fillOpacity="0.25" />
          {/* Whiteboard Body */}
          <rect
            x="180"
            y="140"
            width="230"
            height="220"
            rx="14"
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="3.2"
          />

          {/* Whiteboard top toolbar and pin */}
          <rect x="210" y="156" width="30" height="5" rx="2.5" fill="#18181B" />
          <circle cx="285" cy="158" r="4" fill="#6366F1" stroke="#18181B" strokeWidth="1.5" />
          <circle cx="300" cy="158" r="4" fill="#A5B4FC" stroke="#18181B" strokeWidth="1.5" />
          
          {/* Classroom Lesson Content: Math / Science / Code formulas */}
          <g id="board-content" transform="translate(205, 175)">
            {/* Subject Tag */}
            <rect x="5" y="5" width="80" height="18" rx="5" fill="#EEF2FF" stroke="#18181B" strokeWidth="1.8" />
            <text x="14" y="18" fill="#4338CA" fontSize="10" fontWeight="bold" fontFamily="sans-serif">LESSON PLAN</text>

            {/* Formula / Graph on Board */}
            <path
              d="M 10 70 Q 35 30 65 60 T 120 40"
              fill="none"
              stroke="#4F46E5"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            {/* Grid points */}
            <circle cx="35" cy="45" r="3" fill="#818CF8" stroke="#18181B" strokeWidth="1.2" />
            <circle cx="65" cy="60" r="3" fill="#818CF8" stroke="#18181B" strokeWidth="1.2" />
            <circle cx="95" cy="45" r="3" fill="#818CF8" stroke="#18181B" strokeWidth="1.2" />

            {/* Bullet point items */}
            <circle cx="10" cy="95" r="3" fill="#18181B" />
            <rect x="20" y="92" width="130" height="6" rx="3" fill="#E4E4E7" />
            
            <circle cx="10" cy="115" r="3" fill="#18181B" />
            <rect x="20" y="112" width="100" height="6" rx="3" fill="#E4E4E7" />

            <circle cx="10" cy="135" r="3" fill="#18181B" />
            <rect x="20" y="132" width="140" height="6" rx="3" fill="#E4E4E7" />

            <rect x="20" y="150" width="115" height="6" rx="3" fill="#E4E4E7" />
          </g>

          {/* Marker Tray at bottom of board */}
          <rect x="230" y="356" width="130" height="6" rx="3" fill="#18181B" />
          <rect x="260" y="352" width="20" height="4" rx="2" fill="#6366F1" />
          <rect x="290" y="352" width="20" height="4" rx="2" fill="#E11D48" />
        </g>

        {/* Graduation Cap Floating Symbol / Excellence */}
        <g id="grad-cap-badge" transform="translate(370, 100)">
          {/* Diamond Cap */}
          <path d="M 40 10 L 70 24 L 40 38 L 10 24 Z" fill="#18181B" stroke="#18181B" strokeWidth="2" />
          {/* Skullcap skull */}
          <path d="M 22 28 L 22 40 C 22 48, 58 48, 58 40 L 58 28" fill="#18181B" stroke="#18181B" strokeWidth="2" />
          {/* Tassel */}
          <path d="M 40 24 L 68 36 L 68 52" fill="none" stroke="#FBBF24" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="68" cy="54" r="3" fill="#F59E0B" />
        </g>

        {/* Stack of Academic Books at Bottom Right */}
        <g id="books-stack" transform="translate(390, 290)">
          {/* Book 1 (Bottom) */}
          <rect x="0" y="60" width="75" height="16" rx="3" fill="#FFFFFF" stroke="#18181B" strokeWidth="2.4" />
          <rect x="8" y="64" width="4" height="8" rx="1" fill="#18181B" />
          
          {/* Book 2 (Middle) */}
          <rect x="6" y="42" width="65" height="16" rx="3" fill="#FFFFFF" stroke="#18181B" strokeWidth="2.4" />
          <rect x="14" y="46" width="4" height="8" rx="1" fill="#4F46E5" />

          {/* Book 3 (Top) */}
          <rect x="12" y="24" width="55" height="16" rx="3" fill="#FFFFFF" stroke="#18181B" strokeWidth="2.4" />
          <rect x="20" y="28" width="4" height="8" rx="1" fill="#18181B" />

          {/* An Apple on top of books */}
          <circle cx="36" cy="14" r="9" fill="#EF4444" stroke="#18181B" strokeWidth="2" />
          <path d="M 36 6 Q 38 0 42 2" stroke="#18181B" strokeWidth="2" strokeLinecap="round" fill="none" />
          <path d="M 38 4 Q 44 2 42 7" fill="#10B981" stroke="#18181B" strokeWidth="1" />
        </g>

        {/* CHARACTER: TEACHER / PROFESSOR (Standing with Pointer & Tablet) */}
        <g id="teacher-character">
          {/* Hair & Style */}
          <path
            d="M 115 155 C 105 135, 130 120, 155 125 C 165 130, 172 145, 168 158 C 160 152, 145 156, 138 150 C 128 154, 120 156, 115 155 Z"
            fill="#18181B"
          />

          {/* Head & Thoughtful Face */}
          <circle cx="145" cy="150" r="15" fill="#FFFFFF" stroke="#18181B" strokeWidth="2.8" />
          <path d="M 139 148 Q 143 152 147 148" stroke="#18181B" strokeWidth="1.8" strokeLinecap="round" fill="none" />
          <path d="M 148 144 L 151 144" stroke="#18181B" strokeWidth="2" strokeLinecap="round" />
          {/* Professional spectacles */}
          <circle cx="140" cy="144" r="5" fill="none" stroke="#18181B" strokeWidth="1.5" />
          <circle cx="150" cy="144" r="5" fill="none" stroke="#18181B" strokeWidth="1.5" />
          <line x1="145" y1="144" x2="146" y2="144" stroke="#18181B" strokeWidth="1.5" />

          {/* Faculty Jacket & Shirt */}
          <path
            d="M 125 170 L 165 170 L 175 255 L 115 255 Z"
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="3"
          />
          {/* Shirt button line & ID Lanyard */}
          <line x1="145" y1="170" x2="145" y2="255" stroke="#18181B" strokeWidth="2" />
          {/* Faculty ID Badge */}
          <rect x="150" y="200" width="16" height="22" rx="2" fill="#FFFFFF" stroke="#18181B" strokeWidth="1.8" />
          <line x1="145" y1="170" x2="158" y2="200" stroke="#4F46E5" strokeWidth="2" />
          <rect x="153" y="208" width="10" height="3" rx="1.5" fill="#18181B" />

          {/* Left Arm: Holding Teaching Pointer reaching towards board */}
          <path
            d="M 160 180 L 195 190 L 225 180"
            stroke="#18181B"
            strokeWidth="3.2"
            fill="none"
            strokeLinecap="round"
          />
          {/* Pointer stick extension */}
          <line x1="225" y1="180" x2="270" y2="165" stroke="#18181B" strokeWidth="3" strokeLinecap="round" />
          <circle cx="270" cy="165" r="3" fill="#EF4444" />

          {/* Right Arm: Holding Digital Gradebook Tablet */}
          <path
            d="M 125 180 L 105 215 L 125 225"
            stroke="#18181B"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
          {/* Tablet in hand */}
          <rect x="95" y="210" width="30" height="38" rx="4" fill="#18181B" transform="rotate(-10 95 210)" />
          <rect x="98" y="213" width="24" height="32" rx="2" fill="#EEF2FF" transform="rotate(-10 95 210)" />
          <line x1="102" y1="220" x2="118" y2="217" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" />

          {/* Trousers */}
          <path
            d="M 115 255 L 140 255 L 136 365 L 112 365 Z"
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="2.8"
          />
          <path
            d="M 144 255 L 175 255 L 170 365 L 142 365 Z"
            fill="#FFFFFF"
            stroke="#18181B"
            strokeWidth="2.8"
          />

          {/* Professional Oxford Shoes */}
          <path d="M 106 365 L 138 365 L 138 376 L 104 376 Z" fill="#18181B" />
          <path d="M 140 365 L 172 365 L 172 376 L 138 376 Z" fill="#18181B" />
        </g>
      </svg>
    </div>
  );
};
