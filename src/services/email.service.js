import dotenv from "dotenv"
dotenv.config();

import nodemailer from "nodemailer";

console.log("SERVICE EMAIL:", process.env.EMAIL_USER);
console.log("SERVICE PASS:", process.env.EMAIL_PASS);

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendEmail = async ({ to, subject, html }) => {
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject,
    html,
  });
};

export default sendEmail;


