import express from 'express';
import { requestOTP, verifyOTP, sendOrderEmail } from './otpService';
import { generateUploadUrl } from './r2Service';

const app = express();
app.use(express.json());

// Restrict trust proxy to ensure accurate IP resolution behind ingress
app.set('trust proxy', 1);

app.post('/api/otp/request', async (req, res) => {
  const { email } = req.body;
  const ipAddress = req.ip || '127.0.0.1';

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email is required' });
  }

  const result = await requestOTP(email, ipAddress);
  
  if (result.success) {
    res.status(200).json(result);
  } else {
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

  const result = await verifyOTP(email, code, ipAddress);

  if (result.success) {
    res.status(200).json(result);
  } else {
    res.status(401).json(result);
  }
});

app.post('/api/upload-url', async (req, res) => {
  const { filename, mimeType, fileSize } = req.body;

  if (!filename || !mimeType || !fileSize) {
    return res.status(400).json({ success: false, message: 'Missing file details.' });
  }

  const result = await generateUploadUrl(filename, mimeType, fileSize);
  if (result.success) {
    res.status(200).json(result);
  } else {
    res.status(400).json(result);
  }
});

app.post('/api/send-email', async (req, res) => {
  const { to, orderDetails } = req.body;
  if (!to || !orderDetails) {
    return res.status(400).json({ success: false, message: 'Missing parameters.' });
  }

  const success = await sendOrderEmail(to, orderDetails);
  if (success) {
    res.status(200).json({ success: true, message: 'Email pushed successfully.' });
  } else {
    res.status(500).json({ success: false, message: 'Failed to push email.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SOC 2 Compliant OTP Service running on port ${PORT}`);
});
