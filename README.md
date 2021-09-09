## Auto Merge Pull Request Bot

This bot takes advantage of the on schedule function provided by github action to automatically execute a combined tests with all mergeable pull requests after a certain period of time. If the test fails, one of the pull requests will be eliminated by a random elimination strategy, then continue to execute the test until the test passes or there is no pull request available. After that, bot will merge the remaining pull requests that passed this test to the main branch, and user can optionally send the merge information to a DingTalk group.

Assuming that the user has a new pull request here, it needs to go through:

1. The pull request is approved by reviewers.
2. Repository maintainer comments /merge, indicating that he/she agrees with the pull request to merge.
3. After completing step 1 and step 2, the pull request will be identified by the bot as a mergeable pull request.
4. The bot preloads all the mergeable pull requests to the local master-based branch to run CI testing.
5. If test passed --- the pull request is merged to the main branch, where as if the test failed --- the bot will randomly remove one of the existing pull requests and run the test again until the test passes or no branch is available.
6. (Optional) The bot sends the merge information to a DingTalk group that provided by user.



**Things need to be noticed**:

1. When using a bot, the repository needs to configure a team in orgnization that contains a set of members. The role of some members needs to be marked as maintainers, corresponding to step 2 above.

2. The maintainer can mark the pull request as mergable(if it is already approved by reviewers) by commenting "/merge", or unapprove the merge by commenting /wait a minute or deleting the comment, but if the test is already running, it can only be cancelled by manually stopping the bot’s workflow by now, a better cancellation scenario will be supported in a future version.
3. Regarding sending merge information to DingTalk group,  you need to configure DingTalk bots in DingTalk group. For details, please refer to https://developers.dingtalk.com/document/robots/custom-robot-access and https://developers.dingtalk.com/document/robots/customize-robot-security-settings, currently bot only supports signature for security settings.
4. The CI code for testing needs to be passed by the user in the input parameters.
5. Scheduled events in Github action usually delays and will not run as scheduled, usually 15-30 minutes delayed.

## Example Usage

```
 ...

 on:
  schedule:
    - cron: '* */1 * * *'  --- run the bot every hour
  workflow_dispatch:

 ...

    - name: Run merge script
      uses: klay-ke/auto-merge-pr@master  --- this might be changed
      id: merge-pr
      with:
        send-to-dingtalk-group: true
        dingtalk-access-token: ${{ secrets.DINGTALK_ACCESS_TOKEN }}
        dingtalk-secret: ${{ secrets.DINGTALK_SECRET }}
        maintainer-team-name: ${{ secrets.MAINTAINER_TEAM_NAME }}
        gh-token: ${{ secrets.GH_TOKEN }}
        ci-command: 'bash ./build.sh'
```



## Input

| Parameter              | Type    | Required                              | Default      | Description                                                  |
| ---------------------- | ------- | ------------------------------------- | ------------ | ------------------------------------------------------------ |
| send-to-dingtalk-group | boolean | Yes                                   | false        | Boolean. If true, it means that the merge information needs to be sent to DingTalk group, and the dingtalk-access-token and dingtalk-access-token fields need to be provided. |
| dingtalk-access-token  | string  | Yes if send-to-dingtalk-group is true | Empty String | Dingtalk bot access token.                                   |
| dingtalk-secret        | string  | Yes if send-to-dingtalk-group is true | Empty String | Dingtalk secret.                                             |
| maintainer-team-name   | string  | Yes                                   | None         | Name of maintainer team.                                     |
| gh-token               | string  | Yes                                   | None         | Github Token                                                 |
| ci-command             | string  | No                                    | None         | The command to use for running test.                         |

## Output

You can use ${{ steps.{action-id}.outputs.{parameter-name} }} read the output in following steps. {action-id} refers to 'merge-pr' in exmaple usage.

| Parameter  | Type    | Description                     |
| ---------- | ------- | ------------------------------- |
| merge-info | string  | Final merge info.               |
| error-log  | string  | Error log.                      |
| pass-log   | string  | Regular log                     |
| merged     | boolean | Boolean, true if any pr merged. |