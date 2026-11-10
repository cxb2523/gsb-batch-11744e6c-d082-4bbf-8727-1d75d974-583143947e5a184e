import { Ticket as APITicket } from '../../../../../lib/api/tickets';
import { Sprint, SprintCapacity } from '../../../../../lib/api/sprints';

export interface BacklogTicket extends APITicket {
  children?: BacklogTicket[];
  isExpanded?: boolean;
}

export interface SprintWithCapacity extends Sprint {
  capacity?: SprintCapacity;
}
