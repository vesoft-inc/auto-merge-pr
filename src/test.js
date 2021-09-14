const exec = require('child_process').exec;

console.log(process.env.cmd);
exec("echo 1234");
exec(process.env.cmd);