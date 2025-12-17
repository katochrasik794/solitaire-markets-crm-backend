import dotenv from 'dotenv';
import { sendEmail } from './services/email.js';

dotenv.config();

const testEmail = async () => {
    console.log('📧 Testing Generic Email Sending...');
    console.log(`Host: ${process.env.EMAIL_HOST}`);
    console.log(`Port: ${process.env.EMAIL_PORT}`);
    console.log(`User: ${process.env.EMAIL_USER}`);

    try {
        const result = await sendEmail({
            to: process.env.EMAIL_USER, // Send to self
            subject: 'Test Generic Email',
            html: '<h1>It Works!</h1><p>This is a test email from the generic sendEmail function.</p>',
            text: 'It Works! This is a test email from the generic sendEmail function.'
        });

        if (result.ok) {
            console.log('✅ Email sent successfully!');
            console.log('Message ID:', result.messageId);
        } else {
            console.error('❌ Failed to send email:', result.error);
        }
    } catch (error) {
        console.error('❌ Error testing email:', error);
    }
};

testEmail();
