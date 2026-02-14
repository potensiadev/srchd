/**
 * Email Module - Public API
 */

export { sendEmail, queueEmail, processPendingEmails } from "./service";
export type { EmailType, EmailPayload, QueueEmailResult, SendEmailResult } from "./service";
export { generateEmailHtml, generateEmailSubject } from "./templates";
