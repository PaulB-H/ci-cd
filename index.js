const http = require("http");
const { execSync } = require("child_process");
const crypto = require("crypto");
const { Octokit } = require("@octokit/rest");
const fs = require("fs");

const requiredEnvVars = [
  "PORT",
  "GITHUB_WEBHOOK_SECRET",
  "GITHUB_REPOSITORIES",
  "GITHUB_TOKEN_FINE",
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(
      `Error: ${envVar} is missing. Make sure to set all required environment variables.`
    );
    process.exit(1);
  }
}

const repositories = parseRepositories();
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN_FINE,
});

const server = http.createServer(async (req, res) => {
  console.log("got request");

  let data = "";

  req.on("data", (chunk) => {
    data += chunk;
  });

  req.on("end", async () => {
    const payload = JSON.parse(data);

    console.log(payload);

    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    const signature = req.headers["x-hub-signature-256"];
    const hash = crypto.createHmac("sha256", secret).update(data).digest("hex");
    const calculatedSignature = `sha256=${hash}`;

    function isSignatureValid(calculatedSignature, signature) {
      const calculatedBuffer = Buffer.from(calculatedSignature, "utf-8");
      const signatureBuffer = Buffer.from(signature, "utf-8");
      return crypto.timingSafeEqual(calculatedBuffer, signatureBuffer);
    }

    // Verify the signature
    if (!isSignatureValid(calculatedSignature, signature)) {
      res.writeHead(401, { "Content-Type": "text/plain" });
      res.end("Unauthorized");
      console.log("Unauthorized");
      return;
    }

    const eventType = req.headers["x-github-event"];

    const action = payload.action;

    // Exit early if the event is not a pull_request or the action is unsupported
    if (
      eventType !== "pull_request" ||
      !["opened", "reopened", "synchronize"].includes(action)
    ) {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Event not supported");
      console.log("Event not supported");
      return;
    }

    const repository = getMatchingRepository(payload.repository.full_name);

    // Exit early if the repository is not configured for CI/CD
    if (!repository) {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Repository not configured for CI/CD.");
      console.log("Repository not configured for CI/CD.");
      return;
    }

    // Perform pre-merge checks and deployment
    try {
      await handlePullRequestEvent(payload, repository);
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Pre-merge checks passed. You can merge.");
    } catch (error) {
      console.error(`Pre-merge checks failed: ${error.message}`);
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Pre-merge checks failed. Do not merge.");
    }
  });
});

function parseRepositories() {
  const repositoriesString = process.env.GITHUB_REPOSITORIES || "";
  const repoLines = repositoriesString.split(","); // Use ',' as the delimiter for individual repositories
  const repositories = {};

  repoLines.forEach((line) => {
    const [githubRepo, productionPath] = line.split(":");
    repositories[githubRepo] = { productionPath };
  });

  console.log(repositories);

  return repositories;
}

function getMatchingRepository(fullName) {
  const [owner, repo] = fullName.split("/");
  const key = `${owner}/${repo}`;
  return repositories[key];
}

async function handlePullRequestEvent(payload, repository) {
  const { owner, name } = payload.repository;
  const sha = payload.pull_request.head.sha;

  console.log("handlePullRequestEvent");

  try {
    console.log("In try block");
    // Create a pending commit status
    await octokit.repos.createCommitStatus({
      owner: owner.login,
      repo: name,
      sha: sha,
      state: "pending",
      description: "Pre-merge checks in progress...",
    });

    /***********/
    // Perform pre-merge checks
    // We would want to pull the feature branch
    // and run whatever tests we want here
    /***********/

    // Simulate a failure in pre-merge checks
    // throw new Error("Simulated failure in pre-merge checks");

    /***********/
    // If checks are successful
    /***********/

    // Update commit status
    await octokit.repos.createCommitStatus({
      owner: owner.login,
      repo: name,
      sha: sha,
      state: "success",
      description: "Pre-merge checks completed successfully.",
    });

    // Create a comment informing admin / teams responsible for review
    const pullRequestId = payload.pull_request.number;
    const teamSlugs = [""];
    const users = [""];
    await octokit.issues.createComment({
      owner: owner.login,
      repo: name,
      issue_number: pullRequestId,
      body: `Pull request has passed CI checks. 
  
      ${
        users.length > 0 ? users.map((user) => `@${user} `) : "No admins to tag"
      }
      ${
        teamSlugs.length > 0
          ? teamSlugs.map((teamSlug) => `@team/${teamSlug} `)
          : "No teams to tag"
      }
      
      `,
      headers: {
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    /***********/
    // Optionally merge the pull request if checks are successful
    /***********/
    // const mergeCommitTitle = "CI Merge";
    // await octokit.pulls.merge({
    //   owner: owner.login,
    //   repo: name,
    //   pull_number: pullRequestId,
    //   commit_title: mergeCommitTitle,
    //   merge_method: "merge", // 'merge', 'squash', or 'rebase'
    // });

    /***********/
    // Handle attempt at deployment
    /***********/
  } catch (error) {
    console.error("Error setting commit status:", error.message);

    // If checks fail
    await octokit.repos.createCommitStatus({
      owner: owner.login,
      repo: name,
      sha: sha,
      state: "failure",
      description: "Pre-merge checks failed.",
    });

    try {
      const commentBody =
        "Your pull request has not passed the required checks. Please push an update.";
      const pullRequestId = payload.pull_request.number;
      const commitSha = payload.pull_request.head.sha;

      console.log(`
        name: ${name}
        owner: ${owner.login}
        issue number: ${pullRequestId}
      `);

      let result = await octokit.issues.createComment({
        owner: owner.login,
        repo: name,
        issue_number: pullRequestId,
        body: "Your pull request has not passed the required checks. Please push an update.",
        headers: {
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });

      /***********/
      // Close the pull request if checks fail
      /***********/
      // await octokit.pulls.update({
      //   owner: owner.login,
      //   repo: name,
      //   pull_number: pullRequestId,
      //   state: "closed",
      // });

      console.log("result: ");
      console.log(result.data);
    } catch (error) {
      console.error("Error setting comment:", error);
    }

    // Handle other errors if necessary
  }
}

const PORT = process.env.PORT;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
