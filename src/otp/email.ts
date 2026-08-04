export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * The seam between the claim flow and whoever delivers the mail. Everything
 * upstream is tested against a fake through this interface, so nothing has to
 * reach the network to prove that codes are generated, hashed, expired and
 * rate-limited correctly.
 */
export interface EmailPort {
  send(message: EmailMessage): Promise<void>;
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Resend over plain fetch. Sending is one POST with a bearer token, so the SDK
 * would be a dependency to keep current in exchange for nothing — the same
 * reasoning that left the Upstash adapter hand-rolled.
 */
export function createResendEmail(
  apiKey: string,
  from: string,
  doFetch: Fetch = globalThis.fetch,
): EmailPort {
  return {
    async send(message) {
      const response = await doFetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
      });

      if (!response.ok) {
        // The body carries Resend's reason — an unverified domain, a malformed
        // address. Swallowing it would leave a silent no-send looking like a send.
        throw new Error(
          `Resend refused the message (${String(response.status)}): ${await response.text()}`,
        );
      }
    },
  };
}

/**
 * Plain text, no template. The subject deliberately omits the code: subjects are
 * shown in lock-screen previews, and a code readable without unlocking the phone
 * is a code readable by whoever is holding it.
 */
export function otpMessage(code: string): { subject: string; text: string } {
  return {
    subject: 'Your Nightfall code',
    text:
      `${code}\n\n` +
      `Enter this in Nightfall to save your crew history. It expires in 10 minutes ` +
      `and works once.\n\n` +
      `If you didn't ask for it, ignore this — nothing has changed on your account.\n`,
  };
}
