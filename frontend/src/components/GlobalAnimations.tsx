'use client';

import { useEffect } from 'react';

/**
 * Global UI Animations
 * Injected once globally to power vibrant UI effects
 */
export function GlobalAnimations() {
  useEffect(() => {
    const styleId = 'grid-global-animations';

    if (typeof document !== 'undefined' && !document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.innerHTML = `
        /* Core Pulse */
        @keyframes reactorPulse {
          0%, 100% {
            transform: scale(1);
            filter: brightness(1);
          }
          50% {
            transform: scale(1.05);
            filter: brightness(1.2);
          }
        }

        @keyframes corePulse {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
            box-shadow: 0px 0px 12px 3px rgba(0, 217, 255, 0.8);
          }
          50% {
            transform: scale(1.15);
            opacity: 0.9;
            box-shadow: 0px 0px 20px 6px rgba(0, 217, 255, 1);
          }
        }

        @keyframes arcPulse {
          0%, 100% {
            opacity: 0.3;
            transform: scale(1);
          }
          50% {
            opacity: 0.6;
            transform: scale(1.1);
          }
        }

        /* Energy Field Ripple */
        @keyframes energyRipple {
          0% {
            transform: scale(0.95);
            opacity: 0.8;
          }
          50% {
            transform: scale(1.05);
            opacity: 1;
          }
          100% {
            transform: scale(0.95);
            opacity: 0.8;
          }
        }

        /* Holographic Shimmer */
        @keyframes holographicShimmer {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }

        /* Neon Glow Pulse */
        @keyframes neonGlow {
          0%, 100% {
            filter: brightness(1) drop-shadow(0 0 5px currentColor);
          }
          50% {
            filter: brightness(1.3) drop-shadow(0 0 15px currentColor);
          }
        }

        /* Particle Float */
        @keyframes particleFloat {
          0%, 100% {
            transform: translateY(0px) translateX(0px);
            opacity: 0.6;
          }
          33% {
            transform: translateY(-20px) translateX(10px);
            opacity: 1;
          }
          66% {
            transform: translateY(-10px) translateX(-10px);
            opacity: 0.8;
          }
        }

        /* Energy Scan Line */
        @keyframes scanLine {
          0% {
            transform: translateY(-100%);
          }
          100% {
            transform: translateY(200%);
          }
        }

        /* Data Stream */
        @keyframes dataStream {
          0% {
            transform: translateX(-100%);
            opacity: 0;
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: translateX(200%);
            opacity: 0;
          }
        }

        /* Button Hover Lift with Energy */
        @keyframes buttonEnergyLift {
          0% {
            transform: translateY(0px);
            box-shadow: 0px 8px 24px 0px rgba(59, 124, 255, 0.20);
          }
          100% {
            transform: translateY(-3px);
            box-shadow: 0px 16px 40px 0px rgba(59, 124, 255, 0.40), 0px 0px 20px 4px rgba(0, 217, 255, 0.3);
          }
        }

        /* Card Hover with Arc Glow */
        @keyframes cardArcGlow {
          0% {
            box-shadow: 0px 2px 4px 0px rgba(0, 0, 0, 0.06);
          }
          100% {
            box-shadow: 0px 8px 16px 0px rgba(0, 0, 0, 0.10), 0px 0px 30px 4px rgba(59, 124, 255, 0.2);
          }
        }

        /* Progress Bar Fill with Glow */
        @keyframes progressGlow {
          0%, 100% {
            filter: brightness(1);
          }
          50% {
            filter: brightness(1.2) drop-shadow(0 0 8px currentColor);
          }
        }

        /* Modal Entrance */
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes modalSlideIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        /* Spinner */
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        /* Gradient Animation for Holographic Elements */
        @keyframes gradientShift {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }

        /* Vibration Effect for Active Elements */
        @keyframes vibrate {
          0%, 100% {
            transform: translateX(0);
          }
          25% {
            transform: translateX(-2px);
          }
          75% {
            transform: translateX(2px);
          }
        }

        /* Notification Slide In */
        @keyframes notificationSlide {
          from {
            transform: translateX(400px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }

        /* Energy Charge Effect */
        @keyframes energyCharge {
          0% {
            transform: scale(1);
            opacity: 0;
          }
          50% {
            opacity: 0.8;
          }
          100% {
            transform: scale(2);
            opacity: 0;
          }
        }

        /* Skeleton Pulse for Loading States */
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        /* Utility Classes for Easy Use */
        .arc-pulse {
          animation: reactorPulse 2s ease-in-out infinite;
        }

        .energy-glow {
          animation: neonGlow 2s ease-in-out infinite;
        }

        .holographic {
          background-size: 200% 200%;
          animation: holographicShimmer 3s ease infinite;
        }

        .float-particle {
          animation: particleFloat 3s ease-in-out infinite;
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  return null;
}
