import { describe, it, expect, vi } from 'vitest';

// The pipecat transport uses URL.createObjectURL which jsdom doesn't provide.
// Mock the heavy transport deps so we can test the pure classifyMicError function.
vi.mock('@pipecat-ai/client-js', () => ({ PipecatClient: class {}, RTVIEvent: {} }));
vi.mock('@pipecat-ai/small-webrtc-transport', () => ({ SmallWebRTCTransport: class {} }));

import { classifyMicError } from '@/hooks/use-pipecat';

describe('classifyMicError', () => {
  it('maps NotAllowedError to mic_denied', () => {
    expect(classifyMicError({ name: 'NotAllowedError' })).toBe('mic_denied');
  });
  it('maps NotFoundError to mic_blocked', () => {
    expect(classifyMicError({ name: 'NotFoundError' })).toBe('mic_blocked');
  });
  it('returns null for unrelated errors', () => {
    expect(classifyMicError({ name: 'TypeError' })).toBeNull();
  });
});
