'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../../hooks/useAuth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function NewProjectPage() {
  const router = useRouter();
  const { isAdmin, loading: authLoading } = useAuth();
  const [formData, setFormData] = useState({
    key: '',
    name: '',
    description: '',
    visibility: 'private',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Redirect non-admins
  if (!authLoading && !isAdmin) {
    router.push('/projects');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/projects`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to create project');
      }

      // Success - redirect to projects page
      router.push('/projects');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  if (authLoading) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ fontSize: 14, color: '#6a7282' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <button
          onClick={() => router.push('/projects')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            backgroundColor: 'transparent',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            fontSize: 14,
            color: '#6a7282',
            cursor: 'pointer',
            marginBottom: 24,
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#f9fafb';
            e.currentTarget.style.borderColor = '#d1d5db';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.borderColor = '#e5e7eb';
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8l4-4" stroke="#6a7282" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to Projects
        </button>

        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600, marginBottom: 8 }}>
          Create New Project
        </h1>
        <p style={{ margin: 0, fontSize: 14, color: '#6a7282' }}>
          Set up a new project to organize your work
        </p>
      </div>

      {/* Form */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: 12,
          padding: 32,
          border: '1px solid #e5e7eb',
        }}
      >
        <form onSubmit={handleSubmit}>
          {/* Error Message */}
          {error && (
            <div
              style={{
                padding: 12,
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 8,
                color: '#dc2626',
                fontSize: 14,
                marginBottom: 24,
              }}
            >
              {error}
            </div>
          )}

          {/* Project Key */}
          <div style={{ marginBottom: 24 }}>
            <label
              htmlFor="key"
              style={{
                display: 'block',
                fontSize: 14,
                fontWeight: 500,
                color: '#0a0a0a',
                marginBottom: 8,
              }}
            >
              Project Key <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              id="key"
              name="key"
              type="text"
              required
              value={formData.key}
              onChange={handleChange}
              placeholder="e.g., PROJ"
              pattern="[A-Z]{2,10}"
              title="2-10 uppercase letters only"
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 14,
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                outline: 'none',
                fontFamily: 'var(--font-sans)',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#155dfc';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
              }}
            />
            <p style={{ margin: 0, marginTop: 6, fontSize: 12, color: '#6a7282' }}>
              A short, unique identifier (2-10 uppercase letters)
            </p>
          </div>

          {/* Project Name */}
          <div style={{ marginBottom: 24 }}>
            <label
              htmlFor="name"
              style={{
                display: 'block',
                fontSize: 14,
                fontWeight: 500,
                color: '#0a0a0a',
                marginBottom: 8,
              }}
            >
              Project Name <span style={{ color: '#ef4444' }}>*</span>
            </label>
            <input
              id="name"
              name="name"
              type="text"
              required
              value={formData.name}
              onChange={handleChange}
              placeholder="e.g., Marketing Campaign 2024"
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 14,
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                outline: 'none',
                fontFamily: 'var(--font-sans)',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#155dfc';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
              }}
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: 24 }}>
            <label
              htmlFor="description"
              style={{
                display: 'block',
                fontSize: 14,
                fontWeight: 500,
                color: '#0a0a0a',
                marginBottom: 8,
              }}
            >
              Description
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              placeholder="Describe what this project is about..."
              rows={4}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 14,
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                outline: 'none',
                fontFamily: 'var(--font-sans)',
                resize: 'vertical',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#155dfc';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
              }}
            />
          </div>

          {/* Visibility */}
          <div style={{ marginBottom: 32 }}>
            <label
              htmlFor="visibility"
              style={{
                display: 'block',
                fontSize: 14,
                fontWeight: 500,
                color: '#0a0a0a',
                marginBottom: 8,
              }}
            >
              Visibility
            </label>
            <select
              id="visibility"
              name="visibility"
              value={formData.visibility}
              onChange={handleChange}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 14,
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                outline: 'none',
                fontFamily: 'var(--font-sans)',
                backgroundColor: '#ffffff',
                cursor: 'pointer',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = '#155dfc';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = '#e5e7eb';
              }}
            >
              <option value="private">Private - Only members can see this project</option>
              <option value="public">Public - Anyone in the organization can see this project</option>
            </select>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => router.push('/projects')}
              style={{
                padding: '10px 20px',
                backgroundColor: 'transparent',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                color: '#6a7282',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f9fafb';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '10px 24px',
                backgroundColor: loading ? '#9ca3af' : '#155dfc',
                color: '#ffffff',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.2s',
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor = '#1d4ed8';
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.backgroundColor = '#155dfc';
                }
              }}
            >
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
