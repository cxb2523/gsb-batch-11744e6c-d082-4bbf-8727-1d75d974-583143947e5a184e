import { apiClient } from './client';

/**
 * Which optional features this install is configured for. Booleans only - the
 * credentials behind them stay on the server.
 *
 * Every field is optional so that a server too old to report a capability reads as
 * "off" rather than undefined-shaped.
 */
export interface Capabilities {
  /** Google Workspace directory sync is configured. Google *sign-in* is separate. */
  google_workspace?: boolean;
}

export const capabilitiesAPI = {
  async get(): Promise<Capabilities> {
    const response = await apiClient.get<Capabilities>('/capabilities');
    return response.data;
  },
};
