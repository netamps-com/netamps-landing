# Cloudflare Custom Domain Setup for netamps.com

## Current Status

✅ **Git Repository**: All changes committed and pushed to GitHub
✅ **Cloudflare Pages Project**: Created and deployed successfully
✅ **Latest Deployment**: https://9fa40895.netamps-landing.pages.dev
✅ **Permanent URL**: https://netamps-landing.pages.dev

## Next Step: Configure Custom Domain

To serve the website at `https://netamps.com`, you need to configure the custom domain in Cloudflare.

### Step 1: Add Custom Domain in Cloudflare Pages

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Workers & Pages**
3. Click on **netamps-landing** project
4. Click **Custom Domains** tab
5. Click **Set up a custom domain**
6. Enter: `netamps.com`
7. Click **Continue**

### Step 2: Verify DNS Configuration

Cloudflare will automatically create the required DNS records. Verify:

1. Go to **DNS** → **Records**
2. You should see a CNAME record for `netamps.com` pointing to your Pages project
3. The record should be proxied (orange cloud icon)

### Step 3: Configure www Redirect (Optional)

To redirect `www.netamps.com` to `netamps.com`:

1. In **Custom Domains** tab
2. Click **Add domain**
3. Enter: `www.netamps.com`
4. Select **Redirect** option
5. Redirect to: `netamps.com`

### Step 4: SSL/TLS Configuration

1. Go to **SSL/TLS** → **Overview**
2. Set mode to **Full (strict)**
3. Cloudflare will automatically provision SSL certificate

### Step 5: Verify Deployment

After configuration, test:

1. Visit `https://netamps.com`
2. Should show the landing page
3. Check SSL certificate is valid
4. Test all navigation links

## Alternative: Use Cloudflare DNS Only

If you prefer to keep the domain DNS in Cloudflare and point to Pages:

1. Go to **DNS** → **Records**
2. Add CNAME record:
   - **Name**: `@` (or leave blank for root)
   - **Target**: `netamps-landing.pages.dev`
   - **Proxy status**: Proxied (orange cloud)
3. Add CNAME record for www:
   - **Name**: `www`
   - **Target**: `netamps-landing.pages.dev`
   - **Proxy status**: Proxied (orange cloud)

## GitHub Actions Deployment

The GitHub Actions workflow is configured but requires secrets:

### Required Secrets

Add these in GitHub repository settings (Settings → Secrets and variables → Actions):

1. **CLOUDFLARE_API_TOKEN**
   - Get from: https://dash.cloudflare.com/profile/api-tokens
   - Create custom token with permissions:
     - Account → Cloudflare Pages → Edit
     - Zone → Zone → Read
     - User → User Details → Read

2. **CLOUDFLARE_ACCOUNT_ID**
   - Found in Cloudflare Dashboard → Workers & Pages → Overview (right sidebar)

### Once Secrets Are Set

GitHub Actions will automatically deploy on every push to `main` branch.

## Current Deployment URLs

- **Preview (latest)**: https://9fa40895.netamps-landing.pages.dev
- **Production**: https://netamps-landing.pages.dev
- **Custom Domain**: https://netamps.com (after configuration)

## Troubleshooting

### Custom Domain Not Working

- Check DNS records are correct
- Verify DNS propagation (can take up to 24 hours)
- Check Cloudflare SSL/TLS mode
- View Cloudflare Analytics for errors

### GitHub Actions Failing

- Verify secrets are set correctly
- Check CLOUDFLARE_API_TOKEN has correct permissions
- Review workflow logs in GitHub Actions tab

### Build Errors

- Check if `npm run build` succeeds locally
- Verify all dependencies are in package.json
- Check for TypeScript errors

## Environment Variables

For production, set these in Cloudflare Pages project settings:

```
NEXT_PUBLIC_LOGIN_URL=https://netamps.com/login
NEXT_PUBLIC_RETURN_PORTAL_URL=https://netamps.com/login
```

## Summary

✅ Code is deployed to Cloudflare Pages
✅ Working at: https://netamps-landing.pages.dev
⏳ Custom domain netamps.com needs manual configuration in Cloudflare Dashboard
⏳ GitHub Actions needs secrets configuration for auto-deployment

The manual deployment is complete. Custom domain configuration requires access to the Cloudflare Dashboard.
