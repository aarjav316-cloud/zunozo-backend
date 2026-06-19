import dotenv from "dotenv";
dotenv.config();

import sendEmail from "./services/email.service.js";

console.log(process.env.EMAIL_USER);
console.log(process.env.EMAIL_PASS);

const testEmail = async () => {
  try {
    await sendEmail({
      to: process.env.EMAIL_USER, // send to yourself
      subject: "Zunozo Test Email",
      html: `
        <h1>Email Service Working 🚀</h1>
        <p>If you're reading this, Nodemailer is configured correctly.</p>
      `,
    });

    console.log("Email sent successfully");
  } catch (error) {
    console.error("Email error:", error);
  }
};

testEmail();
