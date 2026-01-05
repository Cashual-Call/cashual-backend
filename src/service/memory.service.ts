import { Response as ExpressResponse } from "express"

/*
    IT IS MANAGED TO HANDLE LIVE USERS AND THERE SSE
*/
export class MemoryService {
    private static clients: Map<string, ExpressResponse> = new Map();

    static addClient(id: string, client: ExpressResponse): void {
        this.clients.set(id, client);
    }

    static removeClient(id: string): boolean {
        return this.clients.delete(id);
    }

    static getClient(id: string): ExpressResponse | undefined {
        return this.clients.get(id);
    }

    static getAllClientIds(): string[] {
        return Array.from(this.clients.keys());
    }

    static getAllClients(): ExpressResponse[] {
        return Array.from(this.clients.values());
    }

    static clientExists(id: string): boolean {
        return this.clients.has(id);
    }

    static clear(): void {
        this.clients.clear();
    }

    static totalClients(): number {
        return this.clients.size;
    }
}