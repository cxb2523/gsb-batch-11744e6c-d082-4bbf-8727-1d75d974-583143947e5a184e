'use client';

import React, { useState } from 'react';
import { ButtonCore } from '@/components/ui';
import { Eye, EyeOff, Mail, Lock, BarChart3, Users, LineChart } from 'lucide-react';
import { API_BASE_URL } from '../../lib/api/client';
import { login } from '../../lib/api/auth';
import { GridLogo } from '@/components/GridLogo';
import GuestGuard from '@/components/GuestGuard';

export default function LoginPage() {
  return (
    <GuestGuard>
      <LoginForm />
    </GuestGuard>
  );
}

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setError('');

    setIsLoading(true);
    const result = await login(email.trim().toLowerCase(), password, rememberMe);
    if (result.status === 'ok') {
      // Forced first-login reset (AUTH-11) is enforced globally via /auth/me.
      window.location.href = '/dashboard';
      return;
    }
    setIsLoading(false);
    setError(
      {
        invalid: 'Email or password is incorrect. Check both and try again.',
        offline: 'Can’t reach the server. Check the backend is running and try again.',
        error: 'Something went wrong signing in. Try again.',
      }[result.status],
    );
  };

  const handleGoogleLogin = () => {
    if (typeof window !== 'undefined') {
      window.location.href = `${API_BASE_URL}/auth/google/login`;
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: '#FFFFFF',
      }}
    >
      {/* Left Panel - Branding (60%) */}
      <div
        style={{
          flex: '0 0 60%',
          background: 'linear-gradient(135deg, #0052CC 0%, #2684FF 100%)',
          padding: '80px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle background pattern */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: `radial-gradient(circle at 2px 2px, rgba(255,255,255,0.08) 1px, transparent 0)`,
            backgroundSize: '40px 40px',
            opacity: 0.3,
          }}
        />

        {/* Content */}
        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Logo */}
          <div style={{ marginBottom: '80px' }}>
            <div style={{ transform: 'scale(1.2)', transformOrigin: 'left' }}>
              <GridLogo variant="full" size={48} theme="dark" />
            </div>
            <div style={{
              fontSize: '14px',
              color: 'rgba(255,255,255,0.8)',
              marginTop: '16px',
              fontWeight: 500,
              letterSpacing: '0.05em'
            }}>
              POWERED BY STRATZI
            </div>
          </div>

          {/* Hero Text */}
          <h1
            style={{
              fontSize: '48px',
              fontWeight: 700,
              color: '#FFFFFF',
              lineHeight: '1.2',
              marginBottom: '24px',
              letterSpacing: '-0.02em',
            }}
          >
            Streamline your workflow
          </h1>
          <p
            style={{
              fontSize: '20px',
              color: 'rgba(255,255,255,0.9)',
              lineHeight: '1.6',
              marginBottom: '48px',
              maxWidth: '500px',
            }}
          >
            Collaborate seamlessly, track progress effortlessly, and deliver projects on time.
          </p>

          {/* Value Props */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {[
              { icon: BarChart3, title: 'Powerful project management', desc: 'Plan, track, and ship with confidence' },
              { icon: Users, title: 'Real-time collaboration', desc: 'Keep everyone aligned and productive' },
              { icon: LineChart, title: 'Insightful reports', desc: 'Track velocity and delivery at a glance' },
            ].map((item, index) => (
              <div key={index} style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <div style={{ lineHeight: '1' }}>
                  <item.icon size={32} color="#FFFFFF" strokeWidth={1.5} />
                </div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: '#FFFFFF', marginBottom: '4px' }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.8)' }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ position: 'relative', zIndex: 1, color: 'rgba(255,255,255,0.7)', fontSize: '14px' }}>
          © 2026 GRID · Powered by Stratzi
        </div>
      </div>

      {/* Right Panel - Login Form (40%) */}
      <div
        style={{
          flex: '0 0 40%',
          background: '#FAFBFC',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px',
        }}
      >
        <div style={{ width: '100%', maxWidth: '400px' }}>
          {/* Form Header */}
          <div style={{ marginBottom: '32px' }}>
            <h2
              style={{
                fontSize: '24px',
                fontWeight: 600,
                color: '#172B4D',
                marginBottom: '8px',
              }}
            >
              Log in to your account
            </h2>
            <p style={{ fontSize: '14px', color: '#5E6C84', margin: 0 }}>
              Welcome back! Please enter your details.
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div
              style={{
                padding: '12px 16px',
                background: '#FFEBE6',
                border: '1px solid #FFBDAD',
                borderRadius: '3px',
                marginBottom: '16px',
                fontSize: '14px',
                color: '#BF2600',
              }}
            >
              {error}
            </div>
          )}

          {/* Google Sign In */}
          <button
            onClick={handleGoogleLogin}
            style={{
              width: '100%',
              height: '44px',
              background: '#FFFFFF',
              border: '1px solid #DFE1E6',
              borderRadius: '3px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500,
              color: '#42526E',
              fontFamily: 'var(--font-sans)',
              transition: 'all 0.15s',
              marginBottom: '16px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#F4F5F7';
              e.currentTarget.style.borderColor = '#B3BAC5';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#FFFFFF';
              e.currentTarget.style.borderColor = '#DFE1E6';
            }}
          >
            <svg width="20" height="20" viewBox="0 0 18 18">
              <path
                fill="#4285F4"
                d="M9 7.3v3.1h4.3c-.2 1.1-.8 2-1.7 2.6l2.7 2.1c1.6-1.5 2.5-3.7 2.5-6 0-.6-.1-1.2-.2-1.8H9z"
              />
              <path
                fill="#34A853"
                d="M4.1 10.7 3.4 11.2 1.3 12.9C2.6 15.4 5.5 17 9 17c2.4 0 4.4-.8 5.9-2.2l-2.7-2.1c-.8.5-1.8.9-3.2.9-2.4 0-4.4-1.5-5.1-3.6z"
              />
              <path
                fill="#FBBC05"
                d="M1.3 5.1C.7 6.3.4 7.6.4 9s.3 2.7.9 3.9l2.8-2.2C3.8 10.2 3.7 9.6 3.7 9c0-.6.1-1.2.3-1.8L1.3 5.1z"
              />
              <path
                fill="#EA4335"
                d="M9 3.4c1.3 0 2.4.4 3.3 1.3l2.5-2.5C13.4.9 11.4.1 9 .1 5.5.1 2.6 1.7 1.3 4.2l2.8 2.1C4.6 4.9 6.6 3.4 9 3.4z"
              />
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: '24px 0' }}>
            <div style={{ flex: 1, height: '1px', background: '#DFE1E6' }} />
            <span style={{ fontSize: '12px', color: '#5E6C84', textTransform: 'uppercase', fontWeight: 500 }}>
              Or
            </span>
            <div style={{ flex: 1, height: '1px', background: '#DFE1E6' }} />
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleEmailLogin}>
            {/* Email Input */}
            <div style={{ marginBottom: '16px' }}>
              <label
                htmlFor="email"
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#172B4D',
                  marginBottom: '6px',
                }}
              >
                Email
              </label>
              <div style={{ position: 'relative' }}>
                <Mail
                  size={18}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#5E6C84',
                  }}
                />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  style={{
                    width: '100%',
                    height: '44px',
                    padding: '0 12px 0 42px',
                    background: '#FFFFFF',
                    border: '1px solid #DFE1E6',
                    borderRadius: '3px',
                    fontSize: '14px',
                    fontFamily: 'var(--font-sans)',
                    color: '#172B4D',
                    outline: 'none',
                    transition: 'all 0.15s',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#0052CC';
                    e.currentTarget.style.boxShadow = '0 0 0 2px rgba(0, 82, 204, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#DFE1E6';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>
            </div>

            {/* Password Input */}
            <div style={{ marginBottom: '16px' }}>
              <label
                htmlFor="password"
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#172B4D',
                  marginBottom: '6px',
                }}
              >
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock
                  size={18}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#5E6C84',
                  }}
                />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  style={{
                    width: '100%',
                    height: '44px',
                    padding: '0 42px',
                    background: '#FFFFFF',
                    border: '1px solid #DFE1E6',
                    borderRadius: '3px',
                    fontSize: '14px',
                    fontFamily: 'var(--font-sans)',
                    color: '#172B4D',
                    outline: 'none',
                    transition: 'all 0.15s',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = '#0052CC';
                    e.currentTarget.style.boxShadow = '0 0 0 2px rgba(0, 82, 204, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = '#DFE1E6';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: '#5E6C84',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Remember Me & Forgot Password */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  style={{
                    width: '16px',
                    height: '16px',
                    cursor: 'pointer',
                    accentColor: '#0052CC',
                  }}
                />
                <span style={{ fontSize: '13px', color: '#42526E' }}>Remember me</span>
              </label>
              <span style={{ fontSize: '13px', color: '#5E6C84' }}>
                Forgot password? Contact your admin.
              </span>
            </div>

            {/* Sign In Button */}
            <ButtonCore
              type="submit"
              variant="primary"
              fullWidth
              disabled={isLoading}
              style={{ height: '44px' }}
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </ButtonCore>
          </form>
        </div>
      </div>
    </div>
  );
}
