// A pending upload held in state before it is sent: the browser File plus a
// client-side id and an optional preview URL.
export interface FileAttachment {
  file: File;
  id: string;
  preview?: string;
}
