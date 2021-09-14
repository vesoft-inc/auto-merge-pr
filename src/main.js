const { Octokit } = require("@octokit/core");
const q = require('q');
const striptags = require('striptags');
const async = require("async");
const ChatBot = require('dingtalk-robot-sender');
const exec = require('@actions/exec');

// const octokit = new Octokit({ auth: process.env.GH_TOKEN);
// const repoName = process.env.REPOSITORY_NAME;
// const ownerName = process.env.OWNER_NAME;
// const maintainerTeam = process.env.MAINTAINER_TEAM;
// const dingTalkAccessToken = process.env.DINGTALK_ACCESS_TOKEN;
// const dingTalkSecret = process.env.DINGTALK_SECRET;

const octokit = new Octokit({ auth: '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'});
const repoName = "nebula";
const ownerName = "vesoft-inc";
const maintainerTeamName = "nebula-force";
const dingTalkAccessToken = "93b071fc90528b2ecc09a4702692c8b630f0622d7447ab9d957399c2a0043c32";
const dingTalkSecret = 'SECaea7282b5526b290528d6d3149c8a2b73fb1c4ea64e08cdb79d68d5f99b809e1';

const robot = new ChatBot({
    webhook: `https://oapi.dingtalk.com/robot/send?access_token=${dingTalkAccessToken}`,
    secret: dingTalkSecret
});

let mergablePr = [];
let failedToMerge = [];
let succeedToMerge = [];

// getAllMaintainers()
// getAllOpenPrs()
// .then(prs => {
//     async.each(prs, getMergablePrs).then (() => {
//         console.log(mergablePr);
//     })
// });

mergePr(2450, "title", "content").then(data => {
    console.log(data);
})

async function getAllMaintainers() {
    return octokit.request('GET /orgs/{org}/teams/{team_slug}/members', {
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
    return octokit.request('GET /search/issues', {
        q: `is:pr+is:open+repo:${ownerName}/${repoName}+review:approved`
    }).then(res => {
        return res.data.items;
    });
}

async function mergePr(prNum, commit_title, commit_message) {
    return octokit.request('PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge', {
        owner: ownerName,
        repo: repoName,
        merge_method: 'squash',
        pull_number: prNum,
        commit_title: commit_title,
        commit_message: commit_message
    })
}

async function getMergablePrs(pr) {
    return octokit.request('GET ' + pr.comments_url)
    .then(comment => {
        const mergable = false;
        comment.data.forEach(e => { 
            const body = striptags(e.body).trim();
            if (body === "/merge") {
                mergable = true;
            } else if (body === "wait a minute") {
                mergable = false;
            }
        });
        if (mergable) {
            mergablePr.push(pr.url);
        }
    });
}

function runTest() {
    const exec = require('@actions/exec');

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

    const returnCode = await exec.exec(process.env.COMMAND_FOR_TESTING, [], options);

    if (returnCode != 0) {
        console.log("cmd failed with error:");
        console.log(stderr);
        return false;
    }
    return true;
}

async function sendMergeInfoToDingtalk() {
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

