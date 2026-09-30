import React from 'react';

export default function NetampsLogo({ className = "h-10 w-10 md:h-12 md:w-12" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      className={`${className} transform-gpu`}
      style={{ willChange: "transform, filter" }}
    >
      <defs>
        <style>
          {`
            @keyframes glitch {
              0% { transform: translate(0) }
              20% { transform: translate(-2px, 1px) }
              40% { transform: translate(-1px, -1px) }
              60% { transform: translate(2px, 1px) }
              80% { transform: translate(1px, -1px) }
              100% { transform: translate(0) }
            }
            @keyframes glow {
              0% { filter: drop-shadow(0 0 4px rgba(79, 70, 229, 0.6)) }
              50% { filter: drop-shadow(0 0 10px rgba(79, 70, 229, 0.9)) }
              100% { filter: drop-shadow(0 0 4px rgba(79, 70, 229, 0.6)) }
            }
            .logo-text {
              font-family: 'Inter', sans-serif;
              font-weight: 900;
              font-size: 55px;
              letter-spacing: -2px;
              animation: glow 3s ease-in-out infinite;
            }
            .glitch-layer-1 {
              animation: glitch 4s infinite linear alternate-reverse;
              fill: #06b6d4; /* Cyan */
              opacity: 0.7;
            }
            .glitch-layer-2 {
              animation: glitch 3s infinite linear alternate-reverse;
              fill: #ec4899; /* Pink */
              opacity: 0.7;
            }
          `}
        </style>
        <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="100%" stopColor="#1e1b4b" />
        </linearGradient>
      </defs>
      
      {/* Background */}
      <rect width="100" height="100" rx="20" fill="url(#bgGradient)" />
      
      {/* Glitch Layers */}
      <text x="50" y="65" textAnchor="middle" className="logo-text glitch-layer-1">nt</text>
      <text x="48" y="66" textAnchor="middle" className="logo-text glitch-layer-2">nt</text>
      
      {/* Main Text */}
      <text x="49" y="65.5" textAnchor="middle" fill="#ffffff" className="logo-text">nt</text>
    </svg>
  );
}
