'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Bold, Italic, List, ListOrdered, Strikethrough, Heading2, Link2, RemoveFormatting } from 'lucide-react';
import { tokens } from '../design-system/tokens';
import { sanitizeHtml } from '../lib/sanitize';

interface MentionUser {
  user_id: number;
  name: string;
  email: string;
}

interface RichTextEditorProps {
  projectId: number;
  /** HTML string. Plain-text values (legacy descriptions) are converted on load. */
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onFocus?: () => void;
  placeholder?: string;
  disabled?: boolean;
  /** Applied to the editable surface (matches the old MentionTextarea API). */
  style?: React.CSSProperties;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/** True if the string already contains HTML markup. */
function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Normalize the incoming value to HTML the contentEditable surface can render. */
function toHtml(value: string): string {
  if (!value) return '';
  if (looksLikeHtml(value)) return value;
  // Legacy plain text: preserve line breaks.
  return escapeHtml(value).replace(/\n/g, '<br>');
}

/**
 * A lightweight contentEditable rich-text editor with a formatting toolbar
 * (bold, italic, strikethrough, headings, bulleted & numbered lists, links)
 * and @mention autocomplete. Stores its content as an HTML string.
 *
 * Drop-in replacement for MentionTextarea — same prop surface.
 */
export default function RichTextEditor({
  projectId,
  value,
  onChange,
  onBlur,
  onFocus,
  placeholder,
  disabled,
  style,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  // The last HTML we emitted, so the sync effect doesn't clobber the caret while typing.
  const lastHtmlRef = useRef<string>('');
  const [isEmpty, setIsEmpty] = useState(!value);
  const [isFocused, setIsFocused] = useState(false);

  // ---- Mentions ----
  const [allUsers, setAllUsers] = useState<MentionUser[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<MentionUser[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  // Length of the in-progress "@query" (including the @) at the caret.
  const mentionLenRef = useRef<number>(0);

  // Sync external value into the DOM only when it actually differs (avoids caret jumps).
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    // If `value` is exactly what we last emitted, this is our own change echoing
    // back — skip it. Re-running toHtml() here would re-escape serialized entities
    // (e.g. the `&nbsp;` a space produces), turning them into `&amp;nbsp;` and
    // escalating on every keystroke.
    if (value === lastHtmlRef.current) return;
    const html = sanitizeHtml(toHtml(value));
    el.innerHTML = html;
    lastHtmlRef.current = html;
    setIsEmpty(!el.textContent?.trim());
  }, [value]);

  // Fetch mentionable users (project members + available users).
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
        console.error('RichTextEditor: member fetch failed', err);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [projectId]);

  const emitChange = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    const html = el.innerHTML;
    lastHtmlRef.current = html;
    setIsEmpty(!el.textContent?.trim());
    onChange(html);
  }, [onChange]);

  const exec = useCallback((command: string, arg?: string) => {
    const el = editorRef.current;
    if (!el || disabled) return;
    el.focus();
    document.execCommand(command, false, arg);
    emitChange();
  }, [disabled, emitChange]);

  // Inspect the caret to detect an in-progress "@query".
  const checkMention = useCallback(() => {
    if (allUsers.length === 0) { setShowSuggestions(false); return; }
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) { setShowSuggestions(false); return; }

    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) { setShowSuggestions(false); return; }

    const text = node.textContent || '';
    const offset = range.startOffset;

    // Walk backwards to find the @ that starts the mention.
    for (let i = offset - 1; i >= 0; i--) {
      const ch = text[i];
      if (ch === '@' && (i === 0 || /\s/.test(text[i - 1]))) {
        const query = text.substring(i + 1, offset).toLowerCase();
        const filtered = allUsers.filter(
          (u) => u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query)
        ).slice(0, 6);
        if (filtered.length > 0) {
          mentionLenRef.current = offset - i; // includes the '@'
          setSuggestions(filtered);
          setSelectedIndex(0);
          setShowSuggestions(true);
        } else {
          setShowSuggestions(false);
        }
        return;
      }
      if (/[\s\n]/.test(ch)) break;
    }
    setShowSuggestions(false);
  }, [allUsers]);

  const pickUser = useCallback((user: MentionUser) => {
    const el = editorRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    const len = mentionLenRef.current;
    // Select the typed "@query" and replace it with "@localpart ".
    try {
      range.setStart(range.startContainer, Math.max(0, range.startOffset - len));
    } catch { /* fall through */ }
    range.deleteContents();

    const localPart = user.email.split('@')[0];
    const textNode = document.createTextNode(`@${localPart} `);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);

    setShowSuggestions(false);
    emitChange();
  }, [emitChange]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        pickUser(suggestions[selectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setShowSuggestions(false);
        return;
      }
    }

    // Keyboard shortcuts for common formatting.
    if (e.metaKey || e.ctrlKey) {
      if (e.key === 'b') { e.preventDefault(); exec('bold'); }
      else if (e.key === 'i') { e.preventDefault(); exec('italic'); }
    }
  };

  const handleInput = () => {
    emitChange();
    setTimeout(checkMention, 0);
  };

  const toolbarButtons = [
    { icon: Bold, label: 'Bold (Ctrl/Cmd+B)', action: () => exec('bold') },
    { icon: Italic, label: 'Italic (Ctrl/Cmd+I)', action: () => exec('italic') },
    { icon: Strikethrough, label: 'Strikethrough', action: () => exec('strikeThrough') },
    { icon: Heading2, label: 'Heading', action: () => exec('formatBlock', 'H3') },
    { icon: List, label: 'Bulleted list', action: () => exec('insertUnorderedList') },
    { icon: ListOrdered, label: 'Numbered list', action: () => exec('insertOrderedList') },
    {
      icon: Link2,
      label: 'Insert link',
      action: () => {
        const url = (window.prompt('Enter URL') || '').trim();
        if (!url) return;
        // Only allow safe link schemes; block javascript: and other executable URLs.
        if (/^(https?:|mailto:)/i.test(url)) {
          exec('createLink', url);
        } else {
          window.alert('Only http(s):// or mailto: links are allowed.');
        }
      },
    },
    { icon: RemoveFormatting, label: 'Clear formatting', action: () => exec('removeFormat') },
  ];

  const { minHeight, ...restStyle } = style || {};

  return (
    <div style={{ position: 'relative' }}>
      {!disabled && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            flexWrap: 'wrap',
            padding: '6px 8px',
            border: `1px solid ${isFocused ? tokens.colors.primary[400] : tokens.colors.neutral[300]}`,
            borderBottom: 'none',
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
            backgroundColor: tokens.colors.neutral[50],
          }}
        >
          {toolbarButtons.map(({ icon: Icon, label, action }) => (
            <button
              key={label}
              type="button"
              title={label}
              // Use onMouseDown + preventDefault so the editor keeps its selection.
              onMouseDown={(e) => { e.preventDefault(); action(); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 30,
                height: 30,
                border: 'none',
                borderRadius: 6,
                backgroundColor: 'transparent',
                color: tokens.colors.neutral[600],
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = tokens.colors.neutral[200];
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              <Icon size={16} />
            </button>
          ))}
        </div>
      )}

      <div style={{ position: 'relative' }}>
        <div
          ref={editorRef}
          contentEditable={!disabled}
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onClick={() => setTimeout(checkMention, 0)}
          onFocus={() => { setIsFocused(true); onFocus?.(); }}
          onBlur={() => {
            setIsFocused(false);
            // Delay so a click on the suggestion dropdown registers first.
            setTimeout(() => setShowSuggestions(false), 200);
            onBlur?.();
          }}
          data-rich-text-editor
          style={{
            ...restStyle,
            minHeight: minHeight ?? 140,
            borderTopLeftRadius: disabled ? (restStyle.borderRadius as number) : 0,
            borderTopRightRadius: disabled ? (restStyle.borderRadius as number) : 0,
            overflowY: 'auto',
            cursor: disabled ? 'default' : 'text',
            borderColor: isFocused ? tokens.colors.primary[400] : (restStyle.borderColor as string),
          }}
        />
        {isEmpty && placeholder && (
          // Overlay the editor box exactly and inherit its padding, rather than trying to
          // derive top/left from it - `padding` is often a shorthand string like
          // "12px 16px", which as a `top` value is invalid CSS and gets dropped, leaving
          // the placeholder unpositioned and free to spill onto the field below.
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              padding: restStyle.padding ?? 16,
              border: '1px solid transparent', // match the editor's border box
              boxSizing: 'border-box',
              color: tokens.colors.neutral[400],
              fontSize: restStyle.fontSize,
              lineHeight: restStyle.lineHeight,
              fontFamily: restStyle.fontFamily,
              pointerEvents: 'none',
              overflow: 'hidden',
              whiteSpace: 'pre-wrap',
            }}
          >
            {placeholder}
          </div>
        )}
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '100%',
            marginTop: 4,
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
              onMouseDown={(e) => { e.preventDefault(); pickUser(user); }}
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
                {user.name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
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
