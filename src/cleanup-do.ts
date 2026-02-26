import { DurableObject } from "cloudflare:workers";

/**
 * Self-destructing stubs for old Durable Objects.
 * When any old DO receives a request, it wipes its own storage
 * so Cloudflare can reclaim the bytes.
 */
export class TodoistMCPv2 extends DurableObject {
  async fetch(_request: Request): Promise<Response> {
    await this.ctx.storage.deleteAll();
    return new Response(JSON.stringify({ cleaned: true }));
  }
}

export class TodoistMCP extends DurableObject {
  async fetch(_request: Request): Promise<Response> {
    await this.ctx.storage.deleteAll();
    return new Response(JSON.stringify({ cleaned: true }));
  }
}
