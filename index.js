const github = require('@actions/github');
const repo = github.context.repo;
const exec = require('@actions/exec');
const core = require('@actions/core');
const q = require('q');
const striptags = require('striptags');
const async = require("async");
const { ChatBot } = require('dingtalk-robot-sender');
const fs = require('fs');

const repoName = repo.repo;
const ownerName = repo.owner;
const octokit = github.getOctokit(core.getInput('gh-token'));
const maintainerTeamName = core.getInput('maintainer-team-name');
const dingtalkAccessToken = core.getInput('dingtalk-access-token');
const dingtalkSecret = core.getInput('dingtalk-secret');
const ci = core.getInput('ci-command');

const robot = new ChatBot({
    webhook: `https://oapi.dingtalk.com/robot/send?access_token=${dingtalkAccessToken}`,
    secret: dingtalkSecret
});

let mergeablePr = {};
let failedToMerge = [];
let errorLog = "";
let passLog = "";

function main() {
    q.all([getAllMaintainers(),getAllOpenPrs()])
    .then(getMergeablePrs)
    .then(() => {
        if (Object.keys(mergeablePr).length) {
            getAllPatchesAndApply()
            .then(runTest)
            .then(mergeValidPr)
            .then(sendMergeInfoToDingtalk)
            .then(setOutputInfo)
        } else {
            setOutputInfo();
        }
    });
}
  
if (require.main === module) {
    main();
}

async function getAllMaintainers() {
    return octokit.rest.teams.listMembersInOrg({
        org: ownerName,
        team_slug: maintainerTeamName,
        role: 'maintainer'
    }).then(res => {
        let maintainerList = [];
        res.data.forEach(maintainer => maintainerList.push(maintainer.login));
        return maintainerList;
    });
}

async function getAllOpenPrs() {
    return octokit.rest.search.issuesAndPullRequests({
        q: `is:pr+is:open+repo:${ownerName}/${repoName}+review:approved`
    }).then(res => {
        return res.data.items;
    });
}

async function mergeValidPr() {
    return async.eachOf(mergeablePr, (pr, prNum) => {
        return octokit.rest.pulls.merge({
            owner: ownerName,
            repo: repoName,
            merge_method: 'squash',
            pull_number: prNum
        }).then((response) => {
            if (response.status != '200') {
                failedToMerge.push(pr.html_url);
                delete mergeablePr[prNum];
            }
        })
    });
}

async function getMergeablePrs(res) {
    const maintainerList = res[0];
    const prs = res[1];
    async.each(prs, pr => {
        return octokit.request('GET ' + pr.comments_url)
        .then(comments => {
            const mergeable = false;
            comments.data.forEach(comment => { 
                const body = striptags(comment.body).trim();
                if (body === "/merge" && maintainerList.includes(comment.body.login)) {
                    mergeable = true;
                } else if (body === "/wait a minute" && maintainerList.includes(comment.body.login)) {
                    mergeable = false;
                }
            });
            if (mergeable) {
                mergeablePr[pr.number] = {number: pr.number, html_url: pr.html_url, patch_url: pr.patch_url};
            }
        });
    });
}

async function runTest() {
    let defer = q.defer();

    const options = {};
    options.listeners = {
        stdout: (data) => {
            console.log(data.toString());
            passLog += data.toString();
        },
        stderr: (data) => {
            console.log(data.toString());
            errorLog += data.toString();
        }
    };

    const returnCode = false;
    while (!returnCode && Object.keys(mergeablePr).length > 0) {
        returnCode = await exec.exec(ci, [], options);
        if (returnCode != 0) {
            const kickout = getRandomInt(Object.keys(mergeablePr).length);
            const pr = mergeablePr[Object.keys(mergeablePr)[kickout]];
            await exec.exec(`git apply -R ${pr.number}.patch`);
            failedToMerge.push(pr.html_url);
            delete mergeablePr[pr.number];
        }
    }
    defer.resolve();
    return defer.promise;
}

async function sendMergeInfoToDingtalk() {
    let succeedToMerge = [];
    for (const [key, value] of Object.entries(mergeablePr)) {
        succeedToMerge.push(value.html_url);
    }
    if (succeedToMerge.length > 0 || failedToMerge.length > 0) {
        let title = "merge info";
        let text = "## merge info\n" +
        "> merge successfully:\n" +
        "> " + succeedToMerge.join() + "\n\n"  +
        "> failed to merge: \n" +
        "> " + failedToMerge.join() + "\n";
        let at = {
            // "atMobiles": phone, 
            "isAtAll": false
        };
        return robot.markdown(title,text,at);
    }    
}

async function getAllPatchesAndApply() {
    async.eachOf(mergeablePr, (pr, prNum) => {
        return octokit.request(`GET ${pr.patch_url}`).then(async response => {
            fs.writeFileSync(`${prNum}.patch`, response.data);
            mergeablePr[prNum]["patchFile"] = `${prNum}.patch`;
            const returnCode = await exec.exec(`git apply ${prNum}.patch`, [], options);
            if (returnCode != 0) {
                failedToMerge.push(pr.html_url);
                delete mergeablePr[pr.number];
            }
        });
    });
}

async function setOutputInfo() {
    core.setOutput("merged", Object.keys(mergeablePr).length > 0);
    core.setOutput("error-log", errorLog);
    core.setOutput("pass-log", passLog);
    core.setOutput("merge-info", Object.keys(mergeablePr).length > 0 ? 
        "merge successfully:\n" + succeedToMerge.join() + "\n\n" + "failed to merge: \n" + failedToMerge.join() + "\n" : 
        "not any pr was merged");
}