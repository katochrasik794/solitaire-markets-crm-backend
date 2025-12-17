import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

console.log('Testing SMTP Connection...');
console.log('Host:', process.env.EMAIL_HOST);
console.log('User:', process.env.EMAIL_USER);

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

transporter.verify(function (error, success) {
    if (error) {
        console.log('❌ Connection failed:', error);
        process.exit(1);
    } else {
        console.log('✅ Connection successful! Server is ready to take our messages');
        process.exit(0);
    }
});
