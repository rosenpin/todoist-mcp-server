import { v4 as uuidv4 } from 'uuid';
import { Integration } from './types.js';

export class AuthService {
  // In-memory storage for integrations
  private integrations: Map<string, Integration> = new Map();

  createIntegration(todoistToken: string): Integration {
    const integration: Integration = {
      integrationId: uuidv4(),
      todoistToken,
      createdAt: new Date()
    };
    
    this.integrations.set(integration.integrationId, integration);
    console.log(`Created integration ${integration.integrationId}`);
    
    return integration;
  }

  getIntegration(integrationId: string): Integration | undefined {
    const integration = this.integrations.get(integrationId);
    if (integration) {
      integration.lastUsed = new Date();
    }
    return integration;
  }

  deleteIntegration(integrationId: string): boolean {
    return this.integrations.delete(integrationId);
  }

  getAllIntegrations(): Integration[] {
    return Array.from(this.integrations.values());
  }
}