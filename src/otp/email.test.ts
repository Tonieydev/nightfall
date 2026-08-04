import { describe, expect, it, vi } from 'vitest';
import { createResendEmail, otpMessage } from './email.js';

const KEY = 're_test_key';
const FROM = 'Nightfall <codes@nightfall.gg>';

function fakeFetch(response: Partial<Response> = {}) {
  return vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      text: () => Promise.resolve('{"id":"abc"}'),
      ...response,
    } as Response),
  );
}

describe('the Resend adapter', () => {
  it('posts the message to Resend with the key as a bearer token', async () => {
    const fetch = fakeFetch();
    const email = createResendEmail(KEY, FROM, fetch);

    await email.send({ to: 'ada@example.com', subject: 'Your code', text: '123456' });

    expect(fetch).toHaveBeenCalledOnce();
    const call = fetch.mock.calls[0];
    if (call === undefined) throw new Error('fetch was not called');
    const [url, init] = call as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(String(init.body))).toEqual({
      from: FROM,
      to: ['ada@example.com'],
      subject: 'Your code',
      text: '123456',
    });
  });

  it('throws on a refusal rather than reporting a code that was never sent', async () => {
    const fetch = fakeFetch({
      ok: false,
      status: 422,
      text: () => Promise.resolve('{"message":"domain not verified"}'),
    });
    const email = createResendEmail(KEY, FROM, fetch);

    await expect(
      email.send({ to: 'ada@example.com', subject: 'Your code', text: '123456' }),
    ).rejects.toThrow(/422|domain not verified/);
  });

  it('never puts the code in the subject line', () => {
    // Lock screens and notification previews show subjects. The code should not
    // be readable by someone holding the phone but not unlocking it.
    const message = otpMessage('123456');

    expect(message.subject).not.toContain('123456');
    expect(message.text).toContain('123456');
  });

  it('says the code expires, and does not ask for a reply', () => {
    const message = otpMessage('123456');

    expect(message.text).toMatch(/10 minutes/i);
    expect(message.text).toMatch(/did ?n[o']?t request|ignore/i);
  });
});
