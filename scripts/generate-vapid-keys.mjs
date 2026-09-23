// Prints a fresh VAPID key pair for Web Push notifications (new-order alerts
// on the admins' phones/computers). Copy the three lines into .env, then
// restart the server:
//
//   npm run vapid:generate
//
// Generate ONCE and keep them: changing the keys later silently disconnects
// every device that already enabled notifications (they have to re-enable).
import webpush from 'web-push';

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log('VAPID_SUBJECT=mailto:contact@example.com   # a contact address (or your https site URL) -- required by push services');
