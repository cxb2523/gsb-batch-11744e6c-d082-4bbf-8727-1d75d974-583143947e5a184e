'use client';

import React, { useRef, useState } from 'react';
import { ChevronLeft, Download, Upload, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Card } from '@/design-system/components/Card';
import { ButtonCore, Select } from '@/components/ui';
import { Input } from '@/design-system/components/Input';
import { colors } from '@/design-system/tokens';
import { useProjectContext } from '@/hooks/useProjectContext';
import {
  projectImportAPI,
  ACCEPTED_SPREADSHEET_EXTENSIONS,
  SpreadsheetParseResponse,
  SpreadsheetRow,
} from '@/lib/api/project-import';

interface SpreadsheetImportProps {
  onBack: () => void;
}

type Phase = 'upload' | 'preview';

const FIELD_LABELS: Record<string, string> = {
  title: 'Title',
  description: 'Description',
  type: 'Type',
  priority: 'Priority',
  assignee: 'Assignee',
  due_date: 'Due Date',
  status: 'Status',
  labels: 'Labels',
  story_points: 'Story Points',
};

export const SpreadsheetImport: React.FC<SpreadsheetImportProps> = ({ onBack }) => {
  const router = useRouter();
  const { refresh } = useProjectContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [phase, setPhase] = useState<Phase>('upload');
  const [projectName, setProjectName] = useState('');
  const [projectKey, setProjectKey] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [keyTouched, setKeyTouched] = useState(false);

  const [parsed, setParsed] = useState<SpreadsheetParseResponse | null>(null);
  const [rows, setRows] = useState<SpreadsheetRow[]>([]);

  const [isParsing, setIsParsing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);

  const handleNameChange = (value: string) => {
    setProjectName(value);
    if (!projectKey) {
      const key = value.split(/\s+/).map((w) => w[0] || '').join('').toUpperCase().slice(0, 8);
      setProjectKey(key);
    }
  };

  const handleKeyChange = (value: string) => {
    setProjectKey(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10));
  };

  const handleTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      await projectImportAPI.downloadTemplate();
    } catch (err: any) {
      setError(err.message || 'Could not download the template.');
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleParse = async () => {
    if (!file) return;
    setIsParsing(true);
    setError(null);
    try {
      const result = await projectImportAPI.parse(file);
      setParsed(result);
      setRows(result.rows);
      setPhase('preview');
    } catch (err: any) {
      setError(err.message || 'Could not read that spreadsheet.');
    } finally {
      setIsParsing(false);
    }
  };

  const updateRow = (ref: number, patch: Partial<SpreadsheetRow>) => {
    setRows((prev) => prev.map((r) => (r.ref === ref ? { ...r, ...patch } : r)));
  };

  const untitledCount = rows.filter((r) => !r.title || !r.title.trim()).length;

  const handleCreate = async () => {
    if (!projectName.trim() || !projectKey.trim()) {
      setError('Project name and key are required.');
      return;
    }
    if (untitledCount > 0) {
      setError(`${untitledCount} row(s) are missing a title. Fill them in before creating.`);
      return;
    }
    setIsCreating(true);
    setError(null);
    try {
      const result = await projectImportAPI.commit({
        project_name: projectName.trim(),
        project_key: projectKey.trim(),
        description: description || undefined,
        visibility: 'private',
        rows,
        member_user_ids: parsed?.member_user_ids ?? [],
      });
      localStorage.setItem('selectedProjectId', result.project_id.toString());
      // Pull the new project into the shared list so the nav bar and sidebar
      // resolve it (the list is otherwise only fetched once per mount).
      await refresh();
      router.push(`/projects/${result.project_id}/board`);
    } catch (err: any) {
      setError(err.message || 'Could not create the project.');
      setIsCreating(false);
    }
  };

  // A project key is letters/digits (enforced on input) and at least 2 long.
  const keyValid = projectKey.trim().length >= 2;
  const keyError = !keyValid && projectKey.length > 0 ? 'Project key must be at least 2 letters/digits.' : null;

  // ---- shared bits -------------------------------------------------------

  const backButton = (
    <ButtonCore
      variant="ghost"
      onClick={phase === 'preview' ? () => setPhase('upload') : onBack}
      style={{ marginBottom: '24px', gap: '4px', paddingLeft: 0 }}
      disabled={isParsing || isCreating}
    >
      <ChevronLeft size={18} />
      {phase === 'preview' ? 'Back' : 'Back to modes'}
    </ButtonCore>
  );

  const errorBox = error && (
    <div
      style={{
        padding: '12px 16px',
        background: colors.error[50],
        border: `1px solid ${colors.error[200]}`,
        borderRadius: '8px',
        color: colors.error[700],
        fontSize: '14px',
        marginBottom: '20px',
      }}
    >
      {error}
    </div>
  );

  // ---- upload phase ------------------------------------------------------

  if (phase === 'upload') {
    return (
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '40px 20px' }}>
        {backButton}
        <div style={{ marginBottom: '28px' }}>
          <h1 style={{ fontSize: '30px', fontWeight: 600, color: colors.semantic.text.primary, marginBottom: '8px' }}>
            Create from existing data
          </h1>
          <p style={{ fontSize: '15px', color: colors.semantic.text.secondary }}>
            Upload a spreadsheet of tickets (.xlsx or .csv) and we&apos;ll create the project and
            fill it in. Columns like <em>Title</em>, <em>Assignee</em>, <em>Due Date</em> and{' '}
            <em>Status</em> map automatically.
          </p>
        </div>

        {errorBox}

        <Card style={{ padding: '24px', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: colors.semantic.text.primary, marginBottom: '20px' }}>
            Project details
          </h2>
          <div style={{ marginBottom: '20px' }}>
            <Input label="Project Name" requiredMark value={projectName} onChange={(e) => handleNameChange(e.target.value)} placeholder="e.g., Migrated Backlog" />
          </div>
          <div>
            <Input
              label="Project Key"
              requiredMark
              value={projectKey}
              onChange={(e) => handleKeyChange(e.target.value)}
              onBlur={() => setKeyTouched(true)}
              placeholder="e.g., MIG"
              error={keyTouched && keyError ? keyError : undefined}
              helperText="Short identifier (letters and numbers, 2–10). Can't be changed later."
            />
          </div>
        </Card>

        <Card style={{ padding: '24px', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '12px', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: colors.semantic.text.primary, margin: 0 }}>
              Spreadsheet<span style={{ color: colors.error[600] }}> *</span>
            </h2>
            <ButtonCore variant="secondary" onClick={handleTemplate} disabled={downloadingTemplate} style={{ gap: '6px' }}>
              <Download size={16} />
              {downloadingTemplate ? 'Preparing…' : 'Download template'}
            </ButtonCore>
          </div>
          <p style={{ fontSize: '13px', color: colors.semantic.text.secondary, marginBottom: '16px' }}>
            New to this? Start from the template. Bringing an export from another tool? Upload it as-is —
            we&apos;ll match the columns. <strong>Tip:</strong> an email column gives the most reliable
            assignee matching.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_SPREADSHEET_EXTENSIONS}
            style={{ display: 'none' }}
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }}
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${file ? colors.primary[500] : colors.semantic.border.default}`,
              borderRadius: '10px',
              padding: '28px',
              textAlign: 'center',
              cursor: 'pointer',
              background: file ? colors.primary[50] : colors.semantic.background.default,
              transition: 'all 0.2s ease',
            }}
          >
            {file ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', color: colors.semantic.text.primary }}>
                <FileSpreadsheet size={20} color={colors.primary[600]} />
                <span style={{ fontSize: '14px', fontWeight: 500 }}>{file.name}</span>
                <span style={{ fontSize: '12px', color: colors.semantic.text.tertiary }}>· click to replace</span>
              </div>
            ) : (
              <div style={{ color: colors.semantic.text.secondary }}>
                <Upload size={22} style={{ marginBottom: '8px' }} />
                <div style={{ fontSize: '14px' }}>Click to choose an .xlsx or .csv file</div>
              </div>
            )}
          </div>
        </Card>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <ButtonCore variant="secondary" onClick={onBack} disabled={isParsing}>Cancel</ButtonCore>
          <ButtonCore
            variant="primary"
            onClick={handleParse}
            disabled={isParsing || !file || !projectName.trim() || !keyValid}
          >
            {isParsing ? 'Reading…' : 'Preview tickets'}
          </ButtonCore>
        </div>
      </div>
    );
  }

  // ---- preview phase -----------------------------------------------------

  const options = parsed!.options;
  const mapped = parsed!.columns.filter((c) => c.field);
  const ignored = parsed!.columns.filter((c) => !c.field);

  const typeOptions = options.types.map((t) => ({ value: t, label: t }));
  const statusOptions = options.statuses.map((s) => ({ value: s.name, label: s.name, color: s.color }));
  const priorityOptions = options.priorities.map((p) => ({ value: p, label: p }));
  const assigneeOptions = options.members.map((m) => ({ value: m.email, label: m.name, hint: m.email }));

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '40px 20px' }}>
      {backButton}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 600, color: colors.semantic.text.primary, marginBottom: '6px' }}>
          Review {rows.length} ticket{rows.length === 1 ? '' : 's'}
        </h1>
        <p style={{ fontSize: '14px', color: colors.semantic.text.secondary }}>
          From <strong>{parsed!.source_filename}</strong>. Edit anything below, then create the project.
        </p>
      </div>

      {errorBox}

      {/* Column mapping + warnings */}
      <Card style={{ padding: '16px 20px', marginBottom: '16px' }}>
        <div style={{ fontSize: '13px', color: colors.semantic.text.secondary, marginBottom: '8px' }}>Detected columns</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {mapped.map((c) => (
            <span key={c.header} style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '999px', background: colors.primary[50], color: colors.primary[700], border: `1px solid ${colors.primary[200]}` }}>
              {c.header} → {FIELD_LABELS[c.field!] ?? c.field}
            </span>
          ))}
          {ignored.map((c) => (
            <span key={c.header} style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '999px', background: colors.semantic.background.tertiary, color: colors.semantic.text.tertiary }}>
              {c.header} · ignored
            </span>
          ))}
        </div>
        {parsed!.warnings.length > 0 && (
          <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {parsed!.warnings.map((w, i) => {
              // An unmatched assignee means work lands unassigned — flag it as an
              // error (red), not a soft amber warning like the row-limit note.
              const isError = w.toLowerCase().includes('matched');
              const color = isError ? colors.error[700] : (colors.warning?.[700] ?? colors.semantic.text.secondary);
              return (
                <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', fontSize: '13px', color }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span>{w}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Rows table */}
      <Card style={{ padding: 0, marginBottom: '20px', overflow: 'hidden' }}>
        <div style={{ maxHeight: '560px', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ position: 'sticky', top: 0, background: colors.semantic.background.tertiary, zIndex: 1 }}>
                {['Title', 'Type', 'Status', 'Assignee', 'Priority', 'Due'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 600, color: colors.semantic.text.secondary, borderBottom: `1px solid ${colors.semantic.border.default}`, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const missingTitle = !row.title || !row.title.trim();
                return (
                  <tr key={row.ref} style={{ borderBottom: `1px solid ${colors.semantic.border.subtle ?? colors.semantic.border.default}` }}>
                    <td style={{ padding: '6px 12px', minWidth: '240px', verticalAlign: 'middle' }}>
                      <Input
                        value={row.title ?? ''}
                        onChange={(e) => updateRow(row.ref, { title: e.target.value })}
                        placeholder="Required"
                        style={{ width: '100%', ...(missingTitle ? { borderColor: colors.error[400] } : {}) }}
                      />
                    </td>
                    <td style={{ ...cellStyle, minWidth: 110 }}>
                      <Select size="sm" fullWidth ariaLabel="Type" value={row.type ?? 'task'} options={typeOptions} onChange={(v) => updateRow(row.ref, { type: (v as string) ?? 'task' })} />
                    </td>
                    <td style={{ ...cellStyle, minWidth: 140 }}>
                      <Select size="sm" fullWidth ariaLabel="Status" value={row.status_name ?? 'Backlog'} options={statusOptions} onChange={(v) => updateRow(row.ref, { status_name: (v as string) ?? 'Backlog' })} />
                    </td>
                    <td style={{ ...cellStyle, minWidth: 190 }}>
                      <Select
                        size="sm"
                        fullWidth
                        clearable
                        clearLabel="Unassigned"
                        placeholder="Unassigned"
                        ariaLabel="Assignee"
                        minMenuWidth={240}
                        value={row.assignee_email}
                        options={assigneeOptions}
                        onChange={(v) => updateRow(row.ref, { assignee_email: (v as string) ?? null })}
                      />
                    </td>
                    <td style={{ ...cellStyle, minWidth: 120 }}>
                      <Select size="sm" fullWidth clearable clearLabel="None" placeholder="—" ariaLabel="Priority" value={row.priority} options={priorityOptions} onChange={(v) => updateRow(row.ref, { priority: (v as string) ?? null })} />
                    </td>
                    <td style={{ padding: '6px 12px', verticalAlign: 'middle' }}>
                      <Input
                        type="date"
                        value={row.due_date ? row.due_date.slice(0, 10) : ''}
                        onChange={(e) => updateRow(row.ref, { due_date: e.target.value ? new Date(e.target.value).toISOString() : null })}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', alignItems: 'center' }}>
        {untitledCount > 0 && (
          <span style={{ fontSize: '13px', color: colors.error[600], marginRight: 'auto' }}>
            {untitledCount} row(s) need a title
          </span>
        )}
        <ButtonCore variant="secondary" onClick={() => setPhase('upload')} disabled={isCreating}>Back</ButtonCore>
        <ButtonCore variant="primary" onClick={handleCreate} disabled={isCreating || untitledCount > 0}>
          {isCreating ? 'Creating…' : `Create project with ${rows.length} ticket${rows.length === 1 ? '' : 's'}`}
        </ButtonCore>
      </div>
    </div>
  );
};

const cellStyle: React.CSSProperties = { padding: '6px 10px', verticalAlign: 'middle' };
