# Cloudflare Pages Deployment Guide for netamps.com

## Quick Summary

✅ **Code**: Deployed and live on Cloudflare Pages
✅ **Manual Deployment**: Working (https://netamps-landing.pages.dev)
⚠️ **Cloudflare Pages CI**: Deploy command error needs fixing in dashboard
📋 **Recommended**: Use GitHub Actions for automatic deployments

## Immediate Action Required

The Cloudflare Pages CI is failing because it's using `wrangler deploy` instead of `wrangler pages deploy`. Choose one of these fixes:

### Fix 1: Update Cloudflare Pages Dashboard (Quickest)
1. Go to Cloudflare Dashboard → Workers & Pages → netamps-landing
2. Settings → Builds & deployments
3. **Remove** the "Deploy command" field (clear it)
4. Save

### Fix 2: Use GitHub Actions (Recommended)
1. Add secrets to GitHub: `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (see below)
2. Disable Cloudflare Pages CI (optional but recommended)
3. GitHub Actions will handle deployments automatically

## Current Status

✅ **Git Repository**: All changes committed and pushed to GitHub
✅ **Cloudflare Pages Project**: Created and deployed successfully
✅ **Latest Manual Deployment**: https://9fa40895.netamps-landing.pages.dev
✅ **Permanent URL**: https://netamps-landing.pages.dev
⚠️ **Cloudflare Pages CI**: Deploy command needs to be fixed in dashboard

## Fix Cloudflare Pages CI Deploy Command

The Cloudflare Pages CI is currently configured with the wrong deploy command. Here's how to fix it:

### Option 1: Fix Cloudflare Pages CI (Recommended)

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Navigate to **Workers & Pages** → **netamps-landing**
3. Click **Settings** → **Builds & deployments**
4. Find **Build configuration** section
5. **Remove** or **clear** the "Deploy command" field (Cloudflare Pages automatically deploys the build output)
6. Click **Save**

**Why this works**: Cloudflare Pages automatically deploys the output directory specified in `wrangler.toml` (`pages_build_output_dir = "./out"`). You don't need a custom deploy command.

### Option 2: Use Correct Deploy Command

If you prefer to keep a deploy command, change it to:

```
npx wrangler pages deploy out --project-name=netamps-landing
```

### Option 3: Disable Cloudflare Pages CI, Use GitHub Actions

1. Go to Cloudflare Pages project → **Settings** → **Builds & deployments**
2. Click **Disconnect** next to Git integration
3. Use the GitHub Actions workflow (`.github/workflows/cloudflare-pages.yml`)
4. Add required secrets in GitHub (see below)

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

## GitHub Actions Deployment (Recommended)

Since Cloudflare Pages CI has configuration issues, we recommend using GitHub Actions for automatic deployments.

### Required Secrets

Add these in GitHub repository settings (Settings → Secrets and variables → Actions → New repository secret):

1. **CLOUDFLARE_API_TOKEN**
   - Go to: https://dash.cloudflare.com/profile/api-tokens
   - Click **Create Token**
   - Choose **Custom Token**
   - Set permissions:
     - Account → Cloudflare Pages → Edit
     - Account → Account Settings → Read
     - User → User Details → Read
   - Create token and copy the value
   - Paste in GitHub secret: `CLOUDFLARE_API_TOKEN`

2. **CLOUDFLARE_ACCOUNT_ID**
   - Go to Cloudflare Dashboard → Workers & Pages → Overview
   - Find **Account ID** in the right sidebar
   - Copy the value
   - Paste in GitHub secret: `CLOUDFLARE_ACCOUNT_ID`

### Disable Cloudflare Pages CI (Optional but Recommended)

To avoid conflicts between Cloudflare Pages CI and GitHub Actions:

1. Go to Cloudflare Pages project → **Settings** → **Builds & deployments**
2. Click **Disconnect** next to the Git integration
3. Confirm disconnection
4. Now GitHub Actions will be the only deployment method

### Once Secrets Are Set

GitHub Actions will automatically deploy on every push to `main` branch. You can monitor deployments in:
- GitHub: Repository → Actions tab
- Cloudflare: Workers & Pages → netamps-landing → Deployments

## Current Deployment URLs

- **Preview (latest)**: https://9fa40895.netamps-landing.pages.dev
- **Production**: https://netamps-landing.pages.dev
- **Custom Domain**: https://netamps.com (after configuration)

## Troubleshooting

### Cloudflare Pages CI Deploy Error

**Error**: `wrangler deploy` on a Pages project, `wrangler pages deploy` should be used instead

**Solution**: The deploy command in Cloudflare Pages settings is incorrect. Go to:
- Cloudflare Dashboard → Workers & Pages → netamps-landing
- Settings → Builds & deployments
- **Remove** the deploy command field (or change to `npx wrangler pages deploy out --project-name=netamps-landing`)
- Save

**Alternative**: Use GitHub Actions workflow instead (recommended)

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
✅ Manual deployment working at: https://netamps-landing.pages.dev
⚠️ Cloudflare Pages CI deploy command needs fixing (remove deploy command or use GitHub Actions)
⏳ Custom domain netamps.com needs manual configuration in Cloudflare Dashboard
⏳ GitHub Actions needs secrets configuration for auto-deployment (recommended)

## Recommended Next Steps

1. **Fix Cloudflare Pages CI** (choose one):
   - Option A: Remove deploy command in Cloudflare Pages dashboard
   - Option B: Use GitHub Actions (add secrets, disable Pages CI)

2. **Configure Custom Domain**:
   - Add netamps.com in Cloudflare Pages Custom Domains
   - Wait for DNS propagation

3. **Set Environment Variables**:
   - Add `NEXT_PUBLIC_LOGIN_URL` and `NEXT_PUBLIC_RETURN_PORTAL_URL` in Cloudflare Pages settings

The manual deployment is complete and working. The CI issue is a configuration problem in the Cloudflare Dashboard, not in the code.
