import { verifyEmailConnection, sendPasswordResetEmail } from './services/email.js';

const testEmail = async () => {
    console.log('Testing email connection...');
    const connected = await verifyEmailConnection();

    if (connected) {
        console.log('✅ Connection successful!');
        console.log('Sending test email...');
        try {
            // Send to the FROM address as a safe test
            const result = await sendPasswordResetEmail('Solitaire.itpurchase@gmail.com', 'test-token-123');
            console.log('✅ Email sent successfully!', result);
        } catch (error) {
            console.error('❌ Failed to send email:', error.message);
        }
    } else {
        console.error('❌ Connection failed.');
    }
};

testEmail();
