const nodemailer = require('nodemailer');
const fs = require('fs');

nodemailer.createTestAccount((err, account) => {
  if (err) {
    console.error('Failed to create a testing account. ' + err.message);
    return process.exit(1);
  }

  const envContent = `NODE_ENV=production
REDIS_URL=redis://:secure_redis_password@cache:6379/0
DATABASE_URL=postgresql://audit_user:secure_pg_password@audit_db:5432/audit_logs
SMTP_HOST=${account.smtp.host}
SMTP_PORT=${account.smtp.port}
SMTP_USER=${account.user}
SMTP_PASS=${account.pass}
SMTP_FROM=security@netamps.com
`;

  fs.writeFileSync('.env', envContent);
  console.log('Successfully created Ethereal test account and wrote to .env!');
  console.log('To view emails, login to https://ethereal.email/login with:');
  console.log(`Username: ${account.user}`);
  console.log(`Password: ${account.pass}`);
});
