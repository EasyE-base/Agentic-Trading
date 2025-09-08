import { bus } from './src/pubsub/bus';
import type { MCPMessage } from './src/schemas/types';

bus.subscribe('test_topic', (msg: MCPMessage) => {
  console.log('Received:', msg);
});

bus.publish({
  id: 'msg-1',
  sender: 'test-agent',
  role: 'signal',
  topic: 'test_topic',
  timestamp: Date.now(),
  payload: { hello: 'world' }
});


