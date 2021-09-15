const github = require('@actions/github');
const repo = github.context.repo;
const exec = require('@actions/exec');
const core = require('@actions/core');
const q = require('q');
const striptags = require('striptags');
const async = require("async");
const ChatBot = require('dingtalk-robot-sender');
const fs = require('fs');

// const octokit = github.getOctokit(core.getInput('GH_TOKEN'));
// const repoName = core.getInput('REPOSITORY_NAME');
// const ownerName = core.getInput('OWNER_NAME');
// const maintainerTeamName = core.getInput('MAINTAINER_TEAM_NAME');
// const dingTalkAccessToken = core.getInput('DINGTALK_ACCESS_TOKEN');
// const dingTalkSecret = core.getInput('DINGTALK_SECRET');

const octokit = github.getOctokit('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');
const repoName = "nebula";
const ownerName = "vesoft-inc";
const maintainerTeamName = "nebula-force";
const dingTalkAccessToken = "93b071fc90528b2ecc09a4702692c8b630f0622d7447ab9d957399c2a0043c32";
const dingTalkSecret = 'SECaea7282b5526b290528d6d3149c8a2b73fb1c4ea64e08cdb79d68d5f99b809e1';

const robot = new ChatBot({
    webhook: `https://oapi.dingtalk.com/robot/send?access_token=${dingTalkAccessToken}`,
    secret: dingTalkSecret
});

let mergeablePr = {};
let failedToMerge = [];

function main() {
    q.all([getAllMaintainers(),getAllOpenPrs()])
    .then(getMergeablePrs)
    .then(() => {
        if (Object.keys(mergeablePr).length) {
            getAllPatchesAndApply()
            .then(runTest)
            .then(mergeValidPr)
            .then(sendMergeInfoToDingtalk)
        } else {
            core.setOutput("no mergeable pr");
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

    let output = '';
    let error = '';

    const options = {};
    options.listeners = {
        stdout: (data) => {
            output += data.toString();
        },
        stderr: (data) => {
            error += data.toString();
        }
    };

    const returnCode = false;
    while (!returnCode) {
        returnCode = await exec.exec(process.env.COMMAND_FOR_TESTING);
        if (returnCode != 0) {
            const kickout = getRandomInt(Object.keys(mergeablePr).length);
            const pr = mergeablePr[Object.keys(mergeablePr)[kickout]];
            await exec.exec(`git apply -R ${pr.number}.patch`);
            failedToMerge.push(pr.html_url);
            delete mergeablePr[pr.number];
            console.log("build failed with error:");
            console.log(error);
        }
    }
    console.log("build passed!");
    console.log(output);
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
        core.setOutput("merge successfully:\n" + succeedToMerge.join() + "\n\n" + "failed to merge: \n" + failedToMerge.join() + "\n");
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