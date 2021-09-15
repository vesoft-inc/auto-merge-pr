const github = require('@actions/github');
const repo = github.context.repo;
console.log(repo);