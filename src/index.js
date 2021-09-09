const q = require('q');
const shell = require('shelljs');
const { Octokit } = require("@octokit/core");
const octokit = new Octokit({ auth: process.env.GH_TOKEN });

const repoName = process.env.REPO_NAME;
console.log(repoName);

fetchAllOpenPrs()
.then(data => {
    console.log(data.data);
});


// var pull = await octokit.request('GET /orgs/{org}/teams/{team_slug}/members', {
//     org: 'vesoft-inc',
//     team_slug: 'nebula-force',
//     role: 'maintainer'
// });


async function getAllMaintainers() {
// return octokit.request('GET /orgs/{org}/teams/{team_slug}/members', {
//     org: 'vesoft-inc',
//     team_slug: 'nebula-force',
//     role: 'maintainer'
// });
}

async function fetchAllOpenPrs() {
    return octokit.request('GET /repos/{owner}/{repo}/pulls', {
        owner: 'vesoft-inc',
        repo: 'nebula',
        state: 'open',
        sort: 'updated',
        direction: 'desc',
        per_page: 100
    });
}

async function fetchAllAllCmtsOfAPr(prId) {
    
}
