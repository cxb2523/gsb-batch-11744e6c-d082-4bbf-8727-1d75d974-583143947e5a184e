import { apiClient } from './client';

export interface NavigationConfig {
  /** item id -> visible. An id that is absent is visible. */
  navigation: Record<string, boolean>;
}

export const organizationAPI = {
  /**
   * Which sidebar items are visible, install-wide. An id missing from the map means
   * visible, so a new nav item needs no config change.
   */
  async getNavigation(): Promise<NavigationConfig> {
    const response = await apiClient.get<NavigationConfig>('/organization/navigation');
    return response.data;
  },

  /** Replace the whole visibility map (global admin only). */
  async updateNavigation(navigation: Record<string, boolean>): Promise<NavigationConfig> {
    const response = await apiClient.put('/organization/navigation', { navigation });
    return response.data;
  },
};
