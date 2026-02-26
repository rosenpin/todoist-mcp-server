import { DurableObject } from "cloudflare:workers";

/**
 * Self-destructing stub for old TodoistMCPv2 Durable Objects.
 * When any old v2 DO receives a request, it wipes its own storage
 * so Cloudflare can reclaim the bytes.
 */
export class TodoistMCPv2 extends DurableObject {
  async fetch(_request: Request): Promise<Response> {
    await this.ctx.storage.deleteAll();
    return new Response(JSON.stringify({ cleaned: true }));
  }
}
