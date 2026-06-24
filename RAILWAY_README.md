# Railway deployment notes

## First Time Setup

1. Connect your GitHub repository (skwirls-lab/anything-llm) to Railway
2. Add a volume mount for persistent storage:
   - Mount path: `/app/server/storage`
3. Set environment variables from `railway.env.example`
4. Deploy the service

## Important Notes

- **Multi-user mode is irreversible** - Do not enable until you're ready
- **Generate secure secrets** before deploying to production
- **LLM API keys** are stored in environment variables, not in the repository

## Updating Your Fork

To sync with upstream AnythingLLM:

```bash
git fetch upstream
git merge upstream/main
git push origin main
```

Railway will automatically redeploy when you push to main.

## Local Development

For local testing before deploying to Railway:

```bash
cd docker
cp .env.example .env
# Edit .env with your settings
docker-compose up -d
```

Access at http://localhost:3001
