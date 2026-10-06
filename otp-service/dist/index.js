"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const otpService_1 = require("./otpService");
const r2Service_1 = require("./r2Service");
const app = (0, express_1.default)();
app.use(express_1.default.json());
// Restrict trust proxy to ensure accurate IP resolution behind ingress
app.set('trust proxy', 1);
app.post('/api/otp/request', async (req, res) => {
    const { email } = req.body;
    const ipAddress = req.ip || '127.0.0.1';
    if (!email) {
        return res.status(400).json({ success: false, message: 'Email is required' });
    }
    const result = await (0, otpService_1.requestOTP)(email, ipAddress);
    if (result.success) {
        res.status(200).json(result);
    }
    else {
        // 429 Too Many Requests if rate limited, else 500
        const code = result.message.includes('Too many requests') ? 429 : 500;
        res.status(code).json(result);
    }
});
app.post('/api/otp/verify', async (req, res) => {
    const { email, code } = req.body;
    const ipAddress = req.ip || '127.0.0.1';
    if (!email || !code) {
        return res.status(400).json({ success: false, message: 'Email and OTP code are required' });
    }
    const result = await (0, otpService_1.verifyOTP)(email, code, ipAddress);
    if (result.success) {
        res.status(200).json(result);
    }
    else {
        res.status(401).json(result);
    }
});
app.post('/api/upload-url', async (req, res) => {
    const { filename, mimeType, fileSize } = req.body;
    if (!filename || !mimeType || !fileSize) {
        return res.status(400).json({ success: false, message: 'Missing file details.' });
    }
    const result = await (0, r2Service_1.generateUploadUrl)(filename, mimeType, fileSize);
    if (result.success) {
        res.status(200).json(result);
    }
    else {
        res.status(400).json(result);
    }
});
app.post('/api/send-email', async (req, res) => {
    const { to, orderDetails } = req.body;
    if (!to || !orderDetails) {
        return res.status(400).json({ success: false, message: 'Missing parameters.' });
    }
    const success = await (0, otpService_1.sendOrderEmail)(to, orderDetails);
    if (success) {
        res.status(200).json({ success: true, message: 'Email pushed successfully.' });
    }
    else {
        res.status(500).json({ success: false, message: 'Failed to push email.' });
    }
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`SOC 2 Compliant OTP Service running on port ${PORT}`);
});
