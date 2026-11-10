'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { tokens } from '../design-system/tokens';

interface MentionUser {
  user_id: number;
  name: string;
  email: string;
}

interface MentionTextareaProps {
  projectId: number;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onFocus?: () => void;
  placeholder?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * Render saved text with @mentions highlighted in blue and http(s) URLs turned
 * into clickable links. The text is stored plain — this is render-time only, so
 * nothing about the stored comment changes.
 *
 * Only explicit http(s):// links are matched: it keeps false positives out of
 * prose ("e.g.", "Node.js") and, more importantly, means we never build an href
 * from an untrusted scheme like javascript:/data:.
 */
export function renderMentionText(text: string): React.ReactNode[] {
  if (!text) return [];
  // One alternation so mentions and URLs are tokenised in a single pass and
  // never overlap. The capturing group keeps the delimiters in the output.
  const parts = text.split(/(@[\w.+-]+|https?:\/\/[^\s]+)/g);
  return parts.map((part, i) => {
    if (part.startsWith('@') && part.length > 1) {
      return (
        <span key={i} style={{ color: tokens.colors.primary[600], fontWeight: 600 }}>
          {part}
        </span>
      );
    }
    if (/^https?:\/\//.test(part)) {
      // URLs butt up against prose punctuation ("...gitlab.com/." or "(...)"),
      // so peel trailing punctuation off the link and render it as plain text.
      const match = part.match(/[.,;:!?)\]}'"]+$/);
      const trailing = match ? match[0] : '';
      const href = trailing ? part.slice(0, part.length - trailing.length) : part;
      return (
        <React.Fragment key={i}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: tokens.colors.primary[600], textDecoration: 'none', wordBreak: 'break-all' }}
            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
          >
            {href}
          </a>
          {trailing}
        </React.Fragment>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function MentionTextarea({
  projectId,
  value,
  onChange,
  onBlur,
  onFocus,
  placeholder,
  disabled,
  style,
}: MentionTextareaProps) {
  const [allUsers, setAllUsers] = useState<MentionUser[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<MentionUser[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch users on mount
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`${API_URL}/projects/${projectId}/members`, {
          credentials: 'include',
        });
        if (!res.ok) return;
        const members = await res.json();
        if (cancelled) return;

        const users: MentionUser[] = [];
        const seen = new Set<string>();

        for (const m of members) {
          if (m.email && !seen.has(m.email)) {
            seen.add(m.email);
            users.push({ user_id: m.user_id, name: m.name || m.email, email: m.email });
          }
        }

        // Also fetch non-member users
        try {
          const res2 = await fetch(`${API_URL}/projects/${projectId}/members/available`, {
            credentials: 'include',
          });
          if (res2.ok) {
            const avail = await res2.json();
            for (const u of avail) {
              if (u.email && !seen.has(u.email)) {
                seen.add(u.email);
                users.push({ user_id: u.user_id, name: u.name, email: u.email });
              }
            }
          }
        } catch { /* optional */ }

        users.sort((a, b) => a.name.localeCompare(b.name));
        if (!cancelled) setAllUsers(users);
      } catch (err) {
        console.error('MentionTextarea: fetch failed', err);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [projectId]);

  const checkMention = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta || allUsers.length === 0) return;

    const pos = ta.selectionStart;
    const text = ta.value;

    // Walk backwards from cursor to find @
    for (let i = pos - 1; i >= 0; i--) {
      if (text[i] === '@' && (i === 0 || /\s/.test(text[i - 1]))) {
        const query = text.substring(i + 1, pos).toLowerCase();
        const filtered = allUsers.filter(
          u => u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query)
        ).slice(0, 6);

        if (filtered.length > 0) {
          setMentionStart(i);
          setSuggestions(filtered);
          setSelectedIndex(0);
          setShowSuggestions(true);
        } else {
          setShowSuggestions(false);
        }
        return;
      }
      if (/[\s\n]/.test(text[i])) break;
    }

    setShowSuggestions(false);
  }, [allUsers]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(e.target.value);
    // Check after React updates
    setTimeout(checkMention, 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      pickUser(suggestions[selectedIndex]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  }

  function pickUser(user: MentionUser) {
    if (mentionStart === null || !textareaRef.current) return;

    const ta = textareaRef.current;
    const pos = ta.selectionStart;
    const before = value.substring(0, mentionStart);
    const after = value.substring(pos);
    const localPart = user.email.split('@')[0];
    const insert = `@${localPart} `;
    const newVal = before + insert + after;

    onChange(newVal);
    setShowSuggestions(false);
    setMentionStart(null);

    const newPos = mentionStart + insert.length;
    setTimeout(() => {
      ta.focus();
      ta.selectionStart = newPos;
      ta.selectionEnd = newPos;
    }, 0);
  }

  function handleBlurInternal() {
    // Delay so clicks on dropdown register first
    setTimeout(() => setShowSuggestions(false), 200);
    onBlur?.();
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={() => setTimeout(checkMention, 0)}
        onBlur={handleBlurInternal}
        onFocus={onFocus}
        placeholder={placeholder}
        disabled={disabled}
        style={style}
      />
      {showSuggestions && suggestions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: '100%',
            marginBottom: 4,
            maxHeight: 220,
            overflowY: 'auto',
            backgroundColor: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            zIndex: 9999,
          }}
        >
          {suggestions.map((user, idx) => (
            <div
              key={user.email}
              onMouseDown={e => { e.preventDefault(); pickUser(user); }}
              onMouseEnter={() => setSelectedIndex(idx)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                backgroundColor: idx === selectedIndex ? '#f3f4f6' : '#fff',
              }}
            >
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: tokens.colors.primary[500], color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 600, flexShrink: 0,
              }}>
                {user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: '#111827' }}>{user.name}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{user.email}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
