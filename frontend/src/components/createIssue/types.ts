import { type Priority as PriorityLevel } from '../../lib/priority';

export interface CloneTicketData {
  title: string;
  description?: string;
  type: string;
  priority?: PriorityLevel;
  assigneeId?: number | null;
  epicId?: number | null;
  labelIds?: number[];
  dueDate?: string;
}

export interface FileAttachment {
  file: File | Blob;
  id: string;
  preview?: string;
  name?: string;
}

export interface IssueType {
  value: string;
  label: string;
  description: string;
}

export type PriorityValue = PriorityLevel;

export interface Priority {
  value: PriorityValue;
  label: string;
  color: string;
}
