import { Octokit } from "@octokit/core";

const octokit = new Octokit({ auth: `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` });
var pull = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
    owner: 'vesoft-inc',
    repo: 'nebula',
    pull_number: 2782
});

console.log(pull);
