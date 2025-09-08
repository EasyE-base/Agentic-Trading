import type { MCPMessage } from '../schemas/types';

type Callback<T> = (message: MCPMessage<T>) => void;

export class MCPBus {
  private topics: Map<string, Array<Callback<any>>> = new Map();

  subscribe<T>(topic: string, handler: Callback<T>) {
    if (!this.topics.has(topic)) this.topics.set(topic, []);
    this.topics.get(topic)!.push(handler as Callback<any>);
  }

  publish<T>(message: MCPMessage<T>) {
    const handlers = this.topics.get(message.topic) || [];
    handlers.forEach((fn) => fn(message));
  }
}

export const bus = new MCPBus();


