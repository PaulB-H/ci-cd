# 'TEN-CI/CD'

### The Essential Node CI/CD

Very minimal ci-cd using [Node.js](https://nodejs.org/en), [Github Webhooks](https://docs.github.com/en/webhooks/about-webhooks), and [Octokit](https://github.com/octokit). Octokit is the only dependency.

Run with

node --env-file=.env index.js

It requires a dotenv file with:\
PORT\
GITHUB_REPOSITORIES\
GITHUB_WEBHOOK_SECRET\
GITHUB_TOKEN_FINE

---

PORT: Port the server will listen on

GITHUB_REPOSITORIES: A CSV separated list of repos to handle, along with the production path. (Production path is not implemented here currently. To be updated with optional staging environment / test environments as well) The github fine grained token will need access to each one, but this could be updated to handle multiple tokens for multiple separate repos.

`UserName/RepoToHandle:/server/production/directory`

GITHUB_WEBHOOK_SECRET: [A repo-level token to validate webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)

GITHUB_TOKEN_FINE: [Fine grained access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token) for the repo with permissions of what you want it capable of.

Currently:

```
Read and Write access to code, commit statuses, issues, and pull requests
  &
Read access to metadata
```

<strike>SSH_PRIVATE_KEY_PATH</strike>: (removed, may re-implement)\
<strike>Note: On ubuntu~/.ssh/id_rsa.pub</strike>

---

Main loop:

1. Ensure env vars are set
2. Parse repository data from .env
3. Start server

Handle Request: (Currently only setup to act on pull requests)

1. Check for matching repo
2. Update repo status with check-in-process
3. Actually run what tests you want on the code. I have not implemented anything here, but it would be done on line 142. You can see on line 144 we could simulate an error in one of our tests 4. If tests pass, move on to next stage, which could be tagging a human for the next stage of review. We could add that to the .env repo requirements, a list of people to tag depending on result, if any. 5. If tests fail, write a comment why, and close the PR
4. Update status on PR based on pass/fail

---
