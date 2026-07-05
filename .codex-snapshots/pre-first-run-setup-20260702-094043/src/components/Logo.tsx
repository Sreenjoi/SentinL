import React from 'react';

export const Logo = ({ className = "w-8 h-8", fill = "none", faceColor, ...props }: React.SVGProps<SVGSVGElement> & { fill?: string, faceColor?: string }) => {
  const strokeColor = props.stroke || "currentColor";
  const isFilled = fill !== "none" && fill !== "";
  
  // When the logo is filled, we want the face features to contrast (e.g. be transparent/white)
  // We can achieve this by making the features stroke with the background color or white.
  const featureColor = faceColor || (isFilled ? "#ffffff" : strokeColor);

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <g stroke={strokeColor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {/* Antennae Lines */}
        <path d="M 23 26 L 16 12" fill="none" />
        <path d="M 41 26 L 48 12" fill="none" />

        {/* Antennae Blobs */}
        <circle cx="16" cy="12" r="4" fill={isFilled ? strokeColor : "none"} stroke={strokeColor} />
        <circle cx="48" cy="12" r="4" fill={isFilled ? strokeColor : "none"} stroke={strokeColor} />

        {/* Main Head */}
        <rect x="14" y="26" width="36" height="24" rx="6" fill={fill} stroke={strokeColor} />

        {/* Left Ear */}
        <path d="M 14 31 H 10 C 8.895 31 8 31.895 8 33 V 43 C 8 44.105 8.895 45 10 45 H 14" fill={fill} stroke={strokeColor} />
        
        {/* Right Ear */}
        <path d="M 50 31 H 54 C 55.105 31 56 31.895 56 33 V 43 C 56 44.105 55.105 45 54 45 H 50" fill={fill} stroke={strokeColor} />

        {/* Mouth */}
        <path d="M 26 43 Q 32 48 38 43" fill="none" stroke={featureColor} />

        {/* Eyes */}
        <circle cx="24" cy="36" r="3" fill={featureColor} stroke="none" />
        <circle cx="40" cy="36" r="3" fill={featureColor} stroke="none" />
      </g>
    </svg>
  );
};
