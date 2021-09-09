const github = require('@actions/github');
const exec = require('@actions/exec');
const core = require('@actions/core');
const q = require('q');
const striptags = require('striptags');
const ChatBot = require('dingtalk-robot-sender');
const fs = require('fs');

const repo = github.context.repo;
const repoName = repo.repo;
const ownerName = repo.owner;
const octokit = github.getOctokit(core.getInput('gh-token'));
const maintainerTeamName = core.getInput('maintainer-team-name');
const sendToDingtalkGroup = core.getBooleanInput('send-to-dingtalk-group');
const dingtalkAccessToken = core.getInput('dingtalk-access-token');
const dingtalkSecret = core.getInput('dingtalk-secret');
const ci = core.getInput('ci-command');

let robot = null;
let mergeablePr = {};
let failedToMerge = [];
let succeedToMerge = [];
let errorLog = "";
let passLog = "";

const execOptions = {};
execOptions.ignoreReturnCode = true;
execOptions.listeners = {
    stdout: (data) => {
        passLog += data.toString();
    },
    stderr: (data) => {
        errorLog += data.toString();
    }
};

function main() {
    if (sendToDingtalkGroup) {
        if (!dingtalkSecret || !dingtalkAccessToken) {
            throw new Error('dingtalk-access-token and dingtalk-secret are required but not provided');
        }
        robot = new ChatBot({
            webhook: `https://oapi.dingtalk.com/robot/send?access_token=${dingtalkAccessToken}`,
            secret: dingtalkSecret
        });
    }
    q.all([getAllMaintainers(),getAllOpenPrs()])
    .then(getMergeablePrs)
    .then(() => {
        if (Object.keys(mergeablePr).length) {
            return getAllPatchesAndApply()
            .then(runTest)
            .then(mergeValidPr)
            .then(sendMergeInfoToDingtalk);
        }
    })
    .then(setOutputInfoAndCleanup)
    .done();
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
    return Object.values(mergeablePr).reduce((promise, pr) => {
        return promise.then(() => {
            return octokit.rest.pulls.merge({
                owner: ownerName,
                repo: repoName,
                merge_method: 'squash',
                pull_number: pr.number
            })
            .then(response => {
                if (response.status != '200') {
                    failedToMerge.push(pr.html_url);
                    delete mergeablePr[pr.number];
                }
            })
            .catch(err => {
                errorLog += err;
                failedToMerge.push(pr.html_url);
                delete mergeablePr[pr.number];
            })
            .then(() => q().delay(5000))
        })
    }, q());
}

async function getMergeablePrs(res) {
    const maintainerList = res[0];
    const prs = res[1];
    const defer = q.defer();
    let promises = [];
    prs.forEach((pr) => {
        promises.push(
            octokit.request('GET ' + pr.comments_url)
            .then(comments => {
                let mergeable = false;
                comments.data.forEach(comment => {
                    const body = striptags(comment.body).trim();
                    if (body === "/merge" && maintainerList.includes(comment.user.login)) {
                        mergeable = true;
                    } else if (body === "/wait a minute" && maintainerList.includes(comment.user.login)) {
                        mergeable = false;
                    }
                });
                if (mergeable) {
                    mergeablePr[pr.number] = {number: pr.number, html_url: pr.html_url, patch_url: pr.pull_request.patch_url};
                }
            })
        );
    })
    q.all(promises).then(() => {
        defer.resolve();
    });
    return defer.promise;
}

async function runTest() {
    if (ci) {
        let defer = q.defer();

        const getRandomInt = (max) => {
            return Math.floor(Math.random() * max);
        }

        const run =  (returnCode) => {
            if (!returnCode || !Object.keys(mergeablePr).length) {
                return defer.resolve();
            }

            if (returnCode) {
                const kickout = getRandomInt(Object.keys(mergeablePr).length);
                const pr = mergeablePr[Object.keys(mergeablePr)[kickout]];
                failedToMerge.push(pr.html_url);
                delete mergeablePr[pr.number];
                return exec.exec(`git apply -R ${pr.number}.patch`, [], {ignoreReturnCode: true})
                    .then(() => exec.exec(ci, [], execOptions))
                    .then(run);
            }
        };

        exec.exec(ci, [], execOptions)
        .then(run);
        return defer.promise;
    }
}

async function sendMergeInfoToDingtalk() {
    if (sendToDingtalkGroup) {
        for (const [key, value] of Object.entries(mergeablePr)) {
            succeedToMerge.push(value.html_url);
        }
        if (succeedToMerge.length > 0 || failedToMerge.length > 0) {
            let title = "merge info";
            let text = "## merge info\n" +
            "> ### merge successfully:\n" +
            "> " + succeedToMerge.join(', ') + "\n\n"  +
            "> ### failed to merge: \n" +
            "> " + failedToMerge.join(', ') + "\n";
            let at = {
                // "atMobiles": phone, ]
                "isAtAll": false
            };;
            return robot.markdown(title,text,at);
        }
    }
}

async function getAllPatchesAndApply() {
    let promises = [];
    const defer = q.defer();
    for (const [prNum, pr] of Object.entries(mergeablePr)) {
        promises.push(
            octokit.request(`GET ${pr.patch_url}`)
            .then(response => {
                fs.writeFileSync(`${prNum}.patch`, response.data);
                mergeablePr[prNum]["patchFile"] = `${prNum}.patch`;
            })
            .then(() => exec.exec(`git apply ${prNum}.patch`, [], execOptions))
            .then(returnCode => {
                if (returnCode != 0) {
                    failedToMerge.push(pr.html_url);
                    delete mergeablePr[pr.number];
                }
            })
        );
    }
    q.all(promises).then(() => {
        defer.resolve();
    });
    return defer.promise;
}

async function setOutputInfoAndCleanup() {
    core.setOutput("merged", Object.keys(mergeablePr).length > 0);
    core.setOutput("error-log", errorLog);
    core.setOutput("pass-log", passLog);
    core.setOutput("merge-info", Object.keys(mergeablePr).length > 0 ?
        "merge successfully:\n" + succeedToMerge.join(', ') + "\n\n" + "failed to merge: \n" + failedToMerge.join(', ') + "\n" :
        "not any pr was merged");
    return exec.exec(`rm -rf *.patch`, [], execOptions);
}